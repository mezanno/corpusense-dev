import { ElementType } from '@/data/models/annotations/annotation';
import type { Task, WorkerResponse } from '@/data/models/worker/worker';
import { TaskStatus, WorkerEvent, WorkerStatus } from '@/data/models/worker/worker';
import { makeAnnotation } from '@/data/repositories/indexeddb/__tests__/annotationFixtures';
import {
  createTestDb,
  failResultWritesForTask,
} from '@/data/repositories/indexeddb/__tests__/testDb';
import {
  getCollectionRepository,
  getResultRepository,
  getSourceRepository,
  getWorkerRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import i18n from '@/i18n';
import { pushError, pushInfo } from '@/state/reducers/events';
import { startWorkerProcessRequest } from '@/state/reducers/workers';
import { BaseError } from '@/utils/BaseError';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeJobs } from './fakeJobs';
import {
  canvasScope,
  clearTestPlugins,
  createWorkerSagaHarness,
  registerTestPlugin,
} from './workers.harness';

vi.mock('../plugins/registry', () => ({ workerPlugins: {} }));
vi.mock('@/utils/config', async () => {
  const jobs = await import('./fakeJobs');
  return { supabase: jobs.fakeJobs };
});

async function addCollection(canvasIds: string[]) {
  const source = await getSourceRepository().add({
    type: 'remote',
    name: 'source',
    pageCount: canvasIds.length,
    thumbnailBlob: new Blob(['thumbnail']),
    manifest: {
      id: 'manifest-1',
      type: 'Manifest',
      label: { en: ['source'] },
      items: canvasIds.map((id) => ({ id, type: 'Canvas', items: [] })),
    },
  });
  if (!source.ok) throw source.error;
  const collection = await getCollectionRepository().add({
    id: 'collection-1',
    name: 'Collection',
    tags: [],
    contentSize: canvasIds.length,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content: canvasIds.map((canvasId) => ({ canvasId, sourceId: source.value.id })),
  });
  if (!collection.ok) throw collection.error;
}

describe('worker saga harness', () => {
  let harness: ReturnType<typeof createWorkerSagaHarness>;

  beforeEach(async () => {
    await createTestDb();
    clearTestPlugins();
    fakeJobs.reset();
    harness = createWorkerSagaHarness();
  });

  afterEach(async () => {
    await harness.close();
    vi.useRealTimers();
    clearTestPlugins();
    fakeJobs.reset();
    vi.restoreAllMocks();
  });

  it('ignores an unknown plugin without creating a worker', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    harness.send(
      startWorkerProcessRequest({ workerName: 'missing', scope: canvasScope, params: {} }),
    );

    expect(warning).toHaveBeenCalledWith('No plugin saga found for missing');
    expect(await getWorkerRepository().getAll()).toEqual([]);
    expect(harness.actions).toEqual([]);
  });

  it.each([
    ['canvas', canvasScope],
    ['annotation', { ...canvasScope, annotationId: 'annotation-1' }],
  ])('creates one task for a %s scope', async (_label, scope) => {
    const run = vi.fn().mockResolvedValue({ event: WorkerEvent.RESULT_OK, content: 'text' });
    registerTestPlugin('synchronous', run);
    const notified = harness.nextAction(pushInfo.match);

    harness.send(startWorkerProcessRequest({ workerName: 'test-plugin', scope, params: {} }));
    expect(await notified).toEqual(pushInfo(i18n.t('info_worker_completed')));

    const [worker] = await getWorkerRepository().getAll();
    expect(worker).toMatchObject({
      scope,
      status: WorkerStatus.COMPLETED,
      queue: [{ id: 0, scope, status: TaskStatus.COMPLETED }],
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it.each(['empty', 'missing'])('does not create a worker for an %s collection', async (kind) => {
    if (kind === 'empty') await addCollection([]);
    const run = vi.fn();
    registerTestPlugin('synchronous', run);
    const notified = harness.nextAction(pushError.match);

    harness.send(
      startWorkerProcessRequest({
        workerName: 'test-plugin',
        scope: { collectionId: 'collection-1' },
        params: {},
      }),
    );

    expect(await notified).toEqual(pushError(i18n.t('info_empty_collection')));
    expect(await getWorkerRepository().getAll()).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it('executes a collection sequentially, links tasks, persists results and estimates remaining time', async () => {
    await addCollection(['canvas-1', 'canvas-2']);
    let clock = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    let finishFirst!: (value: { event: WorkerEvent.RESULT_OK; content: string }) => void;
    let finishSecond!: (value: { event: WorkerEvent.RESULT_OK; content: unknown }) => void;
    let firstStarted!: () => void;
    let secondStarted!: () => void;
    const firstCall = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const secondCall = new Promise<void>((resolve) => {
      secondStarted = resolve;
    });
    const run = vi.fn((task: Task) => {
      if (task.id === 0) {
        firstStarted();
        return new Promise<{ event: WorkerEvent.RESULT_OK; content: string }>((resolve) => {
          finishFirst = resolve;
        });
      }
      secondStarted();
      return new Promise<{ event: WorkerEvent.RESULT_OK; content: unknown }>((resolve) => {
        finishSecond = resolve;
      });
    });
    registerTestPlugin('synchronous', run);
    const notified = harness.nextAction(pushInfo.match);

    harness.send(
      startWorkerProcessRequest({
        workerName: 'test-plugin',
        scope: { collectionId: 'collection-1' },
        params: { language: 'en' },
      }),
    );
    await firstCall;
    const [started] = await getWorkerRepository().getAll();
    expect(started.queue).toMatchObject([
      {
        id: 0,
        scope: { collectionId: 'collection-1', canvasId: 'canvas-1' },
        status: TaskStatus.INPROGRESS,
      },
      {
        id: 1,
        scope: { collectionId: 'collection-1', canvasId: 'canvas-2' },
        status: TaskStatus.WAITING,
        previousTask: { workerId: started.id, taskId: 0 },
      },
    ]);
    expect(started.queue[0].previousTask).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);

    clock = 1100;
    finishFirst({ event: WorkerEvent.RESULT_OK, content: 'first text' });
    await secondCall;
    const [inProgress] = await getWorkerRepository().getAll();
    expect(inProgress.estimatedDuration).toBe(100);
    expect(inProgress.queue.map((task) => task.status)).toEqual([
      TaskStatus.COMPLETED,
      TaskStatus.INPROGRESS,
    ]);
    expect(await getResultRepository().getAllByWorkerId(started.id)).toMatchObject([
      {
        taskId: 0,
        value: 'first text',
        workerName: 'test-plugin',
        workerCategory: 'test',
        params: { language: 'en' },
        scope: started.queue[0].scope,
      },
    ]);

    clock = 1200;
    finishSecond({
      event: WorkerEvent.RESULT_OK,
      content: [
        makeAnnotation('one', ElementType.UNKNOWN),
        makeAnnotation('two', ElementType.UNKNOWN),
      ],
    });
    expect(await notified).toEqual(pushInfo(i18n.t('info_worker_completed')));
    const [completed] = await getWorkerRepository().getAll();
    expect(completed.status).toBe(WorkerStatus.COMPLETED);
    expect(completed.estimatedDuration).toBe(0);
    expect(completed.queue.map((task) => task.status)).toEqual([
      TaskStatus.COMPLETED,
      TaskStatus.COMPLETED,
    ]);
    expect(await getResultRepository().getAllByWorkerId(started.id)).toMatchObject([
      { taskId: 0, value: 'first text' },
      { taskId: 1, value: 'one\ntwo', scope: started.queue[1].scope },
    ]);
    expect(fakeJobs.calls).toEqual([]);
  });

  it.each(['throw', 'error response', 'wrong strategy', 'persistence'])(
    'continues the queue after a %s failure',
    async (failure) => {
      await addCollection(['canvas-1', 'canvas-2']);
      const cleanupWriteFailure =
        failure === 'persistence' ? failResultWritesForTask(0) : undefined;
      const run = vi.fn((task: { id: number }): Promise<WorkerResponse> => {
        if (task.id === 0) {
          if (failure === 'throw') return Promise.reject(new BaseError('plugin failed'));
          if (failure === 'error response')
            return Promise.resolve({
              event: WorkerEvent.RESULT_ERR,
              message: 'plugin rejected task',
            });
          if (failure === 'wrong strategy')
            return Promise.resolve({ event: WorkerEvent.JOB_ACCEPTED });
        }
        return Promise.resolve({ event: WorkerEvent.RESULT_OK, content: `result ${task.id}` });
      });
      registerTestPlugin('synchronous', run);
      const notified = harness.nextAction(pushError.match);

      try {
        harness.send(
          startWorkerProcessRequest({
            workerName: 'test-plugin',
            scope: { collectionId: 'collection-1' },
            params: {},
          }),
        );
        expect(await notified).toEqual(pushError(i18n.t('info_worker_completed_with_error')));

        const [worker] = await getWorkerRepository().getAll();
        const expectedMessage = {
          throw: 'plugin failed',
          'error response': 'plugin rejected task',
          'wrong strategy': 'Plugin returned an event that does not match its execution strategy',
          persistence: 'result storage failed',
        }[failure];
        expect(worker).toMatchObject({
          status: WorkerStatus.COMPLETED_WITH_ERRORS,
          estimatedDuration: 0,
          queue: [
            { id: 0, status: TaskStatus.COMPLETED_WITH_ERRORS, statusMessage: expectedMessage },
            { id: 1, status: TaskStatus.COMPLETED },
          ],
        });
        expect(run.mock.calls.map(([task]) => task.id)).toEqual([0, 1]);
        expect(await getResultRepository().getAllByWorkerId(worker.id)).toMatchObject([
          { taskId: 1, value: 'result 1' },
        ]);
        expect(fakeJobs.calls).toEqual([]);
      } finally {
        cleanupWriteFailure?.();
      }
    },
  );

  it('runs a synchronous plugin through the watcher and persists its result', async () => {
    expect(await getWorkerRepository().getAll()).toEqual([]);
    registerTestPlugin('synchronous');
    const notified = harness.nextAction(pushInfo.match);

    harness.send(
      startWorkerProcessRequest({ workerName: 'test-plugin', scope: canvasScope, params: {} }),
    );
    await notified;

    const workers = await getWorkerRepository().getAll();
    expect(workers).toHaveLength(1);
    expect(workers[0]).toMatchObject({
      status: WorkerStatus.COMPLETED,
      queue: [{ status: TaskStatus.COMPLETED }],
    });
    expect(await getResultRepository().getAllByWorkerId(workers[0].id)).toMatchObject([
      { value: 'test result', taskId: 0 },
    ]);
    expect(fakeJobs.calls).toEqual([]);
  });

  it('starts with an empty database and runs a deterministic job plugin', async () => {
    expect(await getWorkerRepository().getAll()).toEqual([]);
    expect(await getResultRepository().getAll()).toEqual([]);
    registerTestPlugin('job');
    const notified = harness.nextAction(pushInfo.match);

    harness.send(
      startWorkerProcessRequest({ workerName: 'test-plugin', scope: canvasScope, params: {} }),
    );
    await notified;

    const workers = await getWorkerRepository().getAll();
    expect(workers).toHaveLength(1);
    expect(workers[0].queue[0].status).toBe(TaskStatus.POSTED);
    expect(fakeJobs.calls).toEqual([]);
  });

  it('posts each collection task once and keeps listening after acceptance', async () => {
    await addCollection(['canvas-1', 'canvas-2']);
    let acceptFirst!: (response: WorkerResponse) => void;
    let firstStarted!: () => void;
    let secondStarted!: () => void;
    const firstCall = new Promise<void>((resolve) => (firstStarted = resolve));
    const secondCall = new Promise<void>((resolve) => (secondStarted = resolve));
    const run = vi.fn((task: Task): Promise<WorkerResponse> => {
      if (task.id === 0) {
        firstStarted();
        return new Promise((resolve) => (acceptFirst = resolve));
      }
      secondStarted();
      return Promise.resolve({ event: WorkerEvent.JOB_ACCEPTED });
    });
    registerTestPlugin('job', run);
    const notified = harness.nextAction(pushInfo.match);

    harness.send(
      startWorkerProcessRequest({
        workerName: 'test-plugin',
        scope: { collectionId: 'collection-1' },
        params: {},
      }),
    );
    await firstCall;
    const [posting] = await getWorkerRepository().getAll();
    expect(posting.status).toBe(WorkerStatus.INPROGRESS);
    expect(posting.queue.map((task) => task.status)).toEqual([
      TaskStatus.POSTING,
      TaskStatus.WAITING,
    ]);
    expect(run).toHaveBeenCalledTimes(1);

    acceptFirst({ event: WorkerEvent.JOB_ACCEPTED });
    await secondCall;
    expect(await notified).toEqual(pushInfo(i18n.t('info_worker_all_tasks_posted')));
    const [posted] = await getWorkerRepository().getAll();
    expect(posted.status).toBe(WorkerStatus.INPROGRESS);
    expect(posted.queue.map((task) => task.status)).toEqual([TaskStatus.POSTED, TaskStatus.POSTED]);
    expect(run.mock.calls.map(([task]) => task.id)).toEqual([0, 1]);
    expect(await getResultRepository().getAllByWorkerId(posted.id)).toEqual([]);
    expect(fakeJobs.calls).toEqual([]);
  });

  it.each(['throw', 'error response', 'wrong strategy', 'missing response'])(
    'continues posting after a %s failure',
    async (failure) => {
      await addCollection(['canvas-1', 'canvas-2']);
      // Simulate a plugin violating its TypeScript contract at runtime.
      const missingResponse = vi
        .fn<() => Promise<WorkerResponse>>()
        .mockResolvedValue(undefined as unknown as WorkerResponse);
      const run = vi.fn((task: Task): Promise<WorkerResponse> => {
        if (task.id === 0) {
          if (failure === 'throw') return Promise.reject(new BaseError('post failed'));
          if (failure === 'error response')
            return Promise.resolve({ event: WorkerEvent.RESULT_ERR, message: 'post rejected' });
          if (failure === 'wrong strategy')
            return Promise.resolve({ event: WorkerEvent.RESULT_OK });
          return missingResponse();
        }
        return Promise.resolve({ event: WorkerEvent.JOB_ACCEPTED });
      });
      registerTestPlugin('job', run);
      const notified = harness.nextAction(pushInfo.match);

      harness.send(
        startWorkerProcessRequest({
          workerName: 'test-plugin',
          scope: { collectionId: 'collection-1' },
          params: {},
        }),
      );
      expect(await notified).toEqual(pushInfo(i18n.t('info_worker_all_tasks_posted')));
      const [worker] = await getWorkerRepository().getAll();
      const message = {
        throw: 'post failed',
        'error response': 'post rejected',
        'wrong strategy': 'Plugin returned an event that does not match its execution strategy',
        'missing response': 'Job plugin completed without a response',
      }[failure];
      expect(worker).toMatchObject({
        status: WorkerStatus.INPROGRESS_WITH_ERRORS,
        queue: [
          { status: TaskStatus.COMPLETED_WITH_ERRORS, statusMessage: message },
          { status: TaskStatus.POSTED },
        ],
      });
      expect(run.mock.calls.map(([task]) => task.id)).toEqual([0, 1]);
      expect(await getResultRepository().getAllByWorkerId(worker.id)).toEqual([]);
      expect(fakeJobs.calls).toEqual([]);
    },
  );

  it('notifies a terminal error when the only job post fails', async () => {
    registerTestPlugin('job', () =>
      Promise.resolve({ event: WorkerEvent.RESULT_ERR, message: 'post rejected' }),
    );
    const notified = harness.nextAction(pushError.match);
    harness.send(
      startWorkerProcessRequest({ workerName: 'test-plugin', scope: canvasScope, params: {} }),
    );

    expect(await notified).toEqual(pushError(i18n.t('info_worker_completed_with_error')));
    const [worker] = await getWorkerRepository().getAll();
    expect(worker).toMatchObject({
      status: WorkerStatus.COMPLETED_WITH_ERRORS,
      queue: [{ status: TaskStatus.COMPLETED_WITH_ERRORS, statusMessage: 'post rejected' }],
    });
    expect(fakeJobs.calls).toEqual([]);
  });

  it('times out a pending post after 60 seconds and continues the queue', async () => {
    await addCollection(['canvas-1', 'canvas-2']);
    let firstStarted!: () => void;
    let acceptLate!: (response: WorkerResponse) => void;
    const firstCall = new Promise<void>((resolve) => (firstStarted = resolve));
    const run = vi.fn((task: Task): Promise<WorkerResponse> => {
      if (task.id === 0) {
        // Fake only timers, not the scheduling used by fake-indexeddb.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        firstStarted();
        return new Promise((resolve) => (acceptLate = resolve));
      }
      return Promise.resolve({ event: WorkerEvent.JOB_ACCEPTED });
    });
    registerTestPlugin('job', run);
    const notified = harness.nextAction(pushInfo.match);
    harness.send(
      startWorkerProcessRequest({
        workerName: 'test-plugin',
        scope: { collectionId: 'collection-1' },
        params: {},
      }),
    );
    await firstCall;
    await vi.advanceTimersByTimeAsync(59_999);
    const [beforeTimeout] = await getWorkerRepository().getAll();
    expect(beforeTimeout.queue.map((task) => task.status)).toEqual([
      TaskStatus.POSTING,
      TaskStatus.WAITING,
    ]);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(await notified).toEqual(pushInfo(i18n.t('info_worker_all_tasks_posted')));
    const [worker] = await getWorkerRepository().getAll();
    expect(worker).toMatchObject({
      status: WorkerStatus.INPROGRESS_WITH_ERRORS,
      queue: [
        {
          status: TaskStatus.COMPLETED_WITH_ERRORS,
          statusMessage: 'Job post timed out after 60 seconds',
        },
        { status: TaskStatus.POSTED },
      ],
    });
    expect(run.mock.calls.map(([task]) => task.id)).toEqual([0, 1]);
    expect(fakeJobs.calls).toEqual([]);
    acceptLate({ event: WorkerEvent.JOB_ACCEPTED });
    await Promise.resolve();
    const [afterLateAcceptance] = await getWorkerRepository().getAll();
    expect(afterLateAcceptance.queue[0]).toMatchObject({
      status: TaskStatus.COMPLETED_WITH_ERRORS,
      statusMessage: 'Job post timed out after 60 seconds',
    });
  });

  it('does not time out an accepted job while it is processing', async () => {
    const run = vi.fn((): Promise<WorkerResponse> => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      return Promise.resolve({ event: WorkerEvent.JOB_ACCEPTED });
    });
    registerTestPlugin('job', run);
    const notified = harness.nextAction(pushInfo.match);
    harness.send(
      startWorkerProcessRequest({ workerName: 'test-plugin', scope: canvasScope, params: {} }),
    );
    expect(await notified).toEqual(pushInfo(i18n.t('info_worker_all_tasks_posted')));
    const [posted] = await getWorkerRepository().getAll();
    expect(posted.queue[0].status).toBe(TaskStatus.POSTED);

    const delivered = await getWorkerRepository().updateTaskStatus(posted.id, 0, {
      type: WorkerEvent.JOB_DELIVERED,
      jobStatus: 'processing',
    });
    expect(delivered.ok).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);

    const [processing] = await getWorkerRepository().getAll();
    expect(processing.status).toBe(WorkerStatus.INPROGRESS);
    expect(processing.queue[0]).toMatchObject({ status: TaskStatus.INPROGRESS });
    expect(processing.queue[0].statusMessage).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(run).toHaveBeenCalledOnce();
    expect(harness.actions).toEqual([pushInfo(i18n.t('info_worker_all_tasks_posted'))]);
    expect(fakeJobs.calls).toEqual([]);
  });

  it('provides controllable job lookup, updates and failures without a network', async () => {
    fakeJobs.setRows([
      {
        id: 1,
        worker_id: 'worker-1',
        task_id: 0,
        status: 'pending',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: null,
        user_id: 'user-1',
        plugin_name: 'test-plugin',
        worker_category: 'test',
        worker_name: 'test-plugin',
        payload: null,
        result: null,
        error: null,
      },
    ]);

    const lookup = await fakeJobs
      .from('cs_jobs')
      .select('*')
      .eq('worker_id', 'worker-1')
      .eq('task_id', 0)
      .maybeSingle();
    expect(lookup.data).toMatchObject({ id: 1, status: 'pending' });
    const active = await fakeJobs
      .from('cs_jobs')
      .select('*')
      .eq('worker_id', 'worker-1')
      .in('status', ['pending', 'processing']);
    expect(active.data).toHaveLength(1);
    await fakeJobs
      .from('cs_jobs')
      .update({ status: 'paused' })
      .eq('id', 1)
      .select('*')
      .maybeSingle();
    expect(fakeJobs.getRows()[0].status).toBe('paused');

    fakeJobs.setError({ message: 'unavailable' });
    const failed = await fakeJobs
      .from('cs_jobs')
      .update({ status: 'pending' })
      .eq('id', 1)
      .select('*')
      .maybeSingle();
    expect(failed).toEqual({ data: null, error: { message: 'unavailable' } });
    expect(fakeJobs.getRows()[0].status).toBe('paused');
  });
});
