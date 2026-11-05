import type { Project } from '@/data/models/project';
import { SourceAlreadyInProjectError } from '@/data/utils/errors';
import { NotFoundError } from '@/utils/NotFoundError';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBProjectRepository } from '../projects';
import { createTestDb } from './testDb';

describe('IndexedDBProjectRepository', () => {
  const repository = new IndexedDBProjectRepository();
  const project: Project = {
    id: 'project-1',
    name: 'Research project',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    sources: ['source-1'],
    collections: [],
  };

  beforeEach(async () => {
    await createTestDb();
  });

  it('persists and reads a project by id and in the project list', async () => {
    await repository.add(project);

    expect(await repository.getById(project.id)).toEqual({ ok: true, value: project });
    expect(await repository.getAll()).toEqual([project]);
  });

  it('returns a typed not-found result when the project is absent', async () => {
    const result = await repository.getById('missing-project');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBeInstanceOf(NotFoundError);
  });

  it('adds a source once and reports a duplicate without changing the project', async () => {
    await repository.add(project);

    expect(await repository.addSource(project.id, 'source-2')).toEqual({
      ok: true,
      value: undefined,
    });
    const duplicate = await repository.addSource(project.id, 'source-2');

    expect(duplicate.ok).toBe(false);
    expect(duplicate.ok === false && duplicate.error).toBeInstanceOf(SourceAlreadyInProjectError);
    expect(await repository.getById(project.id)).toEqual({
      ok: true,
      value: { ...project, sources: ['source-1', 'source-2'] },
    });
  });

  it('returns a typed not-found error when adding a source to an absent project', async () => {
    const result = await repository.addSource('missing-project', 'source-2');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBeInstanceOf(NotFoundError);
  });
});
