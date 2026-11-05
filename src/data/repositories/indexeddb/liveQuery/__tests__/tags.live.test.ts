import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBTagLiveRepository } from '../tags.live';
import { observe } from './liveQueryTestUtils';

describe('IndexedDBTagLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits tag additions, updates and removals', async () => {
    const live = observe(new IndexedDBTagLiveRepository().getAll());
    try {
      expect(await live.next()).toEqual([]);
      await db.tags.put({ id: 'tag-1', label: 'First' });
      expect(await live.until((tags) => tags.length === 1)).toMatchObject([{ label: 'First' }]);
      await db.tags.update('tag-1', { label: 'Updated' });
      expect(await live.until((tags) => tags[0]?.label === 'Updated')).toMatchObject([
        { id: 'tag-1', label: 'Updated' },
      ]);
      await db.tags.delete('tag-1');
      expect(await live.until((tags) => tags.length === 0)).toEqual([]);
    } finally {
      live.unsubscribe();
    }
  });

  it('closes the live subscription when unsubscribed', async () => {
    const live = observe(new IndexedDBTagLiveRepository().getAll());
    try {
      expect(await live.next()).toEqual([]);
      live.unsubscribe();
      expect(live.closed).toBe(true);
    } finally {
      live.unsubscribe();
    }
  });
});
