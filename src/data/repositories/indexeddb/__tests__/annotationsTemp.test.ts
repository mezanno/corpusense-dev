import { ElementType } from '@/data/models/annotations/annotation';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBAnnotationRepository } from '../annotations';
import { IndexedDBAnnotationTempRepository } from '../annotationsTemp';
import { makeAnnotation } from './annotationFixtures';
import { createTestDb } from './testDb';

const repository = new IndexedDBAnnotationTempRepository();
const annotationRepository = new IndexedDBAnnotationRepository();

describe('IndexedDBAnnotationTempRepository', () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it('reads annotations by canvas in order without leaking to or from permanent annotations', async () => {
    await annotationRepository.addAll([makeAnnotation('permanent', ElementType.TEXT_LINE)]);
    await repository.addAll([
      makeAnnotation('temp-later', ElementType.TEMP, undefined, 2),
      makeAnnotation('temp-earlier', ElementType.TEMP, undefined, 1),
      makeAnnotation('temp-other-canvas', ElementType.TEMP, {
        collectionId: 'collection-1',
        canvasId: 'canvas-2',
      }),
      makeAnnotation('temp-other-collection', ElementType.TEMP, {
        collectionId: 'collection-2',
        canvasId: 'canvas-1',
      }),
    ]);

    const allTemporary = await repository.getAll();
    const byCanvas = await repository.getByCanvas({
      collectionId: 'collection-1',
      canvasId: 'canvas-1',
    });

    expect(allTemporary.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'temp-later',
        'temp-earlier',
        'temp-other-canvas',
        'temp-other-collection',
      ]),
    );
    expect(byCanvas.map(({ id, order }) => [id, order])).toEqual([
      ['temp-earlier', 1],
      ['temp-later', 2],
    ]);
    expect(
      (await annotationRepository.getByScope({ collectionId: 'collection-1' })).map(({ id }) => id),
    ).toEqual(['permanent']);
  });

  it('deletes only temporary annotations belonging to the requested collection', async () => {
    await annotationRepository.addAll([makeAnnotation('permanent', ElementType.TEXT_LINE)]);
    await repository.addAll([
      makeAnnotation('temp-in-collection-1', ElementType.TEMP),
      makeAnnotation('temp-other-canvas', ElementType.TEMP, {
        collectionId: 'collection-1',
        canvasId: 'canvas-2',
      }),
      makeAnnotation('temp-in-collection-2', ElementType.TEMP, {
        collectionId: 'collection-2',
        canvasId: 'canvas-1',
      }),
    ]);

    await repository.deleteByCollection('collection-1');

    expect((await repository.getAll()).map(({ id }) => id)).toEqual(['temp-in-collection-2']);
    expect(
      (await annotationRepository.getByScope({ collectionId: 'collection-1' })).map(({ id }) => id),
    ).toEqual(['permanent']);
  });
});
