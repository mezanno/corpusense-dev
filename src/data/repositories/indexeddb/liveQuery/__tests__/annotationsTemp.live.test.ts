import { ElementType } from '@/data/models/annotations/annotation';
import { changeValue } from '@/data/models/annotations/annotation.factory';
import { getAnnotationValue } from '@/data/models/annotations/annotation.utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeAnnotation } from '../../__tests__/annotationFixtures';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBAnnotationTempLiveRepository } from '../annotationsTemp.live';
import { observe, settleLiveQuery } from './liveQueryTestUtils';

describe('IndexedDBAnnotationTempLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits temporary annotations for a scope without leaking other scopes or permanent rows', async () => {
    const repository = new IndexedDBAnnotationTempLiveRepository();
    const scope = { collectionId: 'c1', canvasId: 'canvas-1' };
    const live = observe(repository.getByScope(scope));
    const byCollection = observe(repository.getByScope({ collectionId: 'c1' }));
    const byAnnotation = observe(repository.getByScope({ ...scope, annotationId: 'temp-1' }));
    try {
      expect(await live.next()).toEqual([]);
      expect(await byCollection.next()).toEqual([]);
      expect(await byAnnotation.next()).toEqual([]);
      const outside = makeAnnotation('outside', ElementType.TEMP, {
        collectionId: 'c2',
        canvasId: 'canvas-1',
      });
      await db.annotationsTemp.put(outside);
      await settleLiveQuery();
      expect(live.latest).toEqual([]);
      expect(byCollection.latest).toEqual([]);
      expect(byAnnotation.latest).toEqual([]);

      const temporary = makeAnnotation('temp-1', ElementType.TEMP, scope);
      await db.annotationsTemp.put(temporary);
      expect(await live.until((items) => items.some(({ id }) => id === temporary.id))).toHaveLength(
        1,
      );
      expect(await byCollection.until((items) => items.length === 1)).toHaveLength(1);
      expect(await byAnnotation.until((items) => items.length === 1)).toMatchObject([
        { id: temporary.id },
      ]);

      await db.annotations.put(makeAnnotation('permanent', ElementType.TEXT_LINE, scope));
      await settleLiveQuery();
      expect(live.latest).toEqual([temporary]);

      await db.annotationsTemp.put(changeValue(temporary, 'edited'));
      expect(
        getAnnotationValue(
          (await live.until((items) => getAnnotationValue(items[0]!) === 'edited'))[0],
        ),
      ).toBe('edited');
      await db.annotationsTemp.delete(temporary.id);
      expect(await live.until((items) => items.length === 0)).toEqual([]);
      expect(await byCollection.until((items) => items.length === 0)).toEqual([]);
      expect(await byAnnotation.until((items) => items.length === 0)).toEqual([]);
    } finally {
      live.unsubscribe();
      byCollection.unsubscribe();
      byAnnotation.unsubscribe();
    }
  });
});
