import type { DataModel } from '@/data/models/dataModel/dataModel';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityNotFoundError } from '../../EntityNotFoundError';
import { IndexedDBModelRepository } from '../models';
import { createTestDb } from './testDb';

const FIXED_DATE = '2026-01-01T00:00:00.000Z';

describe('IndexedDBModelRepository', () => {
  const repository = new IndexedDBModelRepository();
  // Fixtures describe stored models; the repository nevertheless assigns the
  // timestamps itself, which the controlled clock makes observable.
  const makeModel = (id: string, name: string): DataModel => ({
    id,
    name,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    prompt: `Prompt for ${name}`,
    fields: [{ id: `${id}-field`, name: 'title', type: 'string', color: '#123456' }],
  });

  beforeEach(async () => {
    await createTestDb();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(FIXED_DATE));
  });
  afterEach(() => vi.useRealTimers());

  it('adds models with repository-assigned dates and reads them back', async () => {
    const zebra = await repository.add(makeModel('model-z', 'Zebra'));
    const alpha = await repository.add(makeModel('model-a', 'Alpha'));

    expect(zebra).toMatchObject({ createdAt: FIXED_DATE, updatedAt: FIXED_DATE });
    expect(await repository.getById('model-z')).toEqual({ ok: true, value: zebra });
    expect(await repository.getByName('Alpha')).toEqual({ ok: true, value: alpha });
    expect(await repository.getAll()).toEqual([alpha, zebra]);
  });

  it('returns a typed not-found result for an absent id or name', async () => {
    const byId = await repository.getById('missing-id');
    const byName = await repository.getByName('Missing name');

    expect(byId.ok).toBe(false);
    expect(byId.ok === false && byId.error).toBeInstanceOf(EntityNotFoundError);
    expect(byName.ok).toBe(false);
    expect(byName.ok === false && byName.error).toBeInstanceOf(EntityNotFoundError);
  });

  it('updates a model preserving createdAt, then deletes it', async () => {
    const created = await repository.add(makeModel('model-1', 'Original'));
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    const replacement = makeModel('model-1', 'Updated');
    const written = await repository.update(replacement);

    expect(written).toEqual({
      ...replacement,
      createdAt: created.createdAt,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(await repository.getById('model-1')).toEqual({ ok: true, value: written });
    await repository.deleteById('model-1');
    expect(await repository.getAll()).toEqual([]);
  });

  it('imports an existing model preserving the provided valid dates', async () => {
    await repository.add(makeModel('model-1', 'Original'));
    const imported: DataModel = {
      ...makeModel('model-1', 'Imported'),
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-06-01T00:00:00.000Z',
    };

    expect(await repository.importWithDates(imported)).toEqual({ ok: true, value: undefined });
    expect(await repository.getById('model-1')).toEqual({ ok: true, value: imported });
  });

  it('rejects an import carrying invalid timestamps without touching the stored model', async () => {
    const created = await repository.add(makeModel('model-1', 'Original'));

    const result = await repository.importWithDates({
      ...created,
      updatedAt: 'not-a-date',
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.name).toBe('InvalidImportedDatesError');
    expect(await repository.getById('model-1')).toEqual({ ok: true, value: created });
  });
});
