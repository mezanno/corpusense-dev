/**
 * Lot 8 — useThumbnail (cf. docs/roadmap.md, Q11). Le comportement propre du hook
 * est couvert sur le vrai stack du harnais (lot 0) : chemin rapide synchrone des vignettes
 * IIIF distantes (l. 85-91), activation de la requête (l. 81), états loading/success/error
 * de React Query sur le QueryClient du harnais, transformation de réponse pour les sources
 * locales (l. 59-75) et erreur typée `error_no_thumbnail` (l. 53 et 62 — le fichier source
 * est whitelisté `no-restricted-syntax` pour ces deux throws, cf. eslint.config.js:161).
 *
 * Frontières :
 * - le gabarit du lot 8 mentionne un `fetch` stubbé : ce hook ne l'appelle JAMAIS. Son
 *   queryFn ne touche que Dexie réel (via le vrai `useSources` → repository source, sans
 *   `vi.mock` ici, contrairement à `useTileSource.test.tsx` dont les mocks de `../useSources`
 *   et de `CollectionContext` restent tolérés pour ce fichier seul, sans extension — plan).
 *   L'équivalent « réponse d'erreur HTTP / rejet réseau » est donc l'échec du repository
 *   (`!result.ok`, l. 52), produit par une source absente de la base réelle ; le succès est
 *   produit par une source graine. `fetch` reste stubbé en tripwire dans tout le fichier :
 *   l'`afterEach` vérifie qu'aucun test ne l'a appelé (jamais de trafic réseau ici).
 * - handle de fichier local : seul un handle INERTE (`{}`) survit au clonage structurel de
 *   fake-indexeddb (vérifié : un handle à méthodes lève `DataCloneError` dès le `add` du vrai
 *   repository ; en production, IndexedDB clone les vrais handles et leur rend leurs méthodes).
 *   Revenu sans méthodes, le handle fait échouer le vrai `getFile` (`data/utils/canvas.ts`),
 *   qui tombe dans le repli conçu pour les handles périmés : le store zustand réel
 *   `useFSHandleStore`, peuplé par `setState` (API publique du store). C'est là que vit le
 *   faux fonctionnel minimal, fidèle à l'interface FileSystemDirectoryHandle
 *   (`queryPermission`/`requestPermission`/`getFileHandle`→`getFile`) — la frontière API et
 *   rien de plus ; ses compteurs (appels, noms de fichiers demandés) tiennent lieu des
 *   compteurs du stub `fetch` des lots voisins.
 * - `URL.createObjectURL` : jsdom en fournit un vrai (`blob:nodedata:…`) — non stubbé ;
 *   l'URL de vignette est assertée par son préfixe et l'accès fichier par les espions du faux.
 * - Base Dexie réelle réinitialisée par test, QueryClient neuf `retry: false`, aucun délai
 *   artificiel, aucune écriture hors vrais repositories (`seedLocalSource` passe par
 *   `getSourceRepository().add`).
 *
 * Écarts constatés (règle 7 — documentés et remontés, pas corrigés) :
 * - le hook ne désactive PAS le retry lui-même (l. 79-81 ne posent que staleTime, gcTime et
 *   enabled). Le « pas de retry » observé dans cette suite vient du seul client du harnais ;
 *   le client applicatif (`src/App.tsx:29`, `new QueryClient()`) garde le défaut React Query,
 *   soit 3 retries à backoff exponentiel sur un échec de vignette. À remonter. Dans la suite,
 *   l'absence de retry est établie par `state.fetchFailureCount === 1` sur l'entrée d'erreur
 *   (une seule tentative commise) et par un appel de bord fichier unique côté succès.
 * - source locale sans `canvas.thumbnail` explicite : `error_no_thumbnail` systématique
 *   (l. 60-63) — la voie utilisée est `canvas.thumbnail?.[0]?.id`, jamais le chemin dérivé de
 *   l'image par le repli de la l. 16, même quand le fichier existe dans le dossier. Verrouillé
 *   tel quel (test « source locale sans thumbnail explicite »).
 * - une requête désactivée (canvas ou sourceId manquant, l. 81) ne lève ni erreur ni loading :
 *   le hook renvoie silencieusement la résolution synchrone (describe « activation ») — aucun
 *   signal d'anomalie n'est possible pour l'appelant ; caractérisé, pas légitimé.
 *
 * Branches inatteignables sans délai artificiel ou contorsion hors API publique, justifiées :
 * - l. 42-44 et 65-67 : les gardes `signal.aborted` avant le premier `await` et entre la
 *   détermination du chemin local et l'appel à `getLocalObjectUrl` ne sont atteignables que
 *   si l'annulation tombe dans la fenêtre d'un microtask ; seule la garde du milieu
 *   (l. 48-50, après la lecture repository) est déclenchable de façon déterministe
 *   (annulation au démontage pendant la lecture Dexie — test « démontage ») ; les deux autres
 *   sont du repli défensif à sémantique identique, non re-testées ;
 * - l. 96, filtre `error.name !== 'AbortError'` : React Query ne commet jamais un fetch
 *   annulé comme erreur (le test « démontage » montre en cache status `pending` et error
 *   `null`) — le filtre est inerte par l'API publique, verrouillé comme tel ;
 * - l. 57, côté droit de `syncThumbnail ?? []` : l'opérande gauche est toujours un tableau
 *   (construction l. 16) — code mort ;
 * - l. 80 `gcTime` : ramasse-miettes du cache sans observateur, non observable sans timers
 *   factices ni QueryClient partagé entre tests (interdit par le harnais).
 *
 * Couverture mesurée (vitest --coverage, périmètre useThumbnail.tsx seul) : 93,33 % lignes
 * et énoncés, 89,65 % branches, 100 % fonctions ; non couvert : l. 43 et 66 exactement, les
 * deux gardes `signal.aborted` défensives justifiées ci-dessus. Toutes les lignes
 * atteignables par l'API publique du hook (l. 15-97) sont exercées.
 */
import canvasWithImage from '@/__tests__/canvasWithImage.json';
import manifestFixture from '@/__tests__/manifest.json';
import { AddSourceDTO } from '@/data/models/source/source.dto';
import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  FIXTURE_CANVAS_IDS,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedRemoteSource,
} from '@/hooks/__tests__/harness';
import { useFSHandleStore } from '@/state/zustand/useFSHandleStore';
import { Canvas } from '@iiif/presentation-3';
import type { QueryCache } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useThumbnail from '../useThumbnail';

const fetchTripwire = vi.fn();

// Base réelle vidée et réinitialisée par le harnais (lot 41 — la vidange IDB
// centralisée remplace le `getById('__flush__')` que cette suite portait en
// `afterEach` depuis le lot 8).
resetTestDbBeforeEach();

// Pas de vi.unstubAllGlobals ici : le harnais monte ThemeProvider, qui dépend des
// stubs globaux installés par vitest.setup.ts (matchMedia, FileSystemDirectoryHandle…) —
// la restauration globale les emporterait pour les tests suivants. On ne fait que
// ré-écrire `fetch`, comme dans useCollectionImporter.test.tsx (mêmes motifs).
beforeEach(() => {
  fetchTripwire.mockClear();
  vi.stubGlobal('fetch', fetchTripwire);
});

afterEach(() => {
  expect(fetchTripwire).not.toHaveBeenCalled();
  useFSHandleStore.setState({ directoryHandles: [] });
});

/* ------------------------------------------------------------------ */
/* Fabriques locales (frontière File System Access, cf. en-tête)       */
/* ------------------------------------------------------------------ */

function makeFakeDirectoryHandle(name: string, fileNames: string[]) {
  return {
    name,
    queryPermission: vi.fn(async (_options: { mode: string }) => 'granted' as const),
    requestPermission: vi.fn(async (_options: { mode: string }) => 'granted' as const),
    getFileHandle: vi.fn(async (fileName: string) => {
      if (!fileNames.includes(fileName)) {
        throw new Error(`fichier absent du dossier simulé : ${fileName}`);
      }
      return {
        getFile: async () => new File([`contenu de ${fileName}`], fileName, { type: 'image/png' }),
      };
    }),
  };
}

type FakeDirectoryHandle = ReturnType<typeof makeFakeDirectoryHandle>;

function registerLocalHandles(...handles: FakeDirectoryHandle[]): void {
  useFSHandleStore.setState({
    directoryHandles: handles as unknown as FileSystemDirectoryHandle[],
  });
}

/**
 * Source locale graine, écrite par le VRAI repository avec un handle inerte (seule forme
 * clonable par fake-indexeddb — cf. en-tête) ; le nom du dossier doit correspondre au
 * préfixe des chemins de vignettes pour que le repli `getFile` retrouve le faux en store.
 */
async function seedLocalSource(folderName: string): Promise<string> {
  const result = await getSourceRepository().add({
    type: 'local',
    name: `Source locale (${folderName})`,
    pageCount: FIXTURE_CANVAS_IDS.length,
    thumbnailBlob: new Blob(['thumbnail de test']),
    manifest: manifestFixture,
    localFile: {
      outputDirectoryHandle: {} as FileSystemDirectoryHandle,
      timestamp: 0,
      manifestName: 'manifest.json',
      folderName,
    },
  } as unknown as AddSourceDTO);
  if (!result.ok) throw result.error;
  return result.value.id;
}

/** Canvas dont la vignette est un chemin local (`dossier/fichier`, format exigé par getFile). */
function canvasWithLocalThumbnail(thumbnailId: string): Canvas {
  return {
    id: 'https://example.org/canvas/vignette-locale',
    type: 'Canvas',
    width: 1000,
    height: 800,
    thumbnail: [{ id: thumbnailId, type: 'Image', format: 'image/png' }],
  } as unknown as Canvas;
}

function thumbnailEntries(queryCache: QueryCache) {
  return queryCache.getAll().filter((entry) => entry.queryKey[0] === 'thumbnail');
}

/* ------------------------------------------------------------------ */
/* 1. Chemin rapide : vignette déjà distante (l. 20-23, 85-91)         */
/* ------------------------------------------------------------------ */

describe('useThumbnail — vignette distante : résolution synchrone', () => {
  it('retourne canvas.thumbnail tel quel, sans loading ni erreur, même si la source est absente', async () => {
    // canvasWithImage.thumbnail[0].id est en https : la l. 81 désactive la requête et le
    // chemin rapide (l. 85-91) court-circuite toute lecture repository. La source est bidon
    // exprès : si une requête partait malgré la désactivation, son entrée de cache lesterait
    // en erreur — vérifié absente ci-dessous.
    const { result, queryClient } = renderHookWithHarness(() =>
      useThumbnail({
        canvas: canvasWithImage as unknown as Canvas,
        sourceId: 'source-inexistante',
      }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    // passe-through strict : le tableau retourné EST canvas.thumbnail (l. 16 voie gauche,
    // l. 87) — c'est la promesse « 0ms delay » du commentaire source (l. 14 et 84).
    expect(result.current.thumbnail).toBe(canvasWithImage.thumbnail);

    await vi.waitFor(() => expect(thumbnailEntries(queryClient.getQueryCache()).length).toBe(1));
    const entry = thumbnailEntries(queryClient.getQueryCache())[0];
    expect(entry.state.fetchStatus).toBe('idle');
    expect(entry.state.error).toBeNull();
  });

  it('traite aussi http:// (pas seulement https://) comme distant', async () => {
    const canvas = canvasWithLocalThumbnail('http://example.org/vignette.png');
    const { result, queryClient } = renderHookWithHarness(() =>
      useThumbnail({ canvas, sourceId: 'source-inexistante' }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.thumbnail).toBe(canvas.thumbnail);
    // la query existe mais n'a jamais fetché (enabled faux par isRemoteUrl) ; l'attendre
    // laisse aussi les lectures IDB du montage se terminer avant le test suivant.
    await vi.waitFor(() => expect(thumbnailEntries(queryClient.getQueryCache()).length).toBe(1));
    expect(thumbnailEntries(queryClient.getQueryCache())[0].state.fetchStatus).toBe('idle');
  });
});

/* ------------------------------------------------------------------ */
/* 2. Activation de la requête (l. 81)                                 */
/* ------------------------------------------------------------------ */

describe('useThumbnail — activation de la requête', () => {
  it('sourceId vide : pas de requête, résolution synchrone rendue sans signal d’erreur', async () => {
    const canvas = canvasWithLocalThumbnail('dossier/page-001.png');
    const { result, queryClient } = renderHookWithHarness(() =>
      useThumbnail({ canvas, sourceId: '' }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.thumbnail).toBe(canvas.thumbnail);
    await vi.waitFor(() => expect(thumbnailEntries(queryClient.getQueryCache()).length).toBe(1));
    expect(thumbnailEntries(queryClient.getQueryCache())[0].state.fetchStatus).toBe('idle');
    expect(queryClient.isFetching()).toBe(0);
  });

  it('canvas sans id : pas de requête non plus', async () => {
    const canvas = {
      type: 'Canvas',
      thumbnail: [{ id: 'dossier/page-001.png', type: 'Image' }],
    } as unknown as Canvas;
    const { result, queryClient } = renderHookWithHarness(() =>
      useThumbnail({ canvas, sourceId: 'une-source' }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.thumbnail).toBe(canvas.thumbnail);
    await vi.waitFor(() => expect(thumbnailEntries(queryClient.getQueryCache()).length).toBe(1));
    expect(thumbnailEntries(queryClient.getQueryCache())[0].state.fetchStatus).toBe('idle');
  });

  it('props valides et vignette non distante : contre-épreuve — la requête démarre', async () => {
    // À props valides près, le même canvas non distant déclenche bien la query (l. 81 vrai) :
    // sans cette contre-épreuve, les deux tests « désactivé » ci-dessus passeraient aussi si
    // l'expression d'activation était invariablement fausse.
    const canvas = canvasWithLocalThumbnail('dossier/page-001.png');
    const { result } = renderHookWithHarness(() =>
      useThumbnail({ canvas, sourceId: 'source-inexistante' }),
    );

    expect(result.current.isLoading).toBe(true);
    await vi.waitFor(() => expect(result.current.error).toBe('error_no_thumbnail'));
    expect(result.current.isLoading).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Source distante : succès de requête sans transformation (l. 57, 77) */
/* ------------------------------------------------------------------ */

describe('useThumbnail — source distante', () => {
  it('charge la source par le repository réel et rend la vignette inchangée', async () => {
    const source = await seedRemoteSource();
    const canvas = canvasWithLocalThumbnail('vignettes/page-001.png');
    const { result, queryClient } = renderHookWithHarness(() =>
      useThumbnail({ canvas, sourceId: source.id }),
    );

    // loading : data encore undefined, la l. 94 retombe sur la résolution synchrone ;
    // le test ci-dessous lève tout doute sur la non-instantanéité (l'état loading est
    // observable, pas masqué par un succès déjà en cache).
    expect(result.current.isLoading).toBe(true);
    expect(result.current.thumbnail).toBe(canvas.thumbnail);

    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    // type 'remote' : la branche locale (l. 59) est sautée, le tableau copié (l. 57) garde
    // l'id d'origine — aucune URL objet, aucun accès fichier (tripwire fetch vérifié en
    // afterEach).
    expect(result.current.thumbnail).not.toBe(canvas.thumbnail);
    expect(result.current.thumbnail).toEqual(canvas.thumbnail);

    const entry = thumbnailEntries(queryClient.getQueryCache())[0];
    expect(entry?.state.status).toBe('success');
    expect(entry?.state.fetchFailureCount).toBe(0);
    expect(entry?.state.dataUpdateCount).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Erreurs typées (l. 52-54 et 60-63)                              */
/* ------------------------------------------------------------------ */

describe('useThumbnail — erreurs error_no_thumbnail', () => {
  it('source absente de la base réelle : message typé, thumbnail de repli, tentative unique', async () => {
    const canvas = canvasWithLocalThumbnail('dossier/page-001.png');
    const { result, queryClient } = renderHookWithHarness(() =>
      useThumbnail({ canvas, sourceId: 'source-inexistante' }),
    );

    await vi.waitFor(() => expect(result.current.error).toBe('error_no_thumbnail'));
    expect(result.current.isLoading).toBe(false);
    // l. 94 : data undefined → repli sur la résolution synchrone, jamais undefined/null.
    expect(result.current.thumbnail).toBe(canvas.thumbnail);

    const entry = thumbnailEntries(queryClient.getQueryCache())[0];
    expect(entry?.state.status).toBe('error');
    // fetchFailureCount === 1 → une seule tentative commise : pas de retry dans le client
    // de test (le hook ne pose pas retry lui-même — écart caractérisé en en-tête).
    expect(entry?.state.fetchFailureCount).toBe(1);
  });

  it('source locale sans thumbnail explicite : échec avant tout accès fichier (l. 60-63)', async () => {
    // Le canvas n'a pas de champ `thumbnail` : la l. 16 dérive bien une vignette depuis
    // l'image (voie droite du ??), mais la l. 60 relit canvas.thumbnail — undefined — et
    // lève error_no_thumbnail sans jamais demander le fichier, alors même que le dossier
    // simulé contient image-001.png. Défaut caractérisé en en-tête (règle 7).
    const handle = makeFakeDirectoryHandle('dossier', ['image-001.png']);
    registerLocalHandles(handle);
    const sourceId = await seedLocalSource('dossier');
    const canvas = {
      id: 'https://example.org/canvas/sans-vignette',
      type: 'Canvas',
      width: 1000,
      height: 800,
      items: [
        {
          type: 'AnnotationPage',
          items: [
            {
              type: 'Annotation',
              body: { id: 'dossier/image-001.png', type: 'Image' },
            },
          ],
        },
      ],
    } as unknown as Canvas;

    const { result, queryClient } = renderHookWithHarness(() => useThumbnail({ canvas, sourceId }));

    await vi.waitFor(() => expect(result.current.error).toBe('error_no_thumbnail'));
    expect(result.current.thumbnail).toEqual([{ id: 'dossier/image-001.png', type: 'Image' }]);
    expect(handle.getFileHandle).not.toHaveBeenCalled();
    expect(thumbnailEntries(queryClient.getQueryCache())[0]?.state.fetchFailureCount).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Source locale : succès avec réécriture en URL objet (l. 59-75)   */
/* ------------------------------------------------------------------ */

describe('useThumbnail — source locale', () => {
  it('remplace l’id de la vignette par une URL objet, le reste de la ressource intact', async () => {
    const handle = makeFakeDirectoryHandle('dossier', ['page-001.png']);
    registerLocalHandles(handle);
    const sourceId = await seedLocalSource('dossier');
    const canvas = canvasWithLocalThumbnail('dossier/page-001.png');

    const { result, queryClient } = renderHookWithHarness(() => useThumbnail({ canvas, sourceId }));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.thumbnail).toBe(canvas.thumbnail);

    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.thumbnail[0]?.id).toMatch(/^blob:/);
    expect(result.current.thumbnail[0]?.type).toBe('Image');
    expect(result.current.thumbnail[0]?.format).toBe('image/png');

    // Compteurs de bord (équivalent des compteurs du stub `fetch` des lots voisins) :
    // le vrai getFile a demandé exactement ce fichier, après permission réelle.
    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'read' });
    expect(handle.getFileHandle).toHaveBeenCalledTimes(1);
    expect(handle.getFileHandle).toHaveBeenCalledWith('page-001.png');

    const entry = thumbnailEntries(queryClient.getQueryCache())[0];
    expect(entry?.state.status).toBe('success');
    expect(entry?.state.fetchFailureCount).toBe(0);
  });

  it('ne relance pas la requête au re-render (staleTime, l. 79)', async () => {
    const handle = makeFakeDirectoryHandle('dossier', ['page-001.png']);
    registerLocalHandles(handle);
    const sourceId = await seedLocalSource('dossier');
    const canvas = canvasWithLocalThumbnail('dossier/page-001.png');

    const { result, rerender } = renderHookWithHarness(() => useThumbnail({ canvas, sourceId }));
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(handle.getFileHandle).toHaveBeenCalledTimes(1);

    rerender();
    rerender();
    await Promise.resolve();
    expect(result.current.isLoading).toBe(false);
    expect(handle.getFileHandle).toHaveBeenCalledTimes(1);
    expect(result.current.thumbnail[0]?.id).toMatch(/^blob:/);
  });

  it('la queryKey suit sourceId puis le chemin de vignette : chaque clé repart une fois', async () => {
    const handleA = makeFakeDirectoryHandle('dossier-a', ['page-001.png']);
    const handleB = makeFakeDirectoryHandle('dossier-b', ['page-001.png']);
    registerLocalHandles(handleA, handleB);
    const sourceIdA = await seedLocalSource('dossier-a');
    const sourceIdB = await seedLocalSource('dossier-b');

    // Le chemin de vignette détermine le dossier cherché dans le store (getFile coupe
    // 'dossier/fichier') : pour isoler la composante sourceId de la clé (l. 32), le canvas
    // fixe son chemin sur 'dossier-a/…' et seule la source change — la requête repart
    // (nouvelle entrée de cache) mais sert encore le fichier de 'dossier-a'.
    const canvasFixedPath = canvasWithLocalThumbnail('dossier-a/page-001.png');
    let canvas = canvasFixedPath;
    let sourceId = sourceIdA;
    const { result, rerender, queryClient } = renderHookWithHarness(() =>
      useThumbnail({ canvas, sourceId }),
    );

    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(handleA.getFileHandle).toHaveBeenCalledTimes(1);

    sourceId = sourceIdB;
    rerender();
    await vi.waitFor(() => expect(thumbnailEntries(queryClient.getQueryCache()).length).toBe(2));
    await vi.waitFor(() =>
      expect(thumbnailEntries(queryClient.getQueryCache())[1].state.status).toBe('success'),
    );
    expect(result.current.error).toBeNull();
    // La deuxième entrée de cache PROUVE que sourceId participe bien à la clé (l. 32) : une
    // clé inchangée n'aurait construit qu'une seule entrée. Le fichier lui-même n'est pas
    // redemandé au bord (chemin identique, et le provider CollectionContext déduplique ses
    // URL objet par chemin) : c'est la lecture du repository source, pilotée par la clé, qui
    // est l'effet observable du changement de sourceId.
    expect(handleA.getFileHandle).toHaveBeenCalledTimes(1);
    expect(handleB.getFileHandle).not.toHaveBeenCalled();

    // Second volet : le chemin de vignette est aussi dans la clé (l. 35) — un canvas dont
    // la vignette pointe dossier-b déclenche le troisième accès, sur le nouveau handle.
    canvas = canvasWithLocalThumbnail('dossier-b/page-001.png');
    rerender();
    await vi.waitFor(() => expect(handleB.getFileHandle).toHaveBeenCalledTimes(1));
    expect(result.current.error).toBeNull();
    expect(result.current.thumbnail[0]?.id).toMatch(/^blob:/);
    expect(thumbnailEntries(queryClient.getQueryCache()).length).toBe(3);
  });

  it('démontée pendant la lecture : la requête s’annule sans erreur et sans effet de bord', async () => {
    // Annulation React Query au démontage : le signal est abattu de façon synchrone, donc
    // avant la résolution (en macrotâche) de la lecture Dexie en cours — la garde l. 48-50
    // coupe queryFn avant l'URL objet. Les gardes l. 42-44 et 65-67 sont justifiées en
    // en-tête (fenêtres de microtask inatteignables sans délai).
    const handle = makeFakeDirectoryHandle('dossier', ['page-001.png']);
    registerLocalHandles(handle);
    const sourceId = await seedLocalSource('dossier');
    const canvas = canvasWithLocalThumbnail('dossier/page-001.png');

    const { unmount, queryClient } = renderHookWithHarness(() =>
      useThumbnail({ canvas, sourceId }),
    );
    unmount();

    const entry = thumbnailEntries(queryClient.getQueryCache())[0];
    await vi.waitFor(() => expect(entry?.state.fetchStatus).toBe('idle'));
    expect(entry?.state.status).toBe('pending');
    expect(entry?.state.error).toBeNull();
    expect(handle.getFileHandle).not.toHaveBeenCalled();
    expect(queryClient.isFetching()).toBe(0);
  });
});
