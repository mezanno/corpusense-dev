/**
 * Lot 9 — useBlob (cf. docs/roadmap.md, Q11). Le comportement propre du hook
 * est couvert sur le vrai stack du harnais (lot 0) : états loading/success/error de
 * React Query observés par l'API publique du hook (`thumbUrl`) et l'entrée de cache
 * `['blob', blobId]`, transformation du `StoredBlob` lu en base en URL objet (l. 23-29),
 * révocation de cette URL au démontage (l. 27, promesse du commentaire source) et au
 * changement de clé, et tentative unique par entrée (compteurs `fetchFailureCount` /
 * `dataUpdateCount` du cache + compteurs des espions d'URL objet).
 *
 * Frontières :
 * - le gabarit du lot 9 mentionne un `fetch` stubbé : ce hook ne l'appelle JAMAIS. Son
 *   queryFn ne touche que Dexie réel (`getSourceRepository().getBlob`, l. 12-13, sans
 *   `vi.mock`). L'équivalent « erreur HTTP ok:false / rejet réseau » est donc l'échec du
 *   repository (`!blobResult.ok`, l. 14 — `EntityNotFoundError` levée pour un blob absent
 *   de la base réelle) ; le succès est produit par un blob écrit en base par le vrai
 *   repository (`seedBlobSource` ci-dessous, via `getSourceRepository().add`). `fetch`
 *   reste stubbé en tripwire dans tout le fichier : l'`afterEach` vérifie qu'aucun test
 *   ne l'a appelé (jamais de trafic réseau ici, y compris pour relire les contenus de
 *   blob — faits par `blob.text()`, jamais par `fetch(blob:…)`).
 * - Piège d'environnement (précédent documenté dans useCollectionIO.test.tsx, lot 3) :
 *   fake-indexeddb clone en realm Node et NE RECONNAÎT PAS le Blob de jsdom — un
 *   `new Blob(…)` de test y revient de la base comme un objet vide `{}` (vérifié), sur
 *   quoi `URL.createObjectURL` lève `ERR_INVALID_ARG_TYPE`. Les graines utilisent donc le
 *   Blob de `node:buffer`, seul Blob que ce clone reconnaît : il revient de la base comme
 *   un vrai Blob (taille et contenu intacts) — c'est exactement ce que l'IndexedDB réel
 *   fait en production. Écriture toujours par le vrai repository, aucun mock de Dexie.
 * - `URL.createObjectURL` / `URL.revokeObjectURL` : jsdom/Node en fournissent de vrais
 *   (`blob:nodedata:…`) — les espions `vi.spyOn` les enveloppent SANS les remplacer (les
 *   appels passent à l'original, l'URL rendue est assertée par son préfixe) ; c'est la
 *   frontière par laquelle le hook manifeste ses effets propres. Le blob effectivement
 *   passé à `createObjectURL` est vérifié par son contenu (relu en test) — preuve que
 *   l'URL correspond bien au blob stocké pour cette clé, pas à un autre.
 * - Base Dexie réelle réinitialisée par test, QueryClient neuf `retry: false`, aucun délai
 *   artificiel. La vidange des transactions IDB en course avant le `db.delete()` de
 *   `createTestDb` est assurée par le harnais depuis le lot 41 (motif de l'en-tête du lot 8,
 *   sans cet `afterEach` dédié).
 *
 * Écarts constatés (règle 7 — documentés et remontés, pas corrigés) :
 * - le hook ne désactive PAS le retry lui-même (l. 9-17 ne posent que queryKey et queryFn,
 *   ni staleTime ni gcTime). Le « pas de retry » observé dans cette suite vient du seul
 *   client du harnais ; le client applicatif (`src/App.tsx:29`, `new QueryClient()`) garde
 *   le défaut React Query, soit 3 retries à backoff exponentiel sur une lecture de blob en
 *   échec. À remonter — même écart que le lot 8 (écart 1), vérifié ici par
 *   `state.fetchFailureCount === 1` sur l'entrée d'erreur et par le compteur
 *   `createObjectURL` unique côté succès.
 * - le hook n'expose QUE `{ thumbUrl }` (l. 31-33) : l'`error` destructurée de useQuery au
 *   l. 9 n'est pas transmise, loading et erreur sont invisibles à l'appelant — `thumbUrl`
 *   vaut `null` aussi bien « pas encore chargé » que « échec définitif » (l. 24 ne pose
 *   l'URL que sur data truthy). Les appelants (`ManifestCard.tsx:27`,
 *   `ManifestThumbnail.tsx:7`, `ManifestThumbnailFloatingView.tsx:7`) affichent donc
 *   durablement rien sur une lecture échouée, sans signal. Verrouillé tel quel (test
 *   « blob absent »), pas légitimé.
 * - sur changement de clé, React Query rend `data === undefined` avant que la nouvelle
 *   lecture aboutisse : le cleanup de l'effet (l. 27) révoque l'URL alors que `thumbUrl`
 *   reste l'ancienne valeur — l'appelant tient un instant une URL révoquée et pendante,
 *   l'état n'étant effacé par personne. Caractérisé (test « la queryKey suit blobId »).
 *
 * Branches inatteignables ou non observables, justifiées :
 * - le queryFn (l. 11-16) ne prend pas de `signal` : l'annulation React Query au démontage
 *   lui est invisible et le `getBlob` court jusqu'au bout ; seule conséquence observable
 *   par l'API publique — aucun effet d'URL ne court sur un composant démonté (l'effet ne
 *   s'exécute plus) — verrouillée au test « démontage en vol ». Le sort du résultat en
 *   cache après annulation (pending vs success) relève de React Query, déjà caractérisé au
 *   lot 8, et n'est pas ré-affirmé ici ;
 * - `gcTime`/`staleTime` non posés : ramasse-miettes du cache sans observateur, non
 *   observable sans timers factices ni QueryClient partagé entre tests (interdits par le
 *   harnais) — même justification que le lot 8.
 *
 * Couverture mesurée (vitest --coverage, périmètre useBlob.tsx seul) : 100 % lignes,
 * énoncés, branches et fonctions.
 */
import { AddSourceDTO } from '@/data/models/source/source.dto';
import { EntityNotFoundError } from '@/data/repositories/EntityNotFoundError';
import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  makeRemoteSource,
  renderHookWithHarness,
  resetTestDbBeforeEach,
} from '@/hooks/__tests__/harness';
import type { QueryCache } from '@tanstack/react-query';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useBlob from '../useBlob';

const fetchTripwire = vi.fn();

// Espions aux bords URL objet : ils laissent passer l'implémentation réelle (vi.spyOn
// appelle l'original sauf mockImplementation) et ne font que compter/capturer.
// Non restaurés en fin de fichier : l'isolation par fichier de vitest les borne à cette
// suite, et vi.unstubAllGlobals emporterait les stubs de vitest.setup.ts dont le harnais
// dépend (même raisonnement que les lots 3 et 8).
const createObjectUrl = vi.spyOn(URL, 'createObjectURL');
const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');

// Base réelle vidée et réinitialisée par le harnais (lot 41 — la vidange IDB
// centralisée remplace le `getById('__flush__')` que cette suite portait en
// `afterEach` depuis le lot 9).
resetTestDbBeforeEach();

beforeEach(() => {
  fetchTripwire.mockClear();
  createObjectUrl.mockClear();
  revokeObjectUrl.mockClear();
  vi.stubGlobal('fetch', fetchTripwire);
});

afterEach(() => {
  expect(fetchTripwire).not.toHaveBeenCalled();
});

/**
 * Blob écrit en base par le VRAI repository (source graine dont c'est le thumbnailBlob).
 * Le contenu est porté par un Blob de `node:buffer` — seul Blob que le clone de
 * fake-indexeddb reconnaît (cf. en-tête) ; il revient de la base comme un vrai Blob.
 */
async function seedBlobSource(content: string): Promise<string> {
  // `as unknown as Blob` : le Blob de `node:buffer` est structurellement compatible au
  // clone près (cf. en-tête) mais pas déclarativement assignable au Blob DOM — passage
  // explicite par `unknown`, sans mensonge sur le runtime.
  const dto: AddSourceDTO = {
    ...makeRemoteSource(),
    thumbnailBlob: new NodeBlob([content]) as unknown as Blob,
  };
  const result = await getSourceRepository().add(dto);
  if (!result.ok) throw result.error;
  return result.value.thumbnailBlobId;
}

function blobEntries(queryCache: QueryCache) {
  return queryCache.getAll().filter((entry) => entry.queryKey[0] === 'blob');
}

/* ------------------------------------------------------------------ */
/* 1. États loading/success/error de React Query (l. 9-17, 23-29)      */
/* ------------------------------------------------------------------ */

describe('useBlob — états loading/success/error', () => {
  it('blob présent en base réelle : null pendant le loading, puis URL objet du blob stocké', async () => {
    const blobId = await seedBlobSource('contenu du blob de test');

    const { result, queryClient } = renderHookWithHarness(() => useBlob(blobId));

    // loading : aucune facette loading n'est exposée (écart 2, en-tête) — seul indice
    // observable par l'API publique, thumbUrl encore null.
    expect(result.current.thumbUrl).toBeNull();

    await vi.waitFor(() => expect(result.current.thumbUrl).toMatch(/^blob:/));
    expect(result.current.thumbUrl).toBeTypeOf('string');

    // La transformation propre au hook : le blob passé à createObjectURL est bien un vrai
    // Blob (retour du clonage IDB) et porte le contenu écrit en base — l'URL rendue
    // correspond à CE blob-là, pas à un autre.
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const givenBlob = createObjectUrl.mock.calls[0]?.[0];
    expect(givenBlob).toBeInstanceOf(NodeBlob);
    if (givenBlob instanceof NodeBlob) {
      expect(await givenBlob.text()).toBe('contenu du blob de test');
    }
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(blobEntries(queryClient.getQueryCache()).length).toBe(1));
    const entry = blobEntries(queryClient.getQueryCache())[0];
    expect(entry.queryKey).toEqual(['blob', blobId]);
    expect(entry.state.status).toBe('success');
    expect(entry.state.fetchFailureCount).toBe(0);
    expect(entry.state.dataUpdateCount).toBe(1);
  });

  it('blob absent de la base réelle : erreur typée en cache, tentative unique, thumbUrl figé à null', async () => {
    const { result, queryClient } = renderHookWithHarness(() => useBlob('blob-inexistant'));

    // l. 14 : !blobResult.ok → throw de l'EntityNotFoundError du repository réel
    // (équivalent, à cette frontière, d'un HTTP ok:false / rejet réseau).
    await vi.waitFor(() => expect(blobEntries(queryClient.getQueryCache()).length).toBe(1));
    const entry = blobEntries(queryClient.getQueryCache())[0];
    await vi.waitFor(() => expect(entry.state.status).toBe('error'));

    // fetchFailureCount === 1 → une seule tentative commise : pas de retry dans le client
    // de test (le hook ne pose pas retry lui-même — écart caractérisé en en-tête).
    expect(entry.state.fetchFailureCount).toBe(1);
    const error = entry.state.error;
    expect(error).toBeInstanceOf(EntityNotFoundError);
    if (error instanceof EntityNotFoundError) {
      expect(error.message).toBe('Blob with id blob-inexistant not found');
    }

    // Écart 2 verrouillé : après résolution en échec comme pendant le loading, la seule
    // facette publique du hook reste null — aucun signal distinct n'est possible.
    expect(result.current.thumbUrl).toBeNull();
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* 2. Clé de query et cycle de vie de l'URL (l. 10, 23-29)             */
/* ------------------------------------------------------------------ */

describe('useBlob — queryKey et cycle de vie de l’URL', () => {
  it('la queryKey suit blobId : changement de clé = nouvelle lecture, ancienne URL révoquée', async () => {
    const blobIdA = await seedBlobSource('contenu A');
    const blobIdB = await seedBlobSource('contenu B');

    let blobId = blobIdA;
    const { result, rerender, queryClient } = renderHookWithHarness(() => useBlob(blobId));

    await vi.waitFor(() => expect(result.current.thumbUrl).toMatch(/^blob:/));
    const urlA = result.current.thumbUrl;

    blobId = blobIdB;
    rerender();

    // Écart 3 caractérisé : à la fin du commit du re-render, data est déjà undefined
    // (nouvelle clé) — le cleanup l. 27 a révoqué l'URL A, que thumbUrl affiche encore :
    // l'appelant tient une URL pendante jusqu'à la résolution de la lecture B.
    expect(revokeObjectUrl).toHaveBeenCalledWith(urlA);
    expect(result.current.thumbUrl).toBe(urlA);

    await vi.waitFor(() => expect(result.current.thumbUrl).not.toBe(urlA));
    expect(result.current.thumbUrl).toMatch(/^blob:/);

    // Deux entrées de cache PROUVENT que blobId participe bien à la clé (l. 10) : une clé
    // inchangée n'aurait construit qu'une seule entrée, sans seconde lecture. La seconde
    // lecture porte le contenu B — pas une réédition de A.
    const entries = blobEntries(queryClient.getQueryCache());
    expect(entries.map((entry) => entry.queryKey)).toEqual([
      ['blob', blobIdA],
      ['blob', blobIdB],
    ]);
    for (const entry of entries) {
      expect(entry.state.status).toBe('success');
      expect(entry.state.fetchFailureCount).toBe(0);
      expect(entry.state.dataUpdateCount).toBe(1);
    }
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    const blobB = createObjectUrl.mock.calls[1]?.[0];
    if (blobB instanceof NodeBlob) {
      expect(await blobB.text()).toBe('contenu B');
    }
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('même blobId : un re-render ne relance ni la lecture ni la création d’URL', async () => {
    const blobId = await seedBlobSource('contenu unique');
    const { result, rerender, queryClient } = renderHookWithHarness(() => useBlob(blobId));

    await vi.waitFor(() => expect(result.current.thumbUrl).toMatch(/^blob:/));
    const url = result.current.thumbUrl;
    expect(createObjectUrl).toHaveBeenCalledTimes(1);

    rerender();
    rerender();
    await Promise.resolve();

    // Pas de staleTime posée (l. 9-17) : la donnée est périmée sur le champ, mais un simple
    // re-render n'est pas un déclencheur de refetch dans React Query — la l. 25 ne repasse
    // pas, l'URL reste la même instance.
    expect(result.current.thumbUrl).toBe(url);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    expect(blobEntries(queryClient.getQueryCache())[0].state.dataUpdateCount).toBe(1);
  });

  it('invalidation de la query : nouvelle lecture du blob, ancienne URL révoquée puis remplacée', async () => {
    // Chemin propre au hook : chaque lecture Dexie rend un Blob fraîchement cloné, donc
    // l'effet (deps [data], l. 29) s'exécute de nouveau — révoque puis recrée.
    const blobId = await seedBlobSource('contenu invalidé');
    const { result, queryClient } = renderHookWithHarness(() => useBlob(blobId));

    await vi.waitFor(() => expect(result.current.thumbUrl).toMatch(/^blob:/));
    const url1 = result.current.thumbUrl;

    await queryClient.invalidateQueries({ queryKey: ['blob', blobId] });

    await vi.waitFor(() => expect(result.current.thumbUrl).not.toBe(url1));
    expect(result.current.thumbUrl).toMatch(/^blob:/);
    expect(revokeObjectUrl).toHaveBeenCalledWith(url1);
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    // La relecture a bien rapporté un nouvel objet Blob (clone IDB), pas la même référence.
    expect(createObjectUrl.mock.calls[0]?.[0]).not.toBe(createObjectUrl.mock.calls[1]?.[0]);

    const entry = blobEntries(queryClient.getQueryCache())[0];
    expect(entry.state.status).toBe('success');
    expect(entry.state.dataUpdateCount).toBe(2);
    expect(entry.state.fetchFailureCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Révocation au démontage (l. 27)                                  */
/* ------------------------------------------------------------------ */

describe('useBlob — démontage', () => {
  it('démonté après succès : l’URL rendue est révoquée', async () => {
    const blobId = await seedBlobSource('contenu de vignette');
    const { result, unmount } = renderHookWithHarness(() => useBlob(blobId));

    await vi.waitFor(() => expect(result.current.thumbUrl).toMatch(/^blob:/));
    const url = result.current.thumbUrl;

    unmount();
    // Promesse du commentaire source (l. 27) : libération synchrone au démontage.
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith(url);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('démonté pendant la lecture : aucun effet de bord d’URL objet', async () => {
    const blobId = await seedBlobSource('contenu trop tard');
    const { unmount, queryClient } = renderHookWithHarness(() => useBlob(blobId));

    unmount();
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));

    // L'effet l. 23-29 ne court plus : ni création, ni révocation (aucune URL n'a été
    // ouverte). Le queryFn ne consulte pas de signal — voir justification en en-tête.
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    expect(blobEntries(queryClient.getQueryCache())[0].state.error).toBeNull();
  });
});
