import { db } from '@/data/repositories/indexeddb/db';
import { useCollectionIO } from '@/hooks/data/collections/useCollectionIO';
import { useCollectionImporter } from '@/hooks/data/collections/useCollectionImporter';
import { useModelIO } from '@/hooks/data/models/useModelIO';
import { BaseError } from '@/utils/BaseError';
import { renderHook } from '@testing-library/react';
import { Cozy } from 'cozy-iiif';
import FileSaver from 'file-saver';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from './testDb';

const fetchManifest = vi.fn();
const addManifestToLibrary = vi.fn();
const dispatch = vi.fn();
vi.mock('@/hooks/hooks', () => ({ useAppDispatch: () => dispatch }));
vi.mock('@/hooks/data/sources/useSources', () => ({
  default: () => ({ fetchManifest, addManifestToLibrary }),
}));

const now = '2025-03-04T05:06:07.000Z';
const old = '2020-01-01T00:00:00.000Z';
const setters = { setStatus: vi.fn(), setProgress: vi.fn(), addLog: vi.fn() };
const model = { id: 'model', name: 'Model', prompt: '', fields: [] };
const collection = {
  id: 'collection',
  name: 'Collection',
  tags: ['tag'],
  contentSize: 1,
  content: [{ canvasId: 'canvas', sourceId: 'source' }],
};
const source = {
  id: 'source',
  name: 'Source',
  type: 'remote',
  pageCount: 1,
  thumbnailBlobId: 'blob',
  thumbnailBase64: 'data:image/png;base64,dGh1bWJuYWls',
  content: {
    id: 'source',
    type: 'remote',
    manifest: { id: 'manifest', createdAt: 'business date', items: [] },
  },
};
const worker = {
  id: 'worker',
  name: 'OCR',
  scope: { collectionId: 'collection' },
  scopeKey: 'collection',
  params: {},
  status: 'completed',
  estimatedDuration: 0,
  queue: [],
};
const result = {
  id: 12,
  scope: { collectionId: 'collection' },
  scopeKey: 'collection',
  workerName: 'OCR',
  workerId: 'worker',
  taskId: 1,
  value: 'text',
  params: {},
};
const annotation = {
  id: 'annotation',
  canvasId: 'canvas',
  collectionId: 'collection',
  type: 'UNKNOWN',
  bodies: [],
  target: { annotation: 'annotation', selector: { type: 'RECTANGLE' } },
};

describe('application imports', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await createTestDb();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('imports all current nested entities with one fallback and preserves valid dates and manifest data', async () => {
    const data = {
      collection: { ...collection, createdAt: old, updatedAt: 'bad' },
      sources: [{ ...source, createdAt: '', content: { ...source.content, updatedAt: old } }],
      tags: [{ id: 'tag', label: 'Tag', updatedAt: old }],
      annotations: [{ ...annotation, createdAt: old }],
      model: { ...model, updatedAt: old },
      workers: [{ ...worker, createdAt: new Date(old) }],
      results: [{ ...result, updatedAt: old }],
    };
    const hook = renderHook(() => useCollectionImporter(setters));
    await hook.result.current.importOneCollection('collection.json', data);

    expect(await db.collections.get('collection')).toMatchObject({
      createdAt: old,
      updatedAt: now,
    });
    expect(await db.sources.get('source')).toMatchObject({ createdAt: now, updatedAt: now });
    expect(await db.sourceContents.get('source')).toMatchObject({
      createdAt: now,
      updatedAt: old,
      manifest: source.content.manifest,
    });
    expect(await db.tags.get('tag')).toMatchObject({ createdAt: now, updatedAt: old });
    expect(await db.annotations.get('annotation')).toMatchObject({
      createdAt: old,
      updatedAt: now,
    });
    expect(await db.models.get('model')).toMatchObject({ createdAt: now, updatedAt: old });
    expect(await db.workers.get('worker')).toMatchObject({ createdAt: old, updatedAt: now });
    const storedResults = await db.results.toArray();
    expect(storedResults).toHaveLength(1);
    expect(storedResults[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(storedResults[0]).toMatchObject({ createdAt: now, updatedAt: old, value: 'text' });
    expect(data.collection.updatedAt).toBe('bad');
  });

  it('imports a legacy collection and resolves its manifest', async () => {
    fetchManifest.mockResolvedValue({
      ok: true,
      value: { id: 'manifest', type: 'Manifest', items: [] },
    });
    addManifestToLibrary.mockResolvedValue({ ok: true, value: { id: 'new-source' } });
    vi.spyOn(Cozy, 'parse').mockReturnValue({
      type: 'manifest',
      resource: { getSummary: () => 'name' },
    } as never);
    const hook = renderHook(() => useCollectionImporter(setters));
    await hook.result.current.importOneCollection('legacy.json', {
      collection: {
        ...collection,
        content: [{ canvasId: 'canvas', position: 0, manifestId: 'manifest' }],
      },
      model,
      workers: [worker],
      results: [result],
    });
    expect(await db.collections.get('collection')).toMatchObject({
      createdAt: now,
      updatedAt: now,
    });
    expect(await db.collectionContents.get('collection')).toMatchObject({
      content: [{ canvasId: 'canvas', sourceId: 'new-source', manifestId: 'manifest' }],
    });
    expect(await db.workers.get('worker')).toMatchObject({ createdAt: now, updatedAt: now });
    expect(await db.results.toArray()).toHaveLength(1);
    expect(addManifestToLibrary).toHaveBeenCalledOnce();
  });

  it('rejects malformed non-date fields before writing', async () => {
    const hook = renderHook(() => useCollectionImporter(setters));
    await hook.result.current.importOneCollection('bad.json', {
      collection,
      sources: [{ ...source, pageCount: 'invalid' }],
    });
    expect(await db.collections.count()).toBe(0);
    expect(setters.addLog).toHaveBeenCalledWith(expect.anything(), 'error');
  });

  it.each([
    { model: { ...model, fields: [{ id: 'field', name: 'Field', type: 'text' }] } },
    { workers: [{ ...worker, status: 'not-a-status' }] },
    { results: [{ ...result, taskId: 'invalid' }] },
    { tags: [{ id: 'tag', label: 42 }] },
  ])('rejects malformed nested entities: %o', async (invalid) => {
    const hook = renderHook(() => useCollectionImporter(setters));
    await hook.result.current.importOneCollection('bad.json', {
      collection,
      sources: [source],
      ...invalid,
    });
    expect(await db.collections.count()).toBe(0);
    expect(setters.addLog).toHaveBeenCalledWith(expect.anything(), 'error');
  });

  it('imports standalone models, preserves dates and rejects malformed fields', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const hook = renderHook(() => useModelIO());
    await hook.result.current.importModel({ ...model, createdAt: old, updatedAt: 'bad' }, false);
    await hook.result.current.importModel({ ...model, id: 'bad', name: 7 }, false);
    expect(await db.models.toArray()).toEqual([
      expect.objectContaining({
        id: 'model',
        createdAt: old,
        updatedAt: now,
      }),
    ]);
    expect(dispatch).toHaveBeenCalled();
  });

  it('exports and reimports a standalone model with its dates intact', async () => {
    await db.models.add({ ...model, createdAt: old, updatedAt: old });
    const save = vi.spyOn(FileSaver, 'saveAs').mockImplementation(() => {});
    const hook = renderHook(() => useModelIO());
    await hook.result.current.exportModel('model');
    const blob = save.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new BaseError('Expected text'));
      };
      reader.onerror = reject;
      reader.readAsText(blob as Blob);
    });
    await db.models.clear();
    await hook.result.current.importModel(JSON.parse(text), false);
    expect(await db.models.get('model')).toMatchObject({ createdAt: old, updatedAt: old });
  });

  it('preserves imported timestamps when overwriting a model with the same name', async () => {
    await db.models.add({ ...model, id: 'existing', createdAt: now, updatedAt: now });
    const hook = renderHook(() => useModelIO());
    await hook.result.current.importModel({ ...model, createdAt: old, updatedAt: old }, true);
    expect(await db.models.get('existing')).toMatchObject({
      id: 'existing',
      createdAt: old,
      updatedAt: old,
    });
  });

  it('uses the same fallback throughout a ZIP containing multiple collections', async () => {
    fetchManifest.mockImplementation(() => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      return Promise.resolve({ ok: true, value: {} });
    });
    const archive = new JSZip();
    archive.file(
      'one.json',
      JSON.stringify({
        collection: {
          ...collection,
          content: [{ ...collection.content[0], manifestId: 'manifest' }],
        },
        sources: [],
      }),
    );
    archive.file(
      'two.json',
      JSON.stringify({ collection: { ...collection, id: 'two', content: [] }, sources: [] }),
    );
    const bytes = await archive.generateAsync({ type: 'uint8array' });
    const hook = renderHook(() => useCollectionImporter(setters));
    await hook.result.current.importCollections(bytes.buffer as ArrayBuffer);
    expect(await db.collections.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'collection', createdAt: now, updatedAt: now }),
        expect.objectContaining({ id: 'two', createdAt: now, updatedAt: now }),
      ]),
    );
  });

  it('exports and reimports an empty-source collection through the ZIP path', async () => {
    await db.collections.add({
      id: 'empty',
      name: 'Empty',
      tags: [],
      contentSize: 0,
      createdAt: old,
      updatedAt: old,
    });
    await db.collectionContents.add({
      id: 'empty',
      content: [],
      createdAt: old,
      updatedAt: old,
    });
    const save = vi.spyOn(FileSaver, 'saveAs').mockImplementation(() => {});
    const exporter = renderHook(() => useCollectionIO(setters));
    await exporter.result.current.exportCollections(['empty'], {});
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new BaseError('Expected array buffer'));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(save.mock.calls[0][0] as Blob);
    });
    const zip = await JSZip.loadAsync(bytes);
    const json = await zip.file('Empty.json')!.async('string');
    expect(JSON.parse(json)).toMatchObject({ sources: [] });
    await db.collections.clear();
    await db.collectionContents.clear();
    const importer = renderHook(() => useCollectionImporter(setters));
    await importer.result.current.importCollections(bytes);
    expect(await db.collections.get('empty')).toMatchObject({ createdAt: old, updatedAt: old });
  });
});
