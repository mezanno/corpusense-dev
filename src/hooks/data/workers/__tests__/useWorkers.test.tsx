/**
 * Lot 27 — useWorkers, palier 2 (cf. docs/roadmap.md, Q11).
 *
 * DÉVIATION FONDATRICE, à consigner pour l'audit (lot 38) : `useWorkers` est listé
 * au palier 2 « coquilles liveQuery » du plan, mais son source (useWorkers.tsx,
 * 52 lignes) ne contient AUCUN `useLiveQuery` ni `liveQuery()` — c'est une façade
 * de mutations et d'export sur les vrais repositories (`getWorkerRepository()`,
 * `getResultRepository()`) et sur le registre de plugins `workerPlugins`, dont les
 * seuls effets observables hors valeur retournée sont `console.warn`/
 * `console.error` (export sans résultats, export capturé en échec) et un
 * `pushError` dans la slice `events` (échec synchrone de l'export du plugin,
 * useWorkers.tsx:37-42). Même requalification que le lot 26
 * (`useProjectsIO`) : le gabarit des lots 24-25 (observation de la première
 * émission, defaultResult) est adapté contrat par contrat et les points sans objet
 * sont DOCUMENTÉS, pas inventés. Les liveQuery de workers/results existent bien
 * dans l'application — mais dans le `WorkerProvider` de contexte (monté par le
 * harnais), pas dans le hook : rien de leur réactivité n'est testé ici (couche
 * data + suite du provider).
 *
 * Contrat commun, point par point :
 * - état initial : pas de valeur réactive du tout — le hook ne retourne que trois
 *   fonctions, disponibles dès le premier rendu synchronique. Aucune liveQuery ne
 *   part du hook : preuve mesurée en comparant le compteur
 *   `countLiveQuerySubscribers` à une référence « providers du harnais seuls »
 *   montée dans le même test (leçon des lots 16/24/25/26 : la souscription des
 *   providers est différée via `setTimeout(0)` dans dexie, la comparaison n'est
 *   faite qu'APRÈS installation de ces abonnements, jamais en delta synchrone) ;
 * - bascule après première émission : SANS OBJET côté hook — l'analogue observable
 *   est l'effet résolu des promesses renvoyées : délégations `removeWorker`/
 *   `removeResult` vérifiées par l'état final de la base réelle relue par les
 *   VRAIS repositories, et export `txt` vérifié par l'appel unique à la frontière
 *   navigateur avec le contenu lu en base ;
 * - remontée d'erreur : pas de surface liveQuery à faire échouer — les erreurs
 *   remontent par REJET de la promesse (mutations et lecture des résultats, qui
 *   précède le `try` — useWorkers.tsx:24-25) et, seul canal toast, par
 *   `pushError` quand l'export SYNCHRONE du plugin lève (test dédié). Injections
 *   par l'API publique RÉELLE des hooks Dexie, retirées en `finally`, dans la
 *   discipline du gabarit : `db.workers.hook('deleting')` (le `reading` du gabarit
 *   est sans prise ici — le hook ne LIT pas dans les branches testées) et
 *   `db.results.hook('reading')` pour la lecture préalable de `exportWorkerResult`.
 *   Aucun ErrorBoundary n'est nécessaire : aucune erreur n'éclate le rendu du hook.
 *   Point de vigilance pour l'injection « reading » (test dédié) : les providers
 *   du harnais lisent aussi `db.results` ; l'injection n'intervient qu'APRÈS une
 *   émission prouvée du `WorkerProvider` (mutation d'amorçage attendue via
 *   `hasResult` du contexte) et plus aucune mutation n'a lieu ensuite, donc
 *   aucune re-lecture des providers ne peut buter sur l'injection ;
 * - désabonnement au démontage : trivialement satisfait faute d'abonnement propre
 *   — vérifié malgré tout par le compteur : de retour EXACT à la valeur
 *   d'avant-montage après `unmount`, stable sous `rerender` (test nominal).
 *
 * Frontières (tout le reste est réel : VRAIS repositories, VRAI registre, aucun
 * mock de Dexie, aucun délai artificiel) :
 * - registre des plugins : `initializePluginRegistries()` en `beforeAll` (précédent
 *   lots 1-2 et 20-21) — `peroocr` n'est pas marqué expérimental, le drapeau
 *   `experimentalFeatures` du localStorage n'a pas à être levé ;
 * - `file-saver` stubbé à la frontière navigateur (`vi.mock` + `vi.hoisted`, motif
 *   du lot 3) : jsdom ne sait pas sauvegarder de fichier ; l'espion sert aussi à
 *   faire échouer l'export synchrone (branche `catch` du hook).
 *
 * Call sites (production, vérifiés) :
 * - `WorkerTable` (`removeWorker`, WorkerTable.tsx:29,38 — dans une confirmation,
 *   en `void` : le rejet de la promesse n'y est pas consommé) ;
 * - `WorkerDetails` (`removeResult`, WorkerDetails.tsx:24,53 — idem, en `void`) ;
 * - `ExportFormatSelectionForm` (`exportWorkerResult`,
 *   ExportFormatSelectionForm.tsx:35,72 — `await`é à la soumission du formulaire).
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * - AUCUNE mémoïsation (contrairement aux lots 25/26) : `getWorkerRepository()`
 *   est appelé à chaque rendu (useWorkers.tsx:10, instance neuve à chaque appel,
 *   dbFactory.ts:94-96) et les trois fonctions retournées sont recréées à chaque
 *   rendu — vérifié par l'instabilité d'identité sous `rerender` (test nominal).
 *   Sans effet observable hors identité : les repositories sont sans état ;
 * - la lecture `getAllByWorkerId` précède le `try` (useWorkers.tsx:24-27) : un
 *   échec de lecture est REJETÉ sans `pushError`, alors qu'un échec de l'export
 *   lui-même est capturé et toasté — asymétrie de canal verrouillée par test ;
 * - `saga.export` n'est pas attendu (useWorkers.tsx:35) : avec les plugins
 *   asynchrones (`mistral`, `openai`, `mistralocr`), `exportWorkerResult` se
 *   résout avant la fin de l'export et les erreurs ultérieures de ceux-ci
 *   échappent au `catch` (rejet non géré, aucun toast). Non déclenchable par
 *   peroocr (synchrone) sans réimplémenter un plugin — branche consignée, pas
 *   inventée ;
 * - plugin absent du registre (ou registre jamais initialisé) : no-op TOTAL,
 *   même avec des résultats en base, sans log ni toast (useWorkers.tsx:28) ;
 *   plugin présent mais sans `results` : `console.warn` du hook seul, et le
 *   garde-fou `results.length === 0` des plugins eux-mêmes est injoignable par
 *   cette voie (vérifié avant l'appel) ;
 * - messages en anglais codés en dur (`No results found for worker …`,
 *   `Error in export plugin saga for …`) — non traduits, à la différence des
 *   `pushError(i18n.t(…))` d'autres hooks (précédent lot 26 pour l'asymétrie de
 *   traduction) ;
 * - `removeWorker`/`removeResult` n'ont AUCUNE surface d'erreur propre : erreur
 *   repository = rejet non géré côté appelant (`void …`, cf. call sites) — la
 *   branche est testée du point de vue du hook (rejet + rollback + zéro toast),
 *   pas de celle d'un écran.
 */
import { useWorkerContext } from '@/components/reducers/WorkerContext';
import { Event, EventType } from '@/data/models/event';
import { Result } from '@/data/models/result/result';
import { Worker } from '@/data/models/worker/worker';
import { db } from '@/data/repositories/indexeddb/db';
import { getResultRepository, getWorkerRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  renderHookWithHarness,
  resetTestDbBeforeEach,
} from '@/hooks/__tests__/harness';
import { initializePluginRegistries } from '@/state/sagas/plugins/registry';
import { RootState } from '@/state/store';
import { act, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import useWorkers from '../useWorkers';

// Frontière navigateur (cf. en-tête) : `FileSaver.saveAs` est remplacé par un
// espion qui capture le blob au lieu de déclencher un téléchargement — motif du
// lot 3 ; l'espion fait aussi échouer l'export synchrone du plugin peroocr.
const { saveAsMock } = vi.hoisted(() => ({
  saveAsMock: vi.fn<(blob: Blob, filename?: string) => void>(),
}));
vi.mock('file-saver', () => ({ default: { saveAs: saveAsMock } }));

resetTestDbBeforeEach();

// Le registre `workerPlugins` est peuplé par `main.tsx` en production ; on
// démarre le vrai chargeur — peroocr, non expérimental, y est enregistré avec sa
// fonction d'export `txt` réelle (cf. en-tête).
beforeAll(() => {
  initializePluginRegistries();
});

beforeEach(() => {
  saveAsMock.mockReset();
});

const SCOPE = { collectionId: 'collection-shell-27' };

/** Écriture par le VRAI repository workers. */
async function seedWorker(id: string, name = 'shell-worker'): Promise<Worker> {
  return getWorkerRepository().add({ id, name, scope: SCOPE, params: {} });
}

/** Écriture par le VRAI repository results (value : texte brut, format txt de peroocr). */
async function seedResult(worker: Worker, taskId: number, value: string): Promise<Result> {
  return getResultRepository().add({
    scope: worker.scope,
    workerName: worker.name,
    workerId: worker.id,
    taskId,
    value,
    params: {},
  });
}

/** Les toasts tels que posés dans la slice `events` du store réel du harnais. */
function toasts(state: RootState): Event[] {
  return state.events.allEvents;
}

/** Contenu texte d'un Blob — le `new Blob` global est celui de jsdom, sans `.text()` (motif de `useModelIO.test.tsx`). */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du blob échouée'));
    reader.readAsText(blob);
  });
}

describe('useWorkers — façade IO du palier 2 (coquille sans liveQuery)', () => {
  it('coquille sans liveQuery : API fonctionnelle dès le premier rendu, zéro souscription propre, zéro fuite au démontage', async () => {
    const subscribersBefore = countLiveQuerySubscribers();

    // Référence « providers du harnais seuls » : le wrapper monte ses propres
    // liveQuery (3 d'après les lots 24-25 — dont les workers/results du
    // WorkerProvider), dont la souscription est différée via setTimeout(0) dans
    // dexie. On la matérialise puis on la relâche, pour comparer le hook monté à
    // cette référence — le compteur brut avant émission ne serait pas probant
    // (leçon des lots 16/24/25/26).
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    const { result, rerender, unmount } = renderHookWithHarness(() => useWorkers());

    // Premier rendu synchronique : le hook n'expose AUCUNE valeur — pas
    // d'`undefined` à attendre, pas de defaultResult, pas d'`isLoading`
    // (DÉVIATION du contrat commun, cf. en-tête) : seulement trois fonctions.
    expect(typeof result.current.removeWorker).toBe('function');
    expect(typeof result.current.removeResult).toBe('function');
    expect(typeof result.current.exportWorkerResult).toBe('function');

    // Le hook n'ajoute RIEN aux abonnements des providers : dès que la
    // souscription différée de l'arbre est matérialisée, le compteur revient
    // exactement à la référence « providers seuls ».
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly));

    // Rien ne re-souscrit au rerender — mais les fonctions sont recréées à chaque
    // rendu : ni le repository ni les fonctions ne sont mémoïsés
    // (caractérisation « aucune mémoïsation », cf. en-tête).
    const removeWorkerFirstRender = result.current.removeWorker;
    rerender();
    expect(result.current.removeWorker).not.toBe(removeWorkerFirstRender);
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly);

    // Désabonnement : faute d'abonnement propre, le démontage doit simplement
    // ne rien laisser derrière lui — retour EXACT à la valeur d'avant-montage.
    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('removeWorker et removeResult : délégations strictes aux vrais repositories — effet observable en base, résolution undefined, aucun toast', async () => {
    const worker1 = await seedWorker('worker-shell-del-1');
    const worker2 = await seedWorker('worker-shell-del-2');
    await seedResult(worker1, 7, 'résultat du worker 1');
    const resultOfWorker2 = await seedResult(worker2, 9, 'résultat du worker 2');

    const { result, store, unmount } = renderHookWithHarness(() => useWorkers());
    const workerRepository = getWorkerRepository();

    // removeWorker délègue bien à `deleteById` : la ligne a disparu (relecture
    // par le repository réel). Le détail de la cascade results/queue appartient
    // à workers.test.ts (campagne Q2) — non re-testée ici.
    await expect(act(() => result.current.removeWorker('worker-shell-del-1'))).resolves.toBe(
      undefined,
    );
    expect((await workerRepository.getById('worker-shell-del-1')).ok).toBe(false);
    expect((await workerRepository.getById('worker-shell-del-2')).ok).toBe(true);

    // removeResult délègue à `deleteResultById`, PAS à `deleteById` : le résultat
    // visé disparaît et le worker survit (preuve de routage au niveau hook).
    await expect(act(() => result.current.removeResult('worker-shell-del-2', 9))).resolves.toBe(
      undefined,
    );
    const resultsRepository = getResultRepository();
    expect((await resultsRepository.getResultByWorkerIdAndTaskId('worker-shell-del-2', 9)).ok).toBe(
      false,
    );
    expect((await resultsRepository.getAll()).map((r) => r.id)).toEqual(
      expect.not.arrayContaining([resultOfWorker2.id]),
    );
    expect((await workerRepository.getById('worker-shell-del-2')).ok).toBe(true);

    // Aucune des deux délégations ne toast quoi que ce soit sur succès.
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('removeWorker en échec du repository : promesse rejetée telle quelle, aucun pushError, base inchangée (rollback)', async () => {
    await seedWorker('worker-shell-echec');

    const subscribersBefore = countLiveQuerySubscribers();
    // Injection de faute via l'API publique RÉELLE des hooks Dexie, dans la
    // discipline du gabarit (retirée en `finally`) — transposée au mutation-only :
    // c'est le hook « deleting » qui coupe la suppression, pas le « reading ».
    const failDeleting = (): void => {
      throw new Error('workers-suppression-en-echec');
    };
    db.workers.hook('deleting', failDeleting);
    try {
      const { result, store, unmount } = renderHookWithHarness(() => useWorkers());

      // Le hook n'enveloppe pas sa délégation d'un try/catch : le rejet remonte
      // à l'appelant (qui, côté production, l'ignore en `void` — cf. call sites).
      await expect(result.current.removeWorker('worker-shell-echec')).rejects.toThrow(
        'workers-suppression-en-echec',
      );
      expect(toasts(store.getState())).toEqual([]);

      // La transaction est annulée par l'injection : le worker est toujours là,
      // relu par le repository réel.
      expect((await getWorkerRepository().getById('worker-shell-echec')).ok).toBe(true);

      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.workers.hook('deleting').unsubscribe(failDeleting);
    }
  });

  it('exportWorkerResult : délègue au plugin RÉEL peroocr — lecture en base puis un fichier txt ; formats et plugins inconnus silencieux', async () => {
    const worker = await seedWorker('worker-shell-export', 'peroocr');
    await seedResult(worker, 1, 'alpha');
    await seedResult(worker, 2, 'beta');

    const { result, store, unmount } = renderHookWithHarness(() => useWorkers());

    await act(() => result.current.exportWorkerResult(worker, ['txt']));

    // Les valeurs LUES EN BASE par le vrai repository (ordre des taskId, sémantique
    // couche data) traversent le hook jusqu'au fichier : un seul appel, nom figé
    // par le plugin, contenu concaténé.
    expect(saveAsMock).toHaveBeenCalledTimes(1);
    const [blob, filename] = saveAsMock.mock.calls[0];
    expect(filename).toBe('exported_text.txt');
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(await blobText(blob)).toBe('alpha\n\nbeta');
    expect(toasts(store.getState())).toEqual([]);

    // Format que le plugin ne gère pas : no-op silencieux (résous, ne toast pas,
    // n'appelle rien) — branche consignée, telle qu'implémentée.
    saveAsMock.mockClear();
    await act(() => result.current.exportWorkerResult(worker, ['csv']));
    expect(saveAsMock).not.toHaveBeenCalled();
    expect(toasts(store.getState())).toEqual([]);

    // Nom de plugin absent du registre : no-op TOTAL sans même un log, alors que
    // les résultats existent en base (caractérisation « plugin absent », en-tête).
    await act(() =>
      result.current.exportWorkerResult({ ...worker, name: 'plugin-inexistant' }, ['txt']),
    );
    expect(saveAsMock).not.toHaveBeenCalled();
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('exportWorkerResult sans résultats : le console.warn du hook seul, rien d exporté, aucun toast', async () => {
    const worker = await seedWorker('worker-shell-vide', 'peroocr');

    const { result, store, unmount } = renderHookWithHarness(() => useWorkers());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await act(() => result.current.exportWorkerResult(worker, ['txt']));
      // Message du hook (useWorkers.tsx:31), pas celui du plugin — le garde-fou
      // interne aux plugins est injoignable par cette voie (en-tête).
      expect(warnSpy).toHaveBeenCalledWith('No results found for worker worker-shell-vide');
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('No results to export from'),
      );
      expect(saveAsMock).not.toHaveBeenCalled();
      expect(toasts(store.getState())).toEqual([]);
      unmount();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('exportWorkerResult : export synchrone du plugin en echec (frontiere FileSaver) — console.error et pushError dans la slice events, base intacte', async () => {
    const worker = await seedWorker('worker-shell-erreur', 'peroocr');
    const stored = await seedResult(worker, 1, 'alpha');

    const subscribersBefore = countLiveQuerySubscribers();
    // La frontière stubbée LÈVE : c'est le `catch` du hook qui doit absorber
    // l'échec (useWorkers.tsx:37-42) — error log + toast, promesse résolue.
    saveAsMock.mockImplementationOnce(() => {
      throw new Error('frontiere-telechargement-en-echec');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { result, store, unmount } = renderHookWithHarness(() => useWorkers());

      await expect(
        act(() => result.current.exportWorkerResult(worker, ['txt'])),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        'Error in export plugin saga for peroocr:',
        expect.objectContaining({ message: 'frontiere-telechargement-en-echec' }),
      );
      // Message du toast : préfixe anglais codé en dur + getErrorMessage de
      // l'erreur brute (caractérisation « non traduit », en-tête).
      expect(toasts(store.getState())).toEqual([
        {
          message: 'Error in export plugin saga for peroocr: frontiere-telechargement-en-echec',
          type: EventType.ERROR,
        },
      ]);

      // Un échec d'export ne supprime rien : le résultat est toujours en base.
      expect((await getResultRepository().getResultByWorkerIdAndTaskId(worker.id, 1)).ok).toBe(
        true,
      );
      const remaining = await getResultRepository().getAll();
      expect(remaining.map((r) => r.id)).toEqual([stored.id]);

      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('exportWorkerResult : la lecture prealable des resultats en echec — rejet brut sans pushError, la frontiere export n est pas atteinte', async () => {
    const worker = await seedWorker('worker-shell-lecture', 'peroocr');

    const { result, store, unmount } = renderHookWithHarness(() => ({
      ...useWorkers(),
      // Sonde de synchronisation : `hasResult` vient du WorkerProvider monté par
      // le harnais ; sa bascule à true prouve que la liveQuery des results a
      // émis APRÈS l'ajout d'amorçage ci-dessous — donc qu'aucune re-lecture des
      // providers n'est en vol au moment de l'injection (cf. en-tête).
      hasResult: useWorkerContext().hasResult,
    }));

    // Écriture APRÈS le montage, pour ancrer l'émission des providers ci-dessus.
    await seedResult(worker, 1, 'alpha');
    await waitFor(() => expect(result.current.hasResult('worker-shell-lecture')).toBe(true));

    // Injection « reading » sur db.results : seule la lecture NON PROTÉGÉE du
    // hook (avant son `try`, useWorkers.tsx:24) bute dessus — plus aucune
    // mutation n'a lieu ensuite, les providers ne relisent pas.
    const failReading = (): void => {
      throw new Error('results-lecture-en-echec');
    };
    db.results.hook('reading', failReading);
    try {
      await expect(result.current.exportWorkerResult(worker, ['txt'])).rejects.toThrow(
        'results-lecture-en-echec',
      );
      // Pas de toast (contrairement à l'échec de l'export lui-même — asymétrie
      // de canal caractérisée en en-tête), et la frontière export n'a pas été
      // atteinte.
      expect(toasts(store.getState())).toEqual([]);
      expect(saveAsMock).not.toHaveBeenCalled();

      unmount();
    } finally {
      db.results.hook('reading').unsubscribe(failReading);
    }
  });
});
