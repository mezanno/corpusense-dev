import type { FSHandle } from '@/data/models/fSHandle';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBFSHandleRepository } from '../fsHandle';
import { createTestDb } from './testDb';

describe('IndexedDBFSHandleRepository', () => {
  const repository = new IndexedDBFSHandleRepository();

  beforeEach(async () => {
    await createTestDb();
  });

  it('stores handles by id and returns all persisted handles', async () => {
    const first: FSHandle = { id: 'handle-1', handle: {} as FileSystemDirectoryHandle };
    const second: FSHandle = { id: 'handle-2', handle: {} as FileSystemDirectoryHandle };

    await repository.put(first);
    await repository.put(second);

    const stored = await repository.getAll();
    expect(stored).toHaveLength(2);
    expect(stored).toEqual(expect.arrayContaining([first, second]));
  });

  it('replaces an existing handle with the same id', async () => {
    await repository.put({ id: 'handle-1', handle: {} as FileSystemDirectoryHandle });
    const replacement: FSHandle = {
      id: 'handle-1',
      handle: { name: 'updated' } as FileSystemDirectoryHandle,
    };

    await repository.put(replacement);

    expect(await repository.getAll()).toEqual([replacement]);
  });
});
