import { BaseError } from '@/utils/BaseError';

export type FunctionResult<T, E = BaseError> = { ok: true; value: T } | { ok: false; error: E };

export class EntityNotFoundError extends BaseError {
  constructor(context: { entity: string; id: string }) {
    super(`${context.entity} with id ${context.id} not found`);
  }
}

export const ok = <T>(value: T): FunctionResult<T, never> => ({
  ok: true,
  value,
});

export const err = <E>(error: E): FunctionResult<never, E> => ({
  ok: false,
  error,
});
