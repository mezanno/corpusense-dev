/**
 * Lots 6-7 — useAnnotationActions (cf. docs/roadmap.md, Q11). Un hook, une suite :
 * le lot 6 (`test(hooks): cover useAnnotationActions save and update`, commit bbecdca6) couvre
 * l'enregistrement et la mise à jour (lignes 50-107 du source) ; le lot 7 couvre la
 * duplication, la recomputation et la suppression en masse, plus les coquilles de délégation
 * de la réserve (lignes 109-326) — le hook est complet à l'issue des deux lots.
 *
 * Périmètre lot 6 : le comportement propre du hook, sur le vrai stack via le harnais du lot 0 :
 * - `saveAnnotation` : ordre `max + 1` calculé par le hook sur les SEULS TEXT_REGION du
 *   canvas (les lignes du même canvas, fût-ce à un ordre supérieur, sont écartées par le
 *   filtre de type — lignes 66-70 du source) et `1` sur canvas vide (ternaire ligne 70) ;
 *   la portée passée à `getByScope` est vérifiée par l'effet (une région sur l'AUTRE canvas
 *   de la même collection ne doit pas faire monter l'ordre au-delà de 1) ;
 * - `updateAnnotation` : aucune écriture ni toast quand l'enregistré est identique
 *   (compteur de mutations via l'API publique RÉELLE `db.annotations.hook('updating')`, le
 *   contenu étant par nature indiscernable après une écriture identique) ; écriture +
 *   toast `toast_annotation_saved` quand différente (toasts observés par les actions du
 *   store réel du harnais, slice `events`, jamais par un composant toast mocké) ; type ET
 *   valeur fournis régénèrent les bodies (lignes 86-92), type seul ignoré ; annotation
 *   absente de la base (`!existingAnnotationResult.ok`, ligne 98 vrai — le repository ne
 *   throw jamais, cf. campagne Q2) → écriture + toast.
 * La sémantique des repositories annotations et collection (re-classement d'ordre au
 * changement de type, tri par `order`, isolement des scopes) est verrouillée par
 * `annotations.test.ts` (campagne Q2) : seule la logique propre du hook est assertionnée ;
 * les ordres réassignés par le repository lors du test de bodies ne sont pas assertés.
 *
 * Frontières : base Dexie réelle, écritures uniquement par le vrai repository
 * (`putAnnotation` ci-dessous, délégation du hook) ; AUCUN `vi.mock` dans ce fichier,
 * aucun délai artificiel. Seule injection de faute : `db.annotations.hook('reading')` qui
 * fait échouer toute LECTURE d'annotation tant qu'elle est montée, retirée en `finally` —
 * même précédent que le lot 4 (`failReading` sur `db.collections`) et que
 * `failResultWritesForTask` de `testDb.ts` : le mécanisme d'accès reste réel, la lecture
 * échoue pour de vrai. Elle est nécessaire car le repository réel ne throw jamais sur
 * `getById` (il renvoie `{ ok: false, EntityNotFoundError }`) : sans elle, le `catch` du
 * hook (lignes 104-106) serait inatteignable. Comme au lot 4, l'accès aux hooks de table
 * passe par l'import direct de `db`, hors de la réserve des repositories
 * (`no-restricted-imports`) — décompte remonté à la campagne, pas de correction
 * silencieuse du config ESLint ici.
 *
 * Caractérisations (règle 7 — documentées, pas corrigées) :
 * - le `catch` de `updateAnnotation` avale l'erreur en `console.warn` sans AUCUN canal de
 *   retour (ni valeur — le hook renvoie `void` — ni `pushError`) : l'appelant ne peut pas
 *   savoir que l'enregistrement a échoué. Verrouillé tel quel : en cas d'échec de lecture,
 *   la promesse SE RESOUT, aucune écriture n'a lieu, aucun toast n'est émis (test « erreur
 *   de lecture ») ;
 * - ligne 68, le repli `a.order ?? -1` est défensif : tout chemin d'écriture réel pose un
 *   `order` (modèle `Annotation` l'exige, `addAll` et `update` du repository le
 *   calculent) — le côté droit n'est pas atteignable sans violer le type en base ;
 * - ligne 89, `type ?? annotationToSave.type` : la garde d'entrée (ligne 86) exige
 *   `type !== undefined`, le côté droit est structurellement inatteignable — code mort,
 *   pas un trou de test ;
 * - `saveAnnotation` ignore le `type`/la `value` de l'annotation annotorious reçue (ligne
 *   59-60, TEXT_REGION et valeur figée) : le test verrouille cet écrasement, seul appelant
 *   concerné (`CanvasViewerAnnotations.tsx:106`, création de dessin).
 *
 * Couverture lot 6 : 100 % des énoncés et des branches de `saveAnnotation` (lignes 50-73)
 * et `updateAnnotation` (lignes 81-107), aux deux droites de `??` près, structurellement
 * inatteignables et justifiées ci-dessus.
 *
 * ------------------------------------------------------------------
 *
 * Périmètre du lot 7 (suite et fin du hook), sur le même harnais :
 * - `duplicateRegions` (lignes 117-157) + son helper `duplicateAnnotationsToPages`
 *   (lignes 159-194) : distributions `ALL_PAGES`/`EACH2_PAGES` — la parité des index est
 *   relative à l'index de référence du canvas source (ligne 140), testée paire ET impaire —
 *   et bornes `BEFORE`/`AFTER` (`ALL` = pas de filtre) ; les régions déjà posées sur chaque
 *   canvas cible sont SUPPRIMÉES puis remplacées par les duplicatas (les autres types —
 *   lignes, TEMP — survivent, la portée du filtre étant `[TEXT_REGION]`) ; le canvas source
 *   est exclu des cibles (ligne 153) et jamais réécrit ; collection introuvable →
 *   `pushError(error_collection_not_found)` et canvas absent du content →
 *   `pushError(error_collection_no_canvas)`, sans aucune écriture dans les deux cas. Les
 *   duplicatas sont vérifiés par l'état final de la base réelle (ids nouveaux, géométrie et
 *   valeur recopiées, collection conservée) ; les `order` posés par `addAll` sont la
 *   sémantique du repository (verrouillée par `annotations.test.ts`, campagne Q2) et ne sont
 *   pas assertionnés — la campagne Q2 fixe aussi l'isolement des scopes et le reclassement
 *   après `deleteByIds`.
 * - `recomputeRegions` (lignes 196-269) : par canvas de la collection, les régions existantes
 *   sont supprimées puis remplacées soit par l'emprise `union` des lignes du canvas
 *   (minBy/maxBy, lignes 228-235), soit, sans ligne, par une région pleine page
 *   `0,0,canvas.width,canvas.height` avec repli 1000 sur les dimensions manquantes
 *   (lignes 260-261, canvas légitime au sens IIIF : « A Canvas MAY have the width ») ;
 *   erreur du repository collection → PROMESSE REJETÉE (ligne 206) — atteignable avec le
 *   VRAI repository sans injection : `getCanvasesByCollectionId` propage le `{ ok: false }`
 *   de `getById` sur une collection absente ; le hook n'émet AUCUN toast, ni au succès ni
 *   en erreur (caractérisation).
 * - `removeAnnotationsInside` (lignes 287-310) : non-région → `pushError(error_annotation_is_not_region)`
 *   sans écriture ; sinon suppression par `contains` géométrique INCLUSIVE de tout type
 *   d'annotation du même canvas — jamais la région-contenant elle-même (`contains` renvoie
 *   false à id égal, verrouillé Q2) ; erreur de lecture → `pushError(getErrorMessage(e))`.
 * - coquilles de délégation de la réserve, vérifiées par l'état final de la base et la
 *   forme du résultat, sans re-tester la sémantique Q2 : `updateAnnotationOrder`
 *   (lignes 109-115), `removeAnnotationsByIds` (lignes 271-278), `removeAnnotationsByScope`
 *   (lignes 281-284), `getParentAnnotation` (lignes 312-314) ; et mesure d'abonnements /
 *   identité des callbacks annoncée ici par l'en-tête du lot 6.
 *
 * Frontières lot 7 : toujours base Dexie réelle et écritures par les vrais repositories,
 * aucun `vi.mock`, aucun délai artificiel. Les chemins `catch` des coquilles et de
 * `duplicateAnnotationsToPages` (lignes 191-193, 275-277, 306-309, et 112-114) ne sont
 * atteignables qu'en faute d'infrastructure — le repository ne rejette que si Dexie rejette.
 * Injection utilisée : `failAnnotationReads` ci-dessous, variante factorisée du mécanisme
 * du lot 6 (`db.annotations.hook('reading')`, retirée en `finally`) — elle fait échouer
 * toute LECTURE d'annotation (get, sortBy/toArray, bulkGet : le hook `reading` de Dexie est
 * branché sur ces trois chemins). Le toast de succès/erreur reste observé par la slice
 * `events` du store réel, jamais par un mock de composant toast.
 *
 * Caractérisations lot 7 (règle 7 — documentées, pas corrigées) :
 * - `duplicateRegions` toaste `toast_duplicate_success` APRÈS le helper sans rien vérifier
 *   de son sort (ligne 156) : succès annoncé même si la duplication a échoué en interne
 *   (`catch` du helper, lignes 191-193, `console.warn` avalé — test « erreur de lecture
 *   pendant la duplication »), même s'il n'y avait AUCUNE région source (test « aucune région
 *   sur le canvas source » — les régions déjà posées sur les cibles survivent alors, le
 *   `if (annotations.length > 0)` ligne 166 gardant aussi les suppressions), et même sans
 *   aucune cible (test « content d'une seule page »). Canal d'erreur incohérent avec
 *   `removeAnnotationsInside` qui, lui, `pushError` sur le même type d'échec — remonté, pas
 *   corrigé ;
 * - `recomputeRegions` mute la base en silence : aucun toast, aucune valeur de retour
 *   (tests « emprise union » et « sans ligne ni dimensions ») ; son rejet (test « erreur du
 *   repository collection ») n'est pas non plus converti en toast — l'appelant doit le
 *   prendre en charge lui-même ;
 * - ligne 170, `if (id !== scope.canvasId)` re-filtique des ids déjà exclus ligne 153 : la
 *   branche fausse est structurellement inatteignable par l'unique appelant — garde
 *   défensive morte, pas un trou de test ;
 * - lignes 228-235, les chaînages `?.` après `minBy`/`maxBy` et la conjonction de gardes
 *   ligne 236 ne sont faux que si `minBy`/`maxBy` renvoient `undefined` sur un tableau
 *   NON vide, c'est-à-dire avec des coordonnées NaN — le modèle `Annotation` typant ses
 *   bounds en `number` et la fabrique `createAnnotation` les exigeant, aucune écriture
 *   légitime ne les atteint : branches défensives, justifiées sans scénario ;
 * - lignes 260-261, le repli `?? 1000` sur des dimensions absentes est arbitraire (ni log
 *   ni erreur) : verrouillé tel quel (test « sans ligne ni dimensions ») ;
 * - les callbacks du hook ne sont pas mémoïsés (aucun `useCallback`, contrairement à
 *   `useCollectionActions`) : identité nouvelle à chaque render — mesurée au test
 *   d'abonnements, la mémoïzation du repository (`useMemo`, ligne 44) est la seule identité
 *   stable du hook ;
 * - `removeAnnotationsInside` sélectionne par géométrie TOUS les types du canvas — y compris
 *   d'autres régions emboîtées, qui partent avec les lignes (test « filtre géométrique ») —
 *   et n'émet le toast `toast_annotation_deleted` qu'avec le nombre d'ids réellement passés
 *   au repository.
 *
 * Couverture (mesurée à l'issue du lot 7, v8, sur `useAnnotationActions.tsx` seul) :
 * 100 % des énoncés (138/138), des fonctions (33/33) et des lignes (124/124) ; branches
 * 92,59 % (50/54) — les 4 branches manquantes sont EXACTEMENT les gardes déclarées mortes
 * ci-dessus : lignes 68 et 89 (droites de `??`, lot 6) et lignes 170 et 236 (lot 7).
 * Aucune branche atteignable ne reste sans test.
 */
import manifestFixture from '@/__tests__/manifest.json';
import { Annotation, ElementType } from '@/data/models/annotations/annotation';
import { getAnnotationType, getAnnotationValue } from '@/data/models/annotations/annotation.utils';
import { Event, EventType } from '@/data/models/event';
import { AddSourceDTO } from '@/data/models/source/source.dto';
import { db } from '@/data/repositories/indexeddb/db';
import { getAnnotationRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  FIXTURE_CANVAS_IDS,
  makeAnnotation,
  makeCollection,
  makeCollectionElement,
  makeRemoteSource,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedCollection,
  seedRemoteSource,
} from '@/hooks/__tests__/harness';
import i18n from '@/i18n';
import { BaseError } from '@/utils/BaseError';
import { NotFoundError } from '@/utils/NotFoundError';
import { ImageAnnotation, ShapeType } from '@annotorious/annotorious';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import {
  DuplicateDistribution,
  DuplicateLimit,
  DuplicateRegionsPayload,
  useAnnotationActions,
} from '../useAnnotationActions';

resetTestDbBeforeEach();

type Actions = ReturnType<typeof useAnnotationActions>;
type Store = ReturnType<typeof renderActions>['store'];

function renderActions() {
  return renderHookWithHarness<Actions>(() => useAnnotationActions());
}

/** Écriture d'une annotation à ordre explicite par le VRAI repository (put, sans reclassement : l'id est neuf). */
async function putAnnotation(annotation: Annotation): Promise<void> {
  await getAnnotationRepository().update(annotation);
}

/** Relecture par le VRAI repository (la base est la seule source d'observation). */
async function readAnnotation(id: string): Promise<Annotation> {
  const read = await getAnnotationRepository().getById(id);
  if (!read.ok) throw read.error;
  return read.value;
}

/** Le toast de sauvegarde tel que posé dans la slice `events` par `pushInfo`. */
function savedToast(): Event {
  return { message: i18n.t('toast_annotation_saved'), type: EventType.INFO };
}

function toasts(store: Store): Event[] {
  return store.getState().events.allEvents;
}

/** Dessin annotorious brut (ce que livre `createAnnotation` d'Annotorious) : id + target, sans portée ni type métier. */
function makeDrawnRegion(id: string): ImageAnnotation {
  return {
    id,
    bodies: [],
    target: {
      annotation: id,
      selector: {
        type: ShapeType.RECTANGLE,
        geometry: { bounds: { minX: 10, minY: 20, maxX: 40, maxY: 60 } },
      },
    },
  };
}

describe('useAnnotationActions — saveAnnotation', () => {
  it('canvas ayant des régions : ordre max + 1 des TEXT_REGION seuls, les lignes du même canvas ne comptent pas', async () => {
    const canvas = FIXTURE_CANVAS_IDS[0];
    await putAnnotation(
      makeAnnotation({
        id: 'aa-s1-r1',
        collectionId: 'aa-s1',
        canvasId: canvas,
        type: ElementType.TEXT_REGION,
        order: 2,
      }),
    );
    await putAnnotation(
      makeAnnotation({
        id: 'aa-s1-r2',
        collectionId: 'aa-s1',
        canvasId: canvas,
        type: ElementType.TEXT_REGION,
        order: 7,
      }),
    );
    // Ligne à ordre supérieur sur le même canvas : le filtre de type du hook doit l'écarter
    // (sinon l'ordre calculé serait 10, pas 8).
    await putAnnotation(
      makeAnnotation({
        id: 'aa-s1-l1',
        collectionId: 'aa-s1',
        canvasId: canvas,
        type: ElementType.TEXT_LINE,
        order: 9,
      }),
    );

    const { result, unmount } = renderActions();
    const drawn = makeDrawnRegion('aa-s1-new');
    await act(async () => {
      await expect(result.current.saveAnnotation(drawn, canvas, 'aa-s1')).resolves.toBeUndefined();
    });

    const saved = await readAnnotation('aa-s1-new');
    expect(saved.order).toBe(8);
    expect(saved.canvasId).toBe(canvas);
    expect(saved.collectionId).toBe('aa-s1');
    // Écrasement caractérisé : type TEXT_REGION et valeur vide imposés par le hook, bodies
    // recalculées avec l'id de l'annotation (géométrie et id du dessin conservés par le spread).
    expect(getAnnotationType(saved)).toBe(ElementType.TEXT_REGION);
    expect(getAnnotationValue(saved)).toBe('');
    expect(saved.target).toEqual(drawn.target);
    expect(saved.bodies.map((body) => body.id)).toEqual(['aa-s1-new/class', 'aa-s1-new/tag']);

    // Rien d'autre n'a bouclé : les trois écritures témoins gardent leurs ordres.
    const scope = await getAnnotationRepository().getByScope({
      canvasId: canvas,
      collectionId: 'aa-s1',
    });
    expect(scope.map((a) => [a.id, a.order])).toEqual([
      ['aa-s1-r1', 2],
      ['aa-s1-r2', 7],
      ['aa-s1-new', 8],
      ['aa-s1-l1', 9],
    ]);

    unmount();
  });

  it('canvas vide : ordre 1, même quand la collection a déjà des régions sur un autre canvas', async () => {
    const [canvasA, canvasB] = FIXTURE_CANVAS_IDS;
    await putAnnotation(
      makeAnnotation({
        id: 'aa-s2-r1',
        collectionId: 'aa-s2',
        canvasId: canvasA,
        type: ElementType.TEXT_REGION,
        order: 5,
      }),
    );

    const { result, unmount } = renderActions();
    await act(async () => {
      await expect(
        result.current.saveAnnotation(makeDrawnRegion('aa-s2-new'), canvasB, 'aa-s2'),
      ).resolves.toBeUndefined();
    });

    // La portée canvas+collection passée à getByScope est prouvée par l'effet : si le hook
    // balayait toute la collection, l'ordre serait 6.
    expect(await readAnnotation('aa-s2-new')).toMatchObject({ order: 1, canvasId: canvasB });
    expect(await readAnnotation('aa-s2-r1')).toMatchObject({ order: 5, canvasId: canvasA });

    unmount();
  });
});

describe('useAnnotationActions — updateAnnotation', () => {
  it('annotation identique à l’enregistrée : aucune écriture, aucun toast', async () => {
    await putAnnotation(
      makeAnnotation({
        id: 'aa-u-same',
        collectionId: 'aa-u-same',
        type: ElementType.TEXT_LINE,
        value: 'Texte',
        order: 4,
      }),
    );
    const stored = await readAnnotation('aa-u-same');
    const { result, store, unmount } = renderActions();

    // Copie profonde non identique en référence mais isEqual-identique en valeur : seule
    // une écriture réelle serait observable, le contenu ne changerait pas.
    const clone = structuredClone(stored);
    let writes = 0;
    const countWrite = () => {
      writes += 1;
    };
    db.annotations.hook('updating', countWrite);
    try {
      await act(async () => {
        await expect(result.current.updateAnnotation(clone)).resolves.toBeUndefined();
      });
    } finally {
      db.annotations.hook('updating').unsubscribe(countWrite);
    }

    expect(writes).toBe(0);
    expect(toasts(store)).toEqual([]);
    expect(await readAnnotation('aa-u-same')).toEqual(clone);

    unmount();
  });

  it('annotation différente de l’enregistrée : écriture en base réelle et toast toast_annotation_saved', async () => {
    await putAnnotation(
      makeAnnotation({
        id: 'aa-u-diff',
        collectionId: 'aa-u-diff',
        type: ElementType.TEXT_LINE,
        value: 'Ancien',
        order: 2,
      }),
    );
    const { result, store, unmount } = renderActions();

    const modified = structuredClone(await readAnnotation('aa-u-diff'));
    modified.bodies[1] = { ...modified.bodies[1], value: 'Nouveau' };
    await act(async () => {
      await expect(result.current.updateAnnotation(modified)).resolves.toBeUndefined();
    });

    expect(getAnnotationValue(await readAnnotation('aa-u-diff'))).toBe('Nouveau');
    expect(toasts(store)).toEqual([savedToast()]);

    unmount();
  });

  it('type et valeur fournis : bodies régénérées par createBodies sur l’id de l’annotation', async () => {
    await putAnnotation(
      makeAnnotation({
        id: 'aa-u-bodies',
        collectionId: 'aa-u-bodies',
        type: ElementType.TEXT_REGION,
        value: 'vieux',
        order: 1,
      }),
    );
    const { result, store, unmount } = renderActions();

    const passed = structuredClone(await readAnnotation('aa-u-bodies'));
    await act(async () => {
      await expect(
        result.current.updateAnnotation(passed, ElementType.TEXT_LINE, 'Nouveau texte'),
      ).resolves.toBeUndefined();
    });

    const saved = await readAnnotation('aa-u-bodies');
    expect(saved.type).toBe(ElementType.TEXT_LINE);
    expect(getAnnotationType(saved)).toBe(ElementType.TEXT_LINE);
    expect(getAnnotationValue(saved)).toBe('Nouveau texte');
    expect(saved.bodies.map((body) => body.id)).toEqual(['aa-u-bodies/class', 'aa-u-bodies/tag']);
    expect(toasts(store)).toEqual([savedToast()]);
    // Le reclassement d'ordre déclenché par le changement de type est la sémantique du
    // repository (verrouillée Q2) : volontairement non assertionné ici.

    unmount();
  });

  it('type fourni sans valeur : rien n’est régénéré, la seule modification de bodies est écrite', async () => {
    await putAnnotation(
      makeAnnotation({
        id: 'aa-u-partial',
        collectionId: 'aa-u-partial',
        type: ElementType.TEXT_LINE,
        value: 'Initial',
        order: 3,
      }),
    );
    const { result, store, unmount } = renderActions();

    const modified = structuredClone(await readAnnotation('aa-u-partial'));
    modified.bodies[1] = { ...modified.bodies[1], value: 'Modifié seul' };
    await act(async () => {
      await expect(
        result.current.updateAnnotation(modified, ElementType.TEXT_REGION, undefined),
      ).resolves.toBeUndefined();
    });

    // La régénération des bodies exige type ET valeur : le `type` seul est ignoré,
    // l'annotation passe telle quelle au repository (différente → écrite + toastée).
    const saved = await readAnnotation('aa-u-partial');
    expect(getAnnotationType(saved)).toBe(ElementType.TEXT_LINE);
    expect(getAnnotationValue(saved)).toBe('Modifié seul');
    expect(toasts(store)).toEqual([savedToast()]);

    unmount();
  });

  it('annotation absente de la base : le { ok: false } du repository déclenche écriture et toast', async () => {
    const { result, store, unmount } = renderActions();

    const fresh = makeAnnotation({
      id: 'aa-u-new',
      collectionId: 'aa-u-new',
      type: ElementType.TEXT_LINE,
      value: 'Jamais enregistrée',
      order: 3,
    });
    await act(async () => {
      await expect(result.current.updateAnnotation(fresh)).resolves.toBeUndefined();
    });

    // Le repository ne throw jamais sur une absence : c'est la branche `!ok` du hook, qui
    // écrit (création) et toaste comme pour toute différence.
    expect(await readAnnotation('aa-u-new')).toEqual(fresh);
    expect(toasts(store)).toEqual([savedToast()]);

    unmount();
  });

  it('erreur de lecture du repository : promesse résolue, ni écriture ni toast (injection de faute documentée)', async () => {
    await putAnnotation(
      makeAnnotation({
        id: 'aa-u-fail',
        collectionId: 'aa-u-fail',
        type: ElementType.TEXT_LINE,
        value: 'Initial',
        order: 1,
      }),
    );
    const { result, store, unmount } = renderActions();

    // Différente en base : sans erreur de lecture, ce serait écrite et toastée.
    const modified = structuredClone(await readAnnotation('aa-u-fail'));
    modified.bodies[1] = { ...modified.bodies[1], value: 'Serait écrit' };

    const failReading = () => {
      throw new BaseError('aa-lecture-en-echec');
    };
    db.annotations.hook('reading', failReading);
    try {
      await act(async () => {
        await expect(result.current.updateAnnotation(modified)).resolves.toBeUndefined();
      });
    } finally {
      db.annotations.hook('reading').unsubscribe(failReading);
    }

    // Le catch avale (console.warn, caractérisation d'en-tête) : la promesse se résout,
    // la base et le store n'ont rien vu passer.
    expect(getAnnotationValue(await readAnnotation('aa-u-fail'))).toBe('Initial');
    expect(toasts(store)).toEqual([]);

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* Lot 7 — helpers partagés                                            */
/* ------------------------------------------------------------------ */

type Bounds4 = [number, number, number, number];

function infoEvent(message: string): Event {
  return { message, type: EventType.INFO };
}

function errorEvent(message: string): Event {
  return { message, type: EventType.ERROR };
}

const infoToast = (key: string): Event => infoEvent(i18n.t(key));
const errorToast = (key: string): Event => errorEvent(i18n.t(key));
const deletedToast = (count: number): Event =>
  infoEvent(i18n.t('toast_annotation_deleted', { count }));

function boundOf(annotation: Annotation): Bounds4 {
  const { minX, minY, maxX, maxY } = annotation.target.selector.geometry.bounds;
  return [minX, minY, maxX, maxY];
}

function tuple(bounds: { minX: number; minY: number; maxX: number; maxY: number }): Bounds4 {
  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
}

function sortedBounds(annotations: Annotation[]): Bounds4[] {
  return annotations.map(boundOf).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

/** États finaux : régions par canvas, relu par le VRAI repository (la base est la source d'observation). */
async function regionBoundsByCanvas(
  collectionId: string,
  canvasIds: string[],
): Promise<Record<string, Bounds4[]>> {
  const out: Record<string, Bounds4[]> = {};
  for (const canvasId of canvasIds) {
    out[canvasId] = sortedBounds(
      await getAnnotationRepository().getByScopeAndTypes({ canvasId, collectionId }, [
        ElementType.TEXT_REGION,
      ]),
    );
  }
  return out;
}

async function idsOnCanvas(canvasId: string, collectionId: string): Promise<string[]> {
  const annotations = await getAnnotationRepository().getByScope({ canvasId, collectionId });
  return annotations.map((a) => a.id);
}

/** Collection dont le content cite les canvas donnés, dans cet ordre. */
async function seedCollectionWithCanvases(id: string, canvasIds: string[]): Promise<void> {
  await seedCollection(
    makeCollection({
      id,
      name: `Collection ${id}`,
      content: canvasIds.map((canvasId) => makeCollectionElement({ canvasId })),
    }),
  );
}

/** Collection citant les canvas RÉELS d'une source fixture (seule voie vers les dimensions de canvas). */
async function seedCanvasesWithRealSource(id: string, canvasIds: string[]): Promise<void> {
  const source = await seedRemoteSource(makeRemoteSource({ name: `Source ${id}` }));
  await seedCollection(
    makeCollection({
      id,
      name: `Collection ${id}`,
      content: canvasIds.map((canvasId) =>
        makeCollectionElement({ canvasId, sourceId: source.id, manifestId: undefined }),
      ),
    }),
  );
}

/** Région écrite par le VRAI repository (put, id neuf : pas de reclassement). */
async function putRegion(
  id: string,
  collectionId: string,
  canvasId: string,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  value = 'source',
): Promise<void> {
  await putAnnotation(
    makeAnnotation({ id, collectionId, canvasId, type: ElementType.TEXT_REGION, bounds, value }),
  );
}

async function putLine(
  id: string,
  collectionId: string,
  canvasId: string,
  bounds?: { minX: number; minY: number; maxX: number; maxY: number },
): Promise<void> {
  await putAnnotation(
    makeAnnotation({
      id,
      collectionId,
      canvasId,
      type: ElementType.TEXT_LINE,
      value: 'ligne',
      bounds,
    }),
  );
}

async function duplicateRegions(actions: Actions, payload: DuplicateRegionsPayload): Promise<void> {
  await act(async () => {
    await expect(actions.duplicateRegions(payload)).resolves.toBeUndefined();
  });
}

async function recomputeRegions(actions: Actions, collectionId: string): Promise<void> {
  await act(async () => {
    await expect(actions.recomputeRegions(collectionId)).resolves.toBeUndefined();
  });
}

/**
 * Monte la faute : toute LECTURE d'annotation échoue tant que le cleanup n'est pas appelé.
 * Mécanisme réel (hook Dexie `reading`, branché sur get / itération / bulkGet), retiré en
 * `finally` — même précédent que le lot 6 (cf. en-tête).
 */
function failAnnotationReads(message: string): () => void {
  const failReading = () => {
    throw new BaseError(message);
  };
  db.annotations.hook('reading', failReading);
  return () => {
    db.annotations.hook('reading').unsubscribe(failReading);
  };
}

const BOUNDS_A = { minX: 10, minY: 20, maxX: 30, maxY: 40 };
const BOUNDS_B = { minX: 50, minY: 60, maxX: 70, maxY: 80 };
const BOUNDS_M = { minX: 200, minY: 200, maxX: 201, maxY: 201 };
const A = tuple(BOUNDS_A);
const B = tuple(BOUNDS_B);
const M = tuple(BOUNDS_M);

describe('useAnnotationActions — duplicateRegions', () => {
  it('ALL_PAGES + ALL : toutes les autres pages reçoivent les régions, les régions cibles sont remplacées, les autres types survivent', async () => {
    const [c0, c1, c2, c3, c4] = FIXTURE_CANVAS_IDS;
    const canvasIds = [c0, c1, c2, c3, c4];
    await seedCollectionWithCanvases('dup-all', canvasIds);
    await putRegion('dup-all-src-a', 'dup-all', c2, BOUNDS_A);
    await putRegion('dup-all-src-b', 'dup-all', c2, BOUNDS_B);
    // Sur la cible c0 : une région à remplacer, une ligne et une TEMP à conserver.
    await putRegion('dup-all-old-0', 'dup-all', c0, BOUNDS_M);
    await putLine('dup-all-line-0', 'dup-all', c0);
    await putAnnotation(
      makeAnnotation({
        id: 'dup-all-temp-0',
        collectionId: 'dup-all',
        canvasId: c0,
        type: ElementType.TEMP,
      }),
    );

    const { result, store, unmount } = renderActions();
    await duplicateRegions(result.current, {
      scope: { canvasId: c2, collectionId: 'dup-all' },
      distribution: DuplicateDistribution.ALL_PAGES,
      limit: DuplicateLimit.ALL,
    });

    expect(toasts(store)).toEqual([infoToast('toast_duplicate_success')]);
    // Toute cible (et la source, intacte) porte exactement A et B.
    expect(await regionBoundsByCanvas('dup-all', canvasIds)).toEqual({
      [c0]: [A, B],
      [c1]: [A, B],
      [c2]: [A, B],
      [c3]: [A, B],
      [c4]: [A, B],
    });
    // La région cible préexistante est supprimée, les autres types survivent.
    const onC0 = await idsOnCanvas(c0, 'dup-all');
    expect(onC0).toContain('dup-all-line-0');
    expect(onC0).toContain('dup-all-temp-0');
    expect(onC0).not.toContain('dup-all-old-0');
    // Le canvas source est EXCLU des cibles : mêmes ids, rien de dupliqué sur lui-même.
    expect(await idsOnCanvas(c2, 'dup-all')).toEqual(['dup-all-src-a', 'dup-all-src-b']);
    // Duplicatas : ids neufs, collection conservée, valeur recopiée.
    const dupC4 = await getAnnotationRepository().getByScopeAndTypes(
      { canvasId: c4, collectionId: 'dup-all' },
      [ElementType.TEXT_REGION],
    );
    expect(dupC4.map((a) => a.canvasId)).toEqual([c4, c4]);
    expect(dupC4.map((a) => getAnnotationValue(a))).toEqual(['source', 'source']);
    expect(new Set(dupC4.map((a) => a.collectionId))).toEqual(new Set(['dup-all']));
    expect(dupC4.map((a) => a.id)).not.toContain('dup-all-src-a');

    unmount();
  });

  it('EACH2_PAGES, référence à index pair : seules les pages d’index pair sont ciblées', async () => {
    const [c0, c1, c2, c3, c4] = FIXTURE_CANVAS_IDS;
    const canvasIds = [c0, c1, c2, c3, c4];
    await seedCollectionWithCanvases('dup-e2-pair', canvasIds);
    await putRegion('dup-e2p-src', 'dup-e2-pair', c2, BOUNDS_A);
    await putRegion('dup-e2p-mark-1', 'dup-e2-pair', c1, BOUNDS_M);
    await putRegion('dup-e2p-mark-3', 'dup-e2-pair', c3, BOUNDS_M);

    const { result, store, unmount } = renderActions();
    await duplicateRegions(result.current, {
      scope: { canvasId: c2, collectionId: 'dup-e2-pair' },
      distribution: DuplicateDistribution.EACH2_PAGES,
      limit: DuplicateLimit.ALL,
    });

    // Parité paire (baseIndex 2) : index pairs {0,2,4} retenus, cibles {c0, c4} ; les
    // impairs {c1, c3} gardent leur région témoin intacte.
    expect(await regionBoundsByCanvas('dup-e2-pair', canvasIds)).toEqual({
      [c0]: [A],
      [c1]: [M],
      [c2]: [A],
      [c3]: [M],
      [c4]: [A],
    });
    expect(await idsOnCanvas(c1, 'dup-e2-pair')).toEqual(['dup-e2p-mark-1']);
    expect(await idsOnCanvas(c3, 'dup-e2-pair')).toEqual(['dup-e2p-mark-3']);
    expect(toasts(store)).toEqual([infoToast('toast_duplicate_success')]);

    unmount();
  });

  it('EACH2_PAGES, référence à index impair : la parité s’inverse, seules les pages impaires sont ciblées', async () => {
    const [c0, c1, c2, c3, c4] = FIXTURE_CANVAS_IDS;
    const canvasIds = [c0, c1, c2, c3, c4];
    await seedCollectionWithCanvases('dup-e2-impair', canvasIds);
    await putRegion('dup-e2i-src', 'dup-e2-impair', c1, BOUNDS_A);
    await putRegion('dup-e2i-mark-0', 'dup-e2-impair', c0, BOUNDS_M);
    await putRegion('dup-e2i-mark-2', 'dup-e2-impair', c2, BOUNDS_M);
    await putRegion('dup-e2i-mark-3', 'dup-e2-impair', c3, BOUNDS_M);
    await putRegion('dup-e2i-mark-4', 'dup-e2-impair', c4, BOUNDS_M);

    const { result, store, unmount } = renderActions();
    await duplicateRegions(result.current, {
      scope: { canvasId: c1, collectionId: 'dup-e2-impair' },
      distribution: DuplicateDistribution.EACH2_PAGES,
      limit: DuplicateLimit.ALL,
    });

    // baseIndex 1 (impair) → index impairs {1,3} retenus, cible unique c3, dont la région
    // témoin est REMPLACÉE (nouvel id) : la parité est relative à l'index de référence.
    expect(await regionBoundsByCanvas('dup-e2-impair', canvasIds)).toEqual({
      [c0]: [M],
      [c1]: [A],
      [c2]: [M],
      [c3]: [A],
      [c4]: [M],
    });
    expect(await idsOnCanvas(c3, 'dup-e2-impair')).not.toEqual(['dup-e2i-mark-3']);
    expect(toasts(store)).toEqual([infoToast('toast_duplicate_success')]);

    unmount();
  });

  it('ALL_PAGES + BEFORE : seules les pages jusqu’à la référence (incluse) sont ciblées', async () => {
    const [c0, c1, c2, c3, c4] = FIXTURE_CANVAS_IDS;
    const canvasIds = [c0, c1, c2, c3, c4];
    await seedCollectionWithCanvases('dup-before', canvasIds);
    await putRegion('dup-bef-src', 'dup-before', c2, BOUNDS_A);
    for (const canvasId of [c0, c1, c3, c4]) {
      await putRegion(`dup-bef-mark-${canvasId.slice(-2)}`, 'dup-before', canvasId, BOUNDS_M);
    }

    const { result, store, unmount } = renderActions();
    await duplicateRegions(result.current, {
      scope: { canvasId: c2, collectionId: 'dup-before' },
      distribution: DuplicateDistribution.ALL_PAGES,
      limit: DuplicateLimit.BEFORE,
    });

    expect(await regionBoundsByCanvas('dup-before', canvasIds)).toEqual({
      [c0]: [A],
      [c1]: [A],
      [c2]: [A],
      [c3]: [M],
      [c4]: [M],
    });
    expect(toasts(store)).toEqual([infoToast('toast_duplicate_success')]);

    unmount();
  });

  it('ALL_PAGES + AFTER : seules les pages à partir de la référence (incluse) sont ciblées', async () => {
    const [c0, c1, c2, c3, c4] = FIXTURE_CANVAS_IDS;
    const canvasIds = [c0, c1, c2, c3, c4];
    await seedCollectionWithCanvases('dup-after', canvasIds);
    await putRegion('dup-aft-src', 'dup-after', c2, BOUNDS_A);
    await putRegion('dup-aft-mark-0', 'dup-after', c0, BOUNDS_M);
    await putRegion('dup-aft-mark-1', 'dup-after', c1, BOUNDS_M);

    const { result, store, unmount } = renderActions();
    await duplicateRegions(result.current, {
      scope: { canvasId: c2, collectionId: 'dup-after' },
      distribution: DuplicateDistribution.ALL_PAGES,
      limit: DuplicateLimit.AFTER,
    });

    expect(await regionBoundsByCanvas('dup-after', canvasIds)).toEqual({
      [c0]: [M],
      [c1]: [M],
      [c2]: [A],
      [c3]: [A],
      [c4]: [A],
    });
    expect(toasts(store)).toEqual([infoToast('toast_duplicate_success')]);

    unmount();
  });

  it('EACH2_PAGES + AFTER, référence paire : les deux filtres se composent (cible unique)', async () => {
    const [c0, c1, c2, c3, c4] = FIXTURE_CANVAS_IDS;
    const canvasIds = [c0, c1, c2, c3, c4];
    await seedCollectionWithCanvases('dup-e2-after', canvasIds);
    await putRegion('dup-e2a-src', 'dup-e2-after', c2, BOUNDS_A);
    await putRegion('dup-e2a-mark-0', 'dup-e2-after', c0, BOUNDS_M);

    const { result, store, unmount } = renderActions();
    await duplicateRegions(result.current, {
      scope: { canvasId: c2, collectionId: 'dup-e2-after' },
      distribution: DuplicateDistribution.EACH2_PAGES,
      limit: DuplicateLimit.AFTER,
    });

    // Pairs ET ≥ 2 → {c2, c4} ; c2 exclu en tant que source : cible unique c4.
    expect(await regionBoundsByCanvas('dup-e2-after', canvasIds)).toEqual({
      [c0]: [M],
      [c1]: [],
      [c2]: [A],
      [c3]: [],
      [c4]: [A],
    });
    expect(toasts(store)).toEqual([infoToast('toast_duplicate_success')]);

    unmount();
  });

  it('aucune région sur le canvas source : rien n’est dupliqué NI supprimé, toast de succès quand même (caractérisation)', async () => {
    const [c0, c1, c2] = FIXTURE_CANVAS_IDS;
    await seedCollectionWithCanvases('dup-vide', [c0, c1, c2]);
    await putLine('dup-vide-line-src', 'dup-vide', c2);
    await putRegion('dup-vide-mark-0', 'dup-vide', c0, BOUNDS_M);

    const { result, store, unmount } = renderActions();
    await duplicateRegions(result.current, {
      scope: { canvasId: c2, collectionId: 'dup-vide' },
      distribution: DuplicateDistribution.ALL_PAGES,
      limit: DuplicateLimit.ALL,
    });

    // Garde `annotations.length > 0` (ligne 166) : sans région source, la boucle — ET DONC
    // les suppressions sur les cibles — est court-circuitée ; le succès est pourtant annoncé.
    expect(await regionBoundsByCanvas('dup-vide', [c0, c1])).toEqual({ [c0]: [M], [c1]: [] });
    expect(await idsOnCanvas(c0, 'dup-vide')).toEqual(['dup-vide-mark-0']);
    expect(toasts(store)).toEqual([infoToast('toast_duplicate_success')]);

    unmount();
  });

  it('content d’une seule page (la source) : aucune cible, rien n’est dupliqué, toast de succès', async () => {
    const [c0] = FIXTURE_CANVAS_IDS;
    await seedCollectionWithCanvases('dup-unique', [c0]);
    await putRegion('dup-uni-src', 'dup-unique', c0, BOUNDS_A);

    const { result, store, unmount } = renderActions();
    await duplicateRegions(result.current, {
      scope: { canvasId: c0, collectionId: 'dup-unique' },
      distribution: DuplicateDistribution.ALL_PAGES,
      limit: DuplicateLimit.ALL,
    });

    expect(await idsOnCanvas(c0, 'dup-unique')).toEqual(['dup-uni-src']);
    expect(toasts(store)).toEqual([infoToast('toast_duplicate_success')]);

    unmount();
  });

  it('collection introuvable : pushError(error_collection_not_found) et rien n’est dupliqué', async () => {
    const [c0, c1] = FIXTURE_CANVAS_IDS;
    // Des régions bien réelles, mais dans une collection jamais écrite en base.
    await putRegion('dup-abs-src', 'dup-inconnue', c0, BOUNDS_A);
    await putRegion('dup-abs-mark', 'dup-inconnue', c1, BOUNDS_M);

    const { result, store, unmount } = renderActions();
    await duplicateRegions(result.current, {
      scope: { canvasId: c0, collectionId: 'dup-inconnue' },
      distribution: DuplicateDistribution.ALL_PAGES,
      limit: DuplicateLimit.ALL,
    });

    expect(toasts(store)).toEqual([errorToast('error_collection_not_found')]);
    expect(await idsOnCanvas(c0, 'dup-inconnue')).toEqual(['dup-abs-src']);
    expect(await idsOnCanvas(c1, 'dup-inconnue')).toEqual(['dup-abs-mark']);

    unmount();
  });

  it('canvas hors du content de la collection : pushError(error_collection_no_canvas) et rien n’est dupliqué', async () => {
    const [c0, c1] = FIXTURE_CANVAS_IDS;
    await seedCollectionWithCanvases('dup-sans-canvas', [c0]);
    await putRegion('dup-sc-src', 'dup-sans-canvas', c1, BOUNDS_A);

    const { result, store, unmount } = renderActions();
    await duplicateRegions(result.current, {
      scope: { canvasId: c1, collectionId: 'dup-sans-canvas' },
      distribution: DuplicateDistribution.ALL_PAGES,
      limit: DuplicateLimit.ALL,
    });

    expect(toasts(store)).toEqual([errorToast('error_collection_no_canvas')]);
    expect(await idsOnCanvas(c1, 'dup-sans-canvas')).toEqual(['dup-sc-src']);
    expect(await idsOnCanvas(c0, 'dup-sans-canvas')).toEqual([]);

    unmount();
  });

  it('erreur de lecture pendant la duplication : échec avalé par le helper, toast de succès quand même (caractérisation, injection de faute)', async () => {
    const [c0, c1] = FIXTURE_CANVAS_IDS;
    await seedCollectionWithCanvases('dup-fail', [c0, c1]);
    await putRegion('dup-fail-src', 'dup-fail', c0, BOUNDS_A);
    await putRegion('dup-fail-mark', 'dup-fail', c1, BOUNDS_M);

    const { result, store, unmount } = renderActions();
    const cleanup = failAnnotationReads('dup10-lecture-en-echec');
    try {
      await duplicateRegions(result.current, {
        scope: { canvasId: c0, collectionId: 'dup-fail' },
        distribution: DuplicateDistribution.ALL_PAGES,
        limit: DuplicateLimit.ALL,
      });
    } finally {
      cleanup();
    }

    // Le `catch` du helper (lignes 191-193) console-warn sans remonter ; duplicateRegions
    // toaste le succès quoi qu'il arrive (ligne 156) : ni écriture, ni suppression, mais
    // succès annoncé — incohérent avec removeAnnotationsInside, qui pushError (cf. en-tête).
    expect(toasts(store)).toEqual([infoToast('toast_duplicate_success')]);
    expect(await regionBoundsByCanvas('dup-fail', [c0, c1])).toEqual({
      [c0]: [A],
      [c1]: [M],
    });
    expect(await idsOnCanvas(c1, 'dup-fail')).toEqual(['dup-fail-mark']);

    unmount();
  });
});

describe('useAnnotationActions — recomputeRegions', () => {
  it('canvas avec lignes : emprise union des bounds, les régions existantes sont remplacées et les lignes conservées ; canvas sans ligne : région pleine page', async () => {
    const [c0, c1] = FIXTURE_CANVAS_IDS;
    await seedCanvasesWithRealSource('rc-union', [c0, c1]);
    await putRegion('rc-u-old-0', 'rc-union', c0, { minX: 0, minY: 0, maxX: 999, maxY: 999 });
    await putLine('rc-u-l1', 'rc-union', c0, { minX: 5, minY: 10, maxX: 25, maxY: 15 });
    await putLine('rc-u-l2', 'rc-union', c0, { minX: 2, minY: 20, maxX: 30, maxY: 28 });
    await putLine('rc-u-l3', 'rc-union', c0, { minX: 8, minY: 4, maxX: 12, maxY: 7 });
    await putRegion('rc-u-old-1', 'rc-union', c1, BOUNDS_M);

    const { result, store, unmount } = renderActions();
    await recomputeRegions(result.current, 'rc-union');

    const [, item1] = manifestFixture.items;
    expect(await regionBoundsByCanvas('rc-union', [c0, c1])).toEqual({
      [c0]: [[2, 4, 30, 28]], // union des trois lignes : minX 2, minY 4, maxX 30, maxY 28
      [c1]: [[0, 0, item1.width, item1.height]], // pleine page : dimensions réelles du canvas
    });
    // Les régions remplacées ont disparu, les lignes sont intactes (scope [TEXT_REGION]).
    expect(await idsOnCanvas(c0, 'rc-union')).not.toContain('rc-u-old-0');
    expect(await idsOnCanvas(c0, 'rc-union')).toEqual(
      expect.arrayContaining(['rc-u-l1', 'rc-u-l2', 'rc-u-l3']),
    );
    expect(await idsOnCanvas(c1, 'rc-union')).not.toEqual(['rc-u-old-1']);
    // Caractérisation : la recomputation mute la base en silence — aucun toast.
    expect(toasts(store)).toEqual([]);

    unmount();
  });

  it('canvas sans ligne ni dimensions : région pleine page au repli 1000×1000 (manifest IIIF sans width/height)', async () => {
    const noDimCanvas = 'https://example.org/manifest/sans-dimensions/canvas/1';
    const item: Record<string, unknown> = structuredClone(manifestFixture.items[0]);
    delete item.width;
    delete item.height;
    item.id = noDimCanvas;
    const source = await seedRemoteSource({
      type: 'remote',
      name: 'Source sans dimensions',
      pageCount: 1,
      thumbnailBlob: new Blob(['thumbnail de test']),
      manifest: {
        ...manifestFixture,
        id: 'https://example.org/manifest/sans-dimensions',
        items: [item],
      },
    } as unknown as AddSourceDTO);
    await seedCollection(
      makeCollection({
        id: 'rc-nodim',
        content: [
          makeCollectionElement({
            canvasId: noDimCanvas,
            sourceId: source.id,
            manifestId: undefined,
          }),
        ],
      }),
    );

    const { result, store, unmount } = renderActions();
    await recomputeRegions(result.current, 'rc-nodim');

    expect(await regionBoundsByCanvas('rc-nodim', [noDimCanvas])).toEqual({
      [noDimCanvas]: [[0, 0, 1000, 1000]],
    });
    expect(toasts(store)).toEqual([]);

    unmount();
  });

  it('erreur du repository collection : la promesse est REJETÉE par le vrai repository, sans toast (collection absente)', async () => {
    const [c0] = FIXTURE_CANVAS_IDS;
    await putRegion('rc-x-region', 'rc-inconnue', c0, BOUNDS_A);

    const { result, store, unmount } = renderActions();
    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.recomputeRegions('rc-inconnue').catch((e: unknown) => e);
    });

    // Pas d'injection nécessaire : getCanvasesByCollectionId propage le { ok: false } de
    // getById (collection absente) et le hook JETTE l'erreur (ligne 206).
    expect(thrown).toBeInstanceOf(NotFoundError);
    expect((thrown as Error).message).toBe('Collection with id rc-inconnue not found');
    expect(toasts(store)).toEqual([]);
    expect(await idsOnCanvas(c0, 'rc-inconnue')).toEqual(['rc-x-region']);

    unmount();
  });

  it('collection au content vide : aucune écriture, promesse résolue', async () => {
    await seedCollection(makeCollection({ id: 'rc-vide', content: [] }));

    const { result, store, unmount } = renderActions();
    await recomputeRegions(result.current, 'rc-vide');

    expect(toasts(store)).toEqual([]);
    expect(await getAnnotationRepository().getByScope({ collectionId: 'rc-vide' })).toEqual([]);

    unmount();
  });
});

describe('useAnnotationActions — removeAnnotationsInside', () => {
  it('annotation non-région : pushError(error_annotation_is_not_region) et rien n’est supprimé', async () => {
    const [c0] = FIXTURE_CANVAS_IDS;
    await putLine('rai-t1-line', 'rai-1', c0, BOUNDS_A);
    await putLine('rai-t1-inside', 'rai-1', c0, BOUNDS_B);
    const { result, store, unmount } = renderActions();

    const line = await readAnnotation('rai-t1-line');
    await act(async () => {
      await expect(result.current.removeAnnotationsInside(line)).resolves.toBeUndefined();
    });

    expect(toasts(store)).toEqual([errorToast('error_annotation_is_not_region')]);
    expect(await idsOnCanvas(c0, 'rai-1')).toEqual(
      expect.arrayContaining(['rai-t1-line', 'rai-t1-inside']),
    );

    unmount();
  });

  it('filtre géométrique contains (inclusif) : tout annotation contenue part, y compris les régions emboîtées ; la région-container survit', async () => {
    const [c0, other] = FIXTURE_CANVAS_IDS;
    await putRegion('rai-R', 'rai-2', c0, { minX: 0, minY: 0, maxX: 100, maxY: 100 }, 'container');
    await putLine('rai-A', 'rai-2', c0, { minX: 10, minY: 10, maxX: 20, maxY: 20 }); // dedans
    await putRegion('rai-N', 'rai-2', c0, { minX: 40, minY: 40, maxX: 60, maxY: 60 }); // région emboîtée
    await putLine('rai-C', 'rai-2', c0, { minX: 0, minY: 0, maxX: 100, maxY: 100 }); // bounds égales, id distinct → inclus (bornes ≤/≥)
    await putLine('rai-B', 'rai-2', c0, { minX: 90, minY: 90, maxX: 110, maxY: 110 }); // déborde → exclu
    await putLine('rai-D', 'rai-2', other, BOUNDS_A); // autre canvas → hors scope

    const { result, store, unmount } = renderActions();
    const region = await readAnnotation('rai-R');
    await act(async () => {
      await expect(result.current.removeAnnotationsInside(region)).resolves.toBeUndefined();
    });

    // Survivent : le container lui-même (contains false à id égal, sémantique verrouillée
    // Q2) et les non-contenus. Partent : A (ligne intérieure), N (région emboîtée — la
    // sélection est géométrique, pas par type) et C (bornes strictement égales).
    expect(new Set(await idsOnCanvas(c0, 'rai-2'))).toEqual(new Set(['rai-R', 'rai-B']));
    expect(await idsOnCanvas(other, 'rai-2')).toEqual(['rai-D']);
    expect(toasts(store)).toEqual([deletedToast(3)]);

    unmount();
  });

  it('erreur de lecture du repository : pushError(getErrorMessage(e)) et rien n’est supprimé (injection de faute)', async () => {
    const [c0] = FIXTURE_CANVAS_IDS;
    await putRegion('rai-t3-R', 'rai-3', c0, { minX: 0, minY: 0, maxX: 100, maxY: 100 });
    await putLine('rai-t3-A', 'rai-3', c0, BOUNDS_A);
    const { result, store, unmount } = renderActions();

    const region = await readAnnotation('rai-t3-R');
    const cleanup = failAnnotationReads('rai-lecture-en-echec');
    try {
      await act(async () => {
        await expect(result.current.removeAnnotationsInside(region)).resolves.toBeUndefined();
      });
    } finally {
      cleanup();
    }

    // Contrairement au helper de duplication, le catch de removeAnnotationsInside toaste
    // l'erreur (message = getErrorMessage de l'erreur injectée) — rien n'est supprimé.
    expect(toasts(store)).toEqual([errorEvent('rai-lecture-en-echec')]);
    expect(new Set(await idsOnCanvas(c0, 'rai-3'))).toEqual(new Set(['rai-t3-R', 'rai-t3-A']));

    unmount();
  });
});

describe('useAnnotationActions — coquilles de délégation (réserve du lot 6)', () => {
  it('updateAnnotationOrder : délègue au repository réel, ordre explicite écrit en base', async () => {
    const [c0] = FIXTURE_CANVAS_IDS;
    await putRegion('dl-order-r', 'dl-order', c0, BOUNDS_A);

    const { result, unmount } = renderActions();
    await act(async () => {
      await expect(result.current.updateAnnotationOrder('dl-order-r', 5)).resolves.toBeUndefined();
    });

    expect(await readAnnotation('dl-order-r')).toMatchObject({ order: 5, canvasId: c0 });

    unmount();
  });

  it('updateAnnotationOrder : erreur de lecture avalée par le catch, base inchangée (injection de faute)', async () => {
    const [c0] = FIXTURE_CANVAS_IDS;
    await putRegion('dl-order-fail-r', 'dl-order-fail', c0, BOUNDS_A);

    const { result, store, unmount } = renderActions();
    const cleanup = failAnnotationReads('dl-order-lecture-en-echec');
    try {
      await act(async () => {
        await expect(
          result.current.updateAnnotationOrder('dl-order-fail-r', 9),
        ).resolves.toBeUndefined();
      });
    } finally {
      cleanup();
    }

    expect(await readAnnotation('dl-order-fail-r')).toMatchObject({ order: 1 });
    expect(toasts(store)).toEqual([]);

    unmount();
  });

  it('removeAnnotationsByIds : supprime via le repository réel et toaste le compte', async () => {
    const [c0] = FIXTURE_CANVAS_IDS;
    await putRegion('dl-ids-1', 'dl-ids', c0, BOUNDS_A);
    await putRegion('dl-ids-2', 'dl-ids', c0, BOUNDS_B);
    await putRegion('dl-ids-3', 'dl-ids', c0, BOUNDS_M);

    const { result, store, unmount } = renderActions();
    await act(async () => {
      await expect(
        result.current.removeAnnotationsByIds(['dl-ids-1', 'dl-ids-3']),
      ).resolves.toBeUndefined();
    });

    expect(await idsOnCanvas(c0, 'dl-ids')).toEqual(['dl-ids-2']);
    expect(toasts(store)).toEqual([deletedToast(2)]);

    unmount();
  });

  it('removeAnnotationsByIds : erreur de lecture avalée, rien n’est supprimé ni toasté (injection de faute)', async () => {
    const [c0] = FIXTURE_CANVAS_IDS;
    await putRegion('dl-ids-fail-1', 'dl-ids-fail', c0, BOUNDS_A);

    const { result, store, unmount } = renderActions();
    const cleanup = failAnnotationReads('dl-ids-lecture-en-echec');
    try {
      await act(async () => {
        await expect(
          result.current.removeAnnotationsByIds(['dl-ids-fail-1']),
        ).resolves.toBeUndefined();
      });
    } finally {
      cleanup();
    }

    expect(await idsOnCanvas(c0, 'dl-ids-fail')).toEqual(['dl-ids-fail-1']);
    expect(toasts(store)).toEqual([]);

    unmount();
  });

  it('removeAnnotationsByScope : ne supprime que les types demandés dans le scope demandé', async () => {
    const [c0, other] = FIXTURE_CANVAS_IDS;
    await putLine('dl-scope-l1', 'dl-scope', c0, BOUNDS_A);
    await putLine('dl-scope-l2', 'dl-scope', c0, BOUNDS_B);
    await putRegion('dl-scope-r1', 'dl-scope', c0, BOUNDS_M);
    await putLine('dl-scope-other', 'dl-scope', other, BOUNDS_A);

    const { result, store, unmount } = renderActions();
    await act(async () => {
      await expect(
        result.current.removeAnnotationsByScope({ canvasId: c0, collectionId: 'dl-scope' }, [
          ElementType.TEXT_LINE,
        ]),
      ).resolves.toBeUndefined();
    });

    expect(await idsOnCanvas(c0, 'dl-scope')).toEqual(['dl-scope-r1']);
    expect(await idsOnCanvas(other, 'dl-scope')).toEqual(['dl-scope-other']);
    expect(toasts(store)).toEqual([deletedToast(2)]);

    unmount();
  });

  it('getParentAnnotation : propage le FunctionResult du repository tel quel (ok et err)', async () => {
    const [c0] = FIXTURE_CANVAS_IDS;
    await putRegion('dl-parent-p', 'dl-parent', c0, { minX: 0, minY: 0, maxX: 100, maxY: 100 });
    await putLine('dl-parent-in', 'dl-parent', c0, { minX: 10, minY: 10, maxX: 20, maxY: 20 });
    await putLine('dl-parent-out', 'dl-parent', c0, { minX: 300, minY: 300, maxX: 310, maxY: 310 });

    const { result, unmount } = renderActions();
    const inside = await readAnnotation('dl-parent-in');
    const outside = await readAnnotation('dl-parent-out');

    const found = await result.current.getParentAnnotation(inside);
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.value.id).toBe('dl-parent-p');

    const missing = await result.current.getParentAnnotation(outside);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBeInstanceOf(NotFoundError);

    unmount();
  });
});

describe('useAnnotationActions — abonnements et identité des callbacks (promis par l’en-tête du lot 6)', () => {
  it('le hook ne souscrit à rien, ne fuit rien au démontage ; callbacks recréés à chaque render (pas de useCallback)', () => {
    const before = countLiveQuerySubscribers();
    const control = renderHookWithHarness(() => null);
    const providersDelta = countLiveQuerySubscribers() - before;
    control.unmount();
    expect(countLiveQuerySubscribers()).toBe(before);

    const { result, rerender, unmount } = renderActions();
    // Aucun liveQuery dans le hook : le delta est exactement celui des providers du harnais.
    expect(countLiveQuerySubscribers()).toBe(before + providersDelta);

    const first = result.current.duplicateRegions;
    rerender();
    // Caractérisation (cf. en-tête) : contrairement à useCollectionActions, aucune
    // mémoïsation des callbacks — seule la fabrique de repository (useMemo ligne 44) est
    // stable, et elle est invisible ici.
    expect(result.current.duplicateRegions).not.toBe(first);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(before);
  });
});
