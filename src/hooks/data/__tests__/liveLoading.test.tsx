import { createMockStore } from '@/__tests__/utils';
import { useCollections } from '@/hooks/data/collections/useCollections';
import { useModels } from '@/hooks/data/models/useModels';
import useModifierChainLive from '@/hooks/data/modifiers/useModifierChainLive';
import useLiveSources from '@/hooks/data/sources/useLiveSources';
import { renderHook } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: vi.fn() }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={createMockStore()}>{children}</Provider>
);

describe('état initial des listes live', () => {
  beforeEach(() => vi.mocked(useLiveQuery).mockReset());

  it('distingue les deux listes de sources', () => {
    vi.mocked(useLiveQuery).mockReturnValueOnce([]).mockReturnValueOnce(undefined);
    const { result, rerender } = renderHook(() => useLiveSources());
    expect(result.current.isLoadingRemoteSources).toBe(false);
    expect(result.current.isLoadingLocalSources).toBe(true);
    expect(result.current.localSources).toEqual([]);
    vi.mocked(useLiveQuery).mock.calls.forEach((args) => expect(args).toHaveLength(2));
    vi.mocked(useLiveQuery).mockReturnValue([]);
    rerender();
    expect(result.current.isLoadingLocalSources).toBe(false);
  });

  const cases: [string, () => { isLoading: boolean }][] = [
    ['collections', () => useCollections()],
    ['modèles', () => useModels()],
    ['chaînes', () => useModifierChainLive()],
  ];
  it.each(cases)('distingue le chargement et le vide pour les %s', (_name, hook) => {
    vi.mocked(useLiveQuery).mockReturnValue(undefined);
    const { result, rerender } = renderHook(hook, { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(vi.mocked(useLiveQuery).mock.calls[0]).toHaveLength(2);
    vi.mocked(useLiveQuery).mockReturnValue([]);
    rerender();
    expect(result.current.isLoading).toBe(false);
  });
});
