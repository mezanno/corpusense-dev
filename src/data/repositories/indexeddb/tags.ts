import { Tag } from '@/data/models/tag/tag';
import { TagDTO } from '@/data/models/tag/tag.dto';
import { FunctionResult } from '@/utils/functionResult';
import { InvalidImportedDatesError } from '../../utils/errors';
import { db } from './db';
import { validateTimestamps } from './importWrite';
import { markMigration } from './timestamps';
import { TagRepository } from './types';

export class IndexedDBTagRepository implements TagRepository {
  async getByIds(ids: string[]): Promise<Tag[]> {
    return await db.tags.where('id').anyOf(ids).toArray();
  }

  async getAll(): Promise<Tag[]> {
    return await db.tags.toArray();
  }

  async add(tag: TagDTO): Promise<Tag> {
    // Creation path: the repository initializes both timestamps (decision 1).
    const now = new Date().toISOString();
    const newTag: Tag = { ...tag, createdAt: now, updatedAt: now };
    const id = await db.tags.add(newTag);
    return { ...newTag, id: String(id) };
  }

  /**
   * Dedicated overwrite-import path (decision 3): bulkPut with validated,
   * preserved imported dates inside a migration-marked transaction.
   */
  async importWithDates(tags: Tag[]): Promise<FunctionResult<void, InvalidImportedDatesError>> {
    if (tags.length === 0) {
      return FunctionResult.ok(undefined);
    }
    const validatedTimestamps = validateTimestamps(tags, 'Tag');
    if (!validatedTimestamps.ok) {
      return validatedTimestamps;
    }
    const entities: Tag[] = tags.map((tag, index) => ({
      ...tag,
      ...validatedTimestamps.value[index],
    }));
    await db.transaction('rw', db.tags, async (tx) => {
      markMigration(tx);
      await db.tags.bulkPut(entities);
    });
    return FunctionResult.ok(undefined);
  }
}
