import type { Result } from '@/data/models/result/result';
import type { ResultCreateDTO } from '@/data/models/result/result.dto';
import type { Scope } from '@/data/models/scope/scope';
import { beforeEach, describe, expect, it } from 'vitest';
import { EntityNotFoundError } from '../../EntityNotFoundError';
import { IndexedDBResultRepository } from '../results';
import { createTestDb } from './testDb';

describe('IndexedDBResultRepository', () => {
  const repository = new IndexedDBResultRepository();
  const collectionScope: Scope = { collectionId: 'collection-1' };
  const canvasScope: Scope = { collectionId: 'collection-1', canvasId: 'canvas-1' };
  const makeResult = (taskId: number, scope = collectionScope): ResultCreateDTO => ({
    scope,
    workerName: 'OCR',
    workerId: 'worker-1',
    taskId,
    value: `task-${taskId}`,
    params: { language: 'en' },
  });

  beforeEach(async () => {
    await createTestDb();
  });

  it('computes the scope key when adding a result and reads it by scope and worker name', async () => {
    const added = await repository.add(makeResult(4, canvasScope));

    expect(added).toMatchObject({ scopeKey: 'collection-1-canvas-1', scope: canvasScope });
    expect(await repository.getByScopeAndWorkerName(canvasScope, 'OCR')).toEqual({
      ok: true,
      value: added,
    });
    expect(await repository.getAll()).toEqual([added]);
  });

  it('finds results by worker and task and returns a typed error when absent', async () => {
    const result = await repository.add(makeResult(4));

    expect(await repository.getResultByWorkerIdAndTaskId('worker-1', 4)).toEqual({
      ok: true,
      value: result,
    });
    const missing = await repository.getResultByWorkerIdAndTaskId('worker-1', 99);
    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.error).toBeInstanceOf(EntityNotFoundError);
  });

  it('lists a worker’s tasks by task id and adds multiple persisted results', async () => {
    await repository.add(makeResult(9));
    await repository.add(makeResult(2));
    await repository.add(makeResult(5, canvasScope));
    const otherWorker: Result = {
      id: 20,
      ...makeResult(1),
      workerId: 'worker-2',
      workerName: 'Other worker',
      scopeKey: 'collection-1',
    };
    await repository.addAll([otherWorker]);

    expect((await repository.getAllByWorkerId('worker-1')).map(({ taskId }) => taskId)).toEqual([
      2, 5, 9,
    ]);
    expect(await repository.getAllByWorkerId('worker-2')).toEqual([otherWorker]);
    expect((await repository.getAll()).map(({ id }) => id)).toEqual([1, 2, 3, 20]);
  });

  it('returns a typed error when no result matches a scope and worker name', async () => {
    const result = await repository.getByScopeAndWorkerName(collectionScope, 'Unknown worker');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBeInstanceOf(EntityNotFoundError);
  });
});
