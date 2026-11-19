/**
 * Lot 10 — useSource (cf. docs/roadmap.md, Q11). Le comportement propre du hook est
 * couvert sur le vrai stack du harnais (lot 0) : états loading/success/error de React Query
 * observés par l'API publique `{ error, isLoading, manifest, sourceWithContent }` (l. 33-38),
 * fusion des deux lectures repository (l. 16 et 20 → l. 24-27) et dérivation du manifeste
 * (l. 31) sur la base Dexie réelle, clé de query `[QUERY_KEY_CURRENT_SOURCE, sourceId]`
 * (l. 5, 13) suivie par ses deux contractants réels — changement de sourceId (l. 7) et
 * invalidation par préfixe comme après renommage (ManifestDetails.tsx:31) — et tentative
 * unique par entrée (compteurs `fetchFailureCount` / `dataUpdateCount` du cache).
 *
 * Frontières :
 * - le gabarit du lot 10 mentionne un `fetch` stubbé : ce hook ne l'appelle JAMAIS. Son
 *   queryFn (l. 14-28) ne touche que Dexie réel (`getById` l. 16, `getContentById` l. 20,
 *   sans `vi.mock` ; le seul `fetch` du repository source vit dans sa migration, hors du
 *   chemin de lecture). L'équivalent « erreur HTTP ok:false / rejet réseau » est donc
 *   l'échec du repository : `!sourceResult.ok` (l. 17-19, `EntityNotFoundError` « Source »)
 *   et `!contentResult.ok` (l. 21-23, « SourceContent ») — les deux branches sont couvertes
 *   distinctement. `fetch` reste stubbé en tripwire dans tout le fichier : l'`afterEach`
 *   vérifie qu'aucun test ne l'a appelé (jamais de trafic réseau ici).
 * - « URL objet révoquée quand le code le promet » (gabarit du lot 10) : le code ne promet
 *   RIEN. `useSource.tsx` (41 lignes) ne contient aucun `URL.createObjectURL` ni
 *   `URL.revokeObjectURL`, aucun effet (aucun import de `react` au-delà de `useQuery`) — la
 *   fabrication/révocation d'URL n'existent que dans `useBlob` (verrouillées au lot 9). Ce
 *   silence est néanmoins PROUVÉ, pas postulé : les deux fonctions d'URL sont espionnées en
 *   pass-through et l'`afterEach` vérifie zéro appel sur toute la suite.
 * - source au contenu absent (l. 21-23) : état incohérent qu'aucune API du repository ne
 *   peut produire (`add` l. 52-58 et `deleteById` l. 213-220 de sources.ts sont des
 *   transactions couvrant les deux tables — il ne survit qu'à une interruption de
 *   migration, cf. l. 296-311). La graine est écrite par le VRAI repository puis la ligne
 *   de contenu est supprimée par une opération RÉELLE sur la table (`db.sourceContents.delete`)
 *   — pas un mock de Dexie : mêmes imports bruts et même esprit que l'injection de faute par
 *   `table.hook('reading')` des lots 4 et 6.
 * - Base Dexie réelle réinitialisée par test, QueryClient neuf `retry: false`, aucun délai
 *   artificiel. La vidange des transactions IDB en course avant le `db.delete()` de
 *   `createTestDb` est assurée par le harnais depuis le lot 41 (motif des lots 8-9, sans
 *   cet `afterEach` dédié).
 *
 * Écarts constatés (règle 7 — documentés et remontés, pas corrigés) :
 * - le hook ne désactive PAS le retry lui-même (l. 12-29 ne posent que queryKey et queryFn,
 *   ni staleTime ni gcTime ni retry). Le « pas de retry » observé dans cette suite vient du
 *   seul client du harnais ; le client applicatif (`src/App.tsx:29`, `new QueryClient()`)
 *   garde le défaut React Query, soit 3 retries à backoff exponentiel sur une lecture en
 *   échec. À remonter — écart déjà établi aux lots 8-9, vérifié ici par
 *   `state.fetchFailureCount === 1` sur chaque entrée d'erreur.
 * - le hook ne pose AUCUNE garde `enabled` sur la clé (l. 13) : sourceId vide, cas courant
 *   de son appelant `ManifestPageContext.tsx:30` (`id ?? ''` quand l'URL n'a pas de
 *   manifestId), part en une lecture vouée à l'échec au lieu de rester au repos —
 *   contrairement à `useThumbnail` (l. 81) qui désactive sa requête. Caractérisé (test
 *   « sourceId vide »), pas légitimé.
 * - facette positive propre à ce hook, verrouillée ici pour la distinguer de l'écart 2 du
 *   lot 9 : l'`error` de useQuery EST transmise (l. 9, 34) — l'appelant reçoit l'objet
 *   d'erreur réel du repository, et loading/error/success sont trois états discernables par
 *   la seule API publique (aucun test n'a besoin de fouiller le cache pour les distinguer).
 *
 * Branches inatteignables ou non observables, justifiées :
 * - le queryFn (l. 14) ne prend pas de `signal` : l'annulation React Query au démontage lui
 *   est invisible et les deux lectures Dexie courent jusqu'au bout ; seule conséquence
 *   observable par l'API publique — aucune erreur commise et aucun effet après démontage —
 *   verrouillée au test « démontage en vol ». Le sort du résultat en cache après annulation
 *   (pending vs success) relève de React Query, caractérisé aux lots 8-9, non ré-affirmé ici ;
 * - `gcTime`/`staleTime` non posés : ramasse-miettes du cache sans observateur, non
 *   observable sans timers factices ni QueryClient partagé entre tests (interdits par le
 *   harnais) — même justification que les lots 8-9 ;
 * - volet droit du `?.` de la l. 31 (sourceWithContent undefined) : atteint par tout état
 *   loading/erreur ci-dessous ; volet gauche par le succès — les deux sont donc exercés,
 *   rien d'ajouté.
 *
 * Couverture mesurée (vitest --coverage, périmètre useSource.tsx seul) : 100 % lignes,
 * énoncés, branches et fonctions.
 */
import { EntityNotFoundError } from '@/data/repositories/EntityNotFoundError';
import { db } from '@/data/repositories/indexeddb/db';
import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  makeRemoteSource,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedRemoteSource,
} from '@/hooks/__tests__/harness';
import type { QueryCache } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useSource, { QUERY_KEY_CURRENT_SOURCE } from '../useSource';

const fetchTripwire = vi.fn();

// Espions aux bords URL objet : pass-through (vi.spyOn appelle l'original sauf
// mockImplementation), ils ne font que compter — preuve négative du silence du hook sur
// l'URL objet (cf. en-tête). Non restaurés en fin de fichier : l'isolation par fichier de
// vitest les borne à cette suite, et vi.unstubAllGlobals emporterait les stubs de
// vitest.setup.ts dont le harnais dépend (même raisonnement que les lots 3, 8 et 9).
const createObjectUrl = vi.spyOn(URL, 'createObjectURL');
const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');

// Base réelle vidée et réinitialisée par le harnais (lot 41 — la vidange IDB
// centralisée remplace le `getById('__flush__')` que cette suite portait en
// `afterEach` depuis le lot 10).
resetTestDbBeforeEach();

beforeEach(() => {
  fetchTripwire.mockClear();
  createObjectUrl.mockClear();
  revokeObjectUrl.mockClear();
  vi.stubGlobal('fetch', fetchTripwire);
});

afterEach(() => {
  expect(fetchTripwire).not.toHaveBeenCalled();
  // Le hook ne promet aucune URL objet : vérifié silencieux sur toute la suite (en-tête).
  expect(createObjectUrl).not.toHaveBeenCalled();
  expect(revokeObjectUrl).not.toHaveBeenCalled();
});

function sourceEntries(queryCache: QueryCache) {
  return queryCache.getAll().filter((entry) => entry.queryKey[0] === QUERY_KEY_CURRENT_SOURCE);
}

/* ------------------------------------------------------------------ */
/* 1. États loading/success/error (l. 8-29, 31-38)                     */
/* ------------------------------------------------------------------ */

describe('useSource — états loading/success/error', () => {
  it('source présente en base réelle : loading puis succès fusionné, manifest passé tel quel', async () => {
    const manifestUrl = 'https://example.org/manifest/lot-10';
    const source = await seedRemoteSource(makeRemoteSource({ manifestUrl }));

    const { result, queryClient } = renderHookWithHarness(() => useSource(source.id));

    // loading (l. 10) : data encore undefined, le `?.` de la l. 31 rend manifest undefined,
    // et aucune erreur n'est encore commise.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.sourceWithContent).toBeUndefined();
    expect(result.current.manifest).toBeUndefined();

    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();

    // La fusion propre au hook (l. 24-27) : champs du source (getById, l. 16) + content
    // (getContentById, l. 20) — les deux lectures Dexie réelles, source graine écrite par le
    // vrai repository.
    expect(result.current.sourceWithContent).toMatchObject({
      id: source.id,
      name: source.name,
      type: 'remote',
      content: { type: 'remote', manifest: { id: manifestUrl } },
    });
    // l. 31 : `manifest` EST `sourceWithContent.content.manifest` (pass-through, pas une copie).
    expect(result.current.manifest).toBe(result.current.sourceWithContent?.content.manifest);

    // Clé exacte (l. 5, 13) et tentative unique côté succès.
    const entry = sourceEntries(queryClient.getQueryCache())[0];
    expect(entry.queryKey).toEqual([QUERY_KEY_CURRENT_SOURCE, source.id]);
    expect(entry.state.status).toBe('success');
    expect(entry.state.fetchFailureCount).toBe(0);
    expect(entry.state.dataUpdateCount).toBe(1);
  });

  it('source absente de la base réelle : erreur du repository exposée, tentative unique', async () => {
    const { result, queryClient } = renderHookWithHarness(() => useSource('source-inexistante'));

    // l. 17-19 : !sourceResult.ok → throw de l'EntityNotFoundError du repository réel
    // (équivalent, à cette frontière, d'un HTTP ok:false / rejet réseau).
    await vi.waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.isLoading).toBe(false);
    const error = result.current.error;
    expect(error).toBeInstanceOf(EntityNotFoundError);
    if (error instanceof EntityNotFoundError) {
      expect(error.message).toBe('Source with id source-inexistante not found');
    }
    // Pas de succès partiel : la fusion (l. 24-27) et la dérivation (l. 31) ne voient rien.
    expect(result.current.sourceWithContent).toBeUndefined();
    expect(result.current.manifest).toBeUndefined();

    const entry = sourceEntries(queryClient.getQueryCache())[0];
    expect(entry.state.status).toBe('error');
    // fetchFailureCount === 1 → une seule tentative commise : pas de retry dans le client
    // de test (le hook ne pose pas retry lui-même — écart 1 en en-tête).
    expect(entry.state.fetchFailureCount).toBe(1);
    expect(entry.state.dataUpdateCount).toBe(0);
  });

  it('source présente mais contenu absent : seconde lecture distincte en échec (l. 21-23)', async () => {
    const source = await seedRemoteSource();
    // Suppression RÉELLE de la ligne de contenu (état incohérent hors d'atteinte par l'API
    // du repository — cf. en-tête) ; la source, elle, reste présente.
    await db.sourceContents.delete(source.id);

    const { result, queryClient } = renderHookWithHarness(() => useSource(source.id));

    await vi.waitFor(() => expect(result.current.error).not.toBeNull());
    const error = result.current.error;
    expect(error).toBeInstanceOf(EntityNotFoundError);
    if (error instanceof EntityNotFoundError) {
      expect(error.message).toBe(`SourceContent with id ${source.id} not found`);
    }
    // L'erreur provient bien du SECOND throw (l. 22), pas du premier : entité nommée
    // « SourceContent ». Et le source lu entre-temps n'est pas exposé à moitié fusionné.
    expect(result.current.sourceWithContent).toBeUndefined();
    expect(result.current.manifest).toBeUndefined();

    const entry = sourceEntries(queryClient.getQueryCache())[0];
    expect(entry.state.status).toBe('error');
    expect(entry.state.fetchFailureCount).toBe(1);
    expect(entry.state.dataUpdateCount).toBe(0);
  });

  it('sourceId vide : aucune garde enabled, une lecture vouée à l’échec et une erreur exposée', async () => {
    // Contractant réel : ManifestPageContext.tsx:30 passe `id ?? ''` quand l'URL n'a pas de
    // manifestId. Contrairement à useThumbnail (l. 81), la requête n'est pas désactivée (l. 13
    // ne pose aucune garde) — écart 2 en en-tête, verrouillé tel quel.
    const { result, queryClient } = renderHookWithHarness(() => useSource(''));

    await vi.waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeInstanceOf(EntityNotFoundError);
    if (result.current.error instanceof EntityNotFoundError) {
      // Le message trahit l'id vide : double espace — trace de l'absence de garde, pas un
      // artifice de test.
      expect(result.current.error.message).toBe('Source with id  not found');
    }
    expect(result.current.manifest).toBeUndefined();

    const entry = sourceEntries(queryClient.getQueryCache())[0];
    expect(entry.queryKey).toEqual([QUERY_KEY_CURRENT_SOURCE, '']);
    expect(entry.state.status).toBe('error');
    expect(entry.state.fetchFailureCount).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Clé de query et cycle de vie propres au hook (l. 5, 7, 13)       */
/* ------------------------------------------------------------------ */

describe('useSource — queryKey et invalidation', () => {
  it('la queryKey suit sourceId : changement de clé = nouvelle lecture, trou loading sans donnée précédente', async () => {
    const sourceA = await seedRemoteSource(
      makeRemoteSource({ manifestUrl: 'https://example.org/manifest/a' }),
    );
    const sourceB = await seedRemoteSource(
      makeRemoteSource({ manifestUrl: 'https://example.org/manifest/b' }),
    );

    let sourceId = sourceA.id;
    const { result, rerender, queryClient } = renderHookWithHarness(() => useSource(sourceId));

    await vi.waitFor(() => expect(result.current.sourceWithContent).toBeDefined());
    expect(result.current.manifest?.id).toBe('https://example.org/manifest/a');

    sourceId = sourceB.id;
    rerender();

    // Pas de placeholderData (l. 12-29) : dès le re-render, la nouvelle clé n'a pas de data —
    // l'appelant voit sourceWithContent et manifest retomber à undefined, isLoading repasser
    // à true. Conséquence propre à l'API publique du hook, caractérisée.
    expect(result.current.sourceWithContent).toBeUndefined();
    expect(result.current.manifest).toBeUndefined();
    expect(result.current.isLoading).toBe(true);

    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sourceWithContent?.id).toBe(sourceB.id);
    expect(result.current.manifest?.id).toBe('https://example.org/manifest/b');
    expect(result.current.error).toBeNull();

    // Deux entrées de cache PROUVENT que sourceId participe bien à la clé (l. 13) : une clé
    // inchangée n'aurait construit qu'une seule entrée, sans seconde lecture.
    const entries = sourceEntries(queryClient.getQueryCache());
    expect(entries.map((entry) => entry.queryKey)).toEqual([
      [QUERY_KEY_CURRENT_SOURCE, sourceA.id],
      [QUERY_KEY_CURRENT_SOURCE, sourceB.id],
    ]);
    for (const entry of entries) {
      expect(entry.state.status).toBe('success');
      expect(entry.state.fetchFailureCount).toBe(0);
      expect(entry.state.dataUpdateCount).toBe(1);
    }
  });

  it('même sourceId : un re-render ne relance pas la lecture', async () => {
    const source = await seedRemoteSource();
    const { result, rerender, queryClient } = renderHookWithHarness(() => useSource(source.id));

    await vi.waitFor(() => expect(result.current.sourceWithContent).toBeDefined());
    const data = result.current.sourceWithContent;

    rerender();
    rerender();
    await Promise.resolve();

    // Pas de staleTime posée (l. 12-29) : la donnée est périmée sur le champ, mais un simple
    // re-render n'est pas un déclencheur de refetch dans React Query — même instance rendue,
    // aucun second aller-retour Dexie.
    expect(result.current.sourceWithContent).toBe(data);
    const entry = sourceEntries(queryClient.getQueryCache())[0];
    expect(entry.state.dataUpdateCount).toBe(1);
    expect(entry.state.fetchFailureCount).toBe(0);
  });

  it('invalidation par la constante exportée : renommage relu en base, même entrée de cache', async () => {
    // Contrat de la l. 5 côté appelant : ManifestDetails.tsx:31 invalide
    // [QUERY_KEY_CURRENT_SOURCE] (préfixe seul, sans id) après un renommage. Le test
    // vérifie que la clé du hook est bien préfixée par cette constante — la sémantique de
    // l'invalidation (React Query) et de la mutation (repository updateName) est verrouillée
    // ailleurs, pas ici.
    const source = await seedRemoteSource();
    const { result, queryClient } = renderHookWithHarness(() => useSource(source.id));
    await vi.waitFor(() => expect(result.current.sourceWithContent).toBeDefined());
    const manifestAvant = result.current.manifest;

    await getSourceRepository().updateName(source.id, 'Source renommée');
    await queryClient.invalidateQueries({ queryKey: [QUERY_KEY_CURRENT_SOURCE] });

    // Le nouveau nom vient de la base réelle relue. Le contenu, inchangé en base, revient
    // identique en profondeur — son identité de référence (nouvelle instance ou cache de clé
    // primaire de Dexie selon la table) relève du stockage, pas du hook : pas d'assertion
    // de part ni d'autre (règle : on observe l'API publique, pas les détails internes).
    await vi.waitFor(() => expect(result.current.sourceWithContent?.name).toBe('Source renommée'));
    expect(result.current.manifest).toEqual(manifestAvant);

    const entries = sourceEntries(queryClient.getQueryCache());
    expect(entries.length).toBe(1);
    expect(entries[0].queryKey).toEqual([QUERY_KEY_CURRENT_SOURCE, source.id]);
    expect(entries[0].state.status).toBe('success');
    expect(entries[0].state.dataUpdateCount).toBe(2);
    expect(entries[0].state.fetchFailureCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Démontage (l. 14-28 sans signal)                                 */
/* ------------------------------------------------------------------ */

describe('useSource — démontage', () => {
  it('démonté pendant la lecture : aucune erreur commise, aucun effet après démontage', async () => {
    const source = await seedRemoteSource();
    const { unmount, queryClient } = renderHookWithHarness(() => useSource(source.id));

    unmount();
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));

    // Le queryFn ne consulte aucun signal (l. 14 — justification en en-tête, écho du lot 9) :
    // la lecture court jusqu'au bout. Seules conséquences observables verrouillées ici :
    // rien ne tourne plus, et AUCUNE erreur n'est imputable au démontage (l'entrée ne porte
    // pas d'erreur avortée) ; le sort exact du résultat en cache relève de React Query
    // (caractérisé aux lots 8-9), pas du hook. Les tripwires fetch/URL de l'afterEach
    // complètent la preuve d'absence d'effet.
    const entry = sourceEntries(queryClient.getQueryCache())[0];
    expect(entry.state.error).toBeNull();
    expect(entry.state.fetchFailureCount).toBe(0);
    expect(queryClient.isFetching()).toBe(0);
  });
});
