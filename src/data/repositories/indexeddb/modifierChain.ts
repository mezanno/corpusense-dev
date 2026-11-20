import { ModifierChain } from '@/data/models/modifiers/Modifier';
import { ModifierChainDTO } from '@/data/models/modifiers/modifierChain.dto';
import { FunctionResult } from '@/utils/functionResult';
import { EntityNotFoundError } from '../EntityNotFoundError';
import { db } from './db';
import { ModifierChainRepository } from './types';

export class IndexedDBModifierChainRepository implements ModifierChainRepository {
  async add(chain: ModifierChainDTO): Promise<ModifierChain> {
    // Creation path: the repository initializes both timestamps (decisions 1 and 8).
    const now = new Date().toISOString();
    const newChain: ModifierChain = { ...chain, createdAt: now, updatedAt: now };
    await db.modifierChains.add(newChain);
    return newChain;
  }

  async put(chain: ModifierChainDTO): Promise<ModifierChain> {
    // Upsert: creation initializes both dates, modification preserves the stored createdAt.
    return await db.transaction('rw', db.modifierChains, async () => {
      const existing = await db.modifierChains.get(chain.id);
      const now = new Date().toISOString();
      const written: ModifierChain = {
        ...chain,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await db.modifierChains.put(written);
      return written;
    });
  }

  async getAll(): Promise<ModifierChain[]> {
    return await db.modifierChains.toArray();
  }

  async getById(id: string): Promise<FunctionResult<ModifierChain, EntityNotFoundError>> {
    const modifierChain = await db.modifierChains.get(id);
    if (!modifierChain) {
      return FunctionResult.err(new EntityNotFoundError({ entity: 'ModifierChain', id }));
    }
    return FunctionResult.ok(modifierChain);
  }

  async getByName(name: string): Promise<FunctionResult<ModifierChain, EntityNotFoundError>> {
    const modifierChain = await db.modifierChains.where('name').equals(name).first();
    if (!modifierChain) {
      return FunctionResult.err(new EntityNotFoundError({ entity: 'ModifierChain', id: name }));
    }
    return FunctionResult.ok(modifierChain);
  }

  async delete(id: string): Promise<void> {
    await db.modifierChains.delete(id);
  }
}
