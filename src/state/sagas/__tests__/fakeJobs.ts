import { BaseError } from '@/utils/BaseError';
import type { JobRow } from '@/utils/config';

type JobError = { message: string };

/** Minimal in-memory implementation of the cs_jobs queries used by the saga. */
export function createFakeJobs() {
  let rows: JobRow[] = [];
  let error: JobError | null = null;
  const calls: string[] = [];

  function from(table: string) {
    if (table !== 'cs_jobs') throw new BaseError(`Unexpected Supabase table: ${table}`);
    calls.push(table);
    const filters: ((row: JobRow) => boolean)[] = [];
    let update: Partial<JobRow> | undefined;

    function matchingRows() {
      const matches = rows.filter((row) => filters.every((filter) => filter(row)));
      if (error === null && update !== undefined) {
        for (const row of matches) Object.assign(row, update);
      }
      return matches.map((row) => ({ ...row }));
    }

    const query = {
      select: (_columns: string) => query,
      update: (values: Partial<JobRow>) => {
        update = values;
        return query;
      },
      eq: <K extends keyof JobRow>(column: K, value: JobRow[K]) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      in: <K extends keyof JobRow>(column: K, values: JobRow[K][]) => {
        filters.push((row) => values.includes(row[column]));
        return Promise.resolve({ data: error === null ? matchingRows() : null, error });
      },
      maybeSingle: () => {
        const matches = error === null ? matchingRows() : [];
        if (matches.length > 1) {
          return Promise.resolve({ data: null, error: { message: 'Multiple jobs found' } });
        }
        return Promise.resolve({ data: matches[0] ?? null, error });
      },
    };
    return query;
  }

  return {
    from,
    calls,
    setRows: (jobs: JobRow[]) => {
      rows = jobs.map((job) => ({ ...job }));
    },
    getRows: () => rows.map((row) => ({ ...row })),
    setError: (value: JobError | null) => {
      error = value;
    },
    reset: () => {
      rows = [];
      error = null;
      calls.length = 0;
    },
  };
}

export const fakeJobs = createFakeJobs();
