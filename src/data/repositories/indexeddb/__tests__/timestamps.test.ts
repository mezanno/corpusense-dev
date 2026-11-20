import { BaseError } from '@/utils/BaseError';
import Dexie from 'dexie';
import { exportDB } from 'dexie-export-import';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { IndexedDBDatabaseRepository } from '../database';
import { db } from '../db';
import { binaryPayloadStores, deferredTimestampStores, timestampedStores } from '../timestamps';

const legacySchema = {
  collections: '&id, name, *tags.id',
  collectionContents: '&id',
  history: '&url',
  storedManifests: '&id, name',
  storedManifestContents: '&id',
  typesList: '&label',
  itemMetadata: '[id+attribute.label]',
  tags: '&id',
  models: '&id, name',
  annotations:
    '&id, canvasId, collectionId, [canvasId+collectionId], order, [canvasId+collectionId+type], [collectionId+type]',
  annotationsTemp:
    '&id, canvasId, collectionId, [canvasId+collectionId], order, [canvasId+collectionId+type]',
  namedEntities: '&id, *annotationIds, type.id',
  results: '++id, workerName, workerId, [scopeKey+workerName], taskId, [workerId+taskId]',
  workers: '&id, name, status, [scopeKey+name]',
  handles: '&id',
  convertedFiles: '&id, folderName',
  modifierChains: '&id, name',
  projects: '&id, name',
  sources: '&id, name, type',
  sourceContents: '&id',
  storedBlobs: '&id',
};

async function seedLegacyDatabase(version = 32) {
  db.close();
  await Dexie.delete('mezanno');
  const legacy = new Dexie('mezanno');
  legacy.version(version).stores(legacySchema);
  await legacy.open();
  await legacy.table('tags').bulkAdd([
    {
      id: 'existing',
      label: 'Existing',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2021-01-01T00:00:00.000Z',
    },
    { id: 'missing', label: 'Missing' },
  ]);
  await legacy.table('projects').add({
    id: 'project',
    name: 'Project',
    createdAt: new Date('2020-02-01T00:00:00.000Z'),
    updatedAt: new Date('2021-02-01T00:00:00.000Z'),
    sources: [],
    collections: [],
  });
  await legacy.table('results').add({
    id: 17,
    workerId: 'worker',
    workerName: 'OCR',
    taskId: 1,
    scope: { collectionId: 'c1' },
    scopeKey: 'c1',
    value: 'result',
    params: {},
  });
  await legacy.table('history').add({ url: 'https://example.test' });
  await legacy.table('typesList').add({ label: 'type' });
  await legacy
    .table('itemMetadata')
    .add({ id: 'canvas', attribute: { label: 'label', value: 'value' } });
  return legacy;
}

describe('IndexedDB timestamps', () => {
  beforeEach(async () => {
    db.close();
    await Dexie.delete('mezanno');
  });

  it('migrates legacy records, retains existing dates and replaces numeric result IDs', async () => {
    const legacy = await seedLegacyDatabase();
    legacy.close();
    const before = new Date().toISOString();
    await db.open();
    const after = new Date().toISOString();

    expect(await db.tags.get('existing')).toMatchObject({
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2021-01-01T00:00:00.000Z',
    });
    const missing = await db.tags.get('missing');
    expect(Date.parse(missing?.createdAt ?? '')).toBeGreaterThanOrEqual(Date.parse(before));
    expect(Date.parse(missing?.createdAt ?? '')).toBeLessThanOrEqual(Date.parse(after));
    expect(missing?.updatedAt).toBe(missing?.createdAt);
    expect(await db.projects.get('project')).toMatchObject({
      createdAt: '2020-02-01T00:00:00.000Z',
      updatedAt: '2021-02-01T00:00:00.000Z',
    });
    const results = await db.results.toArray();
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe('result');
    expect(results[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(typeof results[0].createdAt).toBe('string');
    expect(typeof results[0].updatedAt).toBe('string');
    const history = await db.history.get('https://example.test');
    expect(history?.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(typeof history?.createdAt).toBe('string');
    expect(typeof history?.updatedAt).toBe('string');
    const types = await db
      .table<{ id: string; createdAt: string; updatedAt: string }>('typesList')
      .toArray();
    expect(types).toHaveLength(1);
    expect(types[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(typeof types[0].createdAt).toBe('string');
    expect(typeof types[0].updatedAt).toBe('string');
    const metadata = await db.itemMetadata.toArray();
    expect(metadata).toHaveLength(1);
    expect(metadata[0].id).toBe('canvas');
    expect(typeof metadata[0].createdAt).toBe('string');
    expect(typeof metadata[0].updatedAt).toBe('string');
  });

  it('initializes new records and updates only the modification timestamp on changes', async () => {
    await db.open();
    const createdAt = '2020-01-01T00:00:00.000Z';
    // Untyped table on purpose: exercises the tolerant hooks outside repositories.
    await db.table<Record<string, unknown>>('tags').add({ id: 'tag', label: 'Tag', createdAt });
    const before = await db.tags.get('tag');
    expect(before?.createdAt).toBe(createdAt);
    expect(typeof before?.updatedAt).toBe('string');
    await db.tags.update('tag', {
      label: 'Changed',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
    const after = await db.tags.get('tag');
    expect(after).toMatchObject({ createdAt, label: 'Changed' });
    expect(typeof after?.updatedAt).toBe('string');
    expect(after?.updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
  });

  it('normalizes an older backup when it is restored', async () => {
    const legacy = await seedLegacyDatabase();
    const backup = await exportDB(legacy);
    legacy.close();
    await db.open();
    await new IndexedDBDatabaseRepository().import(backup, () => true);
    const results = await db.results.toArray();
    expect(results).toHaveLength(1);
    expect(results[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(typeof results[0].createdAt).toBe('string');
    expect(typeof results[0].updatedAt).toBe('string');
    expect(await db.projects.get('project')).toMatchObject({
      createdAt: '2020-02-01T00:00:00.000Z',
      updatedAt: '2021-02-01T00:00:00.000Z',
    });
  });

  it('timestamps replacements and collection modifications without changing creation dates', async () => {
    await db.open();
    const old = '2020-01-01T00:00:00.000Z';
    await db.tags.bulkAdd([
      { id: 'put', label: 'Original', createdAt: old, updatedAt: old },
      { id: 'bulk', label: 'Original', createdAt: old, updatedAt: old },
      { id: 'modify', label: 'Original', createdAt: old, updatedAt: old },
    ]);
    // Untyped tables on purpose: exercises the tolerant hooks outside repositories.
    await db.table<Record<string, unknown>>('tags').put({ id: 'put', label: 'Changed' });
    await db.table<Record<string, unknown>>('tags').bulkPut([{ id: 'bulk', label: 'Changed' }]);
    await db.tags.where('id').equals('modify').modify({ label: 'Changed' });
    for (const tag of await db.tags.toArray()) {
      expect(tag.createdAt).toBe(old);
      expect(tag.updatedAt).not.toBe(old);
      expect(tag.label).toBe('Changed');
    }
  });

  it.each([31, 32, 33])(
    'upgrades v%i records with strict dates without changing other data',
    async (version) => {
      db.close();
      await Dexie.delete('mezanno');
      const legacy = new Dexie('mezanno');
      legacy.version(version).stores(legacySchema);
      await legacy.open();
      const old = '2020-01-01T00:00:00.000Z';
      for (const name of timestampedStores) {
        const key =
          name === 'history'
            ? { url: 'https://example.test', id: 'history-id' }
            : name === 'typesList'
              ? { label: 'type', id: 'type-id' }
              : name === 'itemMetadata'
                ? { id: 'metadata-id', attribute: { label: 'attribute' } }
                : { id: `${name}-id` };
        await legacy.table(name).add({
          ...key,
          ...(name === 'workers' ? { queue: [], status: 'waiting' } : {}),
          payload: { retained: true },
          createdAt: old,
          updatedAt: 'not-a-date',
        });
      }
      await legacy.table('tags').bulkAdd([
        { id: 'date', createdAt: new Date('2021-02-01T00:00:00Z'), updatedAt: old },
        { id: 'missing', updatedAt: old },
        { id: 'empty', createdAt: '', updatedAt: '2021-01-01T00:00:00+01:00' },
        { id: 'invalid-date', createdAt: new Date(NaN), updatedAt: null },
        { id: 'extended-year', createdAt: new Date('+010000-01-01T00:00:00.000Z'), updatedAt: old },
      ]);
      if (version === 33) {
        await legacy.table('history').add({
          url: 'https://no-id.test',
          createdAt: old,
          updatedAt: 'bad',
          nested: { createdAt: 'untouched' },
        });
      }
      legacy.close();
      const before = new Date().toISOString();
      await db.open();
      const after = new Date().toISOString();
      let fallback = '';
      for (const name of timestampedStores) {
        const rows = await db
          .table<{ id?: string; payload?: unknown; updatedAt: string }>(name)
          .toArray();
        const row = rows.find((value) => value.payload !== undefined);
        if (row === undefined) throw new BaseError(`Missing ${name} fixture`);
        expect(row).toMatchObject({ payload: { retained: true }, createdAt: old });
        expect(row.id).toBe(
          name === 'history'
            ? 'history-id'
            : name === 'typesList'
              ? 'type-id'
              : name === 'itemMetadata'
                ? 'metadata-id'
                : `${name}-id`,
        );
        if (binaryPayloadStores.some((store) => store === name)) {
          // Side data is left out of the upgrade transaction on purpose.
          expect(row.updatedAt).toBe('not-a-date');
          continue;
        }
        expect(row.updatedAt >= before && row.updatedAt <= after).toBe(true);
        fallback ||= row.updatedAt;
        expect(row.updatedAt).toBe(fallback);
        expect(z.iso.datetime().safeParse(row.updatedAt).success).toBe(true);
      }
      expect(deferredTimestampStores()).toEqual(
        Object.fromEntries(binaryPayloadStores.map((store) => [store, 1])),
      );
      const repairBefore = new Date().toISOString();
      expect(await new IndexedDBDatabaseRepository().repairDeferredTimestamps()).toEqual({
        stores: binaryPayloadStores.length,
        repaired: binaryPayloadStores.length,
        failed: 0,
      });
      for (const name of binaryPayloadStores) {
        const row = (await db.table<{ payload?: unknown; updatedAt: string }>(name).toArray()).find(
          (value) => value.payload !== undefined,
        );
        expect(z.iso.datetime().safeParse(row?.updatedAt).success).toBe(true);
        expect((row?.updatedAt ?? '') >= repairBefore).toBe(true);
      }
      expect(deferredTimestampStores()).toEqual({});
      expect(await db.tags.get('date')).toMatchObject({
        createdAt: '2021-02-01T00:00:00.000Z',
        updatedAt: old,
      });
      // v33 previously filled missing dates, while v34 repairs invalid values.
      const missing = await db.tags.get('missing');
      expect(z.iso.datetime().safeParse(missing?.createdAt).success).toBe(true);
      expect(missing?.updatedAt).toBe(old);
      expect(await db.tags.get('empty')).toMatchObject({ updatedAt: fallback });
      const invalidDate = await db.tags.get('invalid-date');
      expect(invalidDate?.createdAt).toBe(invalidDate?.updatedAt);
      expect(
        invalidDate?.createdAt !== undefined &&
          invalidDate.createdAt >= before &&
          invalidDate.createdAt <= after,
      ).toBe(true);
      expect(await db.tags.get('extended-year')).toMatchObject({
        createdAt: fallback,
        updatedAt: old,
      });
      if (version === 33) {
        expect(await db.history.get('https://no-id.test')).toEqual({
          url: 'https://no-id.test',
          createdAt: old,
          updatedAt: fallback,
          nested: { createdAt: 'untouched' },
        });
      }
    },
  );

  it('defers the rows carrying a blob during the upgrade and repairs them after open', async () => {
    const legacy = await seedLegacyDatabase();
    const thumbnail = new Blob(['thumbnail']);
    await legacy.table('storedBlobs').add({ id: 'blob', blob: thumbnail });
    await legacy.table('convertedFiles').add({
      id: 'file',
      folderName: 'folder',
      thumbnailBlob: thumbnail,
    });
    await legacy.table('results').add({
      id: 42,
      workerId: 'worker',
      workerName: 'OCR',
      taskId: 2,
      scope: { collectionId: 'c1' },
      scopeKey: 'c1',
      value: { report: new Blob(['report']) },
      params: {},
    });
    legacy.close();
    await db.open();

    // Plain rows are repaired by the upgrade transaction itself.
    expect(z.iso.datetime().safeParse((await db.tags.get('missing'))?.createdAt).success).toBe(
      true,
    );
    // Rows of the stores that always carry side data are left as they are. Fake
    // IndexedDB flattens a Blob to {}, so the store rule, not the value walk, is
    // what keeps them out of the upgrade transaction here.
    const untouched = await db.table<Record<string, unknown>>('storedBlobs').get('blob');
    expect(untouched?.createdAt).toBeUndefined();
    expect((await db.convertedFiles.get('file'))?.createdAt).toBeUndefined();
    expect(deferredTimestampStores()).toEqual({ storedBlobs: 1, convertedFiles: 1 });

    expect(await new IndexedDBDatabaseRepository().repairDeferredTimestamps()).toMatchObject({
      stores: 2,
      repaired: 2,
      failed: 0,
    });

    const blobs = await db.table<Record<string, unknown>>('storedBlobs').toArray();
    expect(blobs).toHaveLength(1);
    expect(blobs[0].blob).toBeDefined();
    expect(z.iso.datetime().safeParse(blobs[0].createdAt).success).toBe(true);
    expect(blobs[0].createdAt).toBe(blobs[0].updatedAt);
    const file = await db.convertedFiles.get('file');
    expect(file?.thumbnailBlob).toBeDefined();
    expect(file?.folderName).toBe('folder');
    expect(z.iso.datetime().safeParse(file?.updatedAt).success).toBe(true);
    // Legacy numeric result ids are gone, whichever pass repaired the row.
    const results = await db.results.toArray();
    expect(results).toHaveLength(2);
    expect(results.every((result) => /^[a-f0-9-]{36}$/.test(result.id))).toBe(true);
    expect(await db.table<Record<string, unknown>>('results').get(42)).toBeUndefined();
    expect(deferredTimestampStores()).toEqual({});
    expect(await new IndexedDBDatabaseRepository().repairDeferredTimestamps()).toEqual({
      stores: 0,
      repaired: 0,
      failed: 0,
    });
  });

  it.each([32, 33, 34])('restores v%i backups and repairs historical dates', async (version) => {
    const legacy = await seedLegacyDatabase(version);
    await legacy.table('tags').add({
      id: 'invalid',
      label: 'Invalid',
      createdAt: 'bad',
      updatedAt: '2022-01-01T00:00:00.000Z',
    });
    const backup = await exportDB(legacy);
    legacy.close();
    await db.open();
    const before = new Date().toISOString();
    await new IndexedDBDatabaseRepository().import(backup, () => true);
    const after = new Date().toISOString();
    const invalid = await db.tags.get('invalid');
    expect(invalid?.updatedAt).toBe('2022-01-01T00:00:00.000Z');
    expect(
      invalid?.createdAt !== undefined && invalid.createdAt >= before && invalid.createdAt <= after,
    ).toBe(true);
    expect(await db.tags.get('existing')).toMatchObject({
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2021-01-01T00:00:00.000Z',
    });
    expect(await db.projects.get('project')).toMatchObject({
      createdAt: '2020-02-01T00:00:00.000Z',
      updatedAt: '2021-02-01T00:00:00.000Z',
    });
    expect((await db.tags.get('missing'))?.createdAt).toBe(invalid?.createdAt);
    expect((await db.results.toArray())[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(await db.history.get('https://example.test')).toMatchObject({
      url: 'https://example.test',
    });
    expect(await db.table('typesList').get('type')).toMatchObject({ label: 'type' });
    expect(await db.itemMetadata.get(['canvas', 'label'])).toMatchObject({
      id: 'canvas',
      attribute: { label: 'label', value: 'value' },
    });
  });

  it('rejects unsupported backups before clearing the database', async () => {
    const legacy = await seedLegacyDatabase(31);
    const backup = await exportDB(legacy);
    legacy.close();
    await db.open();
    await expect(new IndexedDBDatabaseRepository().import(backup, () => true)).rejects.toThrow(
      'Unsupported database backup version: 31',
    );
    expect(await db.tags.get('existing')).toMatchObject({ label: 'Existing' });
  });

  it('rolls back clearing and inserted rows when restoration fails', async () => {
    const legacy = await seedLegacyDatabase();
    const backup = await exportDB(legacy);
    legacy.close();
    await db.open();
    // Untyped table on purpose: exercises the tolerant hooks outside repositories.
    await db.table<Record<string, unknown>>('tags').add({ id: 'retained', label: 'Retained' });
    await expect(
      new IndexedDBDatabaseRepository().import(backup, (progress) => {
        if (progress.completedRows > 0) throw new BaseError('import failed');
        return true;
      }),
    ).rejects.toThrow('import failed');
    expect(await db.tags.get('retained')).toMatchObject({ label: 'Retained' });
    expect(await db.tags.get('existing')).toMatchObject({ label: 'Existing' });
  });

  it('rolls back the v34 migration on a write failure', async () => {
    const legacy = await seedLegacyDatabase(33);
    await legacy.table('tags').update('existing', { updatedAt: 'invalid' });
    legacy.close();
    const fail = () => {
      throw new BaseError('migration failed');
    };
    db.tags.hook('updating', fail);
    try {
      await expect(db.open()).rejects.toThrow();
    } finally {
      db.tags.hook('updating').unsubscribe(fail);
      db.close();
    }
    const original = new Dexie('mezanno');
    original.version(33).stores(legacySchema);
    await original.open();
    expect((await original.table<{ updatedAt: string }>('tags').get('existing'))?.updatedAt).toBe(
      'invalid',
    );
    expect(original.verno).toBe(33);
    original.close();
  });
});
