import type { Task, Worker } from '@/data/models/worker/worker';
import { TaskStatus, WorkerEvent, WorkerStatus } from '@/data/models/worker/worker';
import type { WorkerPlugin } from '@/state/sagas/plugins/loader';
import { BaseError } from '@/utils/BaseError';
import type { JobRow } from '@/utils/config';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const scope = { collectionId: 'collection-1', canvasId: 'canvas-1' };

export function makeWorker(overrides: Partial<Worker> = {}): Worker {
  return {
    id: 'worker-1',
    name: 'test-job',
    scope,
    scopeKey: 'collection-1-canvas-1',
    params: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    estimatedDuration: 0,
    status: WorkerStatus.INPROGRESS,
    queue: [{ id: 0, scope, status: TaskStatus.WAITING }],
    ...overrides,
  };
}

export function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 1,
    worker_id: 'worker-1',
    task_id: 0,
    status: 'pending',
    worker_name: 'test-job',
    plugin_name: 'test-job',
    worker_category: 'test',
    user_id: 'user-1',
    payload: null,
    result: null,
    error: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: null,
    ...overrides,
  };
}

export function plugin(
  strategy: WorkerPlugin['executionStrategy'],
  run?: WorkerPlugin['run'],
): WorkerPlugin {
  return {
    executionStrategy: strategy,
    info: { category: 'test' },
    run:
      run ??
      (() =>
        Promise.resolve(
          strategy === 'job'
            ? { event: WorkerEvent.JOB_ACCEPTED }
            : { event: WorkerEvent.RESULT_OK, content: 'result' },
        )),
  };
}

export type Request = {
  operation: 'select' | 'update' | 'delete';
  filters: { field: keyof JobRow; values: unknown[] }[];
  patch?: Partial<JobRow>;
};

// Deliberately only models the client queries used here. Hooks run before and after the
// mutation, allowing a network failure before commit or a lost response after commit.
export class FakeJobs {
  rows: JobRow[] = [];
  requests: Request[] = [];
  before?: (request: Request) => Promise<void>;
  after?: (request: Request) => Promise<void>;
  suppressReturnedRows = false;
  listener?: (payload: { new: JobRow }) => void;

  from = (table: string) => {
    if (table !== 'cs_jobs') throw new BaseError(`Unexpected table ${table}`);
    return new Query(this);
  };
  channel = () => ({
    on: (_event: string, _filter: unknown, callback: (payload: { new: JobRow }) => void) => {
      this.listener = callback;
      return { subscribe: () => ({}) };
    },
  });
  removeChannel = () => {
    this.listener = undefined;
    return Promise.resolve();
  };
  emit(row: JobRow) {
    this.listener?.({ new: structuredClone(row) });
  }

  // Models only the supplied fetch_job excerpt: returns the pre-update snapshot.
  take(workerName: string): JobRow | undefined {
    const row = this.rows.find((job) => job.worker_name === workerName && job.status === 'pending');
    if (!row) return undefined;
    const snapshot = structuredClone(row);
    row.status = 'processing';
    return snapshot;
  }
  // Models perolayout's completion filtered solely by id, not other consumers.
  finish(id: number, patch: Pick<JobRow, 'status' | 'result' | 'error'>) {
    const row = this.rows.find((job) => job.id === id);
    if (row) Object.assign(row, patch);
  }
}

class Query implements PromiseLike<{ data: JobRow[] | null; error: unknown }> {
  private request: Request = { operation: 'select', filters: [] };
  constructor(private fake: FakeJobs) {}
  select(_columns: string) {
    return this;
  }
  update(patch: Partial<JobRow>) {
    this.request.operation = 'update';
    this.request.patch = patch;
    return this;
  }
  delete() {
    this.request.operation = 'delete';
    return this;
  }
  eq(field: keyof JobRow, value: unknown) {
    this.request.filters.push({ field, values: [value] });
    return this;
  }
  in(field: keyof JobRow, values: unknown[]) {
    this.request.filters.push({ field, values });
    return this;
  }
  async execute() {
    const request = structuredClone(this.request);
    this.fake.requests.push(request);
    try {
      await this.fake.before?.(request);
      const matches = this.fake.rows.filter((row) =>
        request.filters.every((f) => f.values.includes(row[f.field])),
      );
      if (request.operation === 'update')
        matches.forEach((row) => Object.assign(row, request.patch));
      if (request.operation === 'delete')
        this.fake.rows = this.fake.rows.filter((row) => !matches.includes(row));
      const data = structuredClone(matches);
      await this.fake.after?.(request);
      return { data: this.fake.suppressReturnedRows ? [] : data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }
  async maybeSingle() {
    const result = await this.execute();
    if (result.data && result.data.length > 1)
      return { data: null, error: new BaseError('multiple rows') };
    return { data: result.data?.[0] ?? null, error: result.error };
  }
  then<TResult1 = { data: JobRow[] | null; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: JobRow[] | null; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function task(status: TaskStatus): Task {
  return { id: 0, scope, status };
}
