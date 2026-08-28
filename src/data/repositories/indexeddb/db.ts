import { Annotation } from '@/data/models/annotations/annotation';
import { CollectionContent, CollectionDetails } from '@/data/models/collection';
import { ConvertedFile } from '@/data/models/convertedFile';
import { DataModel } from '@/data/models/dataModel/dataModel';
import { FSHandle } from '@/data/models/fSHandle';
import { History } from '@/data/models/history';
import { ItemMetadata } from '@/data/models/metadata';
import { ModifierChainDTO } from '@/data/models/modifiers/Modifier';
import { NamedEntity } from '@/data/models/namedEntity';
import { Project } from '@/data/models/project';
import { Result } from '@/data/models/result/result';
import { Source, SourceContent, StoredBlob } from '@/data/models/source/source';
import { StoredManifestContent, StoredManifestDetails } from '@/data/models/storedManifest';
import { Tag } from '@/data/models/tag';
import { Worker } from '@/data/models/worker/worker';
import Dexie, { type EntityTable } from 'dexie';
import 'dexie-observable';

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

db.version(30)
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
      '&id, canvasId, collectionId, [canvasId+collectionId], order, [canvasId+collectionId+type], [collectionId+type]',
    annotationsTemp:
      '&id, canvasId, collectionId, [canvasId+collectionId], order, [canvasId+collectionId+type]',
    namedEntities: '&id, *annotationIds, type.id',
    results: '++id, workerName, workerId, [scopeKey+workerName], taskId, [workerId+taskId]',
    workers: '&id, name, status, [scopeKey+name]',
    handles: '&id',
    convertedFiles: '&id, folderName',
    modifierChains: '&id, name',
    projects: '&id, name',
    sources: '&id, name, type',
    sourceContents: '&id',
    storedBlobs: '&id',
  })
  .upgrade(async () => {
    // La migration des données (storedManifests, convertedFiles → sources/sourceContents)
    // est désormais déclenchée manuellement par l'utilisateur depuis l'interface.
    // Voir : IndexedDBSourceRepository.migrateAllSources()
  });

export const clearDatabase = async () => {
  await Dexie.delete('mezanno');
};

Dexie.debug = true;

export { db };
