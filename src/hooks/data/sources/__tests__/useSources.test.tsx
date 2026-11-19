/**
 * Lot 28 — useSources, palier 2 (cf. docs/roadmap.md, Q11).
 *
 * DÉVIATION FONDATRICE, à consigner pour l'audit (lot 38) : `useSources` est listé au
 * palier 2 « coquilles liveQuery » avec pour seule spécificité « coquille seule ;
 * `useSource` (React Query) a déjà son lot 10 », mais son source (useSources.tsx, 99
 * lignes) ne contient AUCUN `useLiveQuery` ni `liveQuery()`, et aucun `useQuery` non
 * plus — c'est une façade d'E/S sur le vrai `IndexedDBSourceRepository`
 * (`getSourceRepository()`, résolu À CHAQUE appel de fonction, jamais mémoïsé), sur la
 * passerelle `fetchManifestFromURL` de `src/utils/manifest.ts` et sur `getThumbnailBlob`
 * de `src/data/utils/manifest.ts`. Même requalification que les lots 26 (`useProjectsIO`)
 * et 27 (`useWorkers`) : le gabarit des lots 24-25 (defaultResult, observation de la
 * première émission) est adapté contrat par contrat et les points sans objet sont
 * DOCUMENTÉS, pas inventés. La réactivité des sources existe dans l'application — dans
 * `useLiveSources` (lot 29) et les providers du harnais, pas dans ce hook.
 *
 * Contrat commun, point par point :
 * - état initial : pas de valeur réactive du tout — six FONCTIONS disponibles dès le
 *   premier rendu synchronique (test nominal), dont deux mémoïsées (l. 31-45, l. 47-59)
 *   et quatre recréées à chaque rendu (caractérisation 2). Le hook ne tient AUCUN état
 *   lui-même (un seul `useAppDispatch`, l. 21) : rien à re-souscrire, rien à libérer.
 *   Aucune liveQuery ne part du hook : preuve mesurée en comparant le compteur
 *   `countLiveQuerySubscribers` à une référence « providers du harnais seuls » montée dans
 *   le même test (leçon des lots 16/24/25/26/27 — les providers souscrivent de façon
 *   différée via `setTimeout(0)` dans dexie, la comparaison n'est faite qu'APRÈS
 *   installation de ces abonnements, jamais en delta synchrone). Le motif « undefined →
 *   loading » de `liveLoading.test.tsx` ne s'applique pas : il n'y a ni `undefined`
 *   initial ni `isLoading` à distinguer ;
 * - bascule après première émission : SANS OBJET côté hook — l'analogue observable est
 *   l'effet résolu des promesses renvoyées : délégations `removeSourceFromLibrary` /
 *   `updateSourceName` / `clearAllSources` vérifiées par la base réelle relue par les
 *   VRAIS repositories, jointure `getSourceWithContent` confrontée à
 *   `getSourceWithContentById` du repository, aller-retour `addManifestToLibrary` (la
 *   ligne est écrite par le repository réel), et routage amont de `fetchManifest` (cache
 *   en base d'abord, réseau ensuite, jamais l'inverse) ;
 * - remontée d'erreur : trois canaux, jamais un seul — (a) VALEUR `FunctionResult`
 *   (`removeSourceFromLibrary` l. 24-28, `getSourceWithContent` l. 65-72,
 *   `addManifestToLibrary` l. 58, `fetchManifest` l. 34/40/42), (b) REJET BRUT pour ce que
 *   le repository LÈVE au lieu de le retourner (`updateSourceName` l. 81 et
 *   `clearAllSources` l. 86, sans try/catch), (c) `pushError` dans la slice `events` —
 *   UN SEUL dans tout le hook : l. 26, échec retourné par `deleteById`. Aucun
 *   ErrorBoundary n'est nécessaire : rien n'éclate le rendu du hook. Injections par l'API
 *   publique RÉELLE des hooks Dexie, retirées en `finally`, transposées au mutation-only
 *   comme au lot 27 : `hook('deleting')` (suppressions), `hook('updating')` (renommage),
 *   `hook('creating')` (ajout) sur `db.sources`. Le `hook('reading')` du gabarit est sans
 *   prise ici — le hook ne fait aucune lecture réactive. Point de vigilance :
 *   `db.sources`/`db.sourceContents`/`db.storedBlobs` ne sont lus par AUCUN provider du
 *   harnais (seulement collections/workers/results), donc une injection sur ces tables ne
 *   peut pas faire échouer une re-lecture différée d'un autre abonnement ; toutes les
 *   graines sont posées AVANT l'injection et plus aucune écriture n'a lieu après ;
 * - désabonnement au démontage : trivialement satisfait faute d'abonnement propre —
 *   vérifié malgré tout par le compteur : stable sous `rerender` et de retour EXACT à la
 *   valeur d'avant-montage après `unmount` (test nominal et tests d'injection).
 *
 * Spécificité table (plan, lot 28) — « coquille seule ; `useSource` a son lot 10 » :
 * respectée à la lettre. Ce fichier ne déclenche AUCUNE requête React Query, ne pilote
 * aucun QueryClient, n'importe ni `QUERY_KEY_CURRENT_SOURCE` ni `useSource` : rien des
 * états loading/success/error, de la queryKey, du retry ni de l'invalidation, tous
 * verrouillés au lot 10. Rien non plus de la sélection/nettoyage de sources
 * (`useLiveSources`, lot 29) ni de la réactivité (campagne Q2).
 *
 * Frontières (tout le reste est réel : VRAIS repositories, VRAI chargeur de plugins,
 * aucun mock de Dexie, aucun délai artificiel) :
 * - registre des importers : `initializePluginRegistries()` en `beforeAll` (précédent
 *   lots 1-2 et 27) — sans lui `fetchManifestFromURL` retomberait sur un importer absent ;
 * - `fetch` stubbé AU BORD DU RÉSEAU (plan, « frontières acceptables » ; motif
 *   `useCollectionImporter.test.tsx`) avec défaut bruyant : toute URL inattendue fait
 *   échouer le test au lieu de sortir sur le réseau. Seuls appels réseau possibles d'ici :
 *   le manifeste (via la passerelle et l'importer réel) et la vignette (`getThumbnailBlob`) ;
 * - preuve de non-écriture : relecture par le repository réel (`getContentByManifestUrl`,
 *   `getById`) et, faute de `getAll` dans l'interface des sources (types.ts:109-145), un
 *   comptage DIRECT `db.sources.count()` — c'est une LECTURE : la règle porte sur les
 *   écritures, toutes faites par `seedRemoteSource` ou les API du repository.
 *
 * Call sites (production, vérifiés) :
 * - `ManifestCard` (`removeSourceFromLibrary`, ManifestCard.tsx:26,38 — `void …` dans une
 *   confirmation : le rejet n'y est pas consommé, seul le toast du hook est visible) ;
 * - `LoadManifestCard` (`fetchManifest`, LoadManifestCard.tsx:35,62 — `FunctionResult.match` ;
 *   le formulaire pré-valide l'entrée avec les MÊMES gardes `isManifestUrl` /
 *   `containsArkIdentifier`, l. 42 : la branche `ManifestInputError` du hook est une
 *   ceinture et des bretelles, couverte ici comme contrat de l'API exportée) ;
 * - `AddManifestCard` (`addManifestToLibrary` AddManifestCard.tsx:39,84 — résultat matché
 *   côté appelant, `updateSourceName` l. 39,77) ; `UpdateSourceNameForm`
 *   (`updateSourceName` UpdateSourceNameForm.tsx:33,52 — `await` sans `.catch`) ;
 * - `ConfigurationGeneralTab` (`clearAllSources` ConfigurationGeneralTab.tsx:23,71 — puis
 *   `pushInfo` : sur rejet le toast de succès ne part pas) ;
 * - `useTileSource` (useTileSource.tsx:42,50) et `useThumbnail` (useThumbnail.tsx:11,46) :
 *   `getSourceWithContent` consommé dans une requête React Query, surface réelle de la
 *   jointure ; `useCollectionImporter` (l. 33,52,75,169) exerce déjà `fetchManifest` +
 *   `addManifestToLibrary` de bout en bout (lots 1-2) — rien de ce pipeline n'est repris.
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * 1. asymétrie des canaux d'erreur : `removeSourceFromLibrary` est la SEULE fonction à
 *   dispatcher un `pushError` (l. 25-27), et seulement sur une erreur RETOURNÉE par le
 *   repository — une erreur LEVÉE par la même opération traverse le hook sans rien toaster
 *   (test dédié). Les cinq autres fonctions n'ont aucune surface de toast et leurs
 *   appelants ne rattrapent rien (cf. call sites) ;
 * 2. mémoïsation PARTIELLE : `fetchManifest` (l. 31-45) et `addManifestToLibrary`
 *   (l. 47-59) sont stables, les quatre autres recréées à chaque rendu — vérifié sous
 *   `rerender` (test nominal). Conséquence hors périmètre, consignée sans assertion ici :
 *   `useThumbnail.tsx:36` place `getSourceWithContent` dans une `queryKey`, où
 *   l'instabilité d'identité est neutre (React Query hache par `JSON.stringify`, une
 *   fonction s'y réduit à `null`) ;
 * 3. `getSourceWithContent` (l. 61-77) RÉIMPLÉMENTE la jointure que le repository sait déjà
 *   faire (`getSourceWithContentById`, sources.ts:123-138, mêmes deux lectures dans le même
 *   ordre) au lieu de déléguer : résultat identique en profondeur (prouvé au test
 *   « jointure »), mais deux copies à maintenir — doublon consigné ;
 * 4. `updateSourceName` sur un id absent : `db.sources.update` → `modify` sur une plage vide
 *   ne lève pas (dexie) — le hook résout `undefined` SANS AUCUN SIGNAL, alors que
 *   `deleteById` du même id inconnu retourne une erreur nommée et toaste. Asymétrie
 *   verrouillée au test « renommage » ;
 * 5. `getThumbnailBlob` avale ses erreurs réseau par un simple `console.warn`
 *   (data/utils/manifest.ts:33-43) : `addManifestToLibrary` écrit alors une vignette vide
 *   et son résultat ne le dit pas. La fidélité du binaire n'est de toute façon PAS
 *   OBSERVABLE dans cet environnement — fake-indexeddb (realm Node) ne reconnaît pas le
 *   Blob jsdom au clone structurel (précédent lot 3 et `useCollectionIO.test.tsx`, où
 *   `sources.test.ts` stubbe exactement cette frontière) — donc les deux branches (URL de
 *   vignette absente / fetch en échec) ne se distinguent ICI que par l'appel réseau, nié
 *   dans l'une, vérifié dans l'autre ;
 * 6. `addManifestToLibrary` lit `manifest.items.length` sans garde (l. 53) : un manifeste
 *   sans `items` rejetterait en TypeError au lieu de retourner un `FunctionResult.err`.
 *   Injoignable dans le parcours réel (`AddManifestCard` valide le manifeste avec
 *   `Cozy.parse` avant d'appeler, AddManifestCard.tsx:65,67) — branche consignée, pas
 *   inventée ;
 * 7. `pageCount` du DTO vient de `manifest.items.length` (l. 53), jamais d'une saisie : la
 *   source créée depuis un manifeste porte le compte des canvas émis — verrouillé au test
 *   nominal (16 canvas du fixture) ;
 * 8. l'ordre des gardes de `fetchManifest` (URL d'abord l. 33, ARK ensuite l. 36) fait
 *   qu'une URL contenant un ARK part telle quelle au réseau, sans réécriture Gallica
 *   (verrouillé) ; la branche ARK code en dur `gallica.bnf.fr` (TODO explicite l. 37-38) et
 *   l'importer gallica RÉÉCRIT cette URL en `openapi.bnf.fr` avant de la demander — le
 *   « old Gallica API » du commentaire n'est donc plus l'URL effectivement sollicitée ;
 * 9. le toast de `removeSourceFromLibrary` transporte le message BRUT en anglais du
 *   repository (`getErrorMessage` l. 26), sans `pushError(i18n.t(…))` — même asymétrie de
 *   traduction que les lots 26 et 27 ;
 * 10. la passerelle `fetchManifestFromURL` ouvre chaque appel par un
 *   `console.log('handleFetchManifestFromURL ', url)` (utils/manifest.ts) : trace de debug
 *   d'un fichier hors périmètre de ce lot, consignée pour l'audit, non corrigée.
 *
 * `liveLoading.test.tsx` : PAS ÉTENDU (option du palier 2) — le hook n'appelle jamais
 * `useLiveQuery`, il n'a donc aucun cas vide/chargement à distinguer (même conclusion que
 * les lots 26 et 27 pour leurs hooks requalifiés).
 *
 * Couverture mesurée (vitest --coverage, périmètre useSources.tsx seul) : 100 % lignes,
 * énoncés, fonctions et branches — y compris les deux branches d'absence de
 * `getSourceWithContent` (l. 67 et l. 71) et la branche `ManifestInputError` (l. 42).
 */
import manifestFixture from '@/__tests__/manifest.json';
import { Event, EventType } from '@/data/models/event';
import { SourceWithContent } from '@/data/models/source/source';
import { db } from '@/data/repositories/indexeddb/db';
import { getSourceRepository, getTagRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  FIXTURE_CANVAS_IDS,
  countLiveQuerySubscribers,
  makeRemoteSource,
  makeTag,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedRemoteSource,
  seedTags,
} from '@/hooks/__tests__/harness';
import { initializePluginRegistries } from '@/state/sagas/plugins/registry';
import { RootState } from '@/state/store';
import { NotFoundError } from '@/utils/NotFoundError';
import { Manifest } from '@iiif/presentation-3';
import { act, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import useSources from '../useSources';

resetTestDbBeforeEach();

// Frontière réseau (cf. en-tête) : un seul espion `fetch` pour tout le fichier, défaut
// bruyant — le registre des importers RÉELS est chargé par ailleurs pour que la chaîne
// `fetchManifest → importer → fetch` tourne vraiment.
const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>();

beforeAll(() => {
  initializePluginRegistries();
  vi.stubGlobal('fetch', fetchMock);
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    throw new Error(`réseau inattendu dans les tests : ${String(input)}`);
  });
});

const FIXTURE_THUMBNAIL_URL = manifestFixture.thumbnail[0].id;

/** Écriture par le VRAI repository sources (id généré par `uuid()`, comme en production). */
async function seedSource(name: string, manifestUrl?: string): Promise<SourceWithContent> {
  return seedRemoteSource(
    makeRemoteSource(manifestUrl === undefined ? { name } : { name, manifestUrl }),
  );
}

function manifestResponse(manifest: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => structuredClone(manifest),
  } as unknown as Response;
}

function blobResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    blob: async () => new Blob([content]),
  } as unknown as Response;
}

/** Manifeste du fixture, avec un `id` de manifeste donné et, optionnellement, sans vignette. */
function manifestWithId(manifestUrl: string, { thumbnail = true }: { thumbnail?: boolean } = {}) {
  const manifest = structuredClone(manifestFixture) as Manifest;
  manifest.id = manifestUrl;
  if (!thumbnail) {
    manifest.thumbnail = [];
  }
  return manifest;
}

/** Les toasts tels que posés dans la slice `events` du store réel du harnais. */
function toasts(state: RootState): Event[] {
  return state.events.allEvents;
}

describe('useSources — façade IO du palier 2 (coquille sans liveQuery)', () => {
  it('coquille sans liveQuery : six fonctions dès le premier rendu, zéro souscription propre, zéro fuite au démontage', async () => {
    const subscribersBefore = countLiveQuerySubscribers();

    // Référence « providers du harnais seuls » : leurs liveQuery (collections, workers,
    // results — AUCUNE sur les tables sources) souscrivent de façon différée. On matérialise
    // cette référence puis on la relâche avant de monter le hook (leçon des lots
    // 16/24/25/26/27 : le compteur brut avant émission ne serait pas probant).
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    const callsAtMount = fetchMock.mock.calls.length;
    const { result, store, rerender, unmount } = renderHookWithHarness(() => useSources());

    // État initial : le hook n'expose AUCUNE valeur — pas d'`undefined` à attendre, pas de
    // defaultResult, pas d'`isLoading` (DÉVIATION du contrat commun, cf. en-tête) :
    // seulement son API, immédiatement fonctionnelle.
    expect(Object.keys(result.current).sort()).toEqual([
      'addManifestToLibrary',
      'clearAllSources',
      'fetchManifest',
      'getSourceWithContent',
      'removeSourceFromLibrary',
      'updateSourceName',
    ]);
    expect(toasts(store.getState())).toEqual([]);

    // Le hook n'ajoute RIEN aux abonnements des providers, et ne touche rien au montage.
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly));
    expect(fetchMock).toHaveLength(callsAtMount);

    // Mémoïsation partielle (caractérisation 2) : deux fonctions stables, quatre recréées
    // à chaque rendu — et dans tous les cas aucune re-souscription.
    const { fetchManifest, addManifestToLibrary, getSourceWithContent } = result.current;
    rerender();
    expect(result.current.fetchManifest).toBe(fetchManifest);
    expect(result.current.addManifestToLibrary).toBe(addManifestToLibrary);
    expect(result.current.getSourceWithContent).not.toBe(getSourceWithContent);
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly);

    // Désabonnement : faute d'abonnement propre, le démontage ne doit rien laisser.
    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('removeSourceFromLibrary : délègue deleteById au vrai repository — source retirée, voisine intacte, aucun toast', async () => {
    const target = await seedSource('À supprimer');
    const neighbor = await seedSource('Voisine');

    const { result, store, unmount } = renderHookWithHarness(() => useSources());

    const deletion = await act(() => result.current.removeSourceFromLibrary(target.id));
    expect(deletion.ok).toBe(true);

    const repository = getSourceRepository();
    expect((await repository.getById(target.id)).ok).toBe(false);
    expect((await repository.getById(neighbor.id)).ok).toBe(true);
    expect(toasts(store.getState())).toEqual([]);

    // Le détail de la cascade (sourceContents + storedBlobs, deleteById en transaction) est
    // verrouillé par sources.test.ts (campagne Q2) — non re-testé ici.
    unmount();
  });

  it('removeSourceFromLibrary sur source absente : NotFoundError en valeur ET pushError — le seul toast du hook', async () => {
    const { result, store, unmount } = renderHookWithHarness(() => useSources());

    const deletion = await act(() => result.current.removeSourceFromLibrary('source-inexistante'));
    expect(deletion.ok).toBe(false);
    if (!deletion.ok) {
      expect(deletion.error).toBeInstanceOf(NotFoundError);
      expect(deletion.error.message).toBe('Source with id source-inexistante not found');
    }

    // Message BRUT du repository, non traduit (caractérisation 9).
    expect(toasts(store.getState())).toEqual([
      { message: 'Source with id source-inexistante not found', type: EventType.ERROR },
    ]);
    unmount();
  });

  it('suppressions en échec de transaction (injection deleting) : rejets bruts sans toast, base intacte — removeSourceFromLibrary et clearAllSources', async () => {
    const source = await seedSource('Résistante');

    const subscribersBefore = countLiveQuerySubscribers();
    // Injection par l'API publique RÉELLE des hooks Dexie, transposée au mutation-only
    // comme au lot 27 : c'est le hook « deleting » qui coupe la suppression.
    const failDeleting = (): void => {
      throw new Error('sources-suppression-en-echec');
    };
    db.sources.hook('deleting', failDeleting);
    try {
      const { result, store, unmount } = renderHookWithHarness(() => useSources());

      // Contrairement à l'erreur RETOURNÉE par `deleteById` (test précédent), l'erreur
      // LEVÉE n'est pas rattrapée : le hook la laisse traverser (caractérisation 1).
      await expect(result.current.removeSourceFromLibrary(source.id)).rejects.toThrow(
        'sources-suppression-en-echec',
      );
      await expect(result.current.clearAllSources()).rejects.toThrow(
        'sources-suppression-en-echec',
      );
      expect(toasts(store.getState())).toEqual([]);

      // Transactions annulées : rien n'a été supprimé, ni en partie.
      expect((await getSourceRepository().getById(source.id)).ok).toBe(true);

      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.sources.hook('deleting').unsubscribe(failDeleting);
    }
  });

  it('clearAllSources : délègue deleteAll au vrai repository — sources et contenus vidés, autres tables intactes, aucun toast', async () => {
    const first = await seedSource('Une');
    const second = await seedSource('Deux');
    const [tag] = await seedTags([makeTag({ id: 'tag-shell-28-temoin', label: 'Témoin' })]);

    const { result, store, unmount } = renderHookWithHarness(() => useSources());

    await expect(act(() => result.current.clearAllSources())).resolves.toBeUndefined();

    const repository = getSourceRepository();
    for (const source of [first, second]) {
      expect((await repository.getById(source.id)).ok).toBe(false);
      expect((await repository.getContentByManifestUrl(source.content.manifest.id)).ok).toBe(false);
    }
    // Routage au niveau du hook : le sweep ne déborde pas sur les autres tables — un tag
    // posé par le VRAI repository tags survit. La cascade storedBlobs relève de la
    // sémantique `deleteAll` (sources.test.ts, campagne Q2), non re-testée ici.
    expect(await getTagRepository().getByIds([tag.id])).toEqual([tag]);
    expect(toasts(store.getState())).toEqual([]);
    unmount();
  });

  it('getSourceWithContent : joint source et contenu, FunctionResult passé tel quel — doublon de la méthode du repository, caractérisé', async () => {
    const source = await seedSource('Jointure');

    const { result, unmount } = renderHookWithHarness(() => useSources());

    const fetched = await act(() => result.current.getSourceWithContent(source.id));
    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.value).toMatchObject({
        id: source.id,
        name: 'Jointure',
        type: 'remote',
        pageCount: FIXTURE_CANVAS_IDS.length,
        content: { type: 'remote' },
      });
      // Le hook refait les deux lectures ligne à ligne (l. 65-76) là où le repository sait
      // les faire (caractérisation 3) : même résultat en profondeur, donc aucune valeur
      // ajoutée — et aucun écart de sérialisation — par cette réimplémentation.
      const direct = await getSourceRepository().getSourceWithContentById(source.id);
      expect(fetched.value).toEqual(direct.ok ? direct.value : undefined);
    }
    unmount();
  });

  it('getSourceWithContent en échec : les deux lectures reviennent en VALEUR, jamais en rejet, sans toast', async () => {
    const orphan = await seedSource('Sans contenu');
    // Suppression RÉELLE de la ligne de contenu : état incohérent qu'aucune API du
    // repository ne produit (add et deleteById sont transactionnels) — précédent lot 10
    // (`useSource.test.tsx`), même table pour le même état incohérent.
    await db.sourceContents.delete(orphan.id);

    const { result, store, unmount } = renderHookWithHarness(() => useSources());

    const missingSource = await act(() =>
      result.current.getSourceWithContent('source-inexistante'),
    );
    expect(missingSource.ok).toBe(false);
    if (!missingSource.ok) {
      expect(missingSource.error.message).toBe('Source with id source-inexistante not found');
    }

    const missingContent = await act(() => result.current.getSourceWithContent(orphan.id));
    expect(missingContent.ok).toBe(false);
    if (!missingContent.ok) {
      // Le message nomme « SourceContent » : c'est bien le SECOND retour (l. 70-72), et la
      // source pourtant lue n'est pas rendue à moitié fusionnée.
      expect(missingContent.error.message).toBe(`SourceContent with id ${orphan.id} not found`);
    }

    expect(toasts(store.getState())).toEqual([]);
    unmount();
  });

  it('updateSourceName : délègue updateName au vrai repository — renommage en base, résolution undefined, aucun toast ; id inconnu = no-op silencieux', async () => {
    const source = await seedSource('Nom initial');

    const { result, store, unmount } = renderHookWithHarness(() => useSources());

    await expect(
      act(() => result.current.updateSourceName(source.id, 'Nouveau nom')),
    ).resolves.toBeUndefined();

    const repository = getSourceRepository();
    const renamed = await repository.getById(source.id);
    expect(renamed.ok).toBe(true);
    if (renamed.ok) {
      expect(renamed.value.name).toBe('Nouveau nom');
    }
    // `updateName` ne touche que `db.sources` : le contenu suit sans être réécrit.
    expect((await repository.getContentById(source.id)).ok).toBe(true);

    // Caractérisation 4 : sur id inconnu, aucune erreur n'est levée, rien ne toaste, rien
    // ne s'écrit — le comptage direct est la seule façon d'observer « aucune ligne de plus »
    // (aucun getAll dans l'interface des sources).
    await expect(
      act(() => result.current.updateSourceName('source-inconnue', 'Peu importe')),
    ).resolves.toBeUndefined();
    expect(await db.sources.count()).toBe(1);
    expect(toasts(store.getState())).toEqual([]);
    unmount();
  });

  it('updateSourceName en échec d écriture (injection updating) : rejet brut, aucun toast, nom inchangé', async () => {
    const source = await seedSource('Intouchable');

    const subscribersBefore = countLiveQuerySubscribers();
    const failUpdating = (): void => {
      throw new Error('sources-renommage-en-echec');
    };
    db.sources.hook('updating', failUpdating);
    try {
      const { result, store, unmount } = renderHookWithHarness(() => useSources());

      await expect(result.current.updateSourceName(source.id, 'Renommée')).rejects.toThrow(
        'sources-renommage-en-echec',
      );
      expect(toasts(store.getState())).toEqual([]);

      const stored = await getSourceRepository().getById(source.id);
      expect(stored.ok).toBe(true);
      if (stored.ok) {
        expect(stored.value.name).toBe('Intouchable');
      }

      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.sources.hook('updating').unsubscribe(failUpdating);
    }
  });

  it('fetchManifest sur URL : cache en base D ABORD (zéro réseau), puis réseau au bord stubbé, et AUCUNE écriture', async () => {
    const storedUrl = 'https://example.org/manifest/deja-en-base';
    await seedSource('Déjà en base', storedUrl);

    const { result, store, unmount } = renderHookWithHarness(() => useSources());

    // Volet cache : le contenu déjà stocké est rendu sans aucun trafic (passerelle réelle,
    // utils/manifest.ts — la sémantique du cache appartient à la couche data).
    const hit = await act(() => result.current.fetchManifest(storedUrl));
    expect(hit.ok).toBe(true);
    if (hit.ok) {
      expect(hit.value.id).toBe(storedUrl);
    }
    expect(fetchMock).not.toHaveBeenCalled();

    // Volet réseau : réponse du fixture sur l'URL demandée, importer `default` réel.
    const remoteUrl = 'https://example.org/manifest/a-recharger';
    fetchMock.mockImplementation(async () => manifestResponse(manifestFixture));

    const miss = await act(() => result.current.fetchManifest(remoteUrl));
    expect(miss.ok).toBe(true);
    if (miss.ok) {
      expect(miss.value.id).toBe(manifestFixture.id);
      expect(miss.value.items).toHaveLength(FIXTURE_CANVAS_IDS.length);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(remoteUrl, expect.anything());

    // `fetchManifest` ne persiste RIEN (c'est `addManifestToLibrary`, plus bas dans le
    // parcours de l'appelant, qui le fait) : la même URL repart au réseau, et la base ne
    // connaît toujours pas ce manifeste.
    await act(() => result.current.fetchManifest(remoteUrl));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await getSourceRepository().getContentByManifestUrl(remoteUrl)).ok).toBe(false);
    expect(toasts(store.getState())).toEqual([]);
    unmount();
  });

  it('fetchManifest sur ARK : URL Gallica codée en dur puis importer gallica réel — et garde URL prioritaire sur ARK', async () => {
    // Défaut bruyant sur l'URL Gallica elle-même : le test échoue si le repli de l'importer
    // partait alors que l'endpoint openapi n'a pas été essayé en premier (cf. caractérisation 8).
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('https://gallica.bnf.fr/')) {
        throw new Error('repli-gallica-impossible');
      }
      return manifestResponse(manifestFixture);
    });

    const { result, store, unmount } = renderHookWithHarness(() => useSources());

    const ark = 'ark:/12148/bpt6k75000001';
    const outcome = await act(() => result.current.fetchManifest(ark));
    expect(outcome.ok).toBe(true);

    // Le hook fabrique `https://gallica.bnf.fr/iiif/<ark>/manifest.json` (l. 39, caractérisation 8) ;
    // c'est l'importer gallica RÉEL qui demande en priorité l'endpoint openapi — le réseau
    // effectivement sollicité n'est donc pas l'URL « old Gallica API » du commentaire.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openapi.bnf.fr/iiif/presentation/v3/ark:/12148/bpt6k75000001/manifest.json',
      expect.anything(),
    );

    // Ordre des gardes (l. 33 avant l. 36, caractérisation 8) : une URL qui CONTIENT un ARK
    // part telle quelle via l'importer `default`, sans réécriture.
    const urlWithArk = 'https://example.org/ark:/12148/bpt6k75000001/manifest.json';
    await act(() => result.current.fetchManifest(urlWithArk));
    expect(fetchMock).toHaveBeenLastCalledWith(urlWithArk, expect.anything());
    expect(toasts(store.getState())).toEqual([]);
    unmount();
  });

  it('fetchManifest : entrée ni URL ni ARK, et échec réseau de la passerelle — deux erreurs en VALEUR, sans toast, sans écriture, sans rejet', async () => {
    const { result, store, unmount } = renderHookWithHarness(() => useSources());
    const failingUrl = 'https://example.org/manifest/reseau-en-echec';
    fetchMock.mockImplementation(async (input) => {
      throw new Error(`réseau-hs : ${String(input)}`);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      // Branche propre au hook (l. 42) : l'erreur est fabriquée ici — aucun accès à la base
      // ni au réseau, aucune promesse rejetée.
      const invalid = await act(() => result.current.fetchManifest('bpt6k75000001'));
      expect(invalid.ok).toBe(false);
      if (!invalid.ok) {
        expect(invalid.error.message).toBe('Manifest input is not valid: bpt6k75000001');
      }
      expect(fetchMock).not.toHaveBeenCalled();

      // Échec de la passerelle (l. 34) : le hook retourne le FunctionResult err tel quel —
      // pas de rejet, pas de toast (caractérisation 1).
      const failed = await act(() => result.current.fetchManifest(failingUrl));
      expect(failed.ok).toBe(false);
      if (!failed.ok) {
        expect(failed.error.message).toContain(failingUrl);
        expect(failed.error.message).toContain('could not be fetched');
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((await getSourceRepository().getContentByManifestUrl(failingUrl)).ok).toBe(false);
      expect(toasts(store.getState())).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }

    unmount();
  });

  it('addManifestToLibrary : vignette fetchée puis source ÉCRITE par le vrai repository — nom, pageCount et manifeste en base', async () => {
    const manifestUrl = 'https://example.org/manifest/ajout-en-bibliotheque';
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === FIXTURE_THUMBNAIL_URL) {
        return blobResponse('vignette de test');
      }
      throw new Error(`réseau inattendu dans les tests : ${url}`);
    });

    const { result, store, unmount } = renderHookWithHarness(() => useSources());

    const added = await act(() =>
      result.current.addManifestToLibrary(manifestWithId(manifestUrl), 'Ajoutée'),
    );
    expect(added.ok).toBe(true);
    if (added.ok) {
      // Relecture par le repository réel, témoin indépendant du hook.
      const repository = getSourceRepository();
      const stored = await repository.getById(added.value.id);
      expect(stored.ok).toBe(true);
      if (stored.ok) {
        expect(stored.value.name).toBe('Ajoutée');
        expect(stored.value.type).toBe('remote');
        expect(stored.value.pageCount).toBe(FIXTURE_CANVAS_IDS.length); // caractérisation 7
      }
      const content = await repository.getContentById(added.value.id);
      expect(content.ok).toBe(true);
      if (content.ok) {
        expect(content.value.type).toBe('remote');
        expect(content.value.manifest.id).toBe(manifestUrl);
        expect(content.value.manifest.items).toHaveLength(FIXTURE_CANVAS_IDS.length);
      }
      // La vignette est passée au repository : une ligne storedBlobs existe (sa fidélité
      // binaire n'est pas observable ici — caractérisation 5).
      expect((await repository.getBlob(added.value.thumbnailBlobId)).ok).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Un seul argument : `getThumbnailBlob` appelle `fetch` sans option d'en-tête, à la
    // différence des importers de manifeste, qui passent `{ headers: { Accept: … } }` (cf.
    // assertions `expect.anything()` du test `fetchManifest` ci-dessus).
    expect(fetchMock).toHaveBeenCalledWith(FIXTURE_THUMBNAIL_URL);
    expect(toasts(store.getState())).toEqual([]);
    unmount();
  });

  it('addManifestToLibrary : vignette absente ou en échec réseau — source créée quand même, blob vide, le warn avalé est la seule trace', async () => {
    const { result, store, unmount } = renderHookWithHarness(() => useSources());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Cas 1 : manifeste sans vignette → aucun appel réseau, `getThumbnailBlob` renvoie le
    // Blob vide sans même tenter quoi que ce soit.
    const noThumbnailUrl = 'https://example.org/manifest/sans-vignette';
    const addedQuietly = await act(() =>
      result.current.addManifestToLibrary(
        manifestWithId(noThumbnailUrl, { thumbnail: false }),
        'Sans vignette',
      ),
    );
    expect(addedQuietly.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    // Cas 2 : vignette présente mais réseau en échec → warning avalé (caractérisation 5),
    // promesse résolue OK : l'appelant ne peut PAS distinguer les deux cas.
    const brokenThumbnailUrl = 'https://example.org/manifest/vignette-en-echec';
    const addedDespiteThumbnail = await act(() =>
      result.current.addManifestToLibrary(manifestWithId(brokenThumbnailUrl), 'Vignette en échec'),
    );
    expect(addedDespiteThumbnail.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Error fetching thumbnail: ',
      expect.objectContaining({
        message: `réseau inattendu dans les tests : ${FIXTURE_THUMBNAIL_URL}`,
      }),
    );

    if (addedQuietly.ok && addedDespiteThumbnail.ok) {
      const repository = getSourceRepository();
      const quietBlob = await repository.getBlob(addedQuietly.value.thumbnailBlobId);
      const brokenBlob = await repository.getBlob(addedDespiteThumbnail.value.thumbnailBlobId);
      expect(quietBlob.ok).toBe(true);
      expect(brokenBlob.ok).toBe(true);
      expect((await repository.getContentById(addedDespiteThumbnail.value.id)).ok).toBe(true);
    }
    expect(toasts(store.getState())).toEqual([]);
    warnSpy.mockRestore();
    unmount();
  });

  it('addManifestToLibrary en échec d écriture (injection creating) : FunctionResult err en valeur, AUCUN toast, rien d écrit', async () => {
    const survivor = await seedSource('Survivante');
    const manifestUrl = 'https://example.org/manifest/ecriture-en-echec';

    const subscribersBefore = countLiveQuerySubscribers();
    const failCreating = (): void => {
      throw new Error('sources-ajout-en-echec');
    };
    db.sources.hook('creating', failCreating);
    try {
      const { result, store, unmount } = renderHookWithHarness(() => useSources());

      // `add` ENVELOPPE sa transaction d'un catch et RETOURNE une DBError (sources.ts:65-67) :
      // le hook la passe telle quelle, sans la regarder — contrairement à deleteById, RIEN
      // n'est toasté (caractérisation 1), et c'est l'appelant qui affiche (`AddManifestCard`).
      const added = await act(() =>
        result.current.addManifestToLibrary(manifestWithId(manifestUrl), 'Jamais ajoutée'),
      );
      expect(added.ok).toBe(false);
      if (!added.ok) {
        expect(added.error.message).toBe('Database error: Failed to add source to IndexedDB');
      }
      expect(toasts(store.getState())).toEqual([]);

      // Aucune trace : ni contenu pour ce manifeste, et la source déjà en base survit.
      expect((await getSourceRepository().getContentByManifestUrl(manifestUrl)).ok).toBe(false);
      expect((await getSourceRepository().getById(survivor.id)).ok).toBe(true);

      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.sources.hook('creating').unsubscribe(failCreating);
    }
  });
});
