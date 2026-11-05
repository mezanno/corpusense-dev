import type { NamedEntity } from '@/data/models/namedEntity';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBNamedEntityLiveRepository } from '../namedEntity.live';
import { observe, settleLiveQuery } from './liveQueryTestUtils';

const entity = (id: string, annotationIds: string[], value = id): NamedEntity => ({
  id,
  dataFieldId: 'field-1',
  value,
  selector: [],
  annotationIds,
});

describe('IndexedDBNamedEntityLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits entities linked to requested annotations and excludes unrelated rows', async () => {
    const live = observe(new IndexedDBNamedEntityLiveRepository().getByAnnotationIds(['a1']));
    try {
      expect(await live.next()).toEqual([]);
      await db.namedEntities.put(entity('outside', ['a2']));
      await settleLiveQuery();
      expect(live.latest).toEqual([]);

      await db.namedEntities.put(entity('match', ['a1']));
      expect(await live.until((items) => items.some(({ id }) => id === 'match'))).toMatchObject([
        { id: 'match', value: 'match' },
      ]);
      await db.namedEntities.update('match', { value: 'Updated' });
      expect(
        await live.until((items) => items.some(({ value }) => value === 'Updated')),
      ).toMatchObject([{ id: 'match', value: 'Updated' }]);
      await db.namedEntities.delete('match');
      expect(await live.until((items) => items.length === 0)).toEqual([]);
    } finally {
      live.unsubscribe();
    }
  });
});
