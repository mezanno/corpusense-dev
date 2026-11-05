import type { Tag } from '@/data/models/tag';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBTagRepository } from '../tags';
import { createTestDb } from './testDb';

describe('IndexedDBTagRepository', () => {
  const repository = new IndexedDBTagRepository();

  beforeEach(async () => {
    await createTestDb();
  });

  it('adds and reads a tag by id and as part of all tags', async () => {
    const tag: Tag = { id: 'tag-1', label: 'Primary source', category: 'source' };

    await expect(repository.add(tag)).resolves.toEqual(tag);
    await expect(repository.getByIds(['tag-1'])).resolves.toEqual([tag]);
    await expect(repository.getAll()).resolves.toEqual([tag]);
  });

  it('adds multiple tags and returns only matching ids', async () => {
    const tags: Tag[] = [
      { id: 'tag-1', label: 'Book' },
      { id: 'tag-2', label: 'Article' },
    ];
    await repository.addAll(tags);

    expect(await repository.getAll()).toEqual(expect.arrayContaining(tags));
    expect(await repository.getByIds(['tag-2', 'missing'])).toEqual([tags[1]]);
    expect(await repository.getByIds([])).toEqual([]);
  });
});
