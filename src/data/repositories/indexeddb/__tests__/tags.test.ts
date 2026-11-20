import { Tag } from '@/data/models/tag/tag';
import { TagDTO } from '@/data/models/tag/tag.dto';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { IndexedDBTagRepository } from '../tags';
import { createTestDb } from './testDb';

describe('IndexedDBTagRepository', () => {
  const repository = new IndexedDBTagRepository();

  beforeEach(async () => {
    await createTestDb();
  });

  it('adds and reads a tag by id and as part of all tags', async () => {
    const tag: TagDTO = { id: 'tag-1', label: 'Primary source', category: 'source' };

    // The repository initializes the two timestamps at creation (decision 1).
    const created = await repository.add(tag);
    expect(created).toMatchObject(tag);
    expect(z.iso.datetime().safeParse(created.createdAt).success).toBe(true);
    expect(created.updatedAt).toBe(created.createdAt);

    await expect(repository.getByIds(['tag-1'])).resolves.toEqual([created]);
    await expect(repository.getAll()).resolves.toEqual([created]);
  });

  it('imports multiple tags preserving their dates and returns only matching ids', async () => {
    const tags: Tag[] = [
      {
        id: 'tag-1',
        label: 'Book',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-02T00:00:00.000Z',
      },
      {
        id: 'tag-2',
        label: 'Article',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-03T00:00:00.000Z',
      },
    ];
    // Dedicated overwrite-import path: valid imported dates are preserved (decision 3).
    expect(await repository.importWithDates(tags)).toEqual({ ok: true, value: undefined });

    expect(await repository.getAll()).toEqual(expect.arrayContaining(tags));
    expect(await repository.getByIds(['tag-2', 'missing'])).toEqual([tags[1]]);
    expect(await repository.getByIds([])).toEqual([]);
  });

  it('rejects an import carrying invalid timestamps without writing anything', async () => {
    const invalid: Tag = {
      id: 'tag-1',
      label: 'Book',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: 'not-a-date',
    };

    const result = await repository.importWithDates([invalid]);

    expect(result.ok).toBe(false);
    expect(await repository.getAll()).toEqual([]);
  });
});
