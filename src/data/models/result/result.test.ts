import { normalizeImportedEntity } from '@/data/utils/historicalDates';
import { describe, expect, it } from 'vitest';
import { ImportedResultSchema } from './result';

describe('ImportedResultSchema', () => {
  const result = {
    scope: { collectionId: 'collection' },
    scopeKey: 'collection',
    workerName: 'OCR',
    workerId: 'worker',
    taskId: 1,
    value: 'result',
    params: {},
  };

  it('generates a new ID for an old numeric result ID', () => {
    // Old files reach the schema through the import boundary, which supplies
    // valid timestamps; the numeric ID conversion itself is unchanged.
    const now = new Date().toISOString();
    const imported = ImportedResultSchema.parse(
      normalizeImportedEntity({ ...result, id: 12 }, now),
    );
    expect(imported.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(imported.value).toBe('result');
    expect(imported.createdAt).toBe(now);
    expect(imported.updatedAt).toBe(now);
  });

  it('preserves string IDs and existing timestamps', () => {
    const imported = ImportedResultSchema.parse({
      ...result,
      id: 'existing',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2021-01-01T00:00:00.000Z',
    });
    expect(imported.id).toBe('existing');
    expect(imported.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(imported.updatedAt).toBe('2021-01-01T00:00:00.000Z');
  });
});
