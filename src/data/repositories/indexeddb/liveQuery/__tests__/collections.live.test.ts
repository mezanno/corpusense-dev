import type { CollectionDetails } from '@/data/models/collection/collection';
import type { Manifest } from '@iiif/presentation-3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBCollectionLiveRepository } from '../collections.live';
import { observe } from './liveQueryTestUtils';

const details = (id: string, name: string): CollectionDetails => ({
  id,
  name,
  tags: [],
  contentSize: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const manifest = {
  id: 'manifest-1',
  type: 'Manifest',
  label: { en: ['Manifest'] },
  items: [{ id: 'canvas-1', type: 'Canvas', items: [] }],
} as Manifest;

describe('IndexedDBCollectionLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits collection details and content additions, updates and removals', async () => {
    const repository = new IndexedDBCollectionLiveRepository();
    const all = observe(repository.getAllDetails());
    const selected = observe(repository.getAllDetailsByIds(['c1']));
    const collection = observe(repository.getById('c1'));
    try {
      expect(await all.next()).toEqual([]);
      expect(await selected.next()).toEqual([]);
      expect(await collection.next()).toBeUndefined();

      await db.collections.put(details('c1', 'Alpha'));
      expect(await all.until((items) => items.length === 1)).toMatchObject([
        { id: 'c1', name: 'Alpha' },
      ]);
      expect(await selected.until((items) => items.length === 1)).toMatchObject([{ id: 'c1' }]);
      expect(await collection.until((item) => item?.name === 'Alpha')).toMatchObject({
        content: [],
      });

      await db.collections.update('c1', { name: 'Renamed' });
      expect(await all.until((items) => items[0]?.name === 'Renamed')).toMatchObject([
        { id: 'c1', name: 'Renamed' },
      ]);
      expect(await collection.until((item) => item?.name === 'Renamed')).toMatchObject({
        id: 'c1',
        name: 'Renamed',
      });

      await db.collectionContents.put({ id: 'c1', content: [] });
      expect(await collection.until((item) => item?.content.length === 0)).toMatchObject({
        id: 'c1',
      });

      await db.transaction('rw', db.collections, db.collectionContents, async () => {
        await db.collections.delete('c1');
        await db.collectionContents.delete('c1');
      });
      expect(await all.until((items) => items.length === 0)).toEqual([]);
      expect(await selected.until((items) => items.length === 0)).toEqual([]);
      expect(await collection.until((item) => item === undefined)).toBeUndefined();
    } finally {
      all.unsubscribe();
      selected.unsubscribe();
      collection.unsubscribe();
    }
  });

  it('emits canvas resolution changes and closes its subscription when unsubscribed', async () => {
    const canvases = observe(
      new IndexedDBCollectionLiveRepository().getCanvasesByCollectionId('c1'),
    );
    try {
      expect(await canvases.next()).toEqual([]);
      await db.sourceContents.put({ id: 'source-1', type: 'remote', manifest });
      await db.collectionContents.put({
        id: 'c1',
        content: [{ sourceId: 'source-1', canvasId: 'canvas-1' }],
      });
      expect(await canvases.until((items) => items[0]?.canvas.id === 'canvas-1')).toMatchObject([
        { sourceId: 'source-1', canvas: { id: 'canvas-1' } },
      ]);

      await db.collectionContents.delete('c1');
      expect(await canvases.until((items) => items.length === 0)).toEqual([]);
      canvases.unsubscribe();
      expect(canvases.closed).toBe(true);
    } finally {
      canvases.unsubscribe();
    }
  });
});
