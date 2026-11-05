import { ElementType } from '@/data/models/annotations/annotation';
import type { Collection } from '@/data/models/collection/collection';
import type { CollectionElement } from '@/data/models/collectionElement';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBAnnotationRepository } from '../annotations';
import { IndexedDBCollectionRepository } from '../collections';
import { db } from '../db';
import { IndexedDBSourceRepository } from '../sources';
import { IndexedDBTagRepository } from '../tags';
import { IndexedDBWorkerRepository } from '../workers';
import { makeAnnotation } from './annotationFixtures';
import { createTestDb } from './testDb';

const repository = new IndexedDBCollectionRepository();
const annotations = new IndexedDBAnnotationRepository();
const sources = new IndexedDBSourceRepository();
const tags = new IndexedDBTagRepository();
const workers = new IndexedDBWorkerRepository();

function makeCollection(id: string, content: CollectionElement[] = []): Collection {
  return {
    id,
    name: `Collection ${id}`,
    tags: [],
    contentSize: content.length,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content,
  };
}

function manifest(id: string, canvasIds: string[]) {
  return {
    id,
    type: 'Manifest' as const,
    label: { en: [id] },
    items: canvasIds.map((canvasId) => ({ id: canvasId, type: 'Canvas' as const, items: [] })),
  };
}

async function addRemoteSource(id: string, canvasIds: string[]) {
  const result = await sources.add({
    type: 'remote',
    name: id,
    pageCount: canvasIds.length,
    thumbnailBlob: new Blob(['thumbnail']),
    manifest: manifest(`manifest-${id}`, canvasIds),
  });
  if (!result.ok) throw result.error;
  return result.value;
}

describe('IndexedDBCollectionRepository', () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it('creates collections with content and reads details separately from content', async () => {
    const created = await repository.create({
      name: 'Research set',
      about: 'Primary sources',
      tags: [],
      contentSize: 1,
      content: [{ canvasId: 'canvas-1', sourceId: 'source-1' }],
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value).toMatchObject({
      name: 'Research set',
      content: [{ canvasId: 'canvas-1', sourceId: 'source-1' }],
    });
    expect(typeof created.value.createdAt).toBe('string');
    expect(typeof created.value.updatedAt).toBe('string');
    expect(await repository.getById(created.value.id)).toEqual({ ok: true, value: created.value });
    expect(await repository.getAllDetails()).toEqual([
      expect.objectContaining({ id: created.value.id, name: 'Research set' }),
    ]);
    expect(await repository.getById('missing')).toMatchObject({
      ok: false,
      error: { name: 'EntityNotFoundError' },
    });
  });

  it('adds and updates collection details and content together', async () => {
    const collection = makeCollection('collection-1', [
      { canvasId: 'canvas-1', sourceId: 'source-1' },
    ]);
    expect(await repository.add(collection)).toEqual({ ok: true, value: undefined });
    await repository.update('collection-1', {
      name: 'Renamed',
      about: 'Updated',
      tags: ['tag-1'],
      content: [{ canvasId: 'canvas-2', sourceId: 'source-2' }],
    });

    expect(await repository.getById('collection-1')).toMatchObject({
      ok: true,
      value: {
        name: 'Renamed',
        about: 'Updated',
        tags: ['tag-1'],
        content: [{ canvasId: 'canvas-2', sourceId: 'source-2' }],
      },
    });
    await repository.updateTags('collection-1', ['tag-2']);
    expect(await repository.getById('collection-1')).toMatchObject({
      ok: true,
      value: { tags: ['tag-2'] },
    });
  });

  it('adds or replaces collection details and content together', async () => {
    await repository.add(makeCollection('collection-1'));
    const replacement = {
      ...makeCollection('collection-1', [{ canvasId: 'canvas-2', sourceId: 'source-2' }]),
      name: 'Replaced collection',
    };

    await repository.addContentToCollection(replacement);

    expect(await repository.getById('collection-1')).toMatchObject({
      ok: true,
      value: {
        name: 'Replaced collection',
        content: [{ canvasId: 'canvas-2', sourceId: 'source-2' }],
      },
    });
  });

  it('resolves collection tags and source ids, ignoring absent referenced records', async () => {
    await tags.add({ id: 'tag-1', label: 'Topic' });
    await repository.add(
      makeCollection('collection-1', [
        { canvasId: 'canvas-1', sourceId: 'source-1' },
        { canvasId: 'canvas-2', sourceId: 'source-1' },
        { canvasId: 'canvas-3', sourceId: 'missing-source' },
      ]),
    );
    await repository.updateTags('collection-1', ['tag-1', 'missing-tag']);

    expect(await repository.getTagsByCollectionId('collection-1')).toEqual({
      ok: true,
      value: [{ id: 'tag-1', label: 'Topic' }],
    });
    expect(await repository.getTagsByCollectionId('missing')).toMatchObject({ ok: false });
    expect(await repository.getSourceIdsByCollectionId('collection-1')).toEqual({
      ok: true,
      value: ['source-1', 'missing-source'],
    });
    expect(await repository.getSourceIdsByCollectionId('missing')).toMatchObject({ ok: false });
    expect(await repository.exists('collection-1')).toBe(true);
    expect(await repository.exists('missing')).toBe(false);
  });

  it('resolves canvases through their source and returns typed errors for missing references', async () => {
    const source = await addRemoteSource('source-1', ['canvas-1', 'canvas-2']);
    await repository.add(
      makeCollection('collection-1', [
        { canvasId: 'canvas-1', sourceId: source.id },
        { canvasId: 'canvas-2', sourceId: source.id },
        { canvasId: 'orphan-canvas', sourceId: 'missing-source' },
      ]),
    );

    expect(await repository.getCanvasesByCollectionId('collection-1')).toMatchObject({
      ok: true,
      value: [{ id: 'canvas-1' }, { id: 'canvas-2' }],
    });
    expect(await repository.getCanvasesByCollectionId('missing')).toMatchObject({ ok: false });
    expect(
      await repository.getCanvasByScope({ collectionId: 'collection-1', canvasId: 'canvas-2' }),
    ).toMatchObject({ ok: true, value: { sourceId: source.id, canvas: { id: 'canvas-2' } } });
    expect(
      await repository.getCanvasByScope({ collectionId: 'collection-1', canvasId: 'absent' }),
    ).toMatchObject({ ok: false, error: { name: 'EntityNotFoundError' } });
    expect(
      await repository.getCanvasByScope({ collectionId: 'missing', canvasId: 'canvas-1' }),
    ).toMatchObject({ ok: false, error: { name: 'EntityNotFoundError' } });
    expect(
      await repository.getCanvasByScope({
        collectionId: 'collection-1',
        canvasId: 'orphan-canvas',
      }),
    ).toMatchObject({ ok: false, error: { name: 'EntityNotFoundError' } });
  });

  it('keeps canvas results in collection order when canvases use different sources', async () => {
    const sourceA = await addRemoteSource('source-a', ['canvas-a1', 'canvas-a2']);
    const sourceB = await addRemoteSource('source-b', ['canvas-b1']);
    await repository.add(
      makeCollection('collection-1', [
        { canvasId: 'canvas-a1', sourceId: sourceA.id },
        { canvasId: 'canvas-b1', sourceId: sourceB.id },
        { canvasId: 'canvas-a2', sourceId: sourceA.id },
      ]),
    );

    const result = await repository.getCanvasesByCollectionId('collection-1');

    expect(result.ok && result.value.map(({ id }) => id)).toEqual([
      'canvas-a1',
      'canvas-b1',
      'canvas-a2',
    ]);
  });

  it('moves collection elements, rejecting invalid positions and missing collections', async () => {
    await repository.add(
      makeCollection('collection-1', [
        { canvasId: 'canvas-1', sourceId: 'source-1' },
        { canvasId: 'canvas-2', sourceId: 'source-1' },
        { canvasId: 'canvas-3', sourceId: 'source-1' },
      ]),
    );

    expect(await repository.shiftCollectionElements('collection-1', 0, 2)).toMatchObject({
      ok: true,
    });
    expect(await repository.getById('collection-1')).toMatchObject({
      ok: true,
      value: {
        content: [{ canvasId: 'canvas-2' }, { canvasId: 'canvas-3' }, { canvasId: 'canvas-1' }],
      },
    });
    for (const [source, target] of [
      [-1, 0],
      [0, 3],
      [1, 1],
    ]) {
      expect(
        await repository.shiftCollectionElements('collection-1', source, target),
      ).toMatchObject({
        ok: false,
        error: { name: 'EntityNotFoundError' },
      });
    }
    expect(await repository.shiftCollectionElements('missing', 0, 1)).toMatchObject({
      ok: false,
      error: { name: 'EntityNotFoundError' },
    });
  });

  it('duplicates content and annotations into a new collection while preserving the original', async () => {
    const original = makeCollection('collection-1', [
      { canvasId: 'canvas-1', sourceId: 'source-1' },
    ]);
    await repository.add(original);
    await annotations.addAll([makeAnnotation('annotation-1', ElementType.TEXT_LINE)]);

    const duplicated = await repository.duplicate('collection-1', 'Copy');

    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) return;
    expect(duplicated.value.id).not.toBe('collection-1');
    expect(duplicated.value).toMatchObject({ name: 'Copy', contentSize: 1 });
    expect(await repository.getById(duplicated.value.id)).toMatchObject({
      ok: true,
      value: { content: original.content },
    });
    expect(await annotations.getByScope({ collectionId: 'collection-1' })).toMatchObject([
      { id: 'annotation-1', collectionId: 'collection-1' },
    ]);
    const duplicatedAnnotations = await annotations.getByScope({
      collectionId: duplicated.value.id,
    });
    expect(duplicatedAnnotations).toHaveLength(1);
    expect(duplicatedAnnotations[0].id).not.toBe('annotation-1');
    expect(duplicatedAnnotations[0].collectionId).toBe(duplicated.value.id);
    expect(await repository.duplicate('missing', 'Copy')).toMatchObject({
      ok: false,
      error: { name: 'EntityNotFoundError' },
    });
  });

  it('removes a canvas, updates content size and deletes only its annotations', async () => {
    await repository.add(
      makeCollection('collection-1', [
        { canvasId: 'canvas-1', sourceId: 'source-1' },
        { canvasId: 'canvas-2', sourceId: 'source-1' },
      ]),
    );
    await annotations.addAll([
      makeAnnotation('annotation-canvas-1', ElementType.TEXT_LINE),
      makeAnnotation('annotation-canvas-2', ElementType.TEXT_LINE, {
        collectionId: 'collection-1',
        canvasId: 'canvas-2',
      }),
      makeAnnotation('annotation-other-collection', ElementType.TEXT_LINE, {
        collectionId: 'collection-2',
        canvasId: 'canvas-1',
      }),
    ]);

    const removed = await repository.deleteElement('collection-1', 'canvas-1');

    expect(removed).toMatchObject({
      ok: true,
      value: { contentSize: 1, content: [{ canvasId: 'canvas-2' }] },
    });
    expect(await annotations.getByScope({ collectionId: 'collection-1' })).toMatchObject([
      { id: 'annotation-canvas-2' },
    ]);
    expect(await annotations.getByScope({ collectionId: 'collection-2' })).toMatchObject([
      { id: 'annotation-other-collection' },
    ]);
    expect(await repository.deleteElement('missing', 'canvas-1')).toMatchObject({ ok: false });
  });

  it('deletes collections and dependent annotations, workers, and results while preserving others', async () => {
    await repository.add(makeCollection('collection-1'));
    await repository.add(makeCollection('collection-2'));
    await annotations.addAll([
      makeAnnotation('annotation-1', ElementType.TEXT_LINE),
      makeAnnotation('annotation-2', ElementType.TEXT_LINE, {
        collectionId: 'collection-2',
        canvasId: 'canvas-1',
      }),
    ]);
    await workers.add({
      id: 'worker-1',
      name: 'worker-one',
      scope: { collectionId: 'collection-1' },
      params: {},
    });
    await workers.add({
      id: 'worker-2',
      name: 'worker-two',
      scope: { collectionId: 'collection-2' },
      params: {},
    });
    await db.results.bulkAdd([
      {
        id: 1,
        scope: { collectionId: 'collection-1' },
        scopeKey: 'collection-1',
        workerName: 'worker-one',
        workerId: 'worker-1',
        taskId: 0,
        value: 'result-1',
        params: {},
      },
      {
        id: 2,
        scope: { collectionId: 'collection-2' },
        scopeKey: 'collection-2',
        workerName: 'worker-two',
        workerId: 'worker-2',
        taskId: 0,
        value: 'result-2',
        params: {},
      },
    ]);

    expect(await repository.deleteById('collection-1')).toEqual({
      ok: true,
      value: { workersIds: ['worker-1'], collectionId: 'collection-1' },
    });
    expect(await repository.getAllDetails()).toMatchObject([{ id: 'collection-2' }]);
    expect(await db.collectionContents.toArray()).toMatchObject([{ id: 'collection-2' }]);
    expect((await db.annotations.toArray()).map(({ id }) => id)).toEqual(['annotation-2']);
    expect((await db.workers.toArray()).map(({ id }) => id)).toEqual(['worker-2']);
    expect((await db.results.toArray()).map(({ id }) => id)).toEqual([2]);

    expect(await repository.deleteMultiple(['collection-2', 'already-absent'])).toMatchObject({
      ok: true,
    });

    expect(await repository.getAllDetails()).toEqual([]);
    expect(await db.collectionContents.toArray()).toEqual([]);
    expect(await db.annotations.toArray()).toEqual([]);
    expect(await db.workers.toArray()).toEqual([]);
    expect((await db.results.toArray()).map(({ id }) => id)).toEqual([]);
  });

  it('deletes a collection supplied by value', async () => {
    const collection = makeCollection('collection-1');
    await repository.add(collection);

    expect(await repository.delete(collection)).toEqual({
      ok: true,
      value: { workersIds: [], collectionId: 'collection-1' },
    });
    expect(await repository.getById('collection-1')).toMatchObject({ ok: false });
    expect(await db.collectionContents.get('collection-1')).toBeUndefined();
  });

  it('rolls back collection details when writing collection content fails', async () => {
    await db.collectionContents.add({ id: 'conflict', content: [] });

    const result = await repository.add(makeCollection('conflict'));

    expect(result.ok).toBe(false);
    expect(await db.collections.get('conflict')).toBeUndefined();
    expect(await db.collectionContents.get('conflict')).toEqual({ id: 'conflict', content: [] });
  });
});
