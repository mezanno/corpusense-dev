import type { Source } from '@/data/models/source/source';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBSourceLiveRepository } from '../sources.live';
import { observe } from './liveQueryTestUtils';

const source = (id: string, type: Source['type'], name = id): Source => ({
  id,
  name,
  type,
  pageCount: 1,
  thumbnailBlobId: `${id}-thumb`,
});

describe('IndexedDBSourceLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits source changes filtered by type and ignores other types', async () => {
    const repository = new IndexedDBSourceLiveRepository();
    const localQuery = repository.getAll('local');
    const local = observe(localQuery);
    try {
      expect(await local.next()).toEqual([]);
      await db.sources.put(source('remote-1', 'remote'));
      expect(await localQuery()).toEqual([]);

      await db.sources.put(source('local-1', 'local'));
      expect(await local.until((items) => items.length === 1)).toMatchObject([{ id: 'local-1' }]);
      await db.sources.update('local-1', { name: 'Renamed' });
      expect(await local.until((items) => items[0]?.name === 'Renamed')).toMatchObject([
        { id: 'local-1', name: 'Renamed' },
      ]);
      await db.sources.delete('local-1');
      expect(await local.until((items) => items.length === 0)).toEqual([]);
    } finally {
      local.unsubscribe();
    }
  });

  it('closes the live subscription when unsubscribed', async () => {
    const live = observe(new IndexedDBSourceLiveRepository().getAll('local'));
    try {
      expect(await live.next()).toEqual([]);
      live.unsubscribe();
      expect(live.closed).toBe(true);
    } finally {
      live.unsubscribe();
    }
  });
});
