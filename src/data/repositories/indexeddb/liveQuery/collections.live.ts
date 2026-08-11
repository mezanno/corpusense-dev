import { Collection, CollectionDetails } from '@/data/models/Collection';
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

      console.log('content ', content);

      //get the list of canvases in the collection (with their sourceId)
      const canvases = await Promise.all(
        content.map(async ({ sourceId, canvasId }) => ({
          canvas: await sourceRepository.getCanvasById(sourceId, canvasId),
          sourceId,
        })),
      );

      // const canvasesOrderedBySourceId = groupBy(canvasesWithSourceId, 'sourceId');

      // //group the canvases by manifestId
      // const groupedCanvasesIds = mapValues(canvasesOrderedBySourceId, (value) =>
      //   value.map((elt) => elt.canvasId),
      // );

      // const canvases: Canvas[] = [];
      // for (const sourceId in groupedCanvasesIds) {
      //   const canvasIds = groupedCanvasesIds[sourceId];
      //   const results = canvasIds.length
      //     ? await Promise.all(canvasIds.map((id) => sourceRepository.getCanvasById(sourceId, id)))
      //     : [];
      //   canvases.push(...results);
      // }

      console.log('canvases ', canvases);

      return canvases;
    };
  }
}
