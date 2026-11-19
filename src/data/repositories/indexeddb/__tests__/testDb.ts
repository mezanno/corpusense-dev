import { BaseError } from '@/utils/BaseError';
import Dexie, { liveQuery } from 'dexie';
import 'fake-indexeddb/auto';
import { db } from '../db';
import { getWorkerRepository } from '../dbFactory';

export async function createTestDb() {
  db.close();
  await db.delete();
  await db.open();
  return db;
}

/** Observe committed worker changes without polling or real-time delays. */
export function observeTestWorker(workerId: string) {
  return liveQuery(() => getWorkerRepository().getById(workerId));
}

/**
 * Number of subscribers to Dexie's global `storagemutated` event. Every active
 * `liveQuery` (including `useLiveQuery`) adds exactly one; used to check that
 * tests leave no subscriptions behind after unmounting.
 */
export function countLiveQuerySubscribers(): number {
  return Dexie.on('storagemutated').subscribers.length;
}

/** Fail a specific result write at the IndexedDB boundary; return a cleanup function. */
export function failResultWritesForTask(taskId: number) {
  const failWrite = (_key: unknown, result: { taskId: number }) => {
    if (result.taskId === taskId) throw new BaseError('result storage failed');
  };
  db.results.hook('creating', failWrite);
  return () => db.results.hook('creating').unsubscribe(failWrite);
}
