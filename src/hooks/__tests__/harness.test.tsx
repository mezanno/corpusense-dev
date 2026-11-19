import { useTags } from '@/hooks/data/tags/useTags';
import { useQueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  countLiveQuerySubscribers,
  makeTag,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedTags,
} from './harness';

resetTestDbBeforeEach();

describe('harnais de tests des hooks — test de fumée', () => {
  it('useTags lit après écriture par le repository tags réel et se désabonne au démontage', async () => {
    // Preuve du plumbing du harnais (écriture réelle → liveQuery sur l'arborescence
    // complète hook + providers), pas de la sémantique de coquille de useTags :
    // celle-ci a emménagé dans src/hooks/data/tags/__tests__/useTags.test.tsx
    // (lot 24, reprise du lot 0 — pas de duplication).
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() => useTags());

    const tag = makeTag({ id: 'tag-fumée', label: 'Sources primaires' });
    await seedTags([tag]);
    await waitFor(() => expect(result.current.tags).toEqual([tag]));

    // Le delta n'est mesuré qu'après une émission réellement observée : avant la
    // première requête (différée de setTimeout(0) par dexie), il ne serait pas
    // probant — leçon du lot 16, cf. l'en-tête de useTags.test.tsx (lot 24).
    expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('la base réelle est réinitialisée entre les tests', async () => {
    // Le tag « tag-fumée » écrit par le test précédent ne doit plus exister :
    // sans réinitialisation, l'émission liveQuery contiendrait les deux tags.
    const { result, unmount } = renderHookWithHarness(() => useTags());
    await waitFor(() => expect(result.current.tags).toEqual([]));

    const tag = makeTag({ id: 'tag-isolation', label: 'Isolation' });
    await seedTags([tag]);
    await waitFor(() => expect(result.current.tags).toEqual([tag]));
    unmount();
  });

  it('chaque rendu obtient un QueryClient neuf sans retry', () => {
    const first = renderHookWithHarness(() => useQueryClient());
    const second = renderHookWithHarness(() => useQueryClient());
    expect(first.result.current).not.toBe(second.result.current);
    expect(first.result.current.getDefaultOptions().queries?.retry).toBe(false);
    first.unmount();
    second.unmount();
  });
});
