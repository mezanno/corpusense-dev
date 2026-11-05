import type { DataModel } from '@/data/models/dataModel/dataModel';
import { beforeEach, describe, expect, it } from 'vitest';
import { EntityNotFoundError } from '../../EntityNotFoundError';
import { IndexedDBModelRepository } from '../models';
import { createTestDb } from './testDb';

describe('IndexedDBModelRepository', () => {
  const repository = new IndexedDBModelRepository();
  const makeModel = (id: string, name: string): DataModel => ({
    id,
    name,
    prompt: `Prompt for ${name}`,
    fields: [{ id: `${id}-field`, name: 'title', type: 'string', color: '#123456' }],
  });

  beforeEach(async () => {
    await createTestDb();
  });

  it('adds models and reads them by id, name, and alphabetical order', async () => {
    const zebra = makeModel('model-z', 'Zebra');
    const alpha = makeModel('model-a', 'Alpha');
    await repository.add(zebra);
    await repository.add(alpha);

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

  it('updates and deletes a model by id', async () => {
    await repository.add(makeModel('model-1', 'Original'));
    const replacement = makeModel('model-1', 'Updated');
    await repository.update(replacement);

    expect(await repository.getById('model-1')).toEqual({ ok: true, value: replacement });
    await repository.deleteById('model-1');
    expect(await repository.getAll()).toEqual([]);
  });
});
