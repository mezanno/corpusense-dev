import type { Worker } from '@/data/models/worker/worker';
import { TaskStatus, WorkerStatus } from '@/data/models/worker/worker';
import { StatusChangeError, WorkerEvent } from '@/data/models/worker/workerStatusLaw';
import Dexie from 'dexie';
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { db } from '../db';
import type { WorkerRepository } from '../types';
import { IndexedDBWorkerRepository } from '../workers';
import { createTestDb } from './testDb';

const workerTableSchema = '&id, name, status, [scopeKey+name]';

function makeStoredWorker(id: string, overrides: Partial<Worker> = {}): Worker {
  const scope = overrides.scope ?? { collectionId: 'collection-1' };
  return {
    id,
    name: `worker-${id}`,
    scope,
    params: {},
    scopeKey:
      overrides.scopeKey ??
      ('canvasId' in scope && scope.canvasId
        ? `${scope.collectionId}-${scope.canvasId}`
        : scope.collectionId),
    status: WorkerStatus.INPROGRESS,
    createdAt: '2026-01-01T00:00:00.000Z',
    estimatedDuration: 0,
    queue: [],
    ...overrides,
  };
}

function makeResult(id: number, workerId: string, taskId: number) {
  return {
    id,
    scope: { collectionId: 'collection-1' },
    scopeKey: 'collection-1',
    workerName: `worker-${workerId}`,
    workerId,
    taskId,
    value: `result-${id}`,
    params: {},
  };
}

async function createVersion31Database(workers: unknown[]) {
  db.close();
  await Dexie.delete('mezanno');

  const legacyDb = new Dexie('mezanno');
  legacyDb.version(31).stores({
    collections: '&id, name, *tags.id',
    collectionContents: '&id',
    history: '&url',
    storedManifests: '&id, name',
    storedManifestContents: '&id',
    typesList: '&label',
    itemMetadata: '[id+attribute.label]',
    tags: '&id',
    models: '&id, name',
    annotations:
      '&id, canvasId, collectionId, [canvasId+collectionId], order, [canvasId+collectionId+type], [collectionId+type]',
    annotationsTemp:
      '&id, canvasId, collectionId, [canvasId+collectionId], order, [canvasId+collectionId+type]',
    namedEntities: '&id, *annotationIds, type.id',
    results: '++id, workerName, workerId, [scopeKey+workerName], taskId, [workerId+taskId]',
    workers: workerTableSchema,
    handles: '&id',
    convertedFiles: '&id, folderName',
    modifierChains: '&id, name',
    projects: '&id, name',
    sources: '&id, name, type',
    sourceContents: '&id',
    storedBlobs: '&id',
  });
  await legacyDb.open();
  await legacyDb.table('workers').bulkAdd(workers);
  legacyDb.close();
}

const legacyWorker = (
  id: string,
  status: string,
  queue: { id: number; scope: { collectionId: string; canvasId: string }; status: string }[] = [],
) => ({
  id,
  name: 'legacy-worker',
  scope: { collectionId: 'collection-1' },
  params: {},
  scopeKey: 'collection-1',
  status,
  createdAt: '2026-01-01T00:00:00.000Z',
  estimatedDuration: 0,
  queue,
});

const legacyTask = (id: number, status: string) => ({
  id,
  scope: { collectionId: 'collection-1', canvasId: `canvas-${id}` },
  status,
});

describe('IndexedDBWorkerRepository status characterization', () => {
  const repository = new IndexedDBWorkerRepository();

  beforeEach(async () => {
    await createTestDb();
  });

  it('reads all workers and returns a typed error for an unknown id', async () => {
    await repository.addAll([makeStoredWorker('worker-1'), makeStoredWorker('worker-2')]);

    const all = await repository.getAll();
    const found = await repository.getById('worker-1');
    const missing = await repository.getById('missing');

    expect(all.map((worker) => worker.id)).toEqual(['worker-1', 'worker-2']);
    expect(found).toMatchObject({ ok: true, value: { id: 'worker-1' } });
    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.error.name).toBe('EntityNotFoundError');
  });

  it('finds workers by exact scope or descendant scope', async () => {
    await repository.addAll([
      makeStoredWorker('worker-collection', { scopeKey: 'collection-1' }),
      makeStoredWorker('worker-canvas', {
        scope: { collectionId: 'collection-1', canvasId: 'canvas-1' },
        scopeKey: 'collection-1-canvas-1',
      }),
      makeStoredWorker('worker-other-collection', {
        scope: { collectionId: 'collection-10' },
        scopeKey: 'collection-10',
      }),
    ]);

    const exact = await repository.getByScope({ collectionId: 'collection-1' }, false);
    const descendants = await repository.getByScope({ collectionId: 'collection-1' }, true);

    expect(exact.map((worker) => worker.id)).toEqual(['worker-collection']);
    expect(descendants.map((worker) => worker.id)).toEqual(
      expect.arrayContaining(['worker-collection', 'worker-canvas']),
    );
    expect(descendants.map((worker) => worker.id)).not.toContain('worker-other-collection');
  });

  it('finds requested worker names in scope, newest first', async () => {
    await repository.addAll([
      makeStoredWorker('old', {
        name: 'extract',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      makeStoredWorker('new', {
        name: 'extract',
        createdAt: '2026-03-01T00:00:00.000Z',
      }),
      makeStoredWorker('other-name', { name: 'translate' }),
      makeStoredWorker('other-scope', {
        name: 'extract',
        scope: { collectionId: 'collection-2' },
        scopeKey: 'collection-2',
      }),
    ]);

    const matches = await repository.getByNamesAndScope(['extract'], {
      collectionId: 'collection-1',
    });

    expect(matches.map((worker) => worker.id)).toEqual(['new', 'old']);
  });

  it('persists new workers with defaults and supports bulk add and patch', async () => {
    const created = await repository.add(
      {
        id: 'created',
        name: 'created-worker',
        scope: { collectionId: 'collection-1', canvasId: 'canvas-1' },
        params: { language: 'fr' },
      },
      [
        {
          id: 0,
          scope: { collectionId: 'collection-1', canvasId: 'canvas-1' },
          status: TaskStatus.WAITING,
        },
      ],
    );
    await repository.addAll([makeStoredWorker('bulk')]);
    await repository.patch('created', { name: 'renamed-worker', estimatedDuration: 42 });

    const persisted = await repository.getById('created');
    expect(created).toMatchObject({
      scopeKey: 'collection-1-canvas-1',
      status: WorkerStatus.INPROGRESS,
      queue: [{ id: 0, status: TaskStatus.WAITING }],
      estimatedDuration: 0,
    });
    expect(created.createdAt).toEqual(expect.any(String));
    expect(persisted.ok && persisted.value).toMatchObject({
      name: 'renamed-worker',
      estimatedDuration: 42,
      status: WorkerStatus.INPROGRESS,
      queue: [{ id: 0, status: TaskStatus.WAITING }],
    });
    expect((await repository.getById('bulk')).ok).toBe(true);
  });

  it('updates worker lifecycle status and reports refused and missing transitions', async () => {
    await repository.add({
      id: 'worker-status',
      name: 'test-worker',
      scope: { collectionId: 'collection-1' },
      params: {},
    });

    const updated = await repository.updateWorkerStatus('worker-status', {
      type: WorkerEvent.INTERRUPT,
    });
    const refused = await repository.updateWorkerStatus('worker-status', {
      type: WorkerEvent.INTERRUPT,
    });
    const missing = await repository.updateWorkerStatus('missing', {
      type: WorkerEvent.INTERRUPT,
    });

    expect(updated).toMatchObject({ ok: true, value: { status: WorkerStatus.UNFINISHED } });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.error).toBeInstanceOf(StatusChangeError);
    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.error.name).toBe('EntityNotFoundError');
  });

  it('returns a typed error when updating a task that does not exist', async () => {
    await repository.add({
      id: 'worker-task',
      name: 'test-worker',
      scope: { collectionId: 'collection-1' },
      params: {},
    });

    const missing = await repository.updateTaskStatus('worker-task', 99, {
      type: WorkerEvent.START,
    });

    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.error.name).toBe('EntityNotFoundError');
  });

  it('deletes a worker and its results while preserving other workers’ results', async () => {
    await repository.addAll([makeStoredWorker('worker-delete'), makeStoredWorker('worker-keep')]);
    await db.results.bulkAdd([makeResult(1, 'worker-delete', 0), makeResult(2, 'worker-keep', 0)]);

    await repository.deleteById('worker-delete');

    expect((await repository.getAll()).map((worker) => worker.id)).toEqual(['worker-keep']);
    expect((await db.results.toArray()).map((result) => result.id)).toEqual([2]);
  });

  it('deletes only the result matching both worker and task ids', async () => {
    await db.results.bulkAdd([
      makeResult(1, 'worker-1', 0),
      makeResult(2, 'worker-1', 1),
      makeResult(3, 'worker-2', 0),
    ]);

    await repository.deleteResultById('worker-1', 0);

    expect((await db.results.toArray()).map((result) => result.id)).toEqual([2, 3]);
  });

  it('persists a task transition and derives the worker status', async () => {
    await repository.add(
      {
        id: 'worker-1',
        name: 'test-worker',
        scope: { collectionId: 'collection-1' },
        params: {},
      },
      [
        {
          id: 0,
          scope: { collectionId: 'collection-1', canvasId: 'canvas-1' },
          status: TaskStatus.WAITING,
        },
      ],
    );

    const started = await repository.updateTaskStatus('worker-1', 0, { type: WorkerEvent.START });
    const completed = await repository.updateTaskStatus('worker-1', 0, {
      type: WorkerEvent.RESULT_OK,
    });
    const worker = await repository.getById('worker-1');

    expect(started.ok).toBe(true);
    expect(completed.ok).toBe(true);
    expect(worker.ok && worker.value.status).toBe(WorkerStatus.COMPLETED);
    expect(worker.ok && worker.value.queue[0].status).toBe(TaskStatus.COMPLETED);
  });

  it('rejects a task status transition that violates the current repository rules', async () => {
    await repository.add(
      {
        id: 'worker-2',
        name: 'test-worker',
        scope: { collectionId: 'collection-1' },
        params: {},
      },
      [
        {
          id: 0,
          scope: { collectionId: 'collection-1', canvasId: 'canvas-1' },
          status: TaskStatus.WAITING,
        },
      ],
    );

    const result = await repository.updateTaskStatus('worker-2', 0, {
      type: WorkerEvent.JOB_ACCEPTED,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBeInstanceOf(StatusChangeError);
  });

  it('returns and deletes workers and results in a collection scope, including descendants', async () => {
    await repository.add({
      id: 'worker-collection',
      name: 'collection-worker',
      scope: { collectionId: 'collection-1' },
      params: {},
    });
    await repository.add({
      id: 'worker-canvas',
      name: 'canvas-worker',
      scope: { collectionId: 'COLLECTION-1', canvasId: 'canvas-1' },
      params: {},
    });
    await repository.add({
      id: 'worker-other',
      name: 'other-worker',
      scope: { collectionId: 'collection-2' },
      params: {},
    });
    await repository.add({
      id: 'worker-prefix-collision',
      name: 'prefix-collision-worker',
      scope: { collectionId: 'collection-10' },
      params: {},
    });
    await db.results.bulkAdd([
      {
        id: 1,
        scope: { collectionId: 'collection-1' },
        scopeKey: 'collection-1',
        workerName: 'collection-worker',
        workerId: 'worker-collection',
        taskId: 0,
        value: 'collection result',
        params: {},
      },
      {
        id: 2,
        scope: { collectionId: 'COLLECTION-1', canvasId: 'canvas-1' },
        scopeKey: 'COLLECTION-1-canvas-1',
        workerName: 'canvas-worker',
        workerId: 'worker-canvas',
        taskId: 0,
        value: 'canvas result',
        params: {},
      },
      {
        id: 3,
        scope: { collectionId: 'collection-2' },
        scopeKey: 'collection-2',
        workerName: 'other-worker',
        workerId: 'worker-other',
        taskId: 0,
        value: 'other result',
        params: {},
      },
      {
        id: 4,
        scope: { collectionId: 'collection-10' },
        scopeKey: 'collection-10',
        workerName: 'prefix-collision-worker',
        workerId: 'worker-prefix-collision',
        taskId: 0,
        value: 'prefix collision result',
        params: {},
      },
    ]);

    const deletedIds = await repository.deleteByScope({ collectionId: 'collection-1' });

    expect(deletedIds).toHaveLength(2);
    expect(deletedIds).toEqual(expect.arrayContaining(['worker-collection', 'worker-canvas']));
    expect((await repository.getAll()).map((worker) => worker.id)).toEqual(
      expect.arrayContaining(['worker-other', 'worker-prefix-collision']),
    );
    expect((await db.results.toArray()).map((result) => result.id)).toEqual([3, 4]);
  });

  it('deletes only workers with an exact non-collection scope key', async () => {
    await repository.add({
      id: 'worker-target',
      name: 'target-worker',
      scope: { collectionId: 'collection-1', canvasId: 'canvas-1' },
      params: {},
    });
    await repository.add({
      id: 'worker-other-canvas',
      name: 'other-canvas-worker',
      scope: { collectionId: 'collection-1', canvasId: 'canvas-2' },
      params: {},
    });

    const deletedIds = await repository.deleteByScope({
      collectionId: 'collection-1',
      canvasId: 'canvas-1',
    });

    expect(deletedIds).toEqual(['worker-target']);
    expect((await repository.getAll()).map((worker) => worker.id)).toEqual(['worker-other-canvas']);
  });

  it('migrates v31 task and worker alphabets into v32', async () => {
    await createVersion31Database([
      legacyWorker('failed-worker', 'posted', [
        legacyTask(0, 'error'),
        legacyTask(1, TaskStatus.COMPLETED),
      ]),
      legacyWorker('empty-failed-worker', 'error'),
      legacyWorker('empty-posted-worker', 'posted'),
      legacyWorker('unfinished-worker', 'unfinished', [legacyTask(0, 'error')]),
    ]);

    await db.open();
    const workers = await db.workers.toArray();
    const byId = new Map(workers.map((worker) => [worker.id, worker]));

    expect(byId.get('failed-worker')?.queue[0].status).toBe(TaskStatus.COMPLETED_WITH_ERRORS);
    expect(byId.get('failed-worker')?.status).toBe(WorkerStatus.COMPLETED_WITH_ERRORS);
    expect(byId.get('empty-failed-worker')?.status).toBe(WorkerStatus.COMPLETED_WITH_ERRORS);
    expect(byId.get('empty-posted-worker')?.status).toBe(WorkerStatus.INPROGRESS);
    expect(byId.get('unfinished-worker')?.queue[0].status).toBe(TaskStatus.COMPLETED_WITH_ERRORS);
    expect(byId.get('unfinished-worker')?.status).toBe(WorkerStatus.UNFINISHED);
  });

  it('rejects unknown persisted task statuses instead of silently coercing them', async () => {
    await createVersion31Database([
      legacyWorker('unknown-worker', 'posted', [legacyTask(0, 'cancelled')]),
    ]);

    await expect(db.open()).rejects.toThrow('Unknown persisted task status during migration');
  });

  it('rejects unknown persisted worker statuses even when tasks can be derived', async () => {
    await createVersion31Database([
      legacyWorker('unknown-worker', 'cancelled', [legacyTask(0, TaskStatus.WAITING)]),
    ]);

    await expect(db.open()).rejects.toThrow('Unknown persisted worker status during migration');
  });
});

describe('WorkerRepository type surface', () => {
  it('does not expose worker status or queue through patch()', () => {
    expectTypeOf<Parameters<WorkerRepository['patch']>[1]>().toEqualTypeOf<
      Partial<Omit<Worker, 'status' | 'queue'>>
    >();
  });
});
