import { Scope } from '@/data/models/scope/scope';
import { isCollectionScope } from '@/data/models/scope/scope.utils';
import { Task, Worker, WorkerStatus } from '@/data/models/worker/worker';
import { WorkerCreateDTO } from '@/data/models/worker/worker.dto';
import { BaseError } from '@/utils/BaseError';
import { FunctionResult } from '@/utils/functionResult';
import { EntityNotFoundError } from '../EntityNotFoundError';
import { db } from './db';
import { WorkerRepository } from './types';
import { computeScopeKey } from './utils';

export class StatusChangeError extends BaseError {
  constructor(context: { workerId: string; taskId: string; newStatus: WorkerStatus }) {
    super(
      `Task ${context.taskId} from worker ${context.workerId} cannot change to status ${context.newStatus}`,
      { context },
    );
  }
}

export class IndexedDBWorkerRepository implements WorkerRepository {
  async getAll(): Promise<Worker[]> {
    return await db.workers.toArray();
  }

  async getById(id: string): Promise<FunctionResult<Worker, EntityNotFoundError>> {
    const worker = await db.workers.get(id);
    if (!worker) {
      return FunctionResult.err(new EntityNotFoundError({ entity: 'Worker', id }));
    }
    return FunctionResult.ok(worker);
  }

  async getByScope(scope: Scope, subScope: boolean): Promise<Worker[]> {
    if (subScope) {
      return await db.workers
        .where('scopeKey')
        .startsWithIgnoreCase(computeScopeKey(scope))
        .toArray();
    }
    return await db.workers.where('scopeKey').equals(computeScopeKey(scope)).toArray();
  }

  async getByNamesAndScope(workerNames: string[], scope: Scope): Promise<Worker[]> {
    const scopeKey = computeScopeKey(scope);

    const workers = await db.workers
      .where('[scopeKey+name]')
      .anyOf(workerNames.map((name) => [scopeKey, name]))
      .toArray();

    // Sort workers by createdAt in descending order
    return workers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async add(worker: WorkerCreateDTO): Promise<Worker> {
    const newWorker: Worker = {
      ...worker,
      scopeKey: computeScopeKey(worker.scope),
      status: WorkerStatus.INPROGRESS,
      createdAt: new Date().toISOString(),
      queue: [],
      estimatedDuration: 0, // Default to 0, can be updated later
    };
    await db.workers.add(newWorker);
    return newWorker;
  }

  async addAll(workers: Worker[]): Promise<void> {
    await db.workers.bulkAdd(workers);
  }

  async patch(id: string, changes: Partial<Worker>): Promise<void> {
    await db.workers.update(id, changes);
  }

  async updateTaskStatus(
    workerId: string,
    taskId: number,
    newStatus: WorkerStatus,
    statusMessage?: string,
  ): Promise<FunctionResult<Task, EntityNotFoundError | StatusChangeError>> {
    const worker = await db.workers.get(workerId);
    if (!worker) {
      return FunctionResult.err(new EntityNotFoundError({ entity: 'Worker', id: workerId }));
    }
    const taskIndex = worker.queue.findIndex((task) => task.id === taskId);
    if (taskIndex === -1) {
      return FunctionResult.err(
        new EntityNotFoundError({ entity: 'Task', id: `${workerId}_${taskId}` }),
      );
    }
    const currentStatus = worker.queue[taskIndex].status;
    switch (newStatus) {
      case WorkerStatus.POSTING:
        if (currentStatus !== WorkerStatus.INPROGRESS) {
          return FunctionResult.err(
            new StatusChangeError({ workerId, taskId: `${taskId}`, newStatus }),
          );
        }
        break;
      case WorkerStatus.POSTED:
        if (currentStatus !== WorkerStatus.POSTING) {
          return FunctionResult.err(
            new StatusChangeError({ workerId, taskId: `${taskId}`, newStatus }),
          );
        }
        break;
      case WorkerStatus.INPROGRESS:
        if (currentStatus !== WorkerStatus.WAITING && currentStatus !== WorkerStatus.POSTED) {
          return FunctionResult.err(
            new StatusChangeError({ workerId, taskId: `${taskId}`, newStatus }),
          );
        }
        break;
      default:
        break;
    }
    const updatedTask: Task = {
      ...worker.queue[taskIndex],
      status: newStatus,
      statusMessage: statusMessage,
    };
    const updatedQueue = worker.queue.map((task, i) => (i === taskIndex ? updatedTask : task));

    // Determine the overall worker status based on the entire queue
    const allFinished = worker.queue.every(
      (t) => t.status === WorkerStatus.COMPLETED || t.status === WorkerStatus.ERROR,
    );
    const anyError = worker.queue.some((t) => t.status === WorkerStatus.ERROR);

    let overallStatus: WorkerStatus;
    if (allFinished) {
      overallStatus = anyError ? WorkerStatus.COMPLETED_WITH_ERRORS : WorkerStatus.COMPLETED;
    } else {
      // If not all tasks are finished, it's either in progress or in progress with errors
      overallStatus = anyError ? WorkerStatus.INPROGRESS_WITH_ERRORS : WorkerStatus.INPROGRESS;
    }

    try {
      await db.transaction('rw', db.workers, async () => {
        // Persist changes to IndexedDB
        await this.patch(worker.id, {
          status: overallStatus,
        });

        await db.workers.update(workerId, { queue: updatedQueue });
      });
      return FunctionResult.ok(updatedTask);
    } catch (error) {
      console.error('Error updating task status:', error);
      return FunctionResult.err(new EntityNotFoundError({ entity: 'Worker', id: workerId }));
    }
  }

  async deleteById(workerId: string): Promise<void> {
    await db.transaction('rw', db.workers, db.results, async () => {
      await db.workers.delete(workerId);
      await db.results.where('workerId').equals(workerId).delete();
    });
  }

  async deleteByScope(scope: Scope): Promise<string[]> {
    const scopeKey = computeScopeKey(scope);
    let workersToDelete = [];
    if (isCollectionScope(scope)) {
      workersToDelete = await db.workers.where('scopeKey').startsWithIgnoreCase(scopeKey).toArray();
    } else {
      workersToDelete = await db.workers.where('scopeKey').equals(scopeKey).toArray();
    }
    const workerIds = workersToDelete.map((worker) => worker.id);
    await db.transaction('rw', db.workers, db.results, async () => {
      await db.workers.bulkDelete(workerIds);
      await db.results.where('workerId').anyOf(workerIds).delete();
      return workerIds;
    });
    return [];
  }

  async deleteResultById(workerId: string, taskId: number): Promise<void> {
    await db.transaction('rw', db.workers, db.results, async () => {
      await db.results.where({ workerId, taskId }).delete();
      const worker = await db.workers.get(workerId);
      if (worker) {
        const updatedQueue = worker.queue.map((task) =>
          task.id !== taskId ? task : { ...task, status: WorkerStatus.WAITING },
        );
        await db.workers.update(workerId, { queue: updatedQueue });
      }
    });
  }
}
