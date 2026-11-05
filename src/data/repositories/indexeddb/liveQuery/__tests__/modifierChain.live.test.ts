import type { ModifierChainDTO } from '@/data/models/modifiers/Modifier';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../__tests__/testDb';
import { db } from '../../db';
import { IndexedDBModifierChainlLiveRepository } from '../modifierChain.live';
import { observe, settleLiveQuery } from './liveQueryTestUtils';

const chain = (id: string, name: string): ModifierChainDTO => ({ id, name, modifiers: [] });

describe('IndexedDBModifierChainlLiveRepository', () => {
  beforeEach(createTestDb);

  it('emits modifier-chain additions, updates and removals', async () => {
    const live = observe(new IndexedDBModifierChainlLiveRepository().getAll());
    try {
      expect(await live.next()).toEqual([]);
      await db.modifierChains.put(chain('chain-1', 'Initial'));
      expect(await live.until((items) => items.length === 1)).toMatchObject([{ name: 'Initial' }]);
      await db.modifierChains.update('chain-1', { name: 'Updated' });
      expect(await live.until((items) => items[0]?.name === 'Updated')).toMatchObject([
        { id: 'chain-1', name: 'Updated' },
      ]);
      await db.modifierChains.delete('chain-1');
      expect(await live.until((items) => items.length === 0)).toEqual([]);

      live.unsubscribe();
      const count = live.values.length;
      await db.modifierChains.put(chain('after-unsubscribe', 'Ignored'));
      await settleLiveQuery();
      expect(live.values).toHaveLength(count);
    } finally {
      live.unsubscribe();
    }
  });
});
