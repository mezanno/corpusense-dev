import { ElementType } from '@/data/models/annotations/annotation';
import { changeValue } from '@/data/models/annotations/annotation.factory';
import { getAnnotationValue } from '@/data/models/annotations/annotation.utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeAnnotation } from '../../__tests__/annotationFixtures';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBAnnotationLiveRepository } from '../annotations.live';
import { observe } from './liveQueryTestUtils';

describe('IndexedDBAnnotationLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits annotations for annotation, canvas and collection scopes', async () => {
    const repository = new IndexedDBAnnotationLiveRepository();
    const scope = { collectionId: 'c1', canvasId: 'canvas-1' };
    const canvasQuery = repository.getByScope(scope);
    const collectionQuery = repository.getByScope({ collectionId: 'c1' });
    const annotationQuery = repository.getByScope({ ...scope, annotationId: 'line-1' });
    const byCanvas = observe(canvasQuery);
    const byCollection = observe(collectionQuery);
    const byAnnotation = observe(annotationQuery);
    try {
      expect(await byCanvas.next()).toEqual([]);
      expect(await byCollection.next()).toEqual([]);
      expect(await byAnnotation.next()).toEqual([]);

      await db.annotations.put(
        makeAnnotation('outside', ElementType.TEXT_LINE, {
          collectionId: 'c2',
          canvasId: 'canvas-1',
        }),
      );
      expect(await canvasQuery()).toEqual([]);
      expect(await collectionQuery()).toEqual([]);
      expect(await annotationQuery()).toEqual([]);

      const annotation = makeAnnotation('line-1', ElementType.TEXT_LINE, scope);
      await db.annotations.put(annotation);
      expect(
        await byCanvas.until((items) => items.some(({ id }) => id === annotation.id)),
      ).toHaveLength(1);
      expect(await byCollection.until((items) => items.length === 1)).toHaveLength(1);
      expect(await byAnnotation.until((items) => items.length === 1)).toMatchObject([
        { id: annotation.id },
      ]);

      await db.annotations.put(changeValue(annotation, 'edited'));
      expect(
        getAnnotationValue(
          (await byCanvas.until((items) => getAnnotationValue(items[0]) === 'edited'))[0],
        ),
      ).toBe('edited');

      await db.annotations.delete(annotation.id);
      expect(await byCanvas.until((items) => items.length === 0)).toEqual([]);
      expect(await byCollection.until((items) => items.length === 0)).toEqual([]);
      expect(await byAnnotation.until((items) => items.length === 0)).toEqual([]);
    } finally {
      byCanvas.unsubscribe();
      byCollection.unsubscribe();
      byAnnotation.unsubscribe();
    }
  });

  it('emits type-filtered annotations and OCR presence changes', async () => {
    const repository = new IndexedDBAnnotationLiveRepository();
    const scope = { collectionId: 'c1', canvasId: 'canvas-1' };
    const typeQuery = repository.getByScopeAndType(scope, ElementType.TEXT_LINE);
    const hasOcrQuery = repository.hasOcrAnnotations(scope);
    const collectionHasOcrQuery = repository.hasOcrAnnotations({ collectionId: 'c1' });
    const byType = observe(typeQuery);
    const hasOcr = observe(hasOcrQuery);
    const collectionHasOcr = observe(collectionHasOcrQuery);
    try {
      expect(await byType.next()).toEqual([]);
      expect(await hasOcr.next()).toBe(false);
      expect(await collectionHasOcr.next()).toBe(false);

      await db.annotations.put(makeAnnotation('region-1', ElementType.TEXT_REGION, scope));
      expect(await typeQuery()).toEqual([]);
      expect(await hasOcrQuery()).toBe(false);
      expect(await collectionHasOcrQuery()).toBe(false);

      const line = makeAnnotation('line-1', ElementType.TEXT_LINE, scope);
      await db.annotations.put(line);
      expect(await byType.until((items) => items.length === 1)).toMatchObject([{ id: 'line-1' }]);
      expect(await hasOcr.until(Boolean)).toBe(true);
      expect(await collectionHasOcr.until(Boolean)).toBe(true);

      await db.annotations.delete(line.id);
      expect(await byType.until((items) => items.length === 0)).toEqual([]);
      expect(await hasOcr.until((value) => !value)).toBe(false);
      expect(await collectionHasOcr.until((value) => !value)).toBe(false);
    } finally {
      byType.unsubscribe();
      hasOcr.unsubscribe();
      collectionHasOcr.unsubscribe();
    }
  });

  it('closes the live subscription when unsubscribed', async () => {
    const live = observe(
      new IndexedDBAnnotationLiveRepository().getByScope({
        collectionId: 'c1',
        canvasId: 'canvas-1',
      }),
    );
    try {
      expect(await live.next()).toEqual([]);
      live.unsubscribe();
      expect(live.closed).toBe(true);
    } finally {
      live.unsubscribe();
    }
  });
});
