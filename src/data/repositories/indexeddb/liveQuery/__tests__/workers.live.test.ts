import type { Worker } from '@/data/models/worker/worker';
import { WorkerStatus } from '@/data/models/worker/worker';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBWorkerLiveRepository } from '../workers.live';
import { observe } from './liveQueryTestUtils';

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

  it('emits worker additions, updates and removals', async () => {
    const all = observe(new IndexedDBWorkerLiveRepository().getAll());
    try {
      expect(await all.next()).toEqual([]);

      await db.workers.put(worker('worker-1', 'collection-1'));
      expect(await all.until((items) => items.some(({ id }) => id === 'worker-1'))).toHaveLength(1);

      await db.workers.update('worker-1', { name: 'updated' });
      expect(
        (await all.until((items) => items.some(({ name }) => name === 'updated')))[0]?.name,
      ).toBe('updated');

      await db.workers.delete('worker-1');
      expect(await all.until((items) => items.length === 0)).toEqual([]);
    } finally {
      all.unsubscribe();
    }
  });

  it('filters result presence to the requested worker name and scope', async () => {
    const repository = new IndexedDBWorkerLiveRepository();
    const scope = { collectionId: 'collection-1' };
    const query = repository.hasResult(scope, ['extract']);
    const hasResult = observe(query);
    try {
      expect(await hasResult.next()).toBe(false);
      await db.workers.put(worker('outside', 'collection-2'));
      expect(await query()).toBe(false);

      await db.workers.put(worker('inside', 'collection-1'));
      expect(await hasResult.until(Boolean)).toBe(true);
      await db.workers.delete('inside');
      expect(await hasResult.until((value) => !value)).toBe(false);
    } finally {
      hasResult.unsubscribe();
    }
  });

  it('closes the live subscription when unsubscribed', async () => {
    const all = observe(new IndexedDBWorkerLiveRepository().getAll());
    try {
      expect(await all.next()).toEqual([]);
      all.unsubscribe();
      expect(all.closed).toBe(true);
    } finally {
      all.unsubscribe();
    }
  });
});
