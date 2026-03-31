import { Annotation } from '@/data/models/Annotation';
import { CollectionContent, CollectionDetails } from '@/data/models/Collection';
import { ConvertedFile } from '@/data/models/ConvertedFile';
import { DataModel } from '@/data/models/DataModel';
import { FSHandle } from '@/data/models/FSHandle';
import { History } from '@/data/models/History';
import { ItemMetadata } from '@/data/models/Metadata';
import { ModifierChainDTO } from '@/data/models/modifiers/Modifier';
import { NamedEntity } from '@/data/models/NamedEntity';
import { Project } from '@/data/models/Project';
import { Result } from '@/data/models/Result';
import { Source, SourceContent, StoredBlob } from '@/data/models/Sources';
import { StoredManifestContent, StoredManifestDetails } from '@/data/models/StoredManifest';
import { Tag } from '@/data/models/Tag';
import { Worker } from '@/data/models/Worker';
import { getThumbnailBlob } from '@/data/utils/manifest';
import { getManifestFromConvertedFile } from '@/utils/manifest';
import Dexie, { type EntityTable } from 'dexie';
import 'dexie-observable';
import { v4 as uuid } from 'uuid';

const db = new Dexie('mezanno') as Dexie & {
  collections: EntityTable<CollectionDetails, 'id'>;
  collectionContents: EntityTable<CollectionContent, 'id'>;
  history: EntityTable<History, 'url'>;
  storedManifests: EntityTable<StoredManifestDetails, 'id'>;
  storedManifestContents: EntityTable<StoredManifestContent, 'id'>;
  itemMetadata: EntityTable<ItemMetadata, 'id'>;
  tags: EntityTable<Tag, 'id'>;
  annotations: EntityTable<Annotation, 'id'>;
  annotationsTemp: EntityTable<Annotation, 'id'>;
  models: EntityTable<DataModel, 'id'>;
  namedEntities: EntityTable<NamedEntity, 'id'>;
  results: EntityTable<Result, 'id'>;
  workers: EntityTable<Worker, 'id'>;
  handles: EntityTable<FSHandle, 'id'>;
  convertedFiles: EntityTable<ConvertedFile, 'id'>;
  modifierChains: EntityTable<ModifierChainDTO, 'id'>;
  projects: EntityTable<Project, 'id'>;
  sources: EntityTable<Source, 'id'>;
  sourceContents: EntityTable<SourceContent, 'id'>;
  storedBlobs: EntityTable<StoredBlob, 'id'>;
};

db.version(17)
  .stores({
    collections: '&id, name, *tags.id',
    collectionContents: '&id',
    history: '&url',
    storedManifests: '&id, name',
    storedManifestContents: '&id',
    typesList: '&label',
    itemMetadata: '[id+attribute.label]',
    tags: '&id',
    models: '&id, name',
    //TODO: il faudrait peut-être revoir le format et ne garder IIIF que pour l'export
    annotations:
      '&id, canvasId, collectionId, [canvasId+collectionId], order, [canvasId+collectionId+type]',
    annotationsTemp:
      '&id, canvasId, collectionId, [canvasId+collectionId], order, [canvasId+collectionId+type]',
    namedEntities: '&id, *annotationIds, type.id',
    results: '++id, workerName, workerId, [scopeKey+workerName], taskId',
    workers: '&id, name, status, [scopeKey+name]',
    handles: '&id',
    convertedFiles: '&id, folderName',
    modifierChains: '&id, name',
    projects: '&id, name',
    sources: '&id, name, type',
    sourceContents: '&id',
    storedBlobs: '&id',
  })
  .upgrade(async (tx) => {
    const storedManifests = (await tx
      .table('storedManifests')
      .toArray()) as StoredManifestDetails[];
    const storedManifestContents = (await tx
      .table('storedManifestContents')
      .toArray()) as StoredManifestContent[];
    const convertedFiles = (await tx.table('convertedFiles').toArray()) as ConvertedFile[];

    const sourcesTable = tx.table('sources');
    const sourceContentsTable = tx.table('sourceContents');
    const storedBlobsTable = tx.table('storedBlobs');
    const collectionContentsTable = tx.table('collectionContents');

    console.log(
      'Migrating ',
      storedManifests.length,
      ' stored manifests and ',
      convertedFiles.length,
      ' converted files',
    );
    // ----------------------------
    // 🔁 MIGRATION StoredManifest (remote)
    // ----------------------------
    for (const manifest of storedManifests) {
      console.log('Migrating storedManifest with id ', manifest.id);
      const content = storedManifestContents.find((c) => c.id === manifest.id);
      if (content === undefined) {
        console.warn(`No content found for manifest with id ${manifest.id}`);
        continue;
      }

      const manifestId = uuid();
      const thumbnailBlobId = uuid();
      const thumbnailBlob = await Dexie.waitFor(getThumbnailBlob(content.content));

      if (manifest.thumbnail) {
        await storedBlobsTable.add({
          id: thumbnailBlobId,
          blob: thumbnailBlob,
        });
      }

      try {
        await sourcesTable.add({
          id: manifestId,
          name: manifest.name,
          type: 'remote',
          pageCount: content.content?.items?.length ?? 0,
          thumbnailBlobId,
        });

        await sourceContentsTable.add({
          id: manifestId,
          type: 'remote',
          manifest: content.content,
        });

        //On update aussi les éléments de collection qui pointaient vers ce manifest pour qu'ils pointent vers la source à la place
        await collectionContentsTable.toCollection().modify((collection: CollectionContent) => {
          for (const element of collection.content) {
            if (element.manifestId === manifest.id) {
              element.sourceId = manifestId;
            }
          }
        });
      } catch (error) {
        console.error(`Error migrating manifest with id ${manifest.id}:`, error);
      }
    }

    // ----------------------------
    // 🔁 MIGRATION ConvertedFile (local)
    // ----------------------------
    for (const file of convertedFiles) {
      console.log('Migrating convertedFile with id ', file.id);
      const thumbnailBlobId = uuid();
      const manifest = await Dexie.waitFor(getManifestFromConvertedFile(file));
      if (manifest === null) {
        console.warn(`No manifest found for converted file with id ${file.id}`);
        continue;
      }
      try {
        await storedBlobsTable.add({
          id: thumbnailBlobId,
          blob: file.thumbnailBlob,
        });

        await sourcesTable.add({
          id: file.id,
          name: file.title,
          type: 'local',
          pageCount: file.pageCount,
          thumbnailBlobId,
        });

        await sourceContentsTable.add({
          id: file.id,
          type: 'local',
          manifest,
          localFile: {
            outputDirectoryHandle: file.outputDirectoryHandle,
            timestamp: file.timestamp,
            manifestName: file.manifestName,
            folderName: file.folderName,
          },
        });
      } catch (error) {
        console.error(`Error migrating converted file with id ${file.id}:`, error);
      }
    }

    // ----------------------------
    // 🧹 (optionnel) nettoyage (à mettre en place à l'avenir pour nettoyer les vieilles versions de la base)
    // ----------------------------
    // await tx.table('storedManifests').clear();
    // await tx.table('storedManifestContents').clear();
    // await tx.table('convertedFiles').clear();
  });

export const clearDatabase = async () => {
  await Dexie.delete('mezanno');
};

Dexie.debug = true;

export { db };
