/**
 * Lot 18 — useModifierChainIO (cf. docs/roadmap.md, Q11).
 *
 * Périmètre : persistance et suppression de chaîne dans `useModifierChainIO.tsx` sur le
 * repository RÉEL (base Dexie réelle via le harnais du lot 0 ; écritures et relectures par
 * `getModifierChainRepository()`). La sémantique du repository (`add`/`put`/`getByName`/
 * `delete`, not-found typés) est déjà verrouillée couche data (`modifierChain.test.ts`,
 * campagne Q2) — seul le logic propre au hook est testé ici, rien sur la réactivité
 * (`useModifierChainLive`, coquille liveQuery du lot 34).
 *
 * - `saveModifierChain` (l. 7-35) :
 *   - chaîne vide → retour anticipé (l. 12) : rien n'est écrit, et la ligne du MÊME NOM est
 *     laissée intacte (le `getByName` comme le `put` sont atteints après la garde). Dans
 *     l'UI courante le bouton de sauvegarde n'apparaît qu'avec au moins un modificateur
 *     (`ModifierChainFlow.tsx:311-320`) et le formulaire n'est ouvert que de là : la garde
 *     est défensive, jamais déclenchée par les composants — caractérisée telle quelle ;
 *   - upsert par nom (l. 15-17) : nom libre → ligne créée sous uuid neuf ; nom existant →
 *     id de la ligne existante REPRIS et contenu remplacé (le `put` écrase sous la clé
 *     primaire). Le hook ne reçoit aucun drapeau d'écrasement : la garde « nom déjà pris »
 *     est en AMONT, au niveau du formulaire (`SaveModifierChainForm.tsx:43-51`,
 *     `nameAlreadyExists` via `useModifierChainLive` ; la case `overwrite` ne conditionne
 *     que la validité du formulaire et n'est pas propagée à l'appel, l. 66-68). Call sites
 *     vérifiés (règle du lot 15) : `saveModifierChain` n'est appelé QUE de ce formulaire —
 *     au niveau du hook, aucune garde d'écrasement, verrouillée comme telle ;
 *   - normalisation des valeurs (l. 19-32) : `values[modifier.id] ?? {}` (l. 23) puis
 *     `schema.parse` (l. 24) — une clé absente donne les défauts du schéma, les valeurs
 *     stockées sont le résultat parsé (défauts ajoutés, clés inconnues retirées par zod),
 *     pas le brut fourni ;
 *   - valeurs non conformes → `schema.parse` lève (ZodError) AVANT le `put` (l. 34) : la
 *     promesse est rejetée et la base reste inchangée — y compris la ligne du même nom,
 *     intacte ; le hook ne rattrape pas (aucun catch dans le fichier).
 *
 * - `loadModifierChain` (l. 37-39) : délégation pure à `getModifiersAndValues`
 *   (`src/data/utils/modifierChain.ts`). Testée ici seulement pour le trajet aller-retour
 *   observable à la frontière du hook (persisté par `saveModifierChain` → base réelle →
 *   relu : modificateurs typés portant leur id de ligne, valeurs indexées par id, nom).
 *   Le détail de reconstruction (registry, `UnknownModifierTypeError`) appartient à la
 *   couche data, non re-testé. Chaîne absente : le rejet `EntityNotFoundError` de
 *   l'utilitaire traverse le hook sans être rattrapé — les call sites font ce qu'ils en
 *   veulent (`ModifierChainFlow.tsx:201-203` logge, `LoadModifierChainForm.tsx:52` ne
 *   capture pas). Signal lot 38 : cet utilitaire n'a pas de suite propre dans la campagne
 *   Q2 ; il n'est exercé ici qu'indirectement, par les bords de ce hook.
 *
 * - `removeModifierChain` (l. 41-44) : délégation à `delete` du repository réel, silencieuse
 *   (le hook ne pose AUCUN toast — aucun dispatch `events` nulle part dans le fichier,
 *   vérifié à chaque mutation par la slice `events` du store réel). Id inexistant → promesse
 *   résolue sans écriture (call site unique `ModifierChainCard.tsx:32`, simple dialogue de
 *   confirmation avant l'appel). Chaîne référencée par une collection
 *   (`postOcrModifierChainId`/`postLayoutModifierChainId`, consommés par les sagas peroocr/
 *   layoutExtraction/customWorker) → supprimée sans AUCUNE garde d'usage, ni dans le hook ni
 *   dans ses call sites : référence laissée pendante, caractérisée et consignée (règle 7),
 *   pas légitimée — précédent lot 15 (aucune garde d'usage inventée).
 *
 * Frontières : aucun mock dans ce fichier. Pas de mock de Dexie ni du stockage, aucun délai
 * artificiel, store réel (sagas non démarrées), vrais repositories.
 *
 * Couverture mesurée à l'issue du lot (v8) : voir rapport — l'intégralité des lignes et
 * branches du fichier est atteinte (garde vide, ternaire d'id, `??` des deux côtés, rejet
 * avant `put`, les trois fonctions).
 */
import { Event } from '@/data/models/event';
import { ModifierChain } from '@/data/models/modifiers/Modifier';
import { ModifierChainDTO } from '@/data/models/modifiers/modifierChain.dto';
import { modifierRegistry } from '@/data/models/modifiers/ModifierFactory';
import { EntityNotFoundError } from '@/data/repositories/EntityNotFoundError';
import {
  getCollectionRepository,
  getModifierChainRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import {
  makeCollection,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedCollection,
} from '@/hooks/__tests__/harness';
import { RootState } from '@/state/store';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import useModifierChainIO from '../useModifierChainIO';

resetTestDbBeforeEach();

/* ------------------------------------------------------------------ */
/* Aides locales — la base réelle est la source d'observation          */
/* ------------------------------------------------------------------ */

let sequence = 0;

/** Nom unique par test, pour que `getByName` soit une lecture non ambiguë. */
function uniqueName(label: string): string {
  sequence += 1;
  return `Chaîne ${label} ${sequence}`;
}

/** Vrais modificateurs du registry (mêmes objets que l'UI de `ModifierChainFlow`). */
function makeModifier(type: 'FilterModifier' | 'ReOrderModifier') {
  return modifierRegistry[type].create();
}

/** Écriture d'une ligne chaîne par le VRAI repository. */
async function putChain(chain: ModifierChainDTO): Promise<ModifierChain> {
  return await getModifierChainRepository().put(chain);
}

/** Relecture par id (undefined si absente). */
async function readChain(id: string): Promise<ModifierChain | undefined> {
  const read = await getModifierChainRepository().getById(id);
  return read.ok ? read.value : undefined;
}

/** Relecture par nom (undefined si absente). */
async function chainNamed(name: string): Promise<ModifierChain | undefined> {
  const read = await getModifierChainRepository().getByName(name);
  return read.ok ? read.value : undefined;
}

async function allChains(): Promise<ModifierChain[]> {
  return await getModifierChainRepository().getAll();
}

/** Les toasts tels que posés dans la slice `events` du store réel du harnais. */
function toasts(state: RootState): Event[] {
  return state.events.allEvents;
}

function renderChainIO() {
  return renderHookWithHarness(() => useModifierChainIO());
}

/* ------------------------------------------------------------------ */
/* saveModifierChain — persistance sur le repository réel              */
/* ------------------------------------------------------------------ */

describe('useModifierChainIO — saveModifierChain sur le repository chaînes réel', () => {
  it('nom libre : une ligne est créée sous uuid neuf, modificateur typé et valeurs parsées en base', async () => {
    const name = uniqueName('nouvelle');
    const filter = makeModifier('FilterModifier');
    const { result, store, unmount } = renderChainIO();

    await act(async () => {
      await result.current.saveModifierChain(name, [filter], {
        [filter.id]: { filterType: 'LP', threshold: 5, dimension: 'height' },
      });
    });

    const row = await chainNamed(name);
    expect(row?.name).toBe(name);
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.modifiers).toEqual([
      {
        id: filter.id,
        type: 'FilterModifier',
        values: { filterType: 'LP', threshold: 5, dimension: 'height' },
      },
    ]);
    // Sauvegarde silencieuse : le hook ne dispatch aucun toast (cf. en-tête).
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('nom existant : upsert par nom — id de la ligne repris, contenu remplacé, aucune seconde ligne (pas de garde au niveau du hook)', async () => {
    const name = uniqueName('doublon');
    await putChain({
      id: 'mco-existing',
      name,
      modifiers: [{ id: 'mco-ancien-modificateur', type: 'FilterModifier', values: {} }],
    });
    const reorder = makeModifier('ReOrderModifier');
    const { result, unmount } = renderChainIO();

    await act(async () => {
      await result.current.saveModifierChain(name, [reorder], {});
    });

    // Le modificateur d'origine a disparu de la ligne (remplacement, pas de fusion) et les
    // valeurs sont les défauts du schéma : la clé fournie était vide (branche `?? {}`).
    const storedChain = await readChain('mco-existing');
    expect({ ...storedChain, createdAt: '', updatedAt: '' }).toEqual({
      id: 'mco-existing',
      name,
      modifiers: [{ id: reorder.id, type: 'ReOrderModifier', values: { order: 'TL2BR' } }],
      createdAt: '',
      updatedAt: '',
    });
    expect(z.iso.datetime().safeParse(storedChain?.createdAt ?? '').success).toBe(true);
    expect(z.iso.datetime().safeParse(storedChain?.updatedAt ?? '').success).toBe(true);
    expect(await allChains()).toHaveLength(1);

    unmount();
  });

  it('aucun modificateur : retour anticipé — rien n’est écrit et la ligne du même nom reste intacte (garde défensive, hors de portée de l’UI courante)', async () => {
    const kept = uniqueName('gardée');
    const fresh = uniqueName('jamais créée');
    const seed = { id: 'mco-keep', name: kept, modifiers: [] } satisfies ModifierChainDTO;
    const storedSeed = await putChain(seed);
    const { result, store, unmount } = renderChainIO();

    await act(async () => {
      await result.current.saveModifierChain(kept, [], {});
      await result.current.saveModifierChain(fresh, [], {});
    });

    expect(await allChains()).toEqual([storedSeed]);
    expect(await chainNamed(fresh)).toBeUndefined();
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('valeurs normalisées par schema.parse : clés absentes comblées aux défauts, clés inconnues retirées', async () => {
    const name = uniqueName('normalisée');
    const filter = makeModifier('FilterModifier');
    const reorder = makeModifier('ReOrderModifier');
    const { result, unmount } = renderChainIO();

    await act(async () => {
      await result.current.saveModifierChain(name, [filter, reorder], {
        [filter.id]: { filterType: 'LP', cleInconnue: 42 },
        // aucune clé pour reorder.id → branche `values[modifier.id] ?? {}` (l. 23)
      });
    });

    const row = await chainNamed(name);
    // `toEqual` verrouille le retrait de `cleInconnue` (zod strip) et l'ajout des défauts.
    expect(row?.modifiers).toEqual([
      {
        id: filter.id,
        type: 'FilterModifier',
        values: { filterType: 'LP', threshold: 0, dimension: 'width' },
      },
      { id: reorder.id, type: 'ReOrderModifier', values: { order: 'TL2BR' } },
    ]);

    unmount();
  });

  it('valeurs non conformes au schéma : rejet ZodError avant tout put — base inchangée, ligne du même nom intacte', async () => {
    const name = uniqueName('rejet');
    const seed = {
      id: 'mco-bad-name',
      name,
      modifiers: [{ id: 'mco-intact', type: 'FilterModifier', values: {} }],
    } satisfies ModifierChainDTO;
    const storedSeed = await putChain(seed);
    const filter = makeModifier('FilterModifier');
    const otherName = uniqueName('autre rejet');
    const { result, unmount } = renderChainIO();

    // `threshold: -5` viole `z.number().min(0)` du schéma FilterModifier.
    await act(async () => {
      await expect(
        result.current.saveModifierChain(name, [filter], { [filter.id]: { threshold: -5 } }),
      ).rejects.toBeInstanceOf(z.ZodError);
    });
    expect(await readChain('mco-bad-name')).toEqual(storedSeed);

    // Nom libre : le rejet part avant le `put`, aucune ligne n'est créée.
    await act(async () => {
      await expect(
        result.current.saveModifierChain(otherName, [filter], { [filter.id]: { threshold: -5 } }),
      ).rejects.toBeInstanceOf(z.ZodError);
    });
    expect(await allChains()).toEqual([storedSeed]);

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* loadModifierChain — délégation observable en base réelle            */
/* ------------------------------------------------------------------ */

describe('useModifierChainIO — loadModifierChain sur le repository chaînes réel', () => {
  it('aller-retour : la ligne persistée par saveModifierChain est relue — modificateurs typés portant leur id, valeurs par id, nom', async () => {
    const name = uniqueName('retour');
    const filter = makeModifier('FilterModifier');
    const reorder = makeModifier('ReOrderModifier');
    const filterValues = { filterType: 'HP', threshold: 12, dimension: 'area' };
    const { result, unmount } = renderChainIO();

    await act(async () => {
      await result.current.saveModifierChain(name, [filter, reorder], {
        [filter.id]: filterValues,
        [reorder.id]: { order: 'TL2BR' },
      });
    });
    const row = await chainNamed(name);
    expect(row).toBeDefined();

    let loaded: Awaited<ReturnType<typeof result.current.loadModifierChain>> | undefined;
    await act(async () => {
      loaded = await result.current.loadModifierChain((row as ModifierChainDTO).id);
    });

    // Instances reconstruites par le registry de l'utilitaire data : on compare par
    // (id, type) et par contenu, jamais par identité (détail hors périmètre, cf. en-tête).
    expect(loaded?.name).toBe(name);
    expect(loaded?.modifiers.map((modifier) => [modifier.id, modifier.type])).toEqual([
      [filter.id, 'FilterModifier'],
      [reorder.id, 'ReOrderModifier'],
    ]);
    expect(loaded?.modifierValues[filter.id]).toEqual(filterValues);
    expect(loaded?.modifierValues[reorder.id]).toEqual({ order: 'TL2BR' });

    unmount();
  });

  it('id inexistant : le rejet EntityNotFoundError de l’utilitaire data traverse le hook sans être rattrapé', async () => {
    const { result, unmount } = renderChainIO();

    await expect(result.current.loadModifierChain('mco-inexistant')).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* removeModifierChain — suppression sur le repository réel            */
/* ------------------------------------------------------------------ */

describe('useModifierChainIO — removeModifierChain sur le repository chaînes réel', () => {
  it('chaîne existante : la ligne disparaît de la base, aucun toast (suppression silencieuse)', async () => {
    await putChain({ id: 'mco-del', name: uniqueName('à supprimer'), modifiers: [] });
    const { result, store, unmount } = renderChainIO();

    await act(async () => {
      await result.current.removeModifierChain('mco-del');
    });

    expect(await readChain('mco-del')).toBeUndefined();
    expect(await allChains()).toEqual([]);
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('id inexistant : la promesse se résout sans erreur et sans toucher aux autres lignes (caractérisation — aucune garde d’existence)', async () => {
    const kept = {
      id: 'mco-keep-2',
      name: uniqueName('intacte'),
      modifiers: [],
    } satisfies ModifierChainDTO;
    const storedKept = await putChain(kept);
    const { result, store, unmount } = renderChainIO();

    await expect(result.current.removeModifierChain('mco-absent')).resolves.toBeUndefined();

    expect(await allChains()).toEqual([storedKept]);
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('chaîne référencée par une collection : supprimée sans garde d’usage, référence laissée pendante (caractérisation — hook ni call sites)', async () => {
    await putChain({ id: 'mco-referenced', name: uniqueName('référencée'), modifiers: [] });
    await seedCollection(
      makeCollection({
        id: 'mco-collection',
        name: 'Collection',
        postOcrModifierChainId: 'mco-referenced',
      }),
    );
    const { result, store, unmount } = renderChainIO();

    await act(async () => {
      await result.current.removeModifierChain('mco-referenced');
    });

    expect(await readChain('mco-referenced')).toBeUndefined();
    // Côté collections : le champ reste écrit et ne pointe plus rien — la garde d'usage est
    // absente du hook ET de son unique call sites (`ModifierChainCard`, simple dialogue de
    // confirmation) ; consigné, pas légitimé (règle 7, précédent lot 15).
    const collection = await getCollectionRepository().getById('mco-collection');
    expect(collection.ok && collection.value.postOcrModifierChainId).toBe('mco-referenced');
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });
});
