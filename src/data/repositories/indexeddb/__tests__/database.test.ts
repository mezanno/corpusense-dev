import type { ExportProgress } from 'dexie-export-import';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBDatabaseRepository } from '../database';
import { db } from '../db';
import { createTestDb } from './testDb';

const repository = new IndexedDBDatabaseRepository();

describe('IndexedDBDatabaseRepository', () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it('exports representative data and imports it while replacing existing tables', async () => {
    await db.tags.bulkAdd([
      { id: 'tag-1', label: 'Exported tag' },
      { id: 'tag-2', label: 'Another exported tag' },
    ]);
    await db.projects.add({
      id: 'project-1',
      name: 'Exported project',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      sources: ['source-1'],
      collections: ['collection-1'],
    });

    const exportProgress: ExportProgress[] = [];
    const backup = await repository.export((progress) => {
      exportProgress.push(progress);
      return true;
    });

    expect(backup).toBeInstanceOf(Blob);
    expect(exportProgress.length).toBeGreaterThan(0);
    expect(exportProgress.at(-1)).toMatchObject({
      totalTables: expect.any(Number),
      completedTables: expect.any(Number),
      totalRows: expect.any(Number),
      completedRows: expect.any(Number),
      done: true,
    });

    await db.tags.put({ id: 'tag-1', label: 'Stale tag' });
    await db.tags.add({ id: 'stale-tag', label: 'Must be removed by import' });
    await db.projects.add({
      id: 'stale-project',
      name: 'Must be removed by import',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      sources: [],
      collections: [],
    });

    const importProgress: ExportProgress[] = [];
    await repository.import(backup, (progress) => {
      importProgress.push(progress);
      return true;
    });

    expect(await db.tags.toArray()).toEqual([
      { id: 'tag-1', label: 'Exported tag' },
      { id: 'tag-2', label: 'Another exported tag' },
    ]);
    expect(await db.projects.toArray()).toEqual([
      {
        id: 'project-1',
        name: 'Exported project',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        sources: ['source-1'],
        collections: ['collection-1'],
      },
    ]);
    expect(importProgress.length).toBeGreaterThan(0);
    expect(importProgress.at(-1)).toMatchObject({
      totalTables: expect.any(Number),
      completedTables: expect.any(Number),
      totalRows: expect.any(Number),
      completedRows: expect.any(Number),
      done: true,
    });
  });

  it('clears the database and allows it to be reopened cleanly', async () => {
    await db.tags.add({ id: 'tag-1', label: 'Persisted tag' });
    await db.projects.add({
      id: 'project-1',
      name: 'Persisted project',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      sources: [],
      collections: [],
    });

    await repository.clear();
    await createTestDb();

    expect(await db.tags.toArray()).toEqual([]);
    expect(await db.projects.toArray()).toEqual([]);
  });
});
