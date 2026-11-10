import type { Task, Worker, WorkerResponse } from '@/data/models/worker/worker';
import { TaskStatus, WorkerEvent, WorkerStatus } from '@/data/models/worker/worker';
import type { WorkerCreateDTO } from '@/data/models/worker/worker.dto';
import { computeScopeKey } from '@/data/repositories/indexeddb/utils';
import type { UnknownAction } from '@reduxjs/toolkit';
import { runSaga, stdChannel } from 'redux-saga';
import type { WorkerPlugin } from '../plugins/loader';
import { workerPlugins } from '../plugins/registry';
import workerSaga from '../workers';

export const canvasScope = { collectionId: 'collection-1', canvasId: 'canvas-1' };

export function makeWorkerInput(overrides: Partial<WorkerCreateDTO> = {}): WorkerCreateDTO {
  return { id: 'worker-1', name: 'test-plugin', scope: canvasScope, params: {}, ...overrides };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return { id: 0, scope: canvasScope, status: TaskStatus.WAITING, ...overrides };
}

export function makeWorker(overrides: Partial<Worker> = {}): Worker {
  const input = makeWorkerInput(overrides);
  return {
    ...input,
    scopeKey: computeScopeKey(input.scope),
    status: WorkerStatus.INPROGRESS,
    createdAt: '2026-01-01T00:00:00.000Z',
    estimatedDuration: 0,
    queue: [makeTask()],
    ...overrides,
  };
}

export function registerTestPlugin(
  strategy: WorkerPlugin['executionStrategy'],
  run?: WorkerPlugin['run'],
): WorkerPlugin {
  const response: WorkerResponse =
    strategy === 'job'
      ? { event: WorkerEvent.JOB_ACCEPTED }
      : { event: WorkerEvent.RESULT_OK, content: 'test result' };
  const plugin: WorkerPlugin = {
    executionStrategy: strategy,
    info: { category: 'test' },
    run: run ?? (() => Promise.resolve(response)),
  };
  workerPlugins['test-plugin'] = plugin;
  return plugin;
}

export function clearTestPlugins() {
  for (const name of Object.keys(workerPlugins)) delete workerPlugins[name];
}

/** Drive the public watcher through actions; wait for emitted actions rather than time. */
export function createWorkerSagaHarness() {
  const channel = stdChannel();
  const actions: UnknownAction[] = [];
  const listeners = new Set<(action: UnknownAction) => void>();
  const saga = runSaga(
    {
      channel,
      dispatch: (action: UnknownAction) => {
        actions.push(action);
        for (const listener of listeners) listener(action);
      },
    },
    workerSaga,
  );

  return {
    actions,
    send: (action: UnknownAction) => channel.put(action),
    nextAction: (matches: (action: UnknownAction) => boolean) =>
      new Promise<UnknownAction>((resolve) => {
        const listener = (action: UnknownAction) => {
          if (matches(action)) {
            listeners.delete(listener);
            resolve(action);
          }
        };
        listeners.add(listener);
      }),
    close: async () => {
      saga.cancel();
      await saga.toPromise();
      channel.close();
      listeners.clear();
      actions.length = 0;
    },
  };
}
