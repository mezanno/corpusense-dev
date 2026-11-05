import { ElementType } from '@/data/models/annotations/annotation';
import { changeValue } from '@/data/models/annotations/annotation.factory';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBAnnotationRepository } from '../annotations';
import { makeAnnotation } from './annotationFixtures';
import { createTestDb } from './testDb';

const repository = new IndexedDBAnnotationRepository();

describe('IndexedDBAnnotationRepository', () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it('finds annotations by id, annotation scope, canvas scope and collection scope', async () => {
    const sameCanvasEarlier = makeAnnotation(
      'same-canvas-earlier',
      ElementType.TEXT_LINE,
      undefined,
      1,
    );
    const sameCanvasLater = makeAnnotation(
      'same-canvas-later',
      ElementType.TEXT_LINE,
      undefined,
      2,
    );
    const anotherCanvas = makeAnnotation('another-canvas', ElementType.TEXT_LINE, {
      collectionId: 'collection-1',
      canvasId: 'canvas-2',
    });
    const anotherCollection = makeAnnotation('another-collection', ElementType.TEXT_LINE, {
      collectionId: 'collection-2',
      canvasId: 'canvas-1',
    });
    await repository.addAll([sameCanvasEarlier, sameCanvasLater]);
    await repository.addAll([anotherCanvas]);
    await repository.addAll([anotherCollection]);

    const byId = await repository.getById('same-canvas-later');
    const missingById = await repository.getById('missing');
    const byAnnotation = await repository.getByScope({
      collectionId: 'collection-1',
      canvasId: 'canvas-1',
      annotationId: 'same-canvas-later',
    });
    const byCanvas = await repository.getByScope({
      collectionId: 'collection-1',
      canvasId: 'canvas-1',
    });
    const byCollection = await repository.getByScope({ collectionId: 'collection-1' });

    expect(byId).toMatchObject({ ok: true, value: { id: 'same-canvas-later' } });
    expect(missingById.ok).toBe(false);
    expect(missingById.ok === false && missingById.error.name).toBe('EntityNotFoundError');
    expect(byAnnotation.map(({ id }) => id)).toEqual(['same-canvas-later']);
    expect(byCanvas.map(({ id }) => id)).toEqual(['same-canvas-earlier', 'same-canvas-later']);
    expect(byCollection.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['same-canvas-earlier', 'same-canvas-later', 'another-canvas']),
    );
  });

  it('filters by annotation type and keeps results isolated to the requested scope', async () => {
    await repository.addAll([
      makeAnnotation('line-1', ElementType.TEXT_LINE),
      makeAnnotation('region-1', ElementType.TEXT_REGION),
    ]);
    await repository.addAll([
      makeAnnotation('line-other-canvas', ElementType.TEXT_LINE, {
        collectionId: 'collection-1',
        canvasId: 'canvas-2',
      }),
    ]);
    await repository.addAll([
      makeAnnotation('line-other-collection', ElementType.TEXT_LINE, {
        collectionId: 'collection-2',
        canvasId: 'canvas-1',
      }),
    ]);

    const lines = await repository.getByScopeAndTypes(
      { collectionId: 'collection-1', canvasId: 'canvas-1' },
      [ElementType.TEXT_LINE],
    );
    const withoutTypeFilter = await repository.getByScopeAndTypes(
      { collectionId: 'collection-1', canvasId: 'canvas-1' },
      [],
    );

    expect(lines.map(({ id }) => id)).toEqual(['line-1']);
    expect(withoutTypeFilter.map(({ id }) => id)).toEqual(['line-1', 'region-1']);
  });

  it('assigns the next order independently for each type when adding annotations', async () => {
    expect(
      await repository.getNextOrderByScopeAndType(
        { collectionId: 'collection-1', canvasId: 'canvas-1' },
        ElementType.TEXT_LINE,
      ),
    ).toBe(1);
    await repository.addAll([
      makeAnnotation('line-1', ElementType.TEXT_LINE),
      makeAnnotation('line-2', ElementType.TEXT_LINE),
      makeAnnotation('region-1', ElementType.TEXT_REGION),
    ]);

    const newAnnotations = await repository.addAll([
      makeAnnotation('region-2', ElementType.TEXT_REGION),
      makeAnnotation('line-3', ElementType.TEXT_LINE),
      makeAnnotation('line-4', ElementType.TEXT_LINE),
    ]);

    expect(
      await repository.getNextOrderByScopeAndType(
        { collectionId: 'collection-1', canvasId: 'canvas-1' },
        ElementType.TEXT_LINE,
      ),
    ).toBe(5);
    expect(newAnnotations.map(({ id, order }) => [id, order])).toEqual([
      ['region-2', 2],
      ['line-3', 3],
      ['line-4', 4],
    ]);
  });

  it('updates annotation data in place when its type does not change', async () => {
    await repository.addAll([
      makeAnnotation('line-1', ElementType.TEXT_LINE),
      makeAnnotation('line-2', ElementType.TEXT_LINE),
      makeAnnotation('line-3', ElementType.TEXT_LINE),
    ]);

    await repository.update(
      changeValue(makeAnnotation('line-2', ElementType.TEXT_LINE, undefined, 2), 'edited'),
    );

    const lines = await repository.getByScopeAndTypes(
      { collectionId: 'collection-1', canvasId: 'canvas-1' },
      [ElementType.TEXT_LINE],
    );
    expect(
      lines.map(({ id, order, bodies }) => [
        id,
        order,
        bodies.find((body) => body.purpose === 'tagging')?.value,
      ]),
    ).toEqual([
      ['line-1', 1, 'line-1'],
      ['line-2', 2, 'edited'],
      ['line-3', 3, 'line-3'],
    ]);
  });

  it('reassigns order on type change and closes the gap in the previous type', async () => {
    await repository.addAll([
      makeAnnotation('line-1', ElementType.TEXT_LINE),
      makeAnnotation('line-2', ElementType.TEXT_LINE),
      makeAnnotation('line-3', ElementType.TEXT_LINE),
      makeAnnotation('region-1', ElementType.TEXT_REGION),
    ]);

    await repository.update(makeAnnotation('line-2', ElementType.TEXT_REGION, undefined, 99));

    const lines = await repository.getByScopeAndTypes(
      { collectionId: 'collection-1', canvasId: 'canvas-1' },
      [ElementType.TEXT_LINE],
    );
    const regions = await repository.getByScopeAndTypes(
      { collectionId: 'collection-1', canvasId: 'canvas-1' },
      [ElementType.TEXT_REGION],
    );
    expect(lines.map(({ id, order }) => [id, order])).toEqual([
      ['line-1', 1],
      ['line-3', 2],
    ]);
    expect(regions.map(({ id, order }) => [id, order])).toEqual([
      ['region-1', 1],
      ['line-2', 2],
    ]);
  });

  it('swaps an annotation order with another annotation of the same type', async () => {
    await repository.addAll([
      makeAnnotation('line-1', ElementType.TEXT_LINE),
      makeAnnotation('line-2', ElementType.TEXT_LINE),
      makeAnnotation('line-3', ElementType.TEXT_LINE),
      makeAnnotation('region-1', ElementType.TEXT_REGION),
    ]);

    await repository.updateOrder('line-1', 3);

    const lines = await repository.getByScopeAndTypes(
      { collectionId: 'collection-1', canvasId: 'canvas-1' },
      [ElementType.TEXT_LINE],
    );
    const regions = await repository.getByScopeAndTypes(
      { collectionId: 'collection-1', canvasId: 'canvas-1' },
      [ElementType.TEXT_REGION],
    );
    expect(lines.map(({ id, order }) => [id, order])).toEqual([
      ['line-3', 1],
      ['line-2', 2],
      ['line-1', 3],
    ]);
    expect(regions.map(({ id, order }) => [id, order])).toEqual([['region-1', 1]]);
  });

  it('deletes selected ids, ignores missing ids and reindexes only the matching type', async () => {
    await repository.addAll([
      makeAnnotation('line-1', ElementType.TEXT_LINE),
      makeAnnotation('line-2', ElementType.TEXT_LINE),
      makeAnnotation('line-3', ElementType.TEXT_LINE),
      makeAnnotation('region-1', ElementType.TEXT_REGION),
    ]);
    await repository.addAll([
      makeAnnotation('other-canvas-line', ElementType.TEXT_LINE, {
        collectionId: 'collection-1',
        canvasId: 'canvas-2',
      }),
    ]);

    const deletedIds = await repository.deleteByIds(['line-2', 'missing']);
    const remainingLines = await repository.getByScopeAndTypes(
      { collectionId: 'collection-1', canvasId: 'canvas-1' },
      [ElementType.TEXT_LINE],
    );
    const deletedRegions = await repository.deleteByScopeAndType(
      { collectionId: 'collection-1', canvasId: 'canvas-1' },
      [ElementType.TEXT_REGION],
    );
    const remaining = await repository.getByScope({ collectionId: 'collection-1' });

    expect(deletedIds).toEqual(['line-2', 'missing']);
    expect(remainingLines.map(({ id, order }) => [id, order])).toEqual([
      ['line-1', 1],
      ['line-3', 2],
    ]);
    expect(deletedRegions).toEqual(['region-1']);
    expect(remaining.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['line-1', 'line-3', 'other-canvas-line']),
    );
  });

  it('deletes an annotation by id and all annotations in a requested scope', async () => {
    await repository.addAll([makeAnnotation('canvas-1-line', ElementType.TEXT_LINE)]);
    await repository.addAll([
      makeAnnotation('canvas-2-line', ElementType.TEXT_LINE, {
        collectionId: 'collection-1',
        canvasId: 'canvas-2',
      }),
    ]);
    await repository.addAll([
      makeAnnotation('other-collection-line', ElementType.TEXT_LINE, {
        collectionId: 'collection-2',
        canvasId: 'canvas-1',
      }),
    ]);

    await repository.deleteById('canvas-1-line');
    const deletedIds = await repository.deleteByScope({
      collectionId: 'collection-1',
      canvasId: 'canvas-2',
    });

    expect(deletedIds).toEqual(['canvas-2-line']);
    expect(await repository.getByScope({ collectionId: 'collection-1' })).toEqual([]);
    expect(
      (await repository.getByScope({ collectionId: 'collection-2' })).map(({ id }) => id),
    ).toEqual(['other-collection-line']);
  });

  it('finds the smallest containing text region as a line parent and reports missing or ineligible parents', async () => {
    const target = makeAnnotation('line-target', ElementType.TEXT_LINE, undefined, 1, {
      minX: 40,
      minY: 40,
      maxX: 60,
      maxY: 60,
    });
    const largeRegion = makeAnnotation('region-large', ElementType.TEXT_REGION, undefined, 1, {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
    });
    const smallRegion = makeAnnotation('region-small', ElementType.TEXT_REGION, undefined, 2, {
      minX: 20,
      minY: 20,
      maxX: 70,
      maxY: 70,
    });
    await repository.addAll([target, largeRegion, smallRegion]);

    const parent = await repository.getParent(target);
    const noParent = await repository.getParent(
      makeAnnotation('orphan-line', ElementType.TEXT_LINE, {
        collectionId: 'collection-1',
        canvasId: 'canvas-without-region',
      }),
    );
    const ineligible = await repository.getParent(
      makeAnnotation('not-a-line', ElementType.UNKNOWN),
    );

    expect(parent).toMatchObject({ ok: true, value: { id: 'region-small' } });
    expect(noParent.ok).toBe(false);
    expect(noParent.ok === false && noParent.error.name).toBe('EntityNotFoundError');
    expect(ineligible.ok).toBe(false);
    expect(ineligible.ok === false && ineligible.error.name).toBe('EntityNotFoundError');
  });
});
