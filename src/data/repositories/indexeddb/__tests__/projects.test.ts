import { ProjectDTO } from '@/data/models/project/project.dto';
import { SourceAlreadyInProjectError } from '@/data/utils/errors';
import { NotFoundError } from '@/utils/NotFoundError';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDBProjectRepository } from '../projects';
import { createTestDb } from './testDb';

const CREATED_AT = '2026-01-01T00:00:00.000Z';
const MODIFIED_AT = '2026-01-02T00:00:00.000Z';

describe('IndexedDBProjectRepository', () => {
  const repository = new IndexedDBProjectRepository();
  // Inputs never carry timestamps: the repository assigns them (decision 1).
  const project: ProjectDTO = {
    id: 'project-1',
    name: 'Research project',
    sources: ['source-1'],
    collections: [],
  };

  beforeEach(async () => {
    await createTestDb();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(CREATED_AT));
  });
  afterEach(() => vi.useRealTimers());

  it('persists a project with initialized timestamps and reads it back', async () => {
    const created = await repository.add(project);

    expect(created).toEqual({ ...project, createdAt: CREATED_AT, updatedAt: CREATED_AT });
    expect(await repository.getById(project.id)).toEqual({ ok: true, value: created });
    expect(await repository.getAll()).toEqual([created]);
  });

  it('returns a typed not-found result when the project is absent', async () => {
    const result = await repository.getById('missing-project');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBeInstanceOf(NotFoundError);
  });

  it('adds a source, keeping createdAt and advancing updatedAt, and reports duplicates', async () => {
    const created = await repository.add(project);

    vi.setSystemTime(new Date(MODIFIED_AT));
    expect(await repository.addSource(project.id, 'source-2')).toEqual({
      ok: true,
      value: undefined,
    });
    const duplicate = await repository.addSource(project.id, 'source-2');

    expect(duplicate.ok).toBe(false);
    expect(duplicate.ok === false && duplicate.error).toBeInstanceOf(SourceAlreadyInProjectError);
    const updated = await repository.getById(project.id);
    expect(updated).toMatchObject({
      ok: true,
      value: {
        id: project.id,
        sources: ['source-1', 'source-2'],
        createdAt: created.createdAt,
        updatedAt: MODIFIED_AT,
      },
    });
    expect(updated.ok && updated.value.updatedAt).not.toBe(created.updatedAt);
  });

  it('returns a typed not-found error when adding a source to an absent project', async () => {
    const result = await repository.addSource('missing-project', 'source-2');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBeInstanceOf(NotFoundError);
  });
});
