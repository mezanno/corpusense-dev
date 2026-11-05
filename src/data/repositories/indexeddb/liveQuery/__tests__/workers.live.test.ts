import type { Worker } from '@/data/models/worker/worker';
import { WorkerStatus } from '@/data/models/worker/worker';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBWorkerLiveRepository } from '../workers.live';
import { observe, settleLiveQuery } from './liveQueryTestUtils';

function worker(id: string, collectionId: string): Worker {
  return {
    id,
    name: 'extract',
    scope: { collectionId },
    scopeKey: collectionId,
    params: {},
    status: WorkerStatus.INPROGRESS,
    createdAt: '2026-01-01T00:00:00.000Z',
    estimatedDuration: 0,
    queue: [],
  };
}

describe('IndexedDBWorkerLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits worker changes, scopes result checks, and stops after unsubscribe', async () => {
    const repository = new IndexedDBWorkerLiveRepository();
    const all = observe(repository.getAll());
    const hasResult = observe(repository.hasResult({ collectionId: 'collection-1' }, ['extract']));
    try {
      expect(await all.next()).toEqual([]);
      expect(await hasResult.next()).toBe(false);

      await db.workers.put(worker('outside', 'collection-2'));
      await settleLiveQuery();
      expect(hasResult.latest).toBe(false);
      expect(all.latest?.map(({ id }) => id)).toEqual(['outside']);

      await db.workers.put(worker('inside', 'collection-1'));
      expect(await all.until((items) => items.some(({ id }) => id === 'inside'))).toHaveLength(2);
      expect(await hasResult.until(Boolean)).toBe(true);

      await db.workers.update('inside', { name: 'updated' });
      expect(
        (await all.until((items) => items.some(({ name }) => name === 'updated')))[0]?.name,
      ).toBe('updated');

      await db.workers.delete('inside');
      expect(await all.until((items) => !items.some(({ id }) => id === 'inside'))).toHaveLength(1);
      expect(await hasResult.until((value) => !value)).toBe(false);

      all.unsubscribe();
      hasResult.unsubscribe();
      const allCount = all.values.length;
      const resultCount = hasResult.values.length;
      await db.workers.clear();
      await settleLiveQuery();
      expect(all.values).toHaveLength(allCount);
      expect(hasResult.values).toHaveLength(resultCount);
    } finally {
      all.unsubscribe();
      hasResult.unsubscribe();
    }
  });
});
