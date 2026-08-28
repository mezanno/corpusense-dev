import { ConvertedFile } from '@/data/models/convertedFile';
import { FunctionResult } from '@/utils/functionResult';
import { EntityNotFoundError } from '../EntityNotFoundError';
import { db } from './db';
import { ConvertedFileRepository } from './types';

export class IndexedDBConvertedFileRepository implements ConvertedFileRepository {
  async getById(id: string): Promise<FunctionResult<ConvertedFile, EntityNotFoundError>> {
    const file = await db.convertedFiles.get(id);
    if (!file) {
      return FunctionResult.err(new EntityNotFoundError({ entity: 'ConvertedFile', id }));
    }
    return FunctionResult.ok(file);
  }

  async getByFolderName(
    folderName: string,
  ): Promise<FunctionResult<ConvertedFile, EntityNotFoundError>> {
    const file = await db.convertedFiles.where('folderName').equals(folderName).first();
    if (!file) {
      return FunctionResult.err(
        new EntityNotFoundError({ entity: 'ConvertedFile', id: folderName }),
      );
    }
    return FunctionResult.ok(file);
  }

  async add(file: ConvertedFile): Promise<void> {
    await db.convertedFiles.add(file);
  }

  async update(
    id: string,
    changes: Partial<Omit<ConvertedFile, 'thumbnailBlob' | 'outputDirectoryHandle'>>,
  ): Promise<void> {
    await db.convertedFiles.update(id, changes);
  }

  async delete(id: string): Promise<void> {
    await db.convertedFiles.delete(id);
  }
}
