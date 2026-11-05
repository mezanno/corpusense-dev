import { ElementType } from '@/data/models/annotations/annotation';
import { changeValue } from '@/data/models/annotations/annotation.factory';
import { getAnnotationValue } from '@/data/models/annotations/annotation.utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeAnnotation } from '../../__tests__/annotationFixtures';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBAnnotationLiveRepository } from '../annotations.live';
import { observe, settleLiveQuery } from './liveQueryTestUtils';

describe('IndexedDBAnnotationLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits scoped and type-filtered annotations and OCR presence changes', async () => {
    const repository = new IndexedDBAnnotationLiveRepository();
    const scope = { collectionId: 'c1', canvasId: 'canvas-1' };
    const byCanvas = observe(repository.getByScope(scope));
    const byCollection = observe(repository.getByScope({ collectionId: 'c1' }));
    const byAnnotation = observe(repository.getByScope({ ...scope, annotationId: 'line-1' }));
    const byType = observe(repository.getByScopeAndType(scope, ElementType.TEXT_LINE));
    const hasOcr = observe(repository.hasOcrAnnotations(scope));
    const collectionHasOcr = observe(repository.hasOcrAnnotations({ collectionId: 'c1' }));
    try {
      expect(await byCanvas.next()).toEqual([]);
      expect(await byCollection.next()).toEqual([]);
      expect(await byAnnotation.next()).toEqual([]);
      expect(await byType.next()).toEqual([]);
      expect(await hasOcr.next()).toBe(false);
      expect(await collectionHasOcr.next()).toBe(false);

      await db.annotations.put(
        makeAnnotation('outside', ElementType.TEXT_LINE, {
          collectionId: 'c2',
          canvasId: 'canvas-1',
        }),
      );
      await settleLiveQuery();
      expect(byCanvas.latest).toEqual([]);
      expect(byCollection.latest).toEqual([]);
      expect(byAnnotation.latest).toEqual([]);
      expect(byType.latest).toEqual([]);
      expect(hasOcr.latest).toBe(false);
      expect(collectionHasOcr.latest).toBe(false);

      const annotation = makeAnnotation('line-1', ElementType.TEXT_LINE, scope);
      await db.annotations.put(annotation);
      expect(
        await byCanvas.until((items) => items.some(({ id }) => id === annotation.id)),
      ).toHaveLength(1);
      expect(await byCollection.until((items) => items.length === 1)).toHaveLength(1);
      expect(await byAnnotation.until((items) => items.length === 1)).toMatchObject([
        { id: annotation.id },
      ]);
      expect(await byType.until((items) => items.length === 1)).toHaveLength(1);
      expect(await hasOcr.until(Boolean)).toBe(true);
      expect(await collectionHasOcr.until(Boolean)).toBe(true);

      await db.annotations.put(changeValue(annotation, 'edited'));
      expect(
        getAnnotationValue(
          (await byCanvas.until((items) => getAnnotationValue(items[0]!) === 'edited'))[0],
        ),
      ).toBe('edited');

      await db.annotations.delete(annotation.id);
      expect(await byCanvas.until((items) => items.length === 0)).toEqual([]);
      expect(await byCollection.until((items) => items.length === 0)).toEqual([]);
      expect(await byAnnotation.until((items) => items.length === 0)).toEqual([]);
      expect(await byType.until((items) => items.length === 0)).toEqual([]);
      expect(await hasOcr.until((value) => !value)).toBe(false);
      expect(await collectionHasOcr.until((value) => !value)).toBe(false);
    } finally {
      byCanvas.unsubscribe();
      byCollection.unsubscribe();
      byAnnotation.unsubscribe();
      byType.unsubscribe();
      hasOcr.unsubscribe();
      collectionHasOcr.unsubscribe();
    }
  });
});
