import type { DataModel } from '@/data/models/dataModel/dataModel';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBModelLiveRepository } from '../models.live';
import { observe, settleLiveQuery } from './liveQueryTestUtils';

const model = (id: string, name: string): DataModel => ({
  id,
  name,
  prompt: '',
  fields: [],
});

describe('IndexedDBModelLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits model changes in name order and releases the subscription', async () => {
    const live = observe(new IndexedDBModelLiveRepository().getAll());
    try {
      expect(await live.next()).toEqual([]);
      await db.models.bulkPut([model('m2', 'Beta'), model('m1', 'Alpha')]);
      expect((await live.until((items) => items.length === 2)).map(({ name }) => name)).toEqual([
        'Alpha',
        'Beta',
      ]);
      await db.models.update('m2', { name: 'Aardvark' });
      expect((await live.until((items) => items[0]?.id === 'm2')).map(({ id }) => id)).toEqual([
        'm2',
        'm1',
      ]);
      await db.models.delete('m1');
      expect(await live.until((items) => items.length === 1)).toMatchObject([{ id: 'm2' }]);

      live.unsubscribe();
      const count = live.values.length;
      await db.models.clear();
      await settleLiveQuery();
      expect(live.values).toHaveLength(count);
    } finally {
      live.unsubscribe();
    }
  });
});
