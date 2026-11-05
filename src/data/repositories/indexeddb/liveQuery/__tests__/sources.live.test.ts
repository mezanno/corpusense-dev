import type { Source } from '@/data/models/source/source';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBSourceLiveRepository } from '../sources.live';
import { observe, settleLiveQuery } from './liveQueryTestUtils';

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
    const local = observe(repository.getAll('local'));
    try {
      expect(await local.next()).toEqual([]);
      await db.sources.put(source('remote-1', 'remote'));
      await settleLiveQuery();
      expect(local.latest).toEqual([]);

      await db.sources.put(source('local-1', 'local'));
      expect(await local.until((items) => items.length === 1)).toMatchObject([{ id: 'local-1' }]);
      await db.sources.update('local-1', { name: 'Renamed' });
      expect(await local.until((items) => items[0]?.name === 'Renamed')).toMatchObject([
        { id: 'local-1', name: 'Renamed' },
      ]);
      await db.sources.delete('local-1');
      expect(await local.until((items) => items.length === 0)).toEqual([]);

      local.unsubscribe();
      const count = local.values.length;
      await db.sources.clear();
      await settleLiveQuery();
      expect(local.values).toHaveLength(count);
    } finally {
      local.unsubscribe();
    }
  });
});
