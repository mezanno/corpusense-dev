import { BaseError } from '@/utils/BaseError';

export class EntityNotFoundError extends BaseError {
  constructor(context: { entity: string; id: string }) {
    super(`${context.entity} with id ${context.id} not found`);
  }
}
