/**
 * Lot 15 — useModelIO (cf. docs/roadmap.md, Q11).
 *
 * Périmètre : les chemins d'ajout / mise à jour / suppression de `useModelIO.tsx` sur le
 * repository modèles RÉEL (base Dexie réelle via le harnais du lot 0, écritures et
 * relectures par `getModelRepository()`), plus l'export à sa frontière navigateur :
 * - `saveModel` (l. 16-19) : délègue à `update` = `put` — vérifié par relecture en base :
 *   mise à jour d'un modèle existant, et upsert (création sous l'id fourni) caractérisé
 *   tel quel ; toast `pushInfo(info_model_saved)` posé dans la slice `events` du store
 *   réel ;
 * - `removeModel` (l. 21-23) : délègue à `deleteById` — vérifié par l'état de la base,
 *   sans aucun toast (suppression silencieuse, telle qu'implémentée) ;
 * - `importModel` (l. 44-70) : ajout sous l'id importé quand le nom est libre ; nom déjà
 *   pris + `overwrite` → écrasement de la ligne existante SOUS SON ID (l'id importé est
 *   jeté) ; nom déjà pris sans `overwrite` → seconde ligne « (imported) » sous uuid neuf ;
 *   schéma invalide et conflit d'id (`add` → ConstraintError) → `pushError` sans écriture ;
 * - `exportModel` (l. 25-42) : `FileSaver.saveAs` mocké à la frontière du module (précédent
 *   lot 3) — vérifié appelé une fois avec un Blob `application/json` dont le contenu est la
 *   ligne relue en base, sous le nom « <nom du modèle>.json » ; modèle absent → `pushError`
 *   sans appel à saveAs ; saveAs qui lève (frontière) → même canal `pushError`.
 *
 * Frontières : `file-saver` mocké (jsdom ne sait pas sauvegarder et `saveAs` s'appuie sur
 * `URL.createObjectURL`) ; lecture du contenu du Blob via `FileReader` — le `new Blob(…)`
 * global est l'implémentation jsdom, sans `.text()` (constat identique à
 * `useRepository.test.tsx:277`). Aucun mock de Dexie ni des repositories, aucun délai
 * artificiel, store réel (sagas non démarrées).
 *
 * Garde d'usage : AUCUNE (call sites vérifiés, règle du lot 15) — ni dans le hook, ni dans
 * ses appelants : `ModelCard.tsx:25-40` se contente d'un dialogue de confirmation avant
 * `removeModel` ; `ModelViewer.tsx:87-99` filtre les champs vides avant `saveModel` mais ne
 * consulte aucun usage (`openModelUsageList` n'est qu'un dialogue informatif). La branche
 * « suppression d'un modèle référencé par des collections » n'a donc PAS de contrat de
 * garde : elle est caractérisée telle qu'implémentée (suppression inconditionnelle,
 * `modelId` laissé pendant dans la collection), consignée ici sans la légitimer (règle 7),
 * idem pour la suppression d'un id inexistant (résolue, silencieuse).
 *
 * Autres caractérisations :
 * - `saveModel` sur un modèle absent CRÉE la ligne (`update` = `put`, models.ts:32-34) —
 *   jamais déclenché par les composants (on n'édite qu'un modèle chargé), verrouillé tel quel ;
 * - `importModel` dont l'`id` est déjà pris sous un autre nom passe par `add` → rejet
 *   `ConstraintError` de Dexie rattrapé par le `catch` → `pushError` générique : le message
 *   exact dépend de fake-indexeddb et n'est PAS verrouillé, seul le préfixe posé par le
 *   hook l'est ;
 * - les toasts `pushInfo(info_model_saved)` sont traduits par `i18n.t` — assert comparé à
 *   l'appel symétrique du même module (même convention que `useAnnotationActions.test.tsx`).
 *
 * Couverture : 100 % des lignes et branches de `useModelIO.tsx` (v8, mesuré à l'issue du
 * lot) — les deux blocs `catch` sont atteints (« saveAs lève », « conflit d'id »).
 */
import { DataModel } from '@/data/models/dataModel/dataModel';
import { Event, EventType } from '@/data/models/event';
import {
  getCollectionRepository,
  getModelRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import {
  makeCollection,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedCollection,
} from '@/hooks/__tests__/harness';
import i18n from '@/i18n';
import { RootState } from '@/state/store';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useModelIO } from '../useModelIO';

// Frontière navigateur (cf. en-tête) : `FileSaver.saveAs` est un espion.
const { saveAsMock } = vi.hoisted(() => ({
  saveAsMock: vi.fn<(blob: Blob, filename?: string) => void>(),
}));
vi.mock('file-saver', () => ({ default: { saveAs: saveAsMock } }));

resetTestDbBeforeEach();
beforeEach(() => {
  saveAsMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* Aides locales — la base réelle est la source d'observation          */
/* ------------------------------------------------------------------ */

let sequence = 0;

/** Modèle valide au sens `DataModelSchema` (strict), id et nom uniques par défaut. */
function makeModel(overrides: Partial<DataModel> = {}): DataModel {
  sequence += 1;
  return {
    id: overrides.id ?? `mio-model-${sequence}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: overrides.name ?? `Modèle ${sequence}`,
    prompt: overrides.prompt ?? 'prompt de test',
    fields: overrides.fields ?? [
      {
        id: `mio-field-${sequence}`,
        name: 'titre',
        type: 'string',
        color: '#a4d6f6',
        description: 'champ de test',
      },
    ],
  };
}

/** Écriture d'une ligne modèle par le VRAI repository, dates de fixture préservées. */
async function putModel(model: DataModel): Promise<void> {
  const written = await getModelRepository().importWithDates(model);
  if (!written.ok) throw written.error;
}

/** Relecture d'une ligne modèle par le VRAI repository (undefined si absente). */
async function readModel(id: string): Promise<DataModel | undefined> {
  const read = await getModelRepository().getById(id);
  return read.ok ? read.value : undefined;
}

async function allModels(): Promise<DataModel[]> {
  return await getModelRepository().getAll();
}

/** Les toasts tels que posés dans la slice `events` du store réel du harnais. */
function toasts(state: RootState): Event[] {
  return state.events.allEvents;
}

function renderModelIO() {
  return renderHookWithHarness(() => useModelIO());
}

/** Contenu texte d'un Blob — le `new Blob` global est celui de jsdom, sans `.text()`. */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader en échec'));
    reader.readAsText(blob);
  });
}

/* ------------------------------------------------------------------ */
/* saveModel — mise à jour                                             */
/* ------------------------------------------------------------------ */

describe('useModelIO — saveModel sur le repository modèles réel', () => {
  it('modèle existant : la ligne est remplacée en base et un pushInfo „modèle sauvegardé“ est posé', async () => {
    const model = makeModel({ id: 'mio-save-1', name: 'Avant' });
    await putModel(model);
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await result.current.saveModel({ ...model, name: 'Après', prompt: 'prompt modifié' });
    });

    expect(await readModel('mio-save-1')).toMatchObject({
      name: 'Après',
      prompt: 'prompt modifié',
    });
    expect(await allModels()).toHaveLength(1);
    expect(toasts(store.getState())).toEqual([
      { message: i18n.t('info_model_saved'), type: EventType.INFO },
    ]);

    unmount();
  });

  it('modèle absent : put crée la ligne sous l’id fourni (caractérisation upsert, même toast)', async () => {
    const fresh = makeModel({ id: 'mio-save-new' });
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await result.current.saveModel(fresh);
    });

    // Upsert de création : le repository initialise ses propres horodatages.
    const stored = await readModel('mio-save-new');
    expect(stored).toMatchObject({
      id: fresh.id,
      name: fresh.name,
      prompt: fresh.prompt,
      fields: fresh.fields,
    });
    expect(z.iso.datetime().safeParse(stored?.createdAt ?? '').success).toBe(true);
    expect(stored?.updatedAt).toBe(stored?.createdAt);
    expect(toasts(store.getState())).toEqual([
      { message: i18n.t('info_model_saved'), type: EventType.INFO },
    ]);

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* removeModel — suppression                                           */
/* ------------------------------------------------------------------ */

describe('useModelIO — removeModel sur le repository modèles réel', () => {
  it('modèle existant : la ligne disparaît de la base, aucun toast (suppression silencieuse)', async () => {
    await putModel(makeModel({ id: 'mio-remove-1' }));
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await result.current.removeModel('mio-remove-1');
    });

    expect(await readModel('mio-remove-1')).toBeUndefined();
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('id inexistant : la promesse se résout sans erreur ni écriture (caractérisation — aucune garde d’existence)', async () => {
    const { result, store, unmount } = renderModelIO();

    await expect(result.current.removeModel('mio-absent')).resolves.toBeUndefined();

    expect(await allModels()).toEqual([]);
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('modèle référencé par une collection : supprimé sans garde, référence laissée pendante (caractérisation — aucune garde d’usage, hook ni call sites)', async () => {
    await putModel(makeModel({ id: 'mio-used' }));
    await seedCollection(
      makeCollection({ id: 'mio-collection', name: 'Collection', modelId: 'mio-used' }),
    );
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await result.current.removeModel('mio-used');
    });

    expect(await readModel('mio-used')).toBeUndefined();
    // Côté collections : `modelId` reste écrit et ne pointe plus rien — la garde d'usage
    // est absente du hook ET de ses appelants (cf. en-tête) ; consigné, pas légitimé.
    const collection = await getCollectionRepository().getById('mio-collection');
    expect(collection.ok && collection.value.modelId).toBe('mio-used');
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* exportModel — frontière FileSaver                                   */
/* ------------------------------------------------------------------ */

describe('useModelIO — exportModel à la frontière FileSaver', () => {
  it('modèle présent : saveAs appelé une fois, „<nom>.json“, contenu = la ligne relue en base, aucun toast', async () => {
    const model = makeModel({ id: 'mio-export-1', name: 'Modèle à exporter' });
    await putModel(model);
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await result.current.exportModel('mio-export-1');
    });

    expect(saveAsMock).toHaveBeenCalledTimes(1);
    const [blob, filename] = saveAsMock.mock.calls[0];
    expect(filename).toBe('Modèle à exporter.json');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blobText(blob))).toEqual(model);
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('modèle absent : pushError „Error exporting model: … not found“, saveAs non appelé', async () => {
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await result.current.exportModel('mio-inconnu');
    });

    expect(saveAsMock).not.toHaveBeenCalled();
    expect(toasts(store.getState())).toEqual([
      {
        message: 'Error exporting model: DataModel with id mio-inconnu not found',
        type: EventType.ERROR,
      },
    ]);

    unmount();
  });

  it('saveAs lève (frontière) : console.error + pushError reprenant le message, sans rejet', async () => {
    await putModel(makeModel({ id: 'mio-export-throw', name: 'Modèle' }));
    saveAsMock.mockImplementationOnce(() => {
      throw new Error('sauvegarde impossible');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await expect(result.current.exportModel('mio-export-throw')).resolves.toBeUndefined();
    });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(toasts(store.getState())).toEqual([
      { message: 'Error exporting model: sauvegarde impossible', type: EventType.ERROR },
    ]);

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* importModel — ajout et mise à jour par import                       */
/* ------------------------------------------------------------------ */

describe('useModelIO — importModel sur le repository modèles réel', () => {
  it('schéma invalide : pushError „Error importing model: Invalid model structure“ et aucune écriture', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await result.current.importModel({ id: 'mio-bad', name: 'Sans prompt ni fields' }, false);
    });

    expect(await allModels()).toEqual([]);
    expect(toasts(store.getState())).toEqual([
      { message: 'Error importing model: Invalid model structure', type: EventType.ERROR },
    ]);
    expect(consoleError).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('nom libre : ajouté sous l’id importé, succès silencieux (aucun toast)', async () => {
    const imported = makeModel({ id: 'mio-import-1', name: 'Modèle importé' });
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await result.current.importModel(imported, false);
    });

    // Horodatages initialisés par le repository à l'écriture, tout le reste conservé.
    const stored = await readModel('mio-import-1');
    expect({ ...stored, createdAt: '', updatedAt: '' }).toEqual({
      ...imported,
      createdAt: '',
      updatedAt: '',
    });
    expect(z.iso.datetime().safeParse(stored?.createdAt ?? '').success).toBe(true);
    expect(z.iso.datetime().safeParse(stored?.updatedAt ?? '').success).toBe(true);
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('nom déjà pris + overwrite : la ligne existante est écrasée SOUS SON ID, l’id importé est jeté', async () => {
    const existing = makeModel({ id: 'mio-existing', name: 'Doublon' });
    await putModel(existing);
    const imported = makeModel({
      id: 'mio-import-id-perdu',
      name: 'Doublon',
      prompt: 'prompt importé',
    });
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await result.current.importModel(imported, true);
    });

    expect(await allModels()).toHaveLength(1);
    expect(await readModel('mio-existing')).toMatchObject({
      name: 'Doublon',
      prompt: 'prompt importé',
      fields: imported.fields,
    });
    expect(await readModel('mio-import-id-perdu')).toBeUndefined();
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('nom déjà pris sans overwrite : seconde ligne „ (imported)“ sous uuid neuf, l’originale intacte', async () => {
    const existing = makeModel({ id: 'mio-keep', name: 'Doublon' });
    await putModel(existing);
    const imported = makeModel({
      id: 'mio-import-other-id',
      name: 'Doublon',
      prompt: 'autre prompt',
    });
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await result.current.importModel(imported, false);
    });

    expect(await allModels()).toHaveLength(2);
    expect(await readModel('mio-keep')).toEqual(existing);
    // La copie importée : ni l'id du JSON importé, ni celui de l'originale (uuid tiré par
    // le hook) — seul le nom suffixé est contractuel, retrouvé en base par ce nom.
    const copy = (await allModels()).find((model) => model.name === 'Doublon (imported)');
    expect(copy).toBeDefined();
    expect(copy?.id).not.toBe('mio-keep');
    expect(copy?.id).not.toBe('mio-import-other-id');
    expect(copy?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(copy?.prompt).toBe('autre prompt');
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('id déjà pris sous un autre nom : add en ConstraintError → pushError „Error importing model: …“, base intacte', async () => {
    const existing = makeModel({ id: 'mio-clash', name: 'Occupé' });
    await putModel(existing);
    const imported = makeModel({ id: 'mio-clash', name: 'Nouveau nom sans conflit de nom' });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, store, unmount } = renderModelIO();

    await act(async () => {
      await result.current.importModel(imported, false);
    });

    // Le préfixe est posé par le hook ; la suite dépend du message Dexie/fake-indexeddb
    // (caractérisation en-tête) et n'est pas verrouillée.
    const events = toasts(store.getState());
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(EventType.ERROR);
    expect(events[0].message).toMatch(/^Error importing model: /);
    expect(await allModels()).toHaveLength(1);
    expect(await readModel('mio-clash')).toEqual(existing);
    expect(consoleError).toHaveBeenCalledTimes(1);

    unmount();
  });
});
