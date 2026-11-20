import { FSHandleDTO } from '@/data/models/fSHandle/fSHandle.dto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDBFSHandleRepository } from '../fsHandle';
import { createTestDb } from './testDb';

const created = '2020-01-01T00:00:00.000Z';
const modified = '2021-01-01T00:00:00.000Z';

describe('IndexedDBFSHandleRepository', () => {
  const repository = new IndexedDBFSHandleRepository();

  beforeEach(async () => {
    await createTestDb();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(created));
  });
  afterEach(() => vi.useRealTimers());

  it('stores handles by id and initializes their timestamps at creation', async () => {
    const first: FSHandleDTO = { id: 'handle-1', handle: {} as FileSystemDirectoryHandle };
    const second: FSHandleDTO = { id: 'handle-2', handle: {} as FileSystemDirectoryHandle };

    const createdFirst = await repository.put(first);
    const createdSecond = await repository.put(second);

    expect(createdFirst).toEqual({ ...first, createdAt: created, updatedAt: created });
    const stored = await repository.getAll();
    expect(stored).toHaveLength(2);
    expect(stored).toEqual(expect.arrayContaining([createdFirst, createdSecond]));
  });

  it('replaces an existing handle preserving createdAt and updating updatedAt', async () => {
    const initial = await repository.put({
      id: 'handle-1',
      handle: {} as FileSystemDirectoryHandle,
    });

    vi.setSystemTime(new Date(modified));
    const replacement: FSHandleDTO = {
      id: 'handle-1',
      handle: { name: 'updated' } as FileSystemDirectoryHandle,
    };
    const written = await repository.put(replacement);

    expect(written).toEqual({
      ...replacement,
      createdAt: initial.createdAt,
      updatedAt: modified,
    });
    expect(await repository.getAll()).toEqual([written]);
  });
});
