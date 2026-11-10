import type {
  Task,
  TaskStatus as TaskStatusType,
  WorkerResponse,
} from '@/data/models/worker/worker';
import { TaskStatus, WorkerEvent, WorkerStatus } from '@/data/models/worker/worker';
import { createTestDb, observeTestWorker } from '@/data/repositories/indexeddb/__tests__/testDb';
import { getWorkerRepository } from '@/data/repositories/indexeddb/dbFactory';
import { pushError, pushInfo } from '@/state/reducers/events';
import { recoverWorkerRequest } from '@/state/reducers/workers';
import type { JobRow } from '@/utils/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeJobs } from './fakeJobs';
import {
  clearTestPlugins,
  createWorkerSagaHarness,
  makeTask,
  makeWorker,
  registerTestPlugin,
} from './workers.harness';

vi.mock('../plugins/registry', () => ({ workerPlugins: {} }));
vi.mock('@/utils/config', async () => {
  const jobs = await import('./fakeJobs');
  return { supabase: jobs.fakeJobs };
});

function job(status: JobRow['status'], overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 1,
    worker_id: 'worker-1',
    task_id: 0,
    status,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: null,
    user_id: 'user-1',
    plugin_name: 'test-plugin',
    worker_category: 'test',
    worker_name: 'test-plugin',
    payload: null,
    result: null,
    error: null,
    ...overrides,
  };
}

describe('worker recovery', () => {
  let harness: ReturnType<typeof createWorkerSagaHarness>;

  beforeEach(async () => {
    await createTestDb();
    clearTestPlugins();
    fakeJobs.reset();
    harness = createWorkerSagaHarness();
  });

  afterEach(async () => {
    await harness.close();
    clearTestPlugins();
    fakeJobs.reset();
    vi.restoreAllMocks();
  });

  it.each<['pending' | 'processing' | 'paused', TaskStatusType, JobRow['status']]>([
    ['pending', TaskStatus.POSTED, 'pending'],
    ['processing', TaskStatus.INPROGRESS, 'processing'],
    ['paused', TaskStatus.POSTED, 'pending'],
  ])('reconnects to a %s job without reposting it', async (status, expected, remoteStatus) => {
    const worker = makeWorker({
      status: WorkerStatus.UNFINISHED,
      queue: [makeTask({ status: TaskStatus.POSTING })],
    });
    await getWorkerRepository().addAll([worker]);
    fakeJobs.setRows([
      job(status),
      job('pending', { id: 2, worker_id: 'other-worker' }),
      job('pending', { id: 3, task_id: 1 }),
    ]);
    const run = vi.fn();
    registerTestPlugin('job', run);
    const notified = harness.nextAction(pushInfo.match);

    harness.send(recoverWorkerRequest(worker));
    await notified;

    expect(await getWorkerRepository().getById(worker.id)).toMatchObject({
      ok: true,
      value: { status: WorkerStatus.INPROGRESS, queue: [{ status: expected }] },
    });
    expect(fakeJobs.getRows().map((row) => row.status)).toEqual([
      remoteStatus,
      'pending',
      'pending',
    ]);
    expect(run).not.toHaveBeenCalled();
  });

  it('replays tasks without a job, but never retries a successful task', async () => {
    const worker = makeWorker({
      status: WorkerStatus.UNFINISHED_WITH_ERRORS,
      queue: [
        makeTask({ id: 0, status: TaskStatus.COMPLETED }),
        makeTask({ id: 1, status: TaskStatus.COMPLETED_WITH_ERRORS, statusMessage: 'old error' }),
        makeTask({ id: 2, status: TaskStatus.INPROGRESS }),
      ],
    });
    await getWorkerRepository().addAll([worker]);
    const run = vi.fn(
      (_task: Task): Promise<WorkerResponse> =>
        Promise.resolve({ event: WorkerEvent.JOB_ACCEPTED }),
    );
    registerTestPlugin('job', run);
    const notified = harness.nextAction(pushInfo.match);

    harness.send(recoverWorkerRequest(worker));
    await notified;

    expect(await getWorkerRepository().getById(worker.id)).toMatchObject({
      ok: true,
      value: {
        status: WorkerStatus.INPROGRESS,
        queue: [
          { status: TaskStatus.COMPLETED },
          { status: TaskStatus.POSTED, statusMessage: undefined },
          { status: TaskStatus.POSTED },
        ],
      },
    });
    expect(run.mock.calls.map(([task]) => task.id)).toEqual([1, 2]);
    expect(fakeJobs.calls).toHaveLength(2);
  });

  it('replays an interrupted synchronous task without retrying completed tasks', async () => {
    const worker = makeWorker({
      status: WorkerStatus.UNFINISHED,
      queue: [
        makeTask({ id: 0, status: TaskStatus.COMPLETED }),
        makeTask({ id: 1, status: TaskStatus.INPROGRESS }),
      ],
    });
    await getWorkerRepository().addAll([worker]);
    const run = vi.fn(
      (_task: Task): Promise<WorkerResponse> =>
        Promise.resolve({ event: WorkerEvent.RESULT_OK, content: 'replayed' }),
    );
    registerTestPlugin('synchronous', run);
    const notified = harness.nextAction(pushInfo.match);

    harness.send(recoverWorkerRequest(worker));
    await notified;

    expect(await getWorkerRepository().getById(worker.id)).toMatchObject({
      ok: true,
      value: {
        status: WorkerStatus.COMPLETED,
        queue: [{ status: TaskStatus.COMPLETED }, { status: TaskStatus.COMPLETED }],
      },
    });
    expect(run.mock.calls.map(([task]) => task.id)).toEqual([1]);
    expect(fakeJobs.calls).toEqual([]);
  });

  it.each(['missing', 'not recoverable'] as const)('refuses a %s worker', async (reason) => {
    const worker = makeWorker({ status: WorkerStatus.UNFINISHED });
    if (reason === 'not recoverable') {
      await getWorkerRepository().addAll([{ ...worker, status: WorkerStatus.INPROGRESS }]);
    }
    let logged!: () => void;
    const refused = new Promise<void>((resolve) => (logged = resolve));
    const logger = vi
      .spyOn(console, reason === 'missing' ? 'error' : 'warn')
      .mockImplementation(logged);
    const run = vi.fn();
    registerTestPlugin('job', run);

    harness.send(recoverWorkerRequest(worker));
    await refused;

    expect(logger).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(fakeJobs.calls).toEqual([]);
    expect(await getWorkerRepository().getAll()).toHaveLength(reason === 'missing' ? 0 : 1);
    if (reason === 'not recoverable') {
      expect(await getWorkerRepository().getById(worker.id)).toMatchObject({
        ok: true,
        value: { status: WorkerStatus.INPROGRESS, queue: worker.queue },
      });
    }
  });

  it('preserves local state and interrupts recovery when job lookup fails', async () => {
    const worker = makeWorker({
      status: WorkerStatus.UNFINISHED,
      queue: [makeTask({ status: TaskStatus.POSTED })],
    });
    await getWorkerRepository().addAll([worker]);
    fakeJobs.setError({ message: 'lookup failed' });
    const run = vi.fn();
    registerTestPlugin('job', run);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notified = harness.nextAction(pushError.match);

    harness.send(recoverWorkerRequest(worker));
    await notified;
    // The notification precedes the best-effort interruption transaction.
    const interrupted = await new Promise<
      Awaited<ReturnType<ReturnType<typeof getWorkerRepository>['getById']>>
    >((resolve, reject) => {
      const subscription = observeTestWorker(worker.id).subscribe({
        next: (result) => {
          if (result.ok && result.value.status === WorkerStatus.UNFINISHED) {
            subscription.unsubscribe();
            resolve(result);
          }
        },
        error: reject,
      });
    });
    expect(interrupted).toMatchObject({ ok: true, value: { queue: worker.queue } });
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    ['completed', TaskStatus.COMPLETED, WorkerStatus.COMPLETED],
    ['failed', TaskStatus.COMPLETED_WITH_ERRORS, WorkerStatus.COMPLETED_WITH_ERRORS],
  ] as const)(
    'reconciles an undelivered %s job on recovery without reposting it',
    async (status, taskStatus, workerStatus) => {
      const worker = makeWorker({
        status: WorkerStatus.UNFINISHED,
        queue: [makeTask({ status: TaskStatus.POSTED })],
      });
      await getWorkerRepository().addAll([worker]);
      fakeJobs.setRows([job(status)]);
      const run = vi.fn();
      registerTestPlugin('job', run);
      const notified = harness.nextAction(
        (action) => pushInfo.match(action) || pushError.match(action),
      );

      harness.send(recoverWorkerRequest(worker));
      await notified;

      expect(await getWorkerRepository().getById(worker.id)).toMatchObject({
        ok: true,
        value: { status: workerStatus, queue: [{ status: taskStatus }] },
      });
      expect(run).not.toHaveBeenCalled();
    },
  );
});
