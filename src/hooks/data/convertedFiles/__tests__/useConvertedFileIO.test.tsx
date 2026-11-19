/**
 * Lot 37 — useConvertedFileIO, palier 2 (cf. docs/roadmap.md, Q11).
 *
 * REQUALIFICATION assumée (discipline des lots 26 et 27) : `useConvertedFileIO` est
 * listé au palier 2 « coquilles liveQuery » (spécificité table : « coquille seule ;
 * convertedFiles/useRepository a ses lots 11–12 »), mais son source
 * (src/hooks/data/convertedFiles/useConvertedFileIO.tsx, 16 lignes) ne contient
 * AUCUN `useLiveQuery` ni `liveQuery()` : c'est une fine façade sur l'API File
 * System Access (`window.showDirectoryPicker`, l. 7) et sur le store zustand réel
 * `useFSHandleStore` (`addDirectoryHandle`, l. 8 — qui peuple la mémoire ET écrit
 * la table `handles` par le VRAI IndexedDBFSHandleRepository). Les liveQuery du
 * dossier convertedFiles n'existent même pas : la réactivité des collections et
 * des sources mobilisées par les uploads est verrouillée couche data, et les
 * échanges GitHub/parcours d'upload appartiennent aux lots 11–12
 * (`__tests__/useRepository.test.tsx`) — rien de leur surface n'est testé ici. Le
 * seul consommateur applicatif du handle posé est `data/utils/canvas.ts:70`
 * (repli de `getFile`, suite déjà en place) et les hooks d'upload, qui reçoivent
 * leur handle en ARGUMENT (lots 11–12).
 *
 * Contrat commun, point par point (adapté, comme aux lots 26–27) :
 * - état initial (`undefined` → loading) : SANS OBJET côté liveQuery — le hook ne
 *   souscrit à AUCUNE requête Dexie : preuve mesurée en comparant le compteur
 *   `countLiveQuerySubscribers` à une référence « providers du harnais seuls »
 *   matérialisée puis relâchée dans le même test (leçon des lots 16/24–36 : jamais
 *   en delta synchrone — les sources multicastées de dexie-react-hooks survivent
 *   CLEANUP_DELAY 3 s ; leçon du lot 35 : référence installée DANS le test). Le
 *   compteur revient EXACTEMENT à la référence « providers seuls » à tous les
 *   instants mesurés : le hook ajoute ZÉRO abonné. La surface, elle, est observable
 *   dès le premier rendu synchronique : `{ requestPermission }` seul, jamais
 *   `undefined`, sans `isLoading` — `liveLoading.test.tsx` n'est PAS étendu (rien à
 *   distinguer, même verdict que les lots 24/25/27) ;
 * - bascule après première émission : SANS OBJET — aucune émission. L'analogue
 *   observable est la RÉSOLUTION de la promesse de `requestPermission` : `await
 *   addDirectoryHandle(handle)` (l. 8) est séquencé store-puis-put, donc à
 *   résolution acquise, mémoire et base réelles sont soldables sans délai (test 2) ;
 * - remontée d'erreur : pas de surface liveQuery à faire échouer ni d'ErrorBoundary
 *   (aucune erreur n'éclate le rendu) — les erreurs remontent par REJET BRUT de la
 *   promesse, sans try/catch dans le hook : rejet du picker (annulation AbortError,
 *   test 3 ; API absente = TypeError sans détection de fonctionnalité, test 4) et
 *   échec du put repository (injection par l'API publique RÉELLE
 *   `db.handles.hook('creating')`, retirée en `finally` — discipline des lots
 *   24–36), caractérisé NON ATOMIQUE : store déjà muté quand la base échoue
 *   (test 5) ;
 * - désabonnement au démontage : le hook a BIEN UNE souscription, mais en mémoire
 *   uniquement — `useFSHandleStore()` SÉLECTEUR ABSENT (l. 4) = abonnement au
 *   store entier. Elle est prouvée dans les deux sens par compteur de rendus : une
 *   mutation du store pendant le montage re-render le hook ; la même mutation après
 *   `unmount` ne le re-render plus (abonnement relâché) — test 1. Côté Dexie, zéro
 *   souscription (ci-dessus), donc retour EXACT à la valeur d'avant-montage au
 *   démontage, dans les six tests.
 *
 * Frontières :
 * - `window.showDirectoryPicker` : API absente de jsdom, stubbée AU BORD (liste du
 *   plan ; précédent lots 13–14, `usePdfConverter.test.tsx`) par un `vi.fn` posé sur
 *   window et retiré en `afterEach` ; jamais réimplémentée (le faux ne FAIT QUE
 *   résoudre ou rejeter — pas de sémantique de picker dans le test). Le test 4
 *   l'exerce ABSENTE (état jsdom nu), seul moyen de caractériser le défaut de
 *   détection sans réimplémenter l'API ;
 * - handles : contrairement aux lots 11–12 (handle passé en argument, jamais
 *   persisté), ICI le handle EST ÉCRIT en base par le hook. Seules les propriétés
 *   OWN data survivent au clonage structurel de fake-indexeddb (constat des lots 8
 *   et 11–12 — un handle à méthodes propres lèverait DataCloneError) : le faux est
 *   donc une classe à données propres + méthodes au prototype, castée
 *   `FileSystemDirectoryHandle`. L'inertie du clone relu en base est VERROUILLÉE
 *   comme artefact de test, documenté tel quel (caractérisation 9) — en production
 *   IndexedDB sérialise les vrais handles et leur rend leurs méthodes ;
 * - store zustand : singleton de module, NON réinitialisé par `createTestDb()` —
 *   remis à vide en `beforeEach` ET `afterEach` par `useFSHandleStore.setState`
 *   (API publique du store, précédent `useThumbnail.test.tsx`, lot 8) ;
 * - écritures en base : AUCUNE hors du chemin réel du hook (le put vient de
 *   `addDirectoryHandle` → `getFSHandleRepository()`), relecture par le VRAI
 *   repository ; pas de mock de Dexie, pas de `vi.mock`, pas de `vi.spyOn`, pas de
 *   délai artificiel, aucun appel réseau (le source n'importe ni fetch ni Octokit).
 *   Le solde des transactions IDB par aller-retour RÉEL (garde-fou des lots 8 et
 *   13–14 avant le `db.delete()` du `createTestDb()` suivant) est centralisé dans le
 *   harnais depuis le lot 41.
 *
 * Call sites (production, vérifiés — grep `useConvertedFileIO`, 1 seul fichier hors
 * la source et les mocks de suites de composants) :
 * - `CollectionInspectorGalleryItemContent.tsx` (l. 53 ; monté par
 *   `CollectionInspectorGalleryItem` → `CollectionInspectorGallery`, galerie de
 *   l'inspecteur de collection) : `requestPermission` est appelé l. 86 dans
 *   `handleOnClick` (l. 82-88), déclenché par `onClick={() => void handleOnClick()}`
 *   (l. 102) UNIQUEMENT quand la vignette a échoué (`error` de `useThumbnail`,
 *   l. 55/83) — c'est-à-dire a priori sur un chemin local dont le handle a expiré.
 *   Le rejet n'y est NI capturé NI toasté (caractérisation 3) ;
 * - `src/pages/__tests__/ManifestExplorerPage.test.tsx:12` MOCKE ce module avec un
 *   `loadManifest` que le hook n'exporte plus et pour une page qui ne l'importe
 *   plus (caractérisation 8 — mock mort, consigné, non étendu).
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * 1. hook listé comme coquille liveQuery alors qu'il n'en est une que du nom : API =
 *   une action seule, aucune valeur, aucun état. Le contrat d'état initial du
 *   palier 2 ne peut s'y observer que NÉGATIVEMENT (zéro abonné Dexie, test 1) ;
 * 2. `requestPermission` n'est pas mémoïsée (fermeture recréée à chaque rendu, l. 6)
 *   — vérifié au test 1 sous `rerender`, sans effet observable hors identité : le
 *   call site l'appelle depuis le rendu courant (précédent lot 35, caractérisation 3) ;
 * 3. le hook ne rattrape RIEN : tout rejet (annulation, API absente, échec
 *   d'écriture) ressort BRUT et, au call site, part dans un `void` non traité — pas
 *   de pushError, pas de toast (symétrique de la caractérisation 7 du lot 35) ;
 * 4. aucune détection de la fonctionnalité (`window.showDirectoryPicker` appelé
 *   sans garde, l. 7) : navigateur non supportant = TypeError rejetée, testée telle
 *   quelle (test 4), pas légitimée ;
 * 5. écriture NON ATOMIQUE : `set` zustand avant le `await put` (useFSHandleStore
 *   .tsx:14-20) — si la persistance échoue, la mémoire a gardé le handle et la base
 *   non : états divergents atteignables, verrouillés au test 5 ;
 * 6. mémoire append, base par nom : le store ACCUMULE un entré par pick (doublons
 *   de nom compris) tandis que `put({ id: handle.name })` REMPLACE la ligne du même
 *   nom ; `getDirectoryHandle` (un `find`) fige donc la mémoire sur le PREMIER
 *   handle vivant — re-pick du même dossier en production laisserait le repli de
 *   `canvas.ts` travailler sur l'ANCIEN handle (permission possiblement expirée)
 *   pendant que la base porte le neuf. Verrouillé TEL QUEL au test 6 (soupçon de
 *   défaut, à remonter) ;
 * 7. persistance À SENS UNIQUE : `loadDirectoryHandles` (la voie de relecture de
 *   `db.handles` par le store) n'a AUCUN appelant dans `src/` (grep) et ne figure
 *   même PAS dans l'interface `FSHandleState` (non plus que `cachedFileHandles`) —
 *   la ligne `handles` écrite par ce hook n'est relue par personne : réserve de
 *   réhydratation aveugle, consignée ;
 * 8. mock périmé côté composants : `ManifestExplorerPage.test.tsx` mocke le module
 *   avec `loadManifest` (surface d'avant les slimings, cf. git d5d08486) alors que
 *   la page n'importe plus le hook — mock inerte, hors périmètre du lot, remonté ;
 * 9. inertie du clone relu en base (méthodes perdues au clonage fake-indexeddb) :
 *   artefact de test documenté (constat des lots 8 et 11–12), asserté au test 2
 *   pour qu'il ne soit jamais confondu avec un comportement de production.
 */
import { FSHandle } from '@/data/models/fSHandle';
import { db } from '@/data/repositories/indexeddb/db';
import { getFSHandleRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  renderHookWithHarness,
  resetTestDbBeforeEach,
} from '@/hooks/__tests__/harness';
import { useFSHandleStore } from '@/state/zustand/useFSHandleStore';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useConvertedFileIO from '../useConvertedFileIO';

resetTestDbBeforeEach();

/* ------------------------------------------------------------------ */
/* Frontière File System Access (cf. en-tête)                          */
/* ------------------------------------------------------------------ */

/**
 * Faux handle CLONABLE : données propres (`kind`, `name`, `pickedAt`), méthodes au
 * PROTOTYPE (non clonées — précédent constat lots 8/11-12, caractérisation 9). Le
 * cast d'usage à la frontière (motif `useThumbnail.test.tsx`).
 */
class FakeConvertedDirectoryHandle {
  kind = 'directory' as const;
  constructor(
    readonly name: string,
    readonly pickedAt: string,
  ) {}
  requestPermission(): Promise<'granted'> {
    return Promise.resolve('granted');
  }
}

function asHandle(handle: FakeConvertedDirectoryHandle): FileSystemDirectoryHandle {
  return handle as unknown as FileSystemDirectoryHandle;
}

/** Relecture de la table `handles` par le VRAI repository fsHandle. */
function readHandlesTable(): Promise<FSHandle[]> {
  return getFSHandleRepository().getAll();
}

function stubDirectoryPicker(impl: () => Promise<FileSystemDirectoryHandle>) {
  const picker = vi.fn(impl);
  pickerHolder.showDirectoryPicker = picker;
  return picker;
}

const pickerHolder = window as unknown as { showDirectoryPicker?: unknown };

beforeEach(() => {
  // clearAllMocks (pas resetAllMocks) : préserve les implémentations des stubs
  // globaux de vitest.setup.ts, nécessaires au harnais (même garde qu'au lot 13).
  vi.clearAllMocks();
  delete pickerHolder.showDirectoryPicker;
  useFSHandleStore.setState({ directoryHandles: [] });
});

afterEach(() => {
  delete pickerHolder.showDirectoryPicker;
  useFSHandleStore.setState({ directoryHandles: [] });
  // Les écritures du hook sont toutes `await`ées ; le solde des transactions IDB
  // résiduelles avant le `db.delete()` de `createTestDb` est la vidange centralisée
  // du harnais depuis le lot 41 (garde-fou des lots 8 et 13-14, sans ligne locale ici).
});

describe('useConvertedFileIO — facade du picker (palier 2, requalifiee)', () => {
  it('coquille sans liveQuery : API synchrone des le premier rendu, zero souscription Dexie, abonnement au store prouve puis relache', async () => {
    const subscribersBefore = countLiveQuerySubscribers();

    // Référence « providers du harnais seuls » : matérialiser leurs abonnements
    // différés, les relâcher, puis mesurer (leçon des lots 16/24–35).
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    let renders = 0;
    const { result, rerender, unmount } = renderHookWithHarness(() => {
      renders += 1;
      return useConvertedFileIO();
    });

    // Premier rendu SYNCHRONE : l'API est exactement l'action seule (caractérisation 1
    // — pas d'`undefined` à attendre, pas de defaultResult, pas d'`isLoading`).
    expect(Object.keys(result.current)).toEqual(['requestPermission']);
    expect(typeof result.current.requestPermission).toBe('function');
    expect(renders).toBe(1);

    // Zéro liveQuery propre : dès la souscription différée de l'arbre matérialisée,
    // le compteur revient EXACTEMENT à la référence « providers seuls ».
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly));

    // L'abonnement qui EXISTE est zustand (sélecteur absent, useConvertedFileIO
    // .tsx:4) : muter le store pendant le montage re-render le consommateur.
    const requestPermissionFirstRender = result.current.requestPermission;
    act(() => {
      useFSHandleStore.setState((state) => ({
        directoryHandles: [...state.directoryHandles, {} as FileSystemDirectoryHandle],
      }));
    });
    await waitFor(() => expect(renders).toBeGreaterThan(1));
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly);

    // Rerender : l'action est recréée à chaque rendu (caractérisation 2, aucune
    // mémoïsation) ; rien ne souscrit davantage — l'abonnement zustand est unique
    // par montage et le compteur Dexie ne bouge pas.
    rerender();
    expect(result.current.requestPermission).not.toBe(requestPermissionFirstRender);
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly);

    unmount();
    // Côté Dexie : RIEN à désabonner, le compteur revient à la valeur d'avant-montage.
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    // Côté zustand, preuve ACTIVE du relâchement : la même mutation après démontage
    // ne déclenche plus aucun rendu du hook (le compteur de rendus est figé).
    const rendersAtUnmount = renders;
    act(() => {
      useFSHandleStore.setState((state) => ({
        directoryHandles: [...state.directoryHandles, {} as FileSystemDirectoryHandle],
      }));
    });
    await act(async () => undefined);
    expect(renders).toBe(rendersAtUnmount);
  });

  it('requestPermission nominal : picker appele une fois avec mode lecture, handle vivant en store, ligne persistancee via le vrai repository', async () => {
    const handle = new FakeConvertedDirectoryHandle('converted-nominal-37', 'premier');
    const showDirectoryPicker = stubDirectoryPicker(async () => asHandle(handle));
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, rerender, unmount } = renderHookWithHarness(() => useConvertedFileIO());

    await act(async () => {
      await expect(result.current.requestPermission()).resolves.toBeUndefined();
    });

    // Frontière : un seul appel, avec les options exactes de la source (l. 7).
    expect(showDirectoryPicker).toHaveBeenCalledTimes(1);
    expect(showDirectoryPicker).toHaveBeenCalledWith({ mode: 'read' });

    // Mémoire (store réel, lu par son API publique) : le handle VIVANT, pas un clone.
    expect(useFSHandleStore.getState().directoryHandles).toHaveLength(1);
    expect(useFSHandleStore.getState().directoryHandles[0]).toBe(handle);
    expect(useFSHandleStore.getState().getDirectoryHandle('converted-nominal-37')).toBe(handle);

    // Base réelle, relue par le VRAI repository fsHandle : une ligne, id = nom du
    // dossier, handle INERTE (caractérisation 9 — artefact de clonage documenté, pas
    // un comportement de production).
    const stored = await readHandlesTable();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('converted-nominal-37');
    expect(stored[0].handle).not.toBe(handle);
    expect(stored[0].handle.name).toBe('converted-nominal-37');
    expect(stored[0].handle.kind).toBe('directory');
    expect(stored[0].handle.requestPermission).toBeUndefined();

    // Rien ne relance le picker au rerender ; la voie normale n'a jamais retourné
    // de valeur (l. 9 : la promesse résout `undefined`).
    rerender();
    expect(showDirectoryPicker).toHaveBeenCalledTimes(1);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('annulation du picker (AbortError) : rejet BRUT a l appelant, store et base inchanges (caracterisation 3)', async () => {
    const abortError = new Error('sélection annulée');
    abortError.name = 'AbortError';
    const showDirectoryPicker = stubDirectoryPicker(async () => {
      throw abortError;
    });
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() => useConvertedFileIO());

    let rejection: unknown;
    await act(async () => {
      rejection = await result.current.requestPermission().then(
        () => undefined,
        (error: unknown) => error,
      );
    });

    // Le MÊME objet d'erreur, sans try/catch ni transformation (caractérisation 3 :
    // au call site, ce rejet part dans un `void` non traité).
    expect(rejection).toBe(abortError);
    expect(showDirectoryPicker).toHaveBeenCalledTimes(1);

    // `addDirectoryHandle` n'a jamais été atteint : ni mémoire, ni base touchées.
    expect(useFSHandleStore.getState().directoryHandles).toEqual([]);
    expect(await readHandlesTable()).toEqual([]);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('API indisponible (jsdom nu, sans picker) : TypeError rejetee faute de detection, rien ecrit (caracterisation 4)', async () => {
    // Le beforeEach a retiré toute stub : `window.showDirectoryPicker` est bien
    // `undefined` — l'état d'un navigateur qui n'implémente pas l'API.
    expect(window.showDirectoryPicker).toBeUndefined();
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() => useConvertedFileIO());

    let rejection: unknown;
    await act(async () => {
      rejection = await result.current.requestPermission().then(
        () => undefined,
        (error: unknown) => error,
      );
    });

    // TypeError BRUT (pas d'Error typée, pas de repli, pas de garde — caractérisation 4).
    expect(rejection).toBeInstanceOf(TypeError);
    expect(useFSHandleStore.getState().directoryHandles).toEqual([]);
    expect(await readHandlesTable()).toEqual([]);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('echec du put repository : rejet brut, mais store DEJA mute — divergence memoire/base verrouillee (caracterisations 3 et 5)', async () => {
    const handle = new FakeConvertedDirectoryHandle('converted-ecriture-37', 'unique');
    const showDirectoryPicker = stubDirectoryPicker(async () => asHandle(handle));

    // Injection par l'API publique RÉELLE des hooks Dexie (discipline des lots 24–36,
    // retirée en `finally`) : toute CRÉATION de ligne dans `handles` échoue pour de
    // vrai. Le put du repository est un put sur clé neuve → hook « creating ».
    // Aucun provider du harnais ne liveQuery `handles` : seule l'écriture du store
    // zustand bute sur l'injection pendant la fenêtre.
    const failCreating = (): void => {
      throw new Error('handles-ecriture-en-echec-37');
    };
    db.handles.hook('creating', failCreating);
    const subscribersBefore = countLiveQuerySubscribers();
    try {
      const { result, unmount } = renderHookWithHarness(() => useConvertedFileIO());

      let rejection: unknown;
      await act(async () => {
        rejection = await result.current.requestPermission().then(
          () => undefined,
          (error: unknown) => error,
        );
      });

      expect(String(rejection)).toContain('handles-ecriture-en-echec-37');
      expect(showDirectoryPicker).toHaveBeenCalledTimes(1);

      // Non-atomicité (caractérisation 5) : le `set` zustand précède le `await put` —
      // à l'échec, la MÉMOIRE a le handle, la BASE n'a rien.
      expect(useFSHandleStore.getState().directoryHandles).toHaveLength(1);
      expect(useFSHandleStore.getState().directoryHandles[0]).toBe(handle);
      expect(await readHandlesTable()).toEqual([]);

      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.handles.hook('creating').unsubscribe(failCreating);
    }
    // Le handle resté « orphelin » en mémoire ne doit pas contaminer le test suivant :
    // le `beforeEach`/`afterEach` remet le store à vide (cf. en-tête).
  });

  it('accumulation et doublons de nom : append en memoire par pick, replace en base par nom, getDirectoryHandle fige sur le premier vivant (caracterisation 6, verrouillee telle quelle)', async () => {
    const alpha1 = new FakeConvertedDirectoryHandle('converted-alpha-37', 'premier');
    const alpha2 = new FakeConvertedDirectoryHandle('converted-alpha-37', 'second');
    const beta = new FakeConvertedDirectoryHandle('converted-beta-37', 'unique');
    const queue = [alpha1, alpha2, beta];
    const showDirectoryPicker = stubDirectoryPicker(async () =>
      asHandle(queue.shift() as FakeConvertedDirectoryHandle),
    );

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() => useConvertedFileIO());

    for (let pick = 0; pick < 3; pick += 1) {
      await act(async () => {
        await expect(result.current.requestPermission()).resolves.toBeUndefined();
      });
    }
    expect(showDirectoryPicker).toHaveBeenCalledTimes(3);

    // Mémoire : un append par pick, DOUBLONS de nom compris, dans l'ordre.
    const { directoryHandles, getDirectoryHandle } = useFSHandleStore.getState();
    expect(directoryHandles).toHaveLength(3);
    expect(directoryHandles[0]).toBe(alpha1);
    expect(directoryHandles[1]).toBe(alpha2);
    expect(directoryHandles[2]).toBe(beta);

    // Base : une ligne par NOM, la dernière écriture gagne (put sur clé existante).
    const stored = await readHandlesTable();
    expect(stored.map((row) => row.id).sort()).toEqual(['converted-alpha-37', 'converted-beta-37']);
    const alphaRow = stored.find((row) => row.id === 'converted-alpha-37');
    expect(alphaRow?.handle).not.toBe(alpha2);
    expect((alphaRow?.handle as unknown as FakeConvertedDirectoryHandle).pickedAt).toBe('second');

    // La caractérisation 6 en action : `find` → PREMIER handle vivant. La base porte
    // le `second`, la mémoire répond `premier` — divergence verrouillée TEL QUEL
    // (règle 7), soupçon de défaut à remonter à l'audit (lot 38).
    expect(getDirectoryHandle('converted-alpha-37')).toBe(alpha1);
    expect(getDirectoryHandle('converted-beta-37')).toBe(beta);
    expect(getDirectoryHandle('converted-absent-37')).toBeUndefined();

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });
});
