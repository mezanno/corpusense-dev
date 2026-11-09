import { TaskStatus, WorkerEvent, WorkerStatus } from '@/data/models/worker/worker';
import { createTestDb } from '@/data/repositories/indexeddb/__tests__/testDb';
import { getResultRepository, getWorkerRepository } from '@/data/repositories/indexeddb/dbFactory';
import useJobRealtime from '@/hooks/useJobRealtime';
import { startWorkerProcessRequest, stopWorkerProcessRequest } from '@/state/reducers/workers';
import { workerPlugins } from '@/state/sagas/plugins/registry';
import workerSaga from '@/state/sagas/workers';
import { BaseError } from '@/utils/BaseError';
import { act, renderHook } from '@testing-library/react';
import { runSaga, stdChannel } from 'redux-saga';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, FakeJobs, makeJob, makeWorker, plugin, scope, task } from './workerHarness';

const state = vi.hoisted(() => ({ fake: null as FakeJobs | null }));
vi.mock('@/utils/config', () => ({
  supabase: {
    from: (table: string) => state.fake!.from(table),
    channel: () => state.fake!.channel(),
    removeChannel: () => state.fake!.removeChannel(),
  },
}));
vi.mock('@/components/reducers/WorkerContext', () => ({
  useWorkerContext: () => ({ workers: [], getWorkersWithTrackedJobs: () => [] }),
}));

describe('worker interruption: current behaviour with the local server model', () => {
  let fake: FakeJobs;
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    testDb = await createTestDb();
    fake = new FakeJobs();
    state.fake = fake;
    for (const name of Object.keys(workerPlugins)) delete workerPlugins[name];
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    for (const name of Object.keys(workerPlugins)) delete workerPlugins[name];
    testDb.close();
    state.fake = null;
  });

  it('does not overwrite a job taken and completed concurrently with the pause', async () => {
    const enteredPlugin = deferred<void>();
    const keepPosting = deferred<never>();
    const pauseReached = deferred<void>();
    const allowPause = deferred<void>();
    const pauseFinished = deferred<void>();
    let workerId = '';
    workerPlugins['test-job'] = plugin('job', async (_task, worker) => {
      workerId = worker.id;
      fake.rows.push(makeJob({ worker_id: worker.id }));
      enteredPlugin.resolve();
      return keepPosting.promise;
    });
    fake.before = async (request) => {
      if (request.operation === 'update') {
        pauseReached.resolve();
        await allowPause.promise;
      }
    };
    fake.after = (request) => {
      if (request.operation === 'update') {
        fake.suppressReturnedRows = true;
        pauseFinished.resolve();
      }
      return Promise.resolve();
    };
    const channel = stdChannel();
    const saga = runSaga({ channel, dispatch: () => {} }, workerSaga);
    try {
      channel.put(startWorkerProcessRequest({ workerName: 'test-job', scope, params: {} }));
      await enteredPlugin.promise;
      const current = await getWorkerRepository().getById(workerId);
      if (!current.ok) throw current.error;
      channel.put(stopWorkerProcessRequest(current.value));
      await pauseReached.promise;
      expect(fake.take('test-job')?.status).toBe('pending');
      expect(fake.rows[0].status).toBe('processing');
      fake.finish(1, { status: 'completed', result: 'done', error: null });
      allowPause.resolve();
      await pauseFinished.promise;
      expect(fake.rows[0]).toMatchObject({ status: 'completed', result: 'done' });
      expect(fake.requests.find((r) => r.operation === 'update')?.filters).toEqual([
        { field: 'id', values: [1] },
        { field: 'worker_id', values: [workerId] },
        { field: 'status', values: ['pending'] },
      ]);
    } finally {
      allowPause.resolve();
      saga.cancel();
      await saga.toPromise();
    }
  });

  it('does not request a pause for a job already processing', async () => {
    const enteredPlugin = deferred<void>();
    const swept = deferred<void>();
    let workerId = '';
    workerPlugins['test-job'] = plugin('job', async (_task, worker) => {
      workerId = worker.id;
      fake.rows.push(makeJob({ worker_id: worker.id, status: 'processing' }));
      enteredPlugin.resolve();
      return deferred<never>().promise;
    });
    fake.after = (request) => {
      if (request.operation === 'select') swept.resolve();
      return Promise.resolve();
    };
    const channel = stdChannel();
    const saga = runSaga({ channel, dispatch: () => {} }, workerSaga);
    try {
      channel.put(startWorkerProcessRequest({ workerName: 'test-job', scope, params: {} }));
      await enteredPlugin.promise;
      const current = await getWorkerRepository().getById(workerId);
      if (!current.ok) throw current.error;
      channel.put(stopWorkerProcessRequest(current.value));
      await swept.promise;
      expect(fake.rows[0].status).toBe('processing');
      expect(fake.requests.some((request) => request.operation === 'update')).toBe(false);
      expect(fake.requests[0].filters).toEqual([
        { field: 'worker_id', values: [workerId] },
        { field: 'status', values: ['pending'] },
      ]);
    } finally {
      saga.cancel();
      await saga.toPromise();
    }
  });

  it('does not pause a pending job taken while the pause request is in flight', async () => {
    const enteredPlugin = deferred<void>();
    const pauseReached = deferred<void>();
    const allowPause = deferred<void>();
    const pauseFinished = deferred<void>();
    let workerId = '';
    workerPlugins['test-job'] = plugin('job', async (_task, worker) => {
      workerId = worker.id;
      fake.rows.push(makeJob({ worker_id: worker.id }));
      enteredPlugin.resolve();
      return deferred<never>().promise;
    });
    fake.before = async (request) => {
      if (request.operation === 'update') {
        pauseReached.resolve();
        await allowPause.promise;
      }
    };
    fake.after = (request) => {
      if (request.operation === 'update') pauseFinished.resolve();
      return Promise.resolve();
    };
    const channel = stdChannel();
    const saga = runSaga({ channel, dispatch: () => {} }, workerSaga);
    try {
      channel.put(startWorkerProcessRequest({ workerName: 'test-job', scope, params: {} }));
      await enteredPlugin.promise;
      const current = await getWorkerRepository().getById(workerId);
      if (!current.ok) throw current.error;
      channel.put(stopWorkerProcessRequest(current.value));
      await pauseReached.promise;
      expect(fake.take('test-job')?.status).toBe('pending');
      allowPause.resolve();
      await pauseFinished.promise;
      expect(fake.rows[0].status).toBe('processing');
    } finally {
      allowPause.resolve();
      saga.cancel();
      await saga.toPromise();
    }
  });

  it('still pauses a job that remains pending', async () => {
    const enteredPlugin = deferred<void>();
    const pauseFinished = deferred<void>();
    let workerId = '';
    workerPlugins['test-job'] = plugin('job', async (_task, worker) => {
      workerId = worker.id;
      fake.rows.push(makeJob({ worker_id: worker.id }));
      enteredPlugin.resolve();
      return deferred<never>().promise;
    });
    fake.after = (request) => {
      if (request.operation === 'update') pauseFinished.resolve();
      return Promise.resolve();
    };
    const channel = stdChannel();
    const saga = runSaga({ channel, dispatch: () => {} }, workerSaga);
    try {
      channel.put(startWorkerProcessRequest({ workerName: 'test-job', scope, params: {} }));
      await enteredPlugin.promise;
      const current = await getWorkerRepository().getById(workerId);
      if (!current.ok) throw current.error;
      channel.put(stopWorkerProcessRequest(current.value));
      await pauseFinished.promise;
      expect(fake.rows[0].status).toBe('paused');
    } finally {
      saga.cancel();
      await saga.toPromise();
    }
  });

  it('a post already in flight can insert after the stop pause sweep', async () => {
    const entered = deferred<void>();
    const releasePost = deferred<void>();
    const inserted = deferred<void>();
    const swept = deferred<void>();
    let workerId = '';
    workerPlugins['test-job'] = plugin('job', async (_task, worker) => {
      workerId = worker.id;
      entered.resolve();
      await releasePost.promise;
      fake.rows.push(makeJob({ worker_id: worker.id }));
      inserted.resolve();
      return { event: WorkerEvent.JOB_ACCEPTED };
    });
    fake.after = (request) => {
      if (request.operation === 'select') swept.resolve();
      return Promise.resolve();
    };
    const channel = stdChannel();
    const saga = runSaga({ channel, dispatch: () => {} }, workerSaga);
    try {
      channel.put(startWorkerProcessRequest({ workerName: 'test-job', scope, params: {} }));
      await entered.promise;
      const current = await getWorkerRepository().getById(workerId);
      if (!current.ok) throw current.error;
      channel.put(stopWorkerProcessRequest(current.value));
      await swept.promise;
      releasePost.resolve();
      await inserted.promise;
      expect(fake.rows[0].status).toBe('pending');
      const stored = await getWorkerRepository().getById(workerId);
      expect(stored).toMatchObject({
        ok: true,
        value: { status: WorkerStatus.UNFINISHED, queue: [{ status: TaskStatus.POSTING }] },
      });
    } finally {
      releasePost.resolve();
      saga.cancel();
      await saga.toPromise();
    }
  });

  it('does not handle a stop after the job posting loop has finished', async () => {
    const posted = deferred<void>();
    workerPlugins['test-job'] = plugin('job');
    const channel = stdChannel();
    const saga = runSaga(
      {
        channel,
        dispatch: () => {
          posted.resolve();
        },
      },
      workerSaga,
    );
    try {
      channel.put(startWorkerProcessRequest({ workerName: 'test-job', scope, params: {} }));
      await posted.promise;
      const [worker] = await getWorkerRepository().getAll();
      expect(worker.queue[0].status).toBe(TaskStatus.POSTED);
      channel.put(stopWorkerProcessRequest(worker));
      expect(await getWorkerRepository().getById(worker.id)).toMatchObject({
        ok: true,
        value: { status: WorkerStatus.INPROGRESS },
      });
      expect(fake.requests).toEqual([]);
    } finally {
      saga.cancel();
      await saga.toPromise();
    }
  });

  it('executes a synchronous plugin through the saga and persists its result', async () => {
    const completed = deferred<void>();
    workerPlugins['test-sync'] = plugin('synchronous');
    const channel = stdChannel();
    const saga = runSaga(
      {
        channel,
        dispatch: () => {
          completed.resolve();
        },
      },
      workerSaga,
    );
    try {
      channel.put(startWorkerProcessRequest({ workerName: 'test-sync', scope, params: {} }));
      await completed.promise;
      const [worker] = await getWorkerRepository().getAll();
      expect(worker).toMatchObject({
        status: WorkerStatus.COMPLETED,
        queue: [{ status: TaskStatus.COMPLETED }],
      });
      expect(await getResultRepository().getAll()).toMatchObject([
        { workerId: worker.id, taskId: 0, value: 'result' },
      ]);
      expect(fake.requests).toEqual([]);
    } finally {
      saga.cancel();
      await saga.toPromise();
    }
  });

  it('marks a post as timed out after 60 simulated seconds, without proving it was not inserted', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    const entered = deferred<void>();
    const notified = deferred<void>();
    workerPlugins['test-job'] = plugin('job', async () => {
      entered.resolve();
      return deferred<never>().promise;
    });
    const channel = stdChannel();
    const saga = runSaga(
      {
        channel,
        dispatch: () => {
          notified.resolve();
        },
      },
      workerSaga,
    );
    try {
      channel.put(startWorkerProcessRequest({ workerName: 'test-job', scope, params: {} }));
      await entered.promise;
      await vi.advanceTimersByTimeAsync(60000);
      await notified.promise;
      const [worker] = await getWorkerRepository().getAll();
      expect(worker.queue[0]).toMatchObject({
        status: TaskStatus.COMPLETED_WITH_ERRORS,
        statusMessage: 'Job post timed out after 60 seconds',
      });
    } finally {
      saga.cancel();
      await saga.toPromise();
    }
  });

  it('ignores intermediate realtime updates for an interrupted worker but still delivers terminal updates', async () => {
    const worker = makeWorker({
      status: WorkerStatus.UNFINISHED,
      queue: [task(TaskStatus.POSTED)],
    });
    await getWorkerRepository().addAll([worker]);
    const processingTask = deferred<TaskStatus>();
    const deleted = deferred<void>();
    workerPlugins['test-job'] = {
      ...plugin('job'),
      processResult: (_result, receivedTask) => {
        processingTask.resolve(receivedTask.status);
        return Promise.resolve({ event: WorkerEvent.RESULT_OK });
      },
    };
    fake.rows.push(makeJob());
    fake.after = (request) => {
      if (request.operation === 'delete') deleted.resolve();
      return Promise.resolve();
    };
    const hook = renderHook(() => useJobRealtime());
    await act(async () => {
      fake.emit(makeJob({ status: 'processing' }));
      fake.emit(makeJob({ status: 'completed', result: 'done' }));
      expect(await processingTask.promise).toBe(TaskStatus.POSTED);
      await deleted.promise;
    });
    expect(await getWorkerRepository().getById(worker.id)).toMatchObject({
      ok: true,
      value: { status: WorkerStatus.UNFINISHED, queue: [{ status: TaskStatus.COMPLETED }] },
    });
    expect(fake.rows).toHaveLength(0);
    hook.unmount();
    expect(fake.listener).toBeUndefined();
  });
});

describe('local server model controls (not server guarantees)', () => {
  it('applies conditional filters at write time and allows completion by id after a pause', async () => {
    const fake = new FakeJobs();
    fake.rows.push(makeJob());
    const reached = deferred<void>();
    const resume = deferred<void>();
    fake.before = async () => {
      reached.resolve();
      await resume.promise;
    };
    const update = fake
      .from('cs_jobs')
      .update({ status: 'paused' })
      .eq('id', 1)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    await reached.promise;
    expect(fake.take('test-job')?.status).toBe('pending');
    resume.resolve();
    expect(await update).toMatchObject({ data: null, error: null });
    expect(fake.rows[0].status).toBe('processing');
    fake.before = undefined;
    fake.rows[0].status = 'pending';
    await fake
      .from('cs_jobs')
      .update({ status: 'paused' })
      .eq('id', 1)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    fake.finish(1, { status: 'completed', result: 'done', error: null });
    expect(fake.rows[0]).toMatchObject({ status: 'completed', result: 'done' });
  });

  it('distinguishes a network failure before a write, a lost response, and no returned row', async () => {
    const fake = new FakeJobs();
    fake.rows.push(makeJob());
    fake.before = () => Promise.reject(new BaseError('network before write'));
    const write = () =>
      fake.from('cs_jobs').update({ status: 'paused' }).eq('id', 1).select('*').maybeSingle();
    const failed = await write();
    expect(failed.data).toBeNull();
    expect(failed.error).toBeInstanceOf(BaseError);
    expect(fake.rows[0].status).toBe('pending');
    fake.before = undefined;
    fake.after = () => Promise.reject(new BaseError('response lost'));
    const lost = await write();
    expect(lost.data).toBeNull();
    expect(lost.error).toBeInstanceOf(BaseError);
    expect(fake.rows[0].status).toBe('paused');
    fake.after = undefined;
    fake.suppressReturnedRows = true;
    expect(await write()).toEqual({ data: null, error: null });
  });
});
