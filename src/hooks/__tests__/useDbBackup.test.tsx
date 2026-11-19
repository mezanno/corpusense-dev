/**
 * Lot 19 — useDbBackup (cf. docs/roadmap.md, Q11).
 *
 * Le hook ne fait que deux choses : relayer la sauvegarde/restauration de la base à
 * `databaseRepository.export`/`.import`, et tenir l'état d'avancement (`isBusy`,
 * `exportProgress`, `importProgress`) pendant l'opération. Ses deux flux sont couverts
 * ici À LEUR FRONTIÈRE — les méthodes `export`/`import` de la classe repository sont
 * des espions posés sur `IndexedDBDatabaseRepository.prototype` (seule exception
 * admise par le plan pour ce lot : la sémantique dexie-export-import appartient à la
 * campagne Q2, rien n'est réimplementé ici). Tout le reste tourne sur le stack réel :
 * store Redux (toasts `pushInfo`/`pushError` observés dans la slice `events`), base
 * Dexie réelle (graine et relecture par le VRAI repository collections dans le test
 * d'échec d'import), harnais du lot 0.
 *
 * Comportements verrouillés :
 * - export nominal (l. 26-45) : progression relayée TALE QUE pendant que l'opération
 *   est pendante (`isBusy` vrai, `exportProgress` égal à l'objet reçu, `importProgress`
 *   nul) ; le blob renvoyé par la frontière est passé IDENTIQUE à `URL.createObjectURL`,
 *   un `<a>` est cliqué avec `download = corpusense-backup-<AAAA-MM-JJ>.json` et un href
 *   `blob:` (pas de date figée — motif seulement, pas de délai artificiel) ;
 *   `revokeObjectURL` une fois ; toast `toast_export_success` ; `isBusy` retombé à faux
 *   et `exportProgress` remis à nul dans le `finally` ;
 * - export en échec (l. 39-44) : `console.error` + `pushError(toast_export_error)`,
 *   AUCUN appel à `URL.createObjectURL`, aucun clic, pas de toast succès ;
 * - import sans fichier sélectionné (l. 48-49) : retour anticipé AVANT le try —
 *   repository non appelé, aucun toast, pas de reload, et l'input n'est PAS
 *   réinitialisé (le `finally` n'est pas atteint : caractérisé tel quel) ;
 * - import nominal (l. 50-56) : le File est transmis à la frontière PAR IDENTITÉ
 *   d'objet ; progression et `isBusy` pendant l'opération ; toast
 *   `toast_import_success` puis `window.location.reload` exactement une fois ; en
 *   `finally`, `importProgress` remis à nul ET `importInputRef.current.value` vidé
 *   (l'utilisateur peut re-sélectionner le même fichier) — sous la garde
 *   `if (importInputRef.current)` : ref non monté, la réinitialisation est sautée
 *   sans lever, toast et reload compris ;
 * - import en échec (l. 57-63) : `pushError(toast_import_error)`, AUCUN reload (le
 *   plan l'exige explicitement), input quant à lui réinitialisé quand même (il est
 *   dans le `finally` : caractérisé tel quel), base intacte — vérifiée par relecture
 *   via le VRAI repository collections ;
 * - `triggerImportPicker` (l. 66-68) : clique l'input référencé ; `current` nul →
 *   no-op silencieux (`?.`).
 *
 * Caractérisation S-08 (docs/securite.md) — le plan demande de la consigner SANS LA
 * LÉGITIMER : à la couche hook, l'import d'un fichier au contenu arbitraire est transmis
 * tel quel à `databaseRepository.import` — aucune validation de schéma, aucun résumé
 * présenté avant import, aucune sauvegarde préalable (export jamais appelé sur ce
 * chemin). Dès que la frontière réserve, le hook annonce le succès et recharge la
 * page. Tout dépend de ce que dexie-export-import accepte ou rejette : le hook, lui,
 * ne regarde pas. Le correctif S-08 (validation Zod + résumé + backup préalable) reste
 * un chantier DISTINCT de Q11 (règle 7 du plan) ; ce test verrouille l'état présent,
 * il est appelé à changer quand S-08 sera traité.
 *
 * Frontières navigateur (stubbées au bord, seules coutures avec jsdom) :
 * - `window.location.reload` : jsdom 27 définit `reload` en propriété d'instance NON
 *   configurable de `Location` (le `vi.spyOn(window.location, 'reload')` usuel lève) ;
 *   la liaison globale `location` exposée par l'environnement jsdom de vitest est en
 *   revanche reconfigurable — remplacée par une valeur portant l'espion, descriptor
 *   d'origine restauré en `afterEach` (jamais `vi.unstubAllGlobals`, qui emporterait
 *   les stubs de `vitest.setup.ts`). Le hook lit `window.location.reload()` à
 *   l'appel, donc l'espion est bien vu ;
 * - clic d'ancrage du téléchargement : jsdom ne sait pas télécharger (« Not implemented:
 *   navigation ») — `HTMLElement.prototype.click` est stubbé au bord et l'ancre cliquée
 *   est capturée pour vérifier `download`/`href` (précédent : `file-saver` stubbé aux
 *   lots 3 et 15 pour la même raison) ;
 * - `URL.createObjectURL`/`revokeObjectURL` : jsdom en fournit de vrais (blob:nodedata:…)
 *   — enveloppés par `vi.spyOn` SANS les remplacer (précédent `useSource`/`useBlob`),
 *   le blob passé est vérifié par identité ;
 * - input `type=file` : ni `files` (jamais rempli hors sélection utilisateur) ni une
 *   `value` non vide (le navigateur — et jsdom — n'admettent que la chaîne vide en
 *   affectation programmatique) ne sont simulables proprement : propriétés d'instance
 *   `defineProperty`, seuls points fake du DOM, documentées à la fabrique.
 *
 * Rien d'autre n'est mocké : pas de Dexie, pas de stockage, pas de délai artificiel,
 * pas de `jest.useFakeTimers` ; la pendaison volontaire des opérations (promesses
 * résolues par le test) est la seule façon d'observer `isBusy` EN COURS d'opération.
 * Les tests rapides de ce fichier révélaient le race d'`afterEach` documenté au lot 8
 * (le `db.delete()` de `createTestDb` avorte les liveQuery de montage encore ouverts) :
 * la vidange par relance réelle en base est centralisée dans le harnais depuis le lot 41.
 *
 * Couverture : 100 % des lignes, fonctions et branches de `useDbBackup.ts` (v8, mesuré
 * à l'issue du lot) — les deux `catch` et les deux garde-fous (`!file`, `?.current`)
 * sont atteints.
 */
import { Event, EventType } from '@/data/models/event';
import { IndexedDBDatabaseRepository } from '@/data/repositories/indexeddb/database';
import { getCollectionRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  makeCollection,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedCollection,
} from '@/hooks/__tests__/harness';
import i18n from '@/i18n';
import { RootState } from '@/state/store';
import type { ExportProgress } from 'dexie-export-import';
import type { ChangeEvent } from 'react';
import { act } from 'react';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useDbBackup from '../useDbBackup';

resetTestDbBeforeEach();

/* ------------------------------------------------------------------ */
/* Espions de frontière                                                */
/* ------------------------------------------------------------------ */

// Frontière admise par le plan (lot 19) : ces DEUX méthodes seulement sont stubbées.
let exportSpy: MockInstance<
  (progressCallback: (progress: ExportProgress) => boolean) => Promise<Blob>
>;
let importSpy: MockInstance<
  (file: Blob, progressCallback: (progress: ExportProgress) => boolean) => Promise<void>
>;

const reloadSpy = vi.fn<() => void>();

// Liaison `location` d'origine (accesseur reconfigurable exposé par l'env jsdom de
// vitest — cf. en-tête) : capturée une fois, restaurée à l'identique en `afterEach`.
// `vi.unstubAllGlobals()` est proscrit ici : il démolirait aussi les stubs globaux
// posés par `vitest.setup.ts` (matchMedia notamment).
const locationDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'location',
) as PropertyDescriptor;

beforeEach(() => {
  exportSpy = vi.spyOn(IndexedDBDatabaseRepository.prototype, 'export');
  importSpy = vi.spyOn(IndexedDBDatabaseRepository.prototype, 'import');
  reloadSpy.mockClear();
  // `window.location.reload` n'est pas espionnable sur l'instance jsdom (cf. en-tête) :
  // on remplace la liaison globale `location`, que le hook résout à l'appel.
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    writable: true,
    value: { reload: reloadSpy, href: 'http://localhost/' },
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'location', locationDescriptor);
  vi.restoreAllMocks();
});

/** Échantillon de progression en cours d'opération (relayé tel quel par le hook). */
const PROGRESS_PARTIELLE: ExportProgress = {
  totalTables: 4,
  completedTables: 1,
  totalRows: 128,
  completedRows: 37,
  done: false,
};

/* ------------------------------------------------------------------ */
/* Aides locales                                                       */
/* ------------------------------------------------------------------ */

function toasts(state: RootState): Event[] {
  return state.events.allEvents;
}

/**
 * Input `type=file` avec une sélection simulée : `files` n'est jamais rempli hors
 * d'une sélection utilisateur réelle (cf. en-tête) ; `value` porte la baseline
 * « fichier déjà sélectionné » que le hook doit vider.
 */
function makeFileInput(files: File[]): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  Object.defineProperty(input, 'value', {
    configurable: true,
    writable: true,
    value: 'C:\\fakepath\\backup.json',
  });
  return input;
}

function changeEvent(input: HTMLInputElement): ChangeEvent<HTMLInputElement> {
  return { target: input } as unknown as ChangeEvent<HTMLInputElement>;
}

/** Stub du clic d'ancre au bord navigateur : capture les ancres cliquées (cf. en-tête). */
function captureAnchorClicks(): HTMLAnchorElement[] {
  const anchors: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(function (this: HTMLElement) {
    if (this instanceof HTMLAnchorElement) {
      anchors.push(this);
    }
  });
  return anchors;
}

function renderDbBackup() {
  return renderHookWithHarness(() => useDbBackup());
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

describe('useDbBackup — export à la frontière databaseRepository.export', () => {
  it('nominal : progression relayée et isBusy pendant l’opération, blob relayé tel quel, ancre „corpusense-backup-<date>.json“, toast succès, état retombé', async () => {
    const backupBlob = new Blob(['{"dexie-export-import-version":4}'], {
      type: 'application/json',
    });
    const resolvers: Array<(blob: Blob) => void> = [];
    const pending = new Promise<Blob>((resolve) => {
      resolvers.push(resolve);
    });
    exportSpy.mockImplementation(async (progressCallback) => {
      progressCallback(PROGRESS_PARTIELLE);
      return pending;
    });

    const { result, store, unmount } = renderDbBackup();
    expect(result.current.isBusy).toBe(false);
    expect(result.current.exportProgress).toBeNull();
    expect(result.current.importProgress).toBeNull();

    const clickedAnchors = captureAnchorClicks();
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');

    let operation: Promise<void> = Promise.resolve();
    await act(async () => {
      operation = result.current.exportDatabase();
    });
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isBusy).toBe(true);
    expect(result.current.exportProgress).toEqual(PROGRESS_PARTIELLE);
    expect(result.current.importProgress).toBeNull();

    await act(async () => {
      resolvers[0](backupBlob);
      await operation;
    });

    expect(result.current.isBusy).toBe(false);
    expect(result.current.exportProgress).toBeNull();
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledWith(backupBlob);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0].download).toMatch(/^corpusense-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(clickedAnchors[0].href).toMatch(/^blob:/);
    expect(toasts(store.getState())).toEqual([
      { message: i18n.t('toast_export_success'), type: EventType.INFO },
    ]);
    expect(importSpy).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();

    unmount();
  });

  it('échec à la frontière : console.error + pushError „toast_export_error“, rien passé à URL.createObjectURL, aucun clic, aucun toast succès', async () => {
    exportSpy.mockImplementation(async () => {
      throw new Error('export refused');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result, store, unmount } = renderDbBackup();
    const clickedAnchors = captureAnchorClicks();
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

    await act(async () => {
      await result.current.exportDatabase();
    });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(clickedAnchors).toHaveLength(0);
    expect(toasts(store.getState())).toEqual([
      { message: i18n.t('toast_export_error'), type: EventType.ERROR },
    ]);
    expect(result.current.isBusy).toBe(false);
    expect(result.current.exportProgress).toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

describe('useDbBackup — import à la frontière databaseRepository.import', () => {
  it('aucun fichier sélectionné : retour anticipé — repository non appelé, pas de toast, pas de reload, input NON réinitialisé (caractérisation : le finally n’est pas atteint)', async () => {
    const input = makeFileInput([]);
    const { result, store, unmount } = renderDbBackup();
    result.current.importInputRef.current = input;

    await act(async () => {
      await result.current.importDatabase(changeEvent(input));
    });

    expect(importSpy).not.toHaveBeenCalled();
    expect(toasts(store.getState())).toEqual([]);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(input.value).toBe('C:\\fakepath\\backup.json');
    expect(result.current.isBusy).toBe(false);

    unmount();
  });

  it('nominal : fichier passé par identité, progression et isBusy pendant l’opération, toast succès puis reload exactement une fois, importInputRef vidé', async () => {
    const file = new File(['{"dexie-export-import-version":4}'], 'backup.json', {
      type: 'application/json',
    });
    const input = makeFileInput([file]);
    const resolvers: Array<() => void> = [];
    const pending = new Promise<void>((resolve) => {
      resolvers.push(resolve);
    });
    importSpy.mockImplementation(async (_file, progressCallback) => {
      progressCallback(PROGRESS_PARTIELLE);
      return pending;
    });

    const { result, store, unmount } = renderDbBackup();
    result.current.importInputRef.current = input;

    let operation: Promise<void> = Promise.resolve();
    await act(async () => {
      operation = result.current.importDatabase(changeEvent(input));
    });
    expect(importSpy).toHaveBeenCalledTimes(1);
    expect(importSpy.mock.calls[0][0]).toBe(file);
    expect(result.current.isBusy).toBe(true);
    expect(result.current.importProgress).toEqual(PROGRESS_PARTIELLE);
    expect(result.current.exportProgress).toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolvers[0]();
      await operation;
    });

    expect(result.current.isBusy).toBe(false);
    expect(result.current.importProgress).toBeNull();
    expect(toasts(store.getState())).toEqual([
      { message: i18n.t('toast_import_success'), type: EventType.INFO },
    ]);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
    expect(exportSpy).not.toHaveBeenCalled();

    unmount();
  });

  it('échec à la frontière : pushError „toast_import_error“, AUCUN reload, input réinitialisé quand même (finally), base intacte (relecture par le vrai repository collections)', async () => {
    await seedCollection(makeCollection({ id: 'dbb-collection', name: 'Témoin' }));
    importSpy.mockRejectedValue(new Error('corrupted backup'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const file = new File(['peu importe'], 'backup.json');
    const input = makeFileInput([file]);
    const { result, store, unmount } = renderDbBackup();
    result.current.importInputRef.current = input;

    await act(async () => {
      await result.current.importDatabase(changeEvent(input));
    });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(toasts(store.getState())).toEqual([
      { message: i18n.t('toast_import_error'), type: EventType.ERROR },
    ]);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(result.current.isBusy).toBe(false);
    expect(result.current.importProgress).toBeNull();
    expect(input.value).toBe('');
    const read = await getCollectionRepository().getById('dbb-collection');
    expect(read.ok && read.value?.name).toBe('Témoin');

    unmount();
  });

  it('ref non monté pendant l’import : le finally saute la réinitialisation sous sa garde `if (importInputRef.current)` sans lever', async () => {
    const file = new File(['{"dexie-export-import-version":4}'], 'backup.json');
    importSpy.mockImplementation(async () => undefined);

    const { result, store, unmount } = renderDbBackup();
    // `importInputRef.current` reste nul (personne n'a monté le ref) — l'import doit
    // néanmoins aboutir, toast et reload compris.
    expect(result.current.importInputRef.current).toBeNull();

    await act(async () => {
      await result.current.importDatabase(changeEvent(makeFileInput([file])));
    });

    expect(toasts(store.getState())).toEqual([
      { message: i18n.t('toast_import_success'), type: EventType.INFO },
    ]);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isBusy).toBe(false);

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* Caractérisation S-08 (docs/securite.md) — consignée, pas légitimée   */
/* ------------------------------------------------------------------ */

describe('useDbBackup — caractérisation S-08 : import sans validation de schéma à la couche hook', () => {
  it('contenu arbitraire accepté par la frontière : transmis PAR IDENTITÉ, sans lecture ni backup préalable, succès annoncé et page rechargée', async () => {
    // REGISTRE DE SÉCURITÉ S-08 (docs/securite.md, A08) : « Import de base sans
    // validation de schéma du JSON importé ». Le correctif documenté (validation Zod
    // + résumé avant import + sauvegarde automatique préalable) est un CHANTIER
    // DISTINCT — ce test characterise l'absence de toute validation côté hook et
    // n'en aucun cas une légitimation : il est appelé à changer quand S-08 sera traité.
    const file = new File(['ceci n’est pas un export dexie'], 'arbitraire.json', {
      type: 'application/json',
    });
    const input = makeFileInput([file]);
    importSpy.mockImplementation(async () => undefined);

    const { result, store, unmount } = renderDbBackup();
    result.current.importInputRef.current = input;

    await act(async () => {
      await result.current.importDatabase(changeEvent(input));
    });

    // Rien n'est regardé avant la frontière : le File arrive tel quel…
    expect(importSpy).toHaveBeenCalledTimes(1);
    expect(importSpy.mock.calls[0][0]).toBe(file);
    // …aucune sauvegarde préalable n'est déclenchée (l'autre méthode de la frontière
    // n'est pas appelée)…
    expect(exportSpy).not.toHaveBeenCalled();
    // …et si la frontière réserve, le hook déclare le succès et recharge.
    expect(toasts(store.getState())).toEqual([
      { message: i18n.t('toast_import_success'), type: EventType.INFO },
    ]);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(result.current.importProgress).toBeNull();
    expect(result.current.isBusy).toBe(false);

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* triggerImportPicker                                                 */
/* ------------------------------------------------------------------ */

describe('useDbBackup — triggerImportPicker', () => {
  it('ref monté : déclenche exactement un clic sur l’input référencé', async () => {
    const input = makeFileInput([]);
    const inputClick = vi.spyOn(input, 'click').mockImplementation(() => {});
    const { result, unmount } = renderDbBackup();
    result.current.importInputRef.current = input;

    await act(async () => {
      result.current.triggerImportPicker();
    });

    expect(inputClick).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('ref non monté (current nul) : no-op silencieux, ne lève pas', async () => {
    const { result, unmount } = renderDbBackup();

    await act(async () => {
      expect(() => result.current.triggerImportPicker()).not.toThrow();
    });

    unmount();
  });
});
