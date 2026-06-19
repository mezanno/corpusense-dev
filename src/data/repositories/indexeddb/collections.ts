import { CollectionElement } from '@/data/models/CollectionElement';
import { AnnotationScope, CanvasScope } from '@/data/models/Scope';
import { Tag } from '@/data/models/Tag';
import { CanvasWithSourceId } from '@/hooks/data/collections/useCollectionContent';
import { Canvas } from '@iiif/presentation-3';
import { groupBy, mapValues } from 'lodash';
import { v4 as uuid } from 'uuid';
import { Collection, CollectionDetails } from '../../models/Collection';
import { db } from './db';
import {
  getAnnotationRepository,
  getSourceRepository,
  getTagRepository,
  getWorkerRepository,
} from './dbFactory';
import { CollectionRepository } from './types';

export class IndexedDBCollectionRepository implements CollectionRepository {
  async getAllDetails(): Promise<CollectionDetails[]> {
    return await db.collections.toArray();
  }

  async getById(id: string): Promise<Collection> {
    const details = await db.collections.get(id);
    if (details === undefined) {
      throw new Error(`Collection with id ${id} not found`);
    }
    const content = await db.collectionContents.get(id);

    return { ...details, content: content?.content || [] };
  }

  async getTagsByCollectionId(collectionId: string): Promise<Tag[]> {
    const collection = await this.getById(collectionId);
    const tagIds = collection.tags;
    if (tagIds.length === 0) {
      return [];
    }
    const tagRepository = getTagRepository();
    return await tagRepository.getByIds(tagIds);
  }

  async getCanvasesByCollectionId(collectionId: string): Promise<Canvas[]> {
    const collection = await this.getById(collectionId);
    if (collection === undefined) {
      throw new Error(`Collection with id ${collectionId} not found`);
    }

    const collectionContent = await db.collectionContents.get(collectionId);
    const content = collectionContent?.content || [];
    if (content.length === 0) {
      return [];
    }

    const sourceRepository = getSourceRepository();

    //get the list of canvases in the collection (with their manifestId)
    const canvaseIdsWithSourceIds = await Promise.all(
      content.map(async (elt) => {
        const sourceId = elt.sourceId;
        const source = await sourceRepository.getContentById(sourceId);

        return {
          canvasId: elt.canvasId,
          sourceId: source.id,
        };
      }),
    );

    const canvasesBySourceId = groupBy(canvaseIdsWithSourceIds, 'sourceId');

    //group the canvases by manifestId
    const groupedCanvasesIds = mapValues(canvasesBySourceId, (value) =>
      value.map((elt) => elt.canvasId),
    );

    const canvases: Canvas[] = [];
    for (const sourceId in groupedCanvasesIds) {
      const canvasIds = groupedCanvasesIds[sourceId];
      if (canvasIds.length > 0) {
        const results = canvasIds.length
          ? await Promise.all(canvasIds.map((id) => sourceRepository.getCanvasById(sourceId, id)))
          : [];
        canvases.push(...results);
      }
    }

    return canvases;
  }

  async getSourceIdsByCollectionId(collectionId: string): Promise<string[]> {
    const collection = await this.getById(collectionId);
    if (collection === undefined) {
      throw new Error(`Collection with id ${collectionId} not found`);
    }
    const content = collection.content;
    if (content.length === 0) {
      return [];
    }
    return [...new Set(content.map((elt) => elt.sourceId))];
  }

  async getOfflineCollections(): Promise<CollectionDetails[]> {
    return await db.collections.where('offline').equals(1).toArray();
  }

  async getOfflineCanvases(): Promise<Canvas[]> {
    const offlineCollections = await this.getOfflineCollections();
    return await Promise.all(
      offlineCollections.map(async (collection) => {
        return await this.getCanvasesByCollectionId(collection.id);
      }),
    ).then((canvases) => canvases.flat());
  }

  async getCanvasByScope(scope: CanvasScope | AnnotationScope): Promise<CanvasWithSourceId> {
    const collection = await this.getById(scope.collectionId);
    if (collection === undefined) {
      throw new Error(`Collection with id ${scope.collectionId} not found`);
    }

    const collectionElement = collection.content.find((elt) => elt.canvasId === scope.canvasId);
    if (!collectionElement) {
      throw new Error(
        `Canvas with id ${scope.canvasId} not found in collection ${scope.collectionId}`,
      );
    }

    return {
      canvas: await getSourceRepository().getCanvasById(collectionElement.sourceId, scope.canvasId),
      sourceId: collectionElement.sourceId,
    };
  }

  async exists(id: string): Promise<boolean> {
    const count = await db.collections.where('id').equals(id).count();
    return count > 0;
  }

  async create(collection: Collection): Promise<void> {
    const { content, ...collectionDetails } = collection;
    await db.transaction('rw', db.collections, db.collectionContents, async () => {
      await db.collections.add(collectionDetails);
      await db.collectionContents.add({
        id: collection.id,
        content: content ?? [],
      });
    });
  }

  async duplicate(collectionId: string, newName: string): Promise<void> {
    await db.transaction('rw', db.collections, db.collectionContents, db.annotations, async () => {
      const collection = await db.collections.get(collectionId);
      if (collection === undefined) {
        throw new Error(`Collection with id ${collectionId} not found`);
      }
      const content = await db.collectionContents.get(collectionId);

      const newCollectionId = uuid();
      await db.collections.add({
        ...collection,
        id: newCollectionId,
        name: newName,
        contentSize: content?.content.length ?? 0,
      });
      await db.collectionContents.add({
        id: newCollectionId,
        content: content?.content ?? [],
      });
      const annotationRepository = getAnnotationRepository();
      const annotationsToDuplicate = await annotationRepository.getByScope({
        collectionId,
      });
      const duplicatedAnnotations = annotationsToDuplicate.map((annotation) => ({
        ...annotation,
        id: uuid(),
        collectionId: newCollectionId,
      }));
      await annotationRepository.addAll(duplicatedAnnotations);
    });
  }

  async update(
    id: string,
    {
      name,
      about,
      tags,
      content,
      modelId,
      offline,
      postLayoutModifierChainId,
      postOcrModifierChainId,
    }: {
      name: string;
      about?: string;
      tags: string[];
      content: CollectionElement[];
      modelId?: string;
      offline: boolean;
      postLayoutModifierChainId?: string;
      postOcrModifierChainId?: string;
    },
  ): Promise<void> {
    await db.transaction('rw', db.collections, db.collectionContents, async () => {
      await db.collections.update(id, {
        name,
        about,
        tags,
        modelId,
        offline,
        postLayoutModifierChainId,
        postOcrModifierChainId,
      });
      await db.collectionContents.update(id, {
        content,
      });
    });
  }

  async updateTags(id: string, tags: string[]): Promise<void> {
    await db.collections.update(id, {
      tags,
    });
  }

  async updateOffline(id: string, offline: boolean): Promise<void> {
    await db.collections.update(id, {
      offline,
    });
  }

  async addContentToCollection(collection: Collection): Promise<void> {
    const { content, ...collectionDetails } = collection;
    await db.transaction('rw', db.collections, db.collectionContents, async () => {
      await db.collections.put(collectionDetails);
      await db.collectionContents.put({
        id: collection.id,
        content: collection.content,
      });
    });
  }

  async delete(
    collectionToRemove: Collection,
  ): Promise<{ workersIds: string[]; collectionId: string }> {
    return await this.deleteById(collectionToRemove.id);
  }

  async deleteById(collectionId: string): Promise<{ workersIds: string[]; collectionId: string }> {
    return await db.transaction(
      'rw',
      [db.collections, db.collectionContents, db.annotations, db.workers, db.results],
      async () => {
        //remove the annotations of the collection
        const annotationRepository = getAnnotationRepository();
        await annotationRepository.deleteByScope({
          collectionId,
        });
        //remove the workers associated to the collection
        const workerRepository = getWorkerRepository();
        const workersIds = await workerRepository.deleteByScope({
          collectionId,
        });
        //remove the collection
        await db.collections.delete(collectionId);
        await db.collectionContents.delete(collectionId);
        return { workersIds, collectionId };
      },
    );
  }

  async deleteElement(collectionId: string, canvasId: string): Promise<Collection> {
    const collection = await this.getById(collectionId);
    if (collection === undefined) {
      throw new Error(`Collection with id ${collectionId} not found`);
    }
    const { content, ...collectionDetails } = collection;

    const updatedContent = content.filter((elt) => elt.canvasId !== canvasId);
    const updatedDetails = { ...collectionDetails, contentSize: updatedContent.length };

    const annotationRepository = getAnnotationRepository();
    await annotationRepository.deleteByScope({
      collectionId,
      canvasId,
    });

    const updatedCollection = { ...updatedDetails, content: updatedContent };
    await this.addContentToCollection(updatedCollection);

    return updatedCollection;
  }
}
