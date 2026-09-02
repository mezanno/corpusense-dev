import { Collection, CollectionDetails } from '@/data/models/collection';
import { Canvas } from '@iiif/presentation-3';
import { db } from '../db';
import { getSourceRepository } from '../dbFactory';
import { CollectionLiveRepository } from './types.live';

export class IndexedDBCollectionLiveRepository implements CollectionLiveRepository {
  getAllDetails(): () => Promise<CollectionDetails[]> {
    return () => db.collections.orderBy('name').toArray();
  }

  getAllDetailsByIds(ids: string[]): () => Promise<CollectionDetails[]> {
    return () => db.collections.where('id').anyOf(ids).toArray();
  }

  getById(id: string): () => Promise<Collection> {
    return async () => {
      const details = await db.collections.get(id);
      if (details === undefined) {
        throw new Error(`Collection with id ${id} not found`);
      }
      const content = await db.collectionContents.get(id);

      return { ...details, content: content?.content || [] };
    };
  }

  getCanvasesByCollectionId(
    collectionId: string,
  ): () => Promise<{ canvas: Canvas; sourceId: string }[]> {
    const sourceRepository = getSourceRepository();
    return async () => {
      const collectionContent = await db.collectionContents.get(collectionId);
      const content = collectionContent?.content || [];
      if (content.length === 0) {
        return [];
      }

      const canvasesWithResults = await Promise.all(
        content.map(async ({ sourceId, canvasId }) => ({
          canvasResult: await sourceRepository.getCanvasById(sourceId, canvasId),
          sourceId,
        })),
      );

      const canvases = canvasesWithResults
        .filter(
          (item): item is { canvasResult: { ok: true; value: Canvas }; sourceId: string } =>
            item.canvasResult.ok,
        )
        .map((item) => ({ canvas: item.canvasResult.value, sourceId: item.sourceId }));
      return canvases;
    };
  }
}
