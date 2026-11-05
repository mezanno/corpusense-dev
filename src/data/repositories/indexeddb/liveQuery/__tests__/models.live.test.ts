import type { DataModel } from '@/data/models/dataModel/dataModel';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBModelLiveRepository } from '../models.live';
import { observe } from './liveQueryTestUtils';

const model = (id: string, name: string): DataModel => ({
  id,
  name,
  prompt: '',
  fields: [],
});

describe('IndexedDBModelLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits model additions, updates and removals in name order', async () => {
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
    } finally {
      live.unsubscribe();
    }
  });

  it('closes the live subscription when unsubscribed', async () => {
    const live = observe(new IndexedDBModelLiveRepository().getAll());
    try {
      expect(await live.next()).toEqual([]);
      live.unsubscribe();
      expect(live.closed).toBe(true);
    } finally {
      live.unsubscribe();
    }
  });
});
