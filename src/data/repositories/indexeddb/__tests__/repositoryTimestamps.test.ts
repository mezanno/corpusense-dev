import { ElementType } from '@/data/models/annotations/annotation';
import { WorkerEvent } from '@/data/models/worker/workerStatusLaw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDBAnnotationRepository } from '../annotations';
import { IndexedDBAnnotationTempRepository } from '../annotationsTemp';
import { IndexedDBCollectionRepository } from '../collections';
import { db } from '../db';
import { IndexedDBModelRepository } from '../models';
import { IndexedDBSourceRepository } from '../sources';
import { IndexedDBWorkerRepository } from '../workers';
import { makeAnnotation } from './annotationFixtures';
import { createTestDb } from './testDb';

const created = '2020-01-01T00:00:00.000Z';
const modified = '2021-01-01T00:00:00.000Z';

describe('repository timestamps and returned values', () => {
  beforeEach(async () => {
    await createTestDb();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(created));
  });
  afterEach(() => vi.useRealTimers());

  it('returns a newly created source and its content exactly as stored', async () => {
    const repository = new IndexedDBSourceRepository();
    const result = await repository.add({
      type: 'remote',
      name: 'Source',
      pageCount: 0,
      thumbnailBlob: new Blob(),
      manifest: { id: 'manifest', type: 'Manifest', label: { en: ['Manifest'] }, items: [] },
    });
    if (!result.ok) throw result.error;
    expect(result.value).toMatchObject({
      createdAt: created,
      updatedAt: created,
      content: { createdAt: created, updatedAt: created },
    });
    expect(await repository.getSourceWithContentById(result.value.id)).toEqual(result);
  });

  it('returns workers with the timestamps persisted at creation and status change', async () => {
    const repository = new IndexedDBWorkerRepository();
    const worker = await repository.add({
      id: 'worker',
      name: 'worker',
      scope: { collectionId: 'collection' },
      params: {},
    });
    expect(worker).toMatchObject({ createdAt: created, updatedAt: created });
    expect(await repository.getById(worker.id)).toEqual({ ok: true, value: worker });
    vi.setSystemTime(new Date(modified));
    const result = await repository.updateWorkerStatus(worker.id, { type: WorkerEvent.INTERRUPT });
    expect(result).toMatchObject({ ok: true, value: { createdAt: created, updatedAt: modified } });
    expect(await repository.getById(worker.id)).toEqual(result);
  });

  it('returns persisted dates for added, updated, reordered and temporary annotations', async () => {
    const repository = new IndexedDBAnnotationRepository();
    const temporary = new IndexedDBAnnotationTempRepository();
    const [annotation] = await repository.addAll([makeAnnotation('a', ElementType.TEXT_LINE)]);
    const [temp] = await temporary.addAll([makeAnnotation('temp', ElementType.TEMP)]);
    expect(annotation).toMatchObject({ createdAt: created, updatedAt: created });
    expect(temp).toMatchObject({ createdAt: created, updatedAt: created });
    expect(temp).toEqual(await db.annotationsTemp.get('temp'));
    vi.setSystemTime(new Date(modified));
    const [updated] = await repository.update({ ...annotation, order: 2 });
    expect(updated).toMatchObject({ createdAt: created, updatedAt: modified });
    expect(updated).toEqual(await db.annotations.get('a'));
    const [reordered] = await repository.updateOrder('a', 3);
    expect(reordered).toEqual(await db.annotations.get('a'));
  });

  it('returns both persisted annotations after swapping their order', async () => {
    const repository = new IndexedDBAnnotationRepository();
    await repository.addAll([
      makeAnnotation('a', ElementType.TEXT_LINE),
      makeAnnotation('b', ElementType.TEXT_LINE),
    ]);
    vi.setSystemTime(new Date(modified));
    const swapped = await repository.updateOrder('a', 2);
    expect(swapped.map((annotation) => annotation.id)).toEqual(['a', 'b']);
    expect(swapped).toEqual(await db.annotations.bulkGet(['a', 'b']));
    expect(swapped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'a', createdAt: created, updatedAt: modified, order: 2 }),
        expect.objectContaining({ id: 'b', createdAt: created, updatedAt: modified, order: 1 }),
      ]),
    );
  });

  it('returns the updated collection after removing an element', async () => {
    const repository = new IndexedDBCollectionRepository();
    const collection = await repository.create({
      name: 'Collection',
      tags: [],
      contentSize: 1,
      content: [{ sourceId: 'source', canvasId: 'canvas' }],
    });
    if (!collection.ok) throw collection.error;
    vi.setSystemTime(new Date(modified));
    const result = await repository.deleteElement(collection.value.id, 'canvas');
    expect(result).toMatchObject({ ok: true, value: { createdAt: created, updatedAt: modified } });
    expect(await repository.getById(collection.value.id)).toEqual(result);
  });

  it('rejects invalid dates on the special model import path without overwriting', async () => {
    const repository = new IndexedDBModelRepository();
    const model = {
      id: 'model',
      name: 'Model',
      prompt: '',
      fields: [],
      createdAt: created,
      updatedAt: created,
    };
    await repository.add(model);
    const rejection = await repository.importWithDates({ ...model, updatedAt: 'invalid' });
    expect(rejection.ok).toBe(false);
    expect(await db.models.get(model.id)).toEqual(model);
  });

  it('preserves imported dates when overwriting stored annotations', async () => {
    const repository = new IndexedDBAnnotationRepository();
    const [stored] = await repository.addAll([makeAnnotation('a', ElementType.TEXT_LINE)]);
    expect(stored).toMatchObject({ createdAt: created, updatedAt: created });

    vi.setSystemTime(new Date(modified));
    const imported = {
      ...makeAnnotation('a', ElementType.TEXT_LINE),
      createdAt: '2019-01-01T00:00:00.000Z',
      updatedAt: '2019-06-01T00:00:00.000Z',
    };
    const result = await repository.importWithDates([imported]);

    // Dedicated path (decision 3): imported dates win over the current clock.
    expect(result.ok).toBe(true);
    expect(await db.annotations.get('a')).toMatchObject({
      createdAt: '2019-01-01T00:00:00.000Z',
      updatedAt: '2019-06-01T00:00:00.000Z',
    });
    if (result.ok) expect(result.value).toEqual([await db.annotations.get('a')]);
  });

  it('rejects annotation imports carrying invalid timestamps without writing', async () => {
    const repository = new IndexedDBAnnotationRepository();
    const [stored] = await repository.addAll([makeAnnotation('a', ElementType.TEXT_LINE)]);

    vi.setSystemTime(new Date(modified));
    const invalid = { ...stored, updatedAt: 'not-a-date' };
    const result = await repository.importWithDates([invalid]);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.name).toBe('InvalidImportedDatesError');
    // Nothing written: the stored row keeps the date the creation path assigned.
    expect(await db.annotations.get('a')).toEqual(stored);
  });

  it('rejects temporary annotation imports carrying invalid timestamps', async () => {
    const repository = new IndexedDBAnnotationTempRepository();
    const [stored] = await repository.addAll([makeAnnotation('temp', ElementType.TEMP)]);

    const result = await repository.importWithDates([{ ...stored, createdAt: '' }]);

    expect(result.ok).toBe(false);
    expect(await db.annotationsTemp.get('temp')).toEqual(stored);
  });

  it('keeps collection timestamps on update and leaves unchanged removals untouched', async () => {
    const repository = new IndexedDBCollectionRepository();
    const createdCollection = await repository.create({
      name: 'Collection',
      tags: [],
      contentSize: 1,
      content: [{ sourceId: 'source', canvasId: 'canvas' }],
    });
    if (!createdCollection.ok) throw createdCollection.error;

    vi.setSystemTime(new Date(modified));
    await repository.update(createdCollection.value.id, {
      name: 'Renamed',
      tags: [],
      content: [{ sourceId: 'source', canvasId: 'canvas' }],
    });
    const details = await repository.getById(createdCollection.value.id);
    expect(details).toMatchObject({
      ok: true,
      value: { createdAt: created, updatedAt: modified },
    });

    // Deleting an absent element changes nothing: no write, updatedAt stands still.
    const untouched = await repository.deleteElement('unknown-collection', 'canvas');
    expect(untouched.ok).toBe(false);
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const unchanged = await repository.deleteElement(
      createdCollection.value.id,
      'canvas-not-in-content',
    );
    expect(unchanged).toMatchObject({ ok: true, value: { updatedAt: modified } });
    expect(await db.collectionContents.get(createdCollection.value.id)).toMatchObject({
      createdAt: created,
      updatedAt: modified,
    });
  });
});
