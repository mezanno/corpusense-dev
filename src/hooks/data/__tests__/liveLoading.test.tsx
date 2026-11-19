/**
 * Lot 42 — Dé-couplage de la suite « état initial des listes live »
 * (cf. docs/roadmap.md, Q11, palier 3 reliquat, constat §5.5 de l'audit
 * du 2026-11-19).
 *
 * FRONTIÈRE MOCKÉE ÉTABLIE PAR LE PLAN : ce fichier est le seul à mocker
 * `dexie-react-hooks` (`vi.mock` ci-dessous, toléré et CANTONNÉ ici — ne pas
 * l'étendre aux autres suites, ne pas le retirer). Aucune base réelle
 * n'intervient dans le verdict : seule la valeur renvoyée par le mock décide
 * de ce que voit le hook. C'est précisément ce qui distingue cette suite des
 * suites « contrat commun » des lots 24+ (ci-dessous) : elle vérifie le
 * distingo vide/chargement SANS base, en un rendu synchrone puis un rerender.
 *
 * PAS DE DOUBLON avec les lots 24-37 et 39-40 : le motif « `undefined` →
 * loading » est déjà verrouillé sur le stack réel dans les suites dédiées de
 * chaque hook (`useLiveSources.test.tsx` lot 29, `useModels.test.tsx` lot 33,
 * `useModifierChainLive.test.tsx` lot 34, `useCollections.test.tsx` lots 39-40).
 * Cette suite garde sa valeur propre : les booléens `isLoading*` exposés par
 * les hooks sont la SEULE source de distinction entre liste émise vide et
 * liste pas encore émise, les tableaux eux-mêmes étant vides dans les deux cas
 * (repli `?? EMPTY_*` des hooks).
 *
 * CHANGEMENT LOT 42 (audit §5.5) : les deux assertions sur l'arité des appels
 * `useLiveQuery` (chaque appel à 2 arguments, puis `mock.calls[0]` à 2
 * arguments) sont SUPPRIMÉES et remplacées par le comportement observable
 * qu'elles croyaient garantir — la distinction vide/chargement par les
 * booléens avant/après rerender. La suite n'assertionne plus RIEN du nombre ni
 * de l'ordre des arguments passés à `useLiveQuery` : un réordonnancement
 * innocent des dépendances dans un hook ne doit plus pouvoir la casser.
 * L'alimentation du mock par `mockReturnValueOnce`/`mockReturnValue` (file
 * d'émisions, sans inspection des arguments) reste le seul pilotage admis.
 */
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
    // Première requête émise (liste vide), seconde pas encore : les deux
    // tableaux sont vides, seuls les booléens distinguent émis/chargement —
    // et ils peuvent diverger au même instant, preuve de listes suivies
    // séparément.
    vi.mocked(useLiveQuery).mockReturnValueOnce([]).mockReturnValueOnce(undefined);
    const { result, rerender } = renderHook(() => useLiveSources());
    expect(result.current.isLoadingRemoteSources).toBe(false);
    expect(result.current.isLoadingLocalSources).toBe(true);
    expect(result.current.remoteSources).toEqual([]);
    expect(result.current.localSources).toEqual([]);
    // Émission vide sur les deux requêtes : les deux booléens passent à faux
    // sans que rien ne change dans les tableaux.
    vi.mocked(useLiveQuery).mockReturnValue([]);
    rerender();
    expect(result.current.isLoadingRemoteSources).toBe(false);
    expect(result.current.isLoadingLocalSources).toBe(false);
    expect(result.current.remoteSources).toEqual([]);
    expect(result.current.localSources).toEqual([]);
  });

  const cases: [string, () => { isLoading: boolean; list: unknown[] }][] = [
    [
      'collections',
      () => {
        const r = useCollections();
        return { isLoading: r.isLoading, list: r.collections };
      },
    ],
    [
      'modèles',
      () => {
        const r = useModels();
        return { isLoading: r.isLoading, list: r.models };
      },
    ],
    [
      'chaînes',
      () => {
        const r = useModifierChainLive();
        return { isLoading: r.isLoading, list: r.modifierChains };
      },
    ],
  ];
  it.each(cases)('distingue le chargement et le vide pour les %s', (_name, hook) => {
    // Pas encore émis : le tableau (repli `?? EMPTY_*`) ne dit rien, seul
    // `isLoading` marque le chargement.
    vi.mocked(useLiveQuery).mockReturnValue(undefined);
    const { result, rerender } = renderHook(hook, { wrapper });
    expect(result.current.list).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    // Émis vide : même tableau qu'au-dessus, seul le booléen bascule —
    // vide n'est pas chargement.
    vi.mocked(useLiveQuery).mockReturnValue([]);
    rerender();
    expect(result.current.list).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
