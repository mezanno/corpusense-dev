import type { ModifierChainDTO } from '@/data/models/modifiers/Modifier';
import { beforeEach, describe, expect, it } from 'vitest';
import { EntityNotFoundError } from '../../EntityNotFoundError';
import { IndexedDBModifierChainRepository } from '../modifierChain';
import { createTestDb } from './testDb';

describe('IndexedDBModifierChainRepository', () => {
  const repository = new IndexedDBModifierChainRepository();
  const makeChain = (id: string, name: string): ModifierChainDTO => ({
    id,
    name,
    modifiers: [{ id: `${id}-modifier`, type: 'trim', values: { length: 3 } }],
  });

  beforeEach(async () => {
    await createTestDb();
  });

  it('adds a chain and finds it by id and name', async () => {
    const chain = makeChain('chain-1', 'Trim text');
    await repository.add(chain);

    expect(await repository.getById('chain-1')).toEqual({ ok: true, value: chain });
    expect(await repository.getByName('Trim text')).toEqual({ ok: true, value: chain });
    expect(await repository.getAll()).toEqual([chain]);
  });

  it('returns typed not-found results for missing chains', async () => {
    const byId = await repository.getById('missing-id');
    const byName = await repository.getByName('Missing name');

    expect(byId.ok).toBe(false);
    expect(byId.ok === false && byId.error).toBeInstanceOf(EntityNotFoundError);
    expect(byName.ok).toBe(false);
    expect(byName.ok === false && byName.error).toBeInstanceOf(EntityNotFoundError);
  });

  it('replaces a chain by id and deletes it', async () => {
    await repository.add(makeChain('chain-1', 'Original'));
    const replacement = makeChain('chain-1', 'Updated');
    await repository.put(replacement);

    expect(await repository.getByName('Updated')).toEqual({ ok: true, value: replacement });
    await repository.delete('chain-1');
    expect(await repository.getAll()).toEqual([]);
  });
});
