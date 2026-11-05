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
    const finalExportProgress = exportProgress.at(-1);
    expect(finalExportProgress).toBeDefined();
    expect(typeof finalExportProgress?.totalTables).toBe('number');
    expect(typeof finalExportProgress?.completedTables).toBe('number');
    expect(typeof finalExportProgress?.totalRows).toBe('number');
    expect(typeof finalExportProgress?.completedRows).toBe('number');
    expect(finalExportProgress?.done).toBe(true);

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

    const importedTags = await db.tags.toArray();
    expect(importedTags).toHaveLength(2);
    expect(importedTags).toEqual(
      expect.arrayContaining([
        { id: 'tag-1', label: 'Exported tag' },
        { id: 'tag-2', label: 'Another exported tag' },
      ]),
    );
    const importedProjects = await db.projects.toArray();
    expect(importedProjects).toHaveLength(1);
    expect(importedProjects).toEqual(
      expect.arrayContaining([
        {
          id: 'project-1',
          name: 'Exported project',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          sources: ['source-1'],
          collections: ['collection-1'],
        },
      ]),
    );
    expect(importProgress.length).toBeGreaterThan(0);
    const finalImportProgress = importProgress.at(-1);
    expect(finalImportProgress).toBeDefined();
    expect(typeof finalImportProgress?.totalTables).toBe('number');
    expect(typeof finalImportProgress?.completedTables).toBe('number');
    expect(typeof finalImportProgress?.totalRows).toBe('number');
    expect(typeof finalImportProgress?.completedRows).toBe('number');
    expect(finalImportProgress?.done).toBe(true);
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
    await db.open();

    expect(await db.tags.toArray()).toEqual([]);
    expect(await db.projects.toArray()).toEqual([]);
  });
});
