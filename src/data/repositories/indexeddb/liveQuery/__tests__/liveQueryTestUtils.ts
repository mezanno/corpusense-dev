import { liveQuery } from 'dexie';

export function observe<T>(query: () => Promise<T>) {
  const queue: T[] = [];
  const waiters: { resolve: (value: T) => void; reject: (error: unknown) => void }[] = [];
  let failure: Error | undefined;

  const subscription = liveQuery(query).subscribe({
    next(value) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve(value);
      } else {
        queue.push(value);
      }
    },
    error(error: unknown) {
      const normalizedError = error instanceof Error ? error : Error(String(error));
      failure = normalizedError;
      waiters.splice(0).forEach((waiter) => waiter.reject(normalizedError));
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
    get closed(): boolean {
      return subscription.closed;
    },
  };
}
