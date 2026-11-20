import { ModifierChainDTO } from '@/data/models/modifiers/modifierChain.dto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityNotFoundError } from '../../EntityNotFoundError';
import { IndexedDBModifierChainRepository } from '../modifierChain';
import { createTestDb } from './testDb';

const CREATED_AT = '2026-01-01T00:00:00.000Z';
const MODIFIED_AT = '2026-01-02T00:00:00.000Z';

describe('IndexedDBModifierChainRepository', () => {
  const repository = new IndexedDBModifierChainRepository();
  // Entry DTOs never carry timestamps: the repository assigns them (decision 8).
  const makeChain = (id: string, name: string): ModifierChainDTO => ({
    id,
    name,
    modifiers: [{ id: `${id}-modifier`, type: 'trim', values: { length: 3 } }],
  });

  beforeEach(async () => {
    await createTestDb();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(CREATED_AT));
  });
  afterEach(() => vi.useRealTimers());

  it('adds a chain with initialized timestamps and finds it by id and name', async () => {
    const chain = makeChain('chain-1', 'Trim text');
    const created = await repository.add(chain);

    expect(created).toEqual({ ...chain, createdAt: CREATED_AT, updatedAt: CREATED_AT });
    expect(await repository.getById('chain-1')).toEqual({ ok: true, value: created });
    expect(await repository.getByName('Trim text')).toEqual({ ok: true, value: created });
    expect(await repository.getAll()).toEqual([created]);
  });

  it('returns typed not-found results for missing chains', async () => {
    const byId = await repository.getById('missing-id');
    const byName = await repository.getByName('Missing name');

    expect(byId.ok).toBe(false);
    expect(byId.ok === false && byId.error).toBeInstanceOf(EntityNotFoundError);
    expect(byName.ok).toBe(false);
    expect(byName.ok === false && byName.error).toBeInstanceOf(EntityNotFoundError);
  });

  it('replaces a chain preserving createdAt, then deletes it', async () => {
    const original = await repository.add(makeChain('chain-1', 'Original'));

    vi.setSystemTime(new Date(MODIFIED_AT));
    const replacement = makeChain('chain-1', 'Updated');
    const written = await repository.put(replacement);

    expect(written).toEqual({
      ...replacement,
      createdAt: original.createdAt,
      updatedAt: MODIFIED_AT,
    });
    expect(await repository.getByName('Updated')).toEqual({ ok: true, value: written });
    await repository.delete('chain-1');
    expect(await repository.getAll()).toEqual([]);
  });
});
