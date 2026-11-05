import type { Project } from '@/data/models/project';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBProjectLiveRepository } from '../projects.live';
import { observe, settleLiveQuery } from './liveQueryTestUtils';

const project = (id: string, name: string): Project => ({
  id,
  name,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  sources: [],
  collections: [],
});

describe('IndexedDBProjectLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits project additions, updates and removals', async () => {
    const live = observe(new IndexedDBProjectLiveRepository().getAll());
    try {
      expect(await live.next()).toEqual([]);
      await db.projects.put(project('p1', 'Initial'));
      expect(await live.until((items) => items.length === 1)).toMatchObject([{ name: 'Initial' }]);
      await db.projects.update('p1', { name: 'Updated' });
      expect(await live.until((items) => items[0]?.name === 'Updated')).toMatchObject([
        { id: 'p1', name: 'Updated' },
      ]);
      await db.projects.delete('p1');
      expect(await live.until((items) => items.length === 0)).toEqual([]);

      live.unsubscribe();
      const count = live.values.length;
      await db.projects.put(project('after-unsubscribe', 'Ignored'));
      await settleLiveQuery();
      expect(live.values).toHaveLength(count);
    } finally {
      live.unsubscribe();
    }
  });
});
