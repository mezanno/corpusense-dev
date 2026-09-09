import { BaseError } from '@/utils/BaseError';

export class EmptyCollectionError extends BaseError {
  constructor(context: { id: string; name: string }) {
    super(`Collection ${context.name} (${context.id}) is empty`);
  }
}

export class DBError extends BaseError {
  constructor(context: { message: string }) {
    super(`Database error: ${context.message}`);
  }
}
