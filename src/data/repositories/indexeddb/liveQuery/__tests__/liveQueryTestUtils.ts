import { liveQuery } from 'dexie';

export function observe<T>(query: () => Promise<T>) {
  const values: T[] = [];
  const queue: T[] = [];
  const waiters: { resolve: (value: T) => void; reject: (error: unknown) => void }[] = [];
  let failure: unknown;

  const subscription = liveQuery(query).subscribe({
    next(value) {
      values.push(value);
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve(value);
      } else {
        queue.push(value);
      }
    },
    error(error: unknown) {
      failure = error;
      waiters.splice(0).forEach((waiter) => waiter.reject(error));
    },
  });

  const next = (): Promise<T> => {
    if (queue.length > 0) {
      return Promise.resolve(queue.shift()!);
    }
    if (failure !== undefined) {
      return Promise.reject(failure);
    }
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  };

  return {
    values,
    next,
    async until(predicate: (value: T) => boolean): Promise<T> {
      while (true) {
        const value = await next();
        if (predicate(value)) {
          return value;
        }
      }
    },
    unsubscribe() {
      subscription.unsubscribe();
    },
    get latest(): T | undefined {
      return values.at(-1);
    },
  };
}

export function settleLiveQuery(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}
