import type { Result } from '@/data/models/result/result';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBResultLiveRepository } from '../results.live';
import { observe } from './liveQueryTestUtils';

const result = (id: number, value: string): Result => ({
  id,
  scope: { collectionId: 'c1' },
  scopeKey: 'c1',
  workerName: 'worker',
  workerId: 'worker-1',
  taskId: id,
  value,
  params: {},
});

describe('IndexedDBResultLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits result additions, updates and removals in id order', async () => {
    const live = observe(new IndexedDBResultLiveRepository().getAll());
    try {
      expect(await live.next()).toEqual([]);
      await db.results.bulkPut([result(2, 'second'), result(1, 'first')]);
      expect((await live.until((items) => items.length === 2)).map(({ id }) => id)).toEqual([1, 2]);
      await db.results.update(1, { value: 'updated' });
      expect(await live.until((items) => items[0]?.value === 'updated')).toMatchObject([
        { id: 1, value: 'updated' },
        { id: 2, value: 'second' },
      ]);
      await db.results.delete(2);
      expect(await live.until((items) => items.length === 1)).toMatchObject([{ id: 1 }]);
    } finally {
      live.unsubscribe();
    }
  });

  it('closes the live subscription when unsubscribed', async () => {
    const live = observe(new IndexedDBResultLiveRepository().getAll());
    try {
      expect(await live.next()).toEqual([]);
      live.unsubscribe();
      expect(live.closed).toBe(true);
    } finally {
      live.unsubscribe();
    }
  });
});
