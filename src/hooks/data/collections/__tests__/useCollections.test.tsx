/**
 * Lot 39 — useCollections (1/2) : lecture, créations et duplication
 * (cf. docs/roadmap.md, Q11, palier 3 reliquat TA-016).
 *
 * Périmètre : la moitié lecture/création du hook, sur le vrai stack via le harnais du
 * lot 0 (base Dexie réelle, store Redux réel — toasts observés par les actions posées
 * dans la slice `events`, jamais par des mocks des repositories) :
 * - contrat de coquille (palier 2, même cordon que les lots 24+) : `isLoading`
 *   (`collectionsQuery === undefined` → vrai au premier rendu synchrone, faux dès la
 *   première émission, ÉMISE VIDE COMPRISE puisque `[] !== undefined`), `collections`
 *   (repli sur le tableau vide figé `EMPTY_COLLECTIONS` avant émission), `collectionCount`,
 *   `getCollectionById` et `nameAlreadyExists` ; le hook souscrit exactement UNE liveQuery
 *   (`collectionLiveRepository.getAllDetails()`, deps `[]`) : +1 abonné mesuré par delta
 *   contre la référence « providers du harnais seuls », stable sous rerender, relâché au
 *   démontage (`countLiveQuerySubscribers`) ;
 * - `createCollection` : écriture vérifiée en base réelle (relecture par le VRAI
 *   repository) + toast `toast_collection_created` ; échec d'écriture INJECTÉ par l'API
 *   publique réelle `db.collections.hook('creating')` (précédents lots 4 et 24+, retiré en
 *   `finally`) — là, comportement DÉVIANT par rapport à l'attente du plan : voir
 *   caractérisation 1, verrouillé TEL QUEL ;
 * - `createCollectionWithSelection` : contenu généré par `generateCollectionContent`
 *   vérifié en base (une entrée par canvas sélectionné avec son `sourceId`, `contentSize`
 *   = taille de la sélection), renvoi du `FunctionResult` du repository tel quel, échec
 *   injecté → `pushError` et AUCUN toast succès ; les annotations initiales sont
 *   COMMENTÉES dans le source (l. 80-82) : documenté par l'absence de toute annotation
 *   en base, sans inventer de contrat (caractérisation 3) ;
 * - `duplicateCollection` : succès → toast `toast_collection_duplicated` et duplicata
 *   réellement présent en base ; échec métier (id inconnu, seule voie d'erreur
 *   observable du hook — caractérisation 4) → `pushError`. La sémantique interne de
 *   `duplicate` (copie du content et des annotations) reste verrouillée couche data
 *   (campagne Q2) : testée ici uniquement comme façade observable du hook.
 *
 * La réactivité de la liveQuery elle-même (émissions add/update/remove) est verrouillée
 * par `collections.live.test.ts` (Q2) : aucun scénario de données n'est dupliqué ici ;
 * si le hook réagit à une écriture, c'est seulement comme preuve que ses callbacks suivent
 * les émissions (pas de closure périmée).
 *
 * Frontières : base Dexie réelle ; écritures par les VRAIS repositories (`seed*` du
 * harnais, actions du hook) ; relectures par le VRAI repository et comptages directs
 * `db.collections.count()` (précédents `useSources`/`useNamedEntities` — la règle porte
 * sur les ÉCRITURES, pas sur la lecture d'observation) ; AUCUN `vi.mock` de Dexie ni du
 * stockage dans ce fichier, aucun délai artificiel, pas de mock des hooks de données ;
 * matérialisation attendue par les mécanismes du harnais (`waitFor`). Vidange IDB de fin
 * de test centralisée dans le harnais (`resetTestDbBeforeEach` — motif des lots
 * 8/9/10/19, intégré au lot 41).
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au rapport du lot) :
 * 1. DÉFAUT PRÉEXISTANT révélé par ce lot : `createCollection` (l. 45-56) `await`e
 *    `collectionRepository.create(...)` SANS TESTER son `FunctionResult` ; or `create`
 *    (collections.ts:121-144) ne lève jamais — tout échec de la transaction ressort en
 *    `{ ok: false, error: DBError }` RÉSOLU. Conséquence observée (test « échec de
 *    création ») : écriture en échec injectée → le hook pose le toast SUCCÈS
 *    `toast_collection_created` et AUCUN `pushError`, alors que rien n'est écrit en base.
 *    La branche `catch → pushError` du hook est donc inatteignable par l'API publique de
 *    Dexie sur ce chemin (seul un rejet hors repository l'activerait). Le plan attendait
 *    « pushError, pas de toast succès » : l'écart est un correctif de code de production
 *    hors du périmètre d'un lot de tests — verrouillé TEL QUEL, asymétrie avec
 *    `createCollectionWithSelection` qui, elle, teste `createResult.ok` ;
 * 2. `nameAlreadyExists` compare en insensibilité de casse (`toLowerCase` des DEUX côtés,
 *    l. 38-41) — verrouillée TEL QUEL, documentée comme incohérence inter-hooks par
 *    l'audit §5 (harmonisation hors plan) ;
 * 3. `createCollectionWithSelection` ne crée AUCUNE annotation : le bloc
 *    `generateFirstAnnotation` + `annotationRepository.addAll` est commenté dans le source
 *    (l. 80-82) — verrouillé par la relecture annotations vide en base, sans présumer
 *    d'un futur contrat ;
 * 4. `duplicateCollection` (l. 89-96) n'a AUCUN catch : un échec d'infrastructure de
 *    `duplicate` (rejet Dexie, non converti en FunctionResult dans ce repository-là)
 *    traverserait le hook en rejet non géré. Seule l'erreur MÉTIER (collection absente →
 *    `{ ok: false, error: EntityNotFoundError }` résolu) est observable par la façade du
 *    hook ; c'est le chemin testé, sans rien statuer sur le rejet (caractérisation de
 *    surface, au même titre que le canal non joignable du lot 5) ;
 * 5. avant première émission, `collections` est le tableau vide figé du module
 *    (`EMPTY_COLLECTIONS`) : identité stable d'un rendu à l'autre — verrouillée, c'est ce
 *    qui évite un nouveau `[]` (et un recalcul de `collectionCount`) à chaque rendu.
 *
 * Couverture : moitié lecture/création du hook ; `addSelectionToCollection`,
 * `updateCollection`, `removeElementFromCollection`, `removeCollection` et
 * `removeMultipleCollections` sont le lot 40 (2/2).
 *
 * ------------------------------------------------------------------
 *
 * Lot 40 — useCollections (2/2) : sélection, mise à jour et suppressions
 * (mêmes suite, harnais et discipline : vrai stack, toasts observés par la slice
 * `events` du store réel, jamais de mock des repositories). Périmètre, reliquat de
 * l'en-tête ci-dessus :
 * - `addSelectionToCollection` : nouveaux canvases ajoutés APRÈS le contenu existant
 *   (ordre : existant puis généré), canvases déjà présents dédupliqués « sans log ni
 *   erreur » — la promesse du `@remarks` du source (l. 98-99), verrouillée TEL QUEL
 *   par espions console et relecture en base, le toast succès continuant de sortir
 *   calibré sur la TAILLE DE LA SÉLECTION et non sur les ajouts réels (caractérisation
 *   6) ; annotations initiales générées et écrites par le VRAI
 *   `annotationRepository.addAll`, observées en base par portée (la sémantique de
 *   `generateFirstAnnotation` — une région plein canvas par nouveau canvas, erreurs
 *   de dimensions avalées — est verrouillée par `annotations.test.ts` couche data et
 *   n'est PAS re-testée ici) ; toast `toast_one_element_added` pour sélection
 *   unitaire, `toast_multiple_elements_added` au-delà (l'argument `count` passé à
 *   i18next n'est observable que par l'appel du mock `t` aliasé, qui rend la clé
 *   brute sans interpolation) ; `getById` en échec METIER (id inconnu — la seule
 *   voie `!result.ok` joignable par l'API publique, cf. caractérisation 8) →
 *   `pushError` et AUCUNE écriture (compteurs de mutations par `hook(...)`, motif
 *   du lot 6) ; écriture du contenu en échec (`hook('updating')` de db.collections)
 *   → `catch` du hook (l. 140-142, seule voie joignable), rollback du contenu et
 *   annotations non tentées.
 * - `updateCollection` : `id` absent → retour anticipé SANS AUCUN appel d'écriture
 *   (compteurs updating sur les deux tables) ni toast ; nominal → SEULS les champs
 *   listés dans le destructuring du source (l. 146-155 et 160-168) sont écrits sur le
 *   repository réel — `contentSize` n'est jamais mis à jour par cette voie et
 *   l'appelant peut passer un `createdAt` empoisonné sans l'écrire (caractérisation
 *   7, TEL QUEL) + toast `toast_collection_saved` ; échec d'écriture (injection
 *   `hook('updating')`) → rollback, `pushError`, aucun toast succès.
 * - `removeElementFromCollection` : délégation pure et silencieuse — le
 *   `FunctionResult` du repository est renvoyé sans transformation, au succès comme à
 *   l'échec métier (aucun toast sur aucune des deux voies) ; la sémantique de
 *   `deleteElement` (filtre du canvas, recompute de `contentSize`, purge des
 *   annotations du canvas) reste verrouillée couche data (règle de non-duplication
 *   du plan) : seule la traversée est observée.
 * - `removeCollection` : `getById` en échec métier → `pushError` sans suppression ;
 *   `deleteById` en échec (injection `hook('deleting')` de db.collections — le
 *   repository enveloppe son transaction dans `FunctionResult.fromPromise`, donc cet
 *   échec-là RESOLUT, contrairement aux autres chemins) → `pushError` du DBError
 *   wrappé, collection et annotations toujours présentes (rollback de la
 *   transaction) ; nominal → collection absente de la base réelle ET de la liste
 *   émise + `toast_collection_deleted`.
 * - `removeMultipleCollections` : boucle à `continue` par id — scénario mixte (id
 *   inconnu puis id existant) verrouillant que l'échec du premier n'interrompt pas
 *   le second (pushError puis toast succès, dans l'ordre des ids) ; échec de
 *   `deleteById` pour chaque id (même injection) verrouillant le SECOND `continue`
 *   (l. 201-205) : deux pushError, rien supprimé.
 *
 * Frontières lot 40 : toujours zéro `vi.mock` de Dexie ni du stockage et zéro délai
 * artificiel ; injections par la seule API publique des hooks de table
 * (`creating`/`updating`/`deleting`/`reading` de `db.collections`, `creating` de
 * `db.annotations` pour les compteurs), chacune retirée en `finally`. Piège des lots
 * 39 et 27 (caractérisation 8) : les repositories collection RESOLVENT leurs erreurs
 * métier (`getById` → `{ ok: false, EntityNotFoundError }` sur id inconnu,
 * `deleteById` → DBError wrappé) mais REJETENT leurs fautes d'infrastructure non
 * enveloppées (`getById` n'a pas de try/catch, collections.ts:27-35) ; là où le hook
 * appelle `getById` hors de son `try` (l. 110-116) ou sans `catch` du tout
 * (`removeCollection`, `removeMultipleCollections`), l'attente du plan « échec de
 * getById → pushError » n'est donc atteignable QUE par la voie métier — la voie
 * infrastructure est caractérisée en rejet non toasté, testée sur
 * `addSelectionToCollection` et reportée telle quelle aux deux suppressions, même
 * structure.
 *
 * Caractérisations lot 40 (règle 7 — documentées, pas corrigées, suite de la
 * numérotation du lot 39) :
 * 6. la déduplication `addSelectionToCollection` est silencieuse AUSSI côté erreur :
 *    rien n'est ajouté, rien n'est loggé (`console` vierge pendant l'action, spy aux
 *    trois canaux log/warn/error), aucun `pushError` — mais le hook toaste quand même
 *    le succès sur la taille de la sélection reçue (l. 135-139) : sélection [A, B]
 *    avec A déjà présent → `toast_multiple_elements_added` avec `count: 2` pour UN
 *    seul ajout réel ; sélection entièrement déjà présente → `toast_one_element_added`
 *    pour rien. Verrouillé TEL QUEL (promesse du `@remarks`, l. 99) ;
 * 7. `updateCollection` ne met JAMAIS à jour `contentSize` : ni le hook (la liste des
 *    champs passés, l. 160-168, ne le contient pas) ni `repository.update`
 *    (collections.ts:221-233) ne l'écrivent — après réduction du contenu, la ligne
 *    garde son ancien `contentSize` (observable en relecture). Contraire à
 *    `addSelectionToCollection` et `deleteElement`, qui le recalculent : incohérence
 *    interne au hook verrouillée TEL QUEL, non harmonisée ici (code de production
 *    hors périmètre) ;
 * 8. `getById` est appelé HORS `try` dans `addSelectionToCollection` (l. 110-116, le
 *    `try` s'ouvre après le test `!ok`) et sans `catch` du tout dans
 *    `removeCollection`/`removeMultipleCollections` : une faute d'infrastructure de la
 *    lecture (injection `hook('reading')`) fait REJETER la promesse du hook, sans
 *    pushError ni toast — seul l'échec métier (id inconnu, `FunctionResult` résolu)
 *    emprunte la voie `pushError` qu'attend le plan. Verrouillé par test sur
 *    `addSelectionToCollection`, commenté sur les suppressions ;
 * 9. `removeElementFromCollection` n'a AUCUN canal de retour utilisateur : ni toast ni
 *    pushError, succès comme échec — l'appelant doit examiner lui-même le
 *    `FunctionResult` renvoyé (caractérisation de façade, au même titre que la
 *    délégation du lot 5).
 *
 * Couverture (lots 39 + 40) : hook intégralement couvert — plus aucune branche propre
 * muette hors les gardes déclarées inatteignables ci-dessus (règle 7 : caractérisées,
 * pas forcées).
 *
 * Hygiène relevée par le lot 40 (règle 7) puis ressoudée au lot 43 : le ratchet eslint
 * était passé de 48/48 (équilibre au commit précédent lot 39, 36f15199) à 51 avec
 * l'ajout de la moitié lot 39 de CE fichier — trois assertions `createResult!` rendues
 * inutiles après la garde de réduction de type, signalées par
 * `@typescript-eslint/no-unnecessary-type-assertion`. Ressoudée au lot 43 à comportement
 * strictement constant (ratchet revenu à 48/2) : le `!` d'affectation certaine est porté
 * par les déclarations `let createResult!:` (seul ce que tolère l'analyse de definite
 * assignment de tsc, qui l'exige au premier usage) et les assertions aux sites d'usage
 * sont retirées, ce qui les rend toutes invisibles à la règle.
 */
import manifestFixture from '@/__tests__/manifest.json';
import { Collection } from '@/data/models/collection/collection';
import { Event, EventType } from '@/data/models/event';
import { db } from '@/data/repositories/indexeddb/db';
import {
  getAnnotationRepository,
  getCollectionRepository,
} from '@/data/repositories/indexeddb/dbFactory';
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
import { RootState } from '@/state/store';
import { Canvas } from '@iiif/presentation-3';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCollections } from '../useCollections';

resetTestDbBeforeEach();

type Collections = ReturnType<typeof useCollections>;

function renderCollections() {
  return renderHookWithHarness<Collections>(() => useCollections());
}

/** Les toasts tels que posés dans la slice `events` du store réel du harnais. */
function toasts(state: RootState): Event[] {
  return state.events.allEvents;
}

function infoToast(key: string, options?: Record<string, unknown>): Event {
  return { message: i18n.t(key, options), type: EventType.INFO };
}

function errorToast(message: string): Event {
  return { message, type: EventType.ERROR };
}

/** Sélection de canvases réels du manifeste fixture (ceux que portent les sources seedés). */
function selectionFromFixture(canvasIds: string[]): Canvas[] {
  return canvasIds.map(
    (id) => manifestFixture.items.find((item) => item.id === id) as unknown as Canvas,
  );
}

/** Échec de toute écriture dans db.collections, par l'API publique réelle de Dexie. */
function failCollectionWrites(marker: string): () => void {
  const failWrite = (): void => {
    throw new Error(marker);
  };
  db.collections.hook('creating', failWrite);
  return () => db.collections.hook('creating').unsubscribe(failWrite);
}

/* Variantes d'injection du lot 40, même discipline (API publique réelle, retrait par
 * la fonction renvoyée, en finally) : l'opération qui casse dépend du chemin du hook —
 * put/update pour les mises à jour, delete pour les suppressions, get pour les lectures. */

/** Échec de toute MISE À JOUR de db.collections (put et update passent par là). */
function failCollectionUpdates(marker: string): () => void {
  const failUpdate = (): void => {
    throw new Error(marker);
  };
  db.collections.hook('updating', failUpdate);
  return () => db.collections.hook('updating').unsubscribe(failUpdate);
}

/** Échec de toute SUPPRESSION de db.collections (coupe les transactions de deleteById). */
function failCollectionDeletes(marker: string): () => void {
  const failDelete = (): void => {
    throw new Error(marker);
  };
  db.collections.hook('deleting', failDelete);
  return () => db.collections.hook('deleting').unsubscribe(failDelete);
}

/** Échec de toute LECTURE de db.collections — fait REJETER `repository.getById`
 * (la lecture n'est pas enveloppée dans un FunctionResult, cf. caractérisation 8). */
function failCollectionReads(marker: string): () => void {
  const failRead = (): void => {
    throw new Error(marker);
  };
  db.collections.hook('reading', failRead);
  return () => db.collections.hook('reading').unsubscribe(failRead);
}

/**
 * Compteur de mutations par l'API publique réelle des hooks Dexie (motif du lot 6) :
 * PROUVE qu'aucune écriture est partie, le contenu d'un put à l'identique étant par
 * nature indiscernable après coup. Surveille tables de contenu et d'annotations du
 * chemin normal d'`addSelectionToCollection`/`updateCollection` (update/put de lignes
 * existantes → « updating », addAll d'annotations → « creating »).
 */
function countCollectionWrites(): { writes: () => number; detach: () => void } {
  let writes = 0;
  const count = (): void => {
    writes += 1;
  };
  db.collections.hook('updating', count);
  db.collectionContents.hook('updating', count);
  db.collectionContents.hook('creating', count);
  db.annotations.hook('creating', count);
  return {
    writes: () => writes,
    detach: () => {
      db.collections.hook('updating').unsubscribe(count);
      db.collectionContents.hook('updating').unsubscribe(count);
      db.collectionContents.hook('creating').unsubscribe(count);
      db.annotations.hook('creating').unsubscribe(count);
    },
  };
}

// La vidange IDB de fin de test (motif des lots 8/9/10/19) est centralisée dans le
// harnais depuis le lot 41 — plus d'`afterEach` local ici.

describe('useCollections — contrat de coquille (lecture)', () => {
  it('base vide : isLoading undefined→vrai→faux sur émission vide, tableaux vides stables, callbacks sans prise, zéro fuite', async () => {
    const before = countLiveQuerySubscribers();
    const { result, rerender, unmount } = renderCollections();

    // Synchrone, avant toute macrotâche : la liveQuery n'a rien émis,
    // `collectionsQuery === undefined` (caractérisation 5 : le repli `[]` est le
    // tableau figé du module — identité stable d'un rendu à l'autre).
    expect(result.current.isLoading).toBe(true);
    const emptyBeforeEmission = result.current.collections;
    rerender();
    expect(result.current.collections).toBe(emptyBeforeEmission);
    expect(result.current.collectionCount).toBe(0);
    expect(result.current.getCollectionById('aucune')).toBeUndefined();
    expect(result.current.nameAlreadyExists('aucun nom')).toBe(false);

    // Base vide : la première émission vaut `[]`, pas `undefined` — `isLoading`
    // retombe quand même (c'est la bascule qui PROUVE l'émission, la valeur seule
    // ne distinguerait rien du pré-émission).
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.collections).toEqual([]);
    expect(result.current.collectionCount).toBe(0);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(before);
  });

  it('état initial puis première émission : isLoading bascule, collections/count/getCollectionById/nameAlreadyExists garnis, +1 abonné, zéro fuite', async () => {
    await seedCollection(makeCollection({ id: 'uc-a', name: 'Alpha coquille' }));
    await seedCollection(makeCollection({ id: 'uc-b', name: 'Beta coquille' }));

    const subscribersBefore = countLiveQuerySubscribers();

    // Référence « providers du harnais seuls » (3 liveQuery : collections,
    // workers, results) matérialisée puis relâchée avant le montage (leçon des
    // lots 16/24-30 : jamais de delta synchrone, la souscription est différée).
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    const { result, rerender, unmount } = renderCollections();

    // Premier rendu synchrone : chargement, liste vide, compte à zéro.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.collections).toEqual([]);
    expect(result.current.collectionCount).toBe(0);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.collections.map((collection) => collection.id)).toEqual(['uc-a', 'uc-b']);
    expect(result.current.collectionCount).toBe(2);
    expect(result.current.getCollectionById('uc-b')?.name).toBe('Beta coquille');
    expect(result.current.getCollectionById('uc-inconnu')).toBeUndefined();

    // Une seule liveQuery au hook : exactement +1 abonné, et le rerender sans
    // changement de deps (`[]` au `useLiveQuery`) ne re-souscrit pas.
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));
    const getAfterEmission = result.current.getCollectionById;
    rerender();
    expect(result.current.getCollectionById).toBe(getAfterEmission);
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('nameAlreadyExists : comparaison insensible à la casse verrouillée TEL QUEL (caractérisation 2), substring exclue', async () => {
    await seedCollection(makeCollection({ id: 'uc-nom', name: 'Mon Dossier' }));
    const { result, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.nameAlreadyExists('Mon Dossier')).toBe(true);
    // Les DEUX côtés du comparateur passent par toLowerCase (l. 40) : n'importe
    // quelle variante de casse « existe » — incohérence inter-hooks documentée,
    // pas harmonisée ici (hors plan, audit §5).
    expect(result.current.nameAlreadyExists('MON DOSSIER')).toBe(true);
    expect(result.current.nameAlreadyExists('mon dossier')).toBe(true);
    // L'égalité de chaîne (insensible à la casse) gouverne seule : ni substring,
    // ni collection absente.
    expect(result.current.nameAlreadyExists('Dossier')).toBe(false);
    expect(result.current.nameAlreadyExists('Nom inconné')).toBe(false);

    unmount();
  });

  it('getCollectionById : rend l entrée émise telle quelle et suit les nouvelles émissions (pas de closure périmée)', async () => {
    await seedCollection(makeCollection({ id: 'uc-g-a', name: 'Gamma vue a' }));
    const { result, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Renvoit l'objet même de la liste émise (le `find` ne transforme rien) et
    // répond `undefined` hors liste.
    expect(result.current.collections).toContain(result.current.getCollectionById('uc-g-a'));
    expect(result.current.getCollectionById('uc-g-z')).toBeUndefined();

    // Écriture par le VRAI repository pendant le montage (matérialisation de
    // l'émission = waitFor) : le callback recalculé sur la nouvelle liste la voit.
    await seedCollection(makeCollection({ id: 'uc-g-b', name: 'Gamma vue b' }));
    await waitFor(() => expect(result.current.collectionCount).toBe(2));
    expect(result.current.getCollectionById('uc-g-b')?.name).toBe('Gamma vue b');
    expect(result.current.nameAlreadyExists('gamma vue b')).toBe(true);

    unmount();
  });
});

describe('useCollections — createCollection', () => {
  it('succès : collection écrite en base réelle (relecture par le vrai repository) et toast toast_collection_created', async () => {
    const before = countLiveQuerySubscribers();
    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createCollection('Nouvelle uc');
    });

    // Toast de succès exact, et RIEN D'AUTRE (aucun pushError résiduel).
    expect(toasts(store.getState())).toEqual([infoToast('toast_collection_created')]);

    // La liveQuery du hook a émis la nouvelle collection : sa ligne vit vraiment en
    // base — relecture par le VRAI repository (détail d'écriture verrouillé couche
    // data, on vérifie ici la traversée par la façade du hook).
    await waitFor(() => expect(result.current.collectionCount).toBe(1));
    const created = result.current.collections[0];
    expect(created.name).toBe('Nouvelle uc');
    const read = await getCollectionRepository().getById(created.id);
    if (!read.ok) throw read.error;
    expect(read.value.name).toBe('Nouvelle uc');
    expect(read.value.tags).toEqual([]);
    expect(read.value.contentSize).toBe(0);
    expect(read.value.content).toEqual([]);
    expect(result.current.nameAlreadyExists('nouvelle uc')).toBe(true);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(before);
  });

  it('échec de création injecté (hook creating de Dexie) : LE HOOK IGNORE le FunctionResult en échec — toast succès posé, base inchangée (caractérisation 1, TEL QUEL)', async () => {
    await seedCollection(makeCollection({ id: 'uc-fond', name: 'Fond uc' }));
    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const detach = failCollectionWrites('uc-creation-en-echec');
    try {
      await act(async () => {
        await result.current.createCollection('Échouée uc');
      });
    } finally {
      detach();
    }

    // Attendu du plan : pushError, pas de toast succès. OBSERVÉ (caractérisation 1) :
    // le repository convertit l'échec en `{ ok: false, error: DBError }` RÉSOLU que
    // `createCollection` n'examine pas — seul le toast SUCCÈS sort, alors que la
    // transaction a été annulée. Verrouillé TEL QUEL, défaut remonté, pas corrigé.
    expect(toasts(store.getState())).toEqual([infoToast('toast_collection_created')]);

    // La base, elle, ne ment pas : rien n'a été écrit (ni la ligne, ni le content).
    expect(await db.collections.count()).toBe(1);
    expect(await db.collections.where('name').equals('Échouée uc').count()).toBe(0);
    expect(await db.collectionContents.count()).toBe(1);
    expect(result.current.nameAlreadyExists('Échouée uc')).toBe(false);

    unmount();
  });
});

describe('useCollections — createCollectionWithSelection', () => {
  it('succès : FunctionResult du repository renvoyé tel quel, contenu généré en base, aucune annotation (bloc commenté, caractérisation 3), toast succès', async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-sel' }));
    const selection = selectionFromFixture(FIXTURE_CANVAS_IDS.slice(0, 3));
    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let createResult!: Awaited<ReturnType<Collections['createCollectionWithSelection']>>;
    await act(async () => {
      createResult = await result.current.createCollectionWithSelection(
        selection,
        'Avec sélection uc',
        source.id,
      );
    });

    // La valeur renvoyée EST le FunctionResult brut du repository (aucune
    // transformation côté hook) : la forme `{ ok, value }`, pas de clé `error`.
    expect(createResult.ok).toBe(true);
    expect(Object.keys(createResult)).toEqual(['ok', 'value']);
    if (!createResult.ok) throw new Error('inatteignable : création attendue réussie');
    const created = createResult.value;
    expect(created.id).toEqual(expect.any(String));
    expect(created.name).toBe('Avec sélection uc');
    expect(created.contentSize).toBe(selection.length);
    expect(toasts(store.getState())).toEqual([infoToast('toast_collection_created')]);

    // Contenu vérifié EN BASE par le VRAI repository : une entrée par canvas de la
    // sélection, dans son ordre, chacune portée par le source id donné.
    const read = await getCollectionRepository().getById(created.id);
    if (!read.ok) throw read.error;
    expect(read.value.contentSize).toBe(selection.length);
    expect(read.value.content).toEqual(
      selection.map((canvas) => ({ canvasId: canvas.id, sourceId: source.id })),
    );

    // Les annotations initiales sont COMMENTÉES dans le source (l. 80-82) : aucune
    // annotation n'est créée — documenté en base, pas de contrat inventé.
    expect(await getAnnotationRepository().getByScope({ collectionId: created.id })).toEqual([]);

    unmount();
  });

  it('échec injecté (hook creating de Dexie) : { ok: false } résolu renvoyé, pushError, aucun toast succès, rien en base', async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-sel-echec' }));
    const selection = selectionFromFixture(FIXTURE_CANVAS_IDS.slice(0, 1));
    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let createResult!: Awaited<ReturnType<Collections['createCollectionWithSelection']>>;
    const detach = failCollectionWrites('uc-selection-en-echec');
    try {
      await act(async () => {
        createResult = await result.current.createCollectionWithSelection(
          selection,
          'Échouée sélection uc',
          source.id,
        );
      });
    } finally {
      detach();
    }

    // Contrairement à `createCollection` (caractérisation 1), CE chemin-là teste
    // `createResult.ok` : l'échec ressort résolu (jamais en rejet) et le hook pose
    // le pushError du message du repository, SANS toast succès.
    expect(createResult.ok).toBe(false);
    if (createResult.ok) throw new Error('inatteignable : création attendue en échec');
    // Message construit par la couche data (`DBError` enveloppe le rejet injecté :
    // « Database error: » + getErrorMessage) — seule l'observation du toast compte.
    expect(createResult.error.message).toBe('Database error: uc-selection-en-echec');
    expect(toasts(store.getState())).toEqual([errorToast(createResult.error.message)]);

    expect(await db.collections.count()).toBe(0);
    expect(await db.collectionContents.count()).toBe(0);
    expect(result.current.collectionCount).toBe(0);

    unmount();
  });
});

describe('useCollections — duplicateCollection', () => {
  it('succès : toast toast_collection_duplicated et duplicata réellement présent en base (sémantique interne non re-testée, verrouillée Q2)', async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-dup' }));
    await seedCollection(
      makeCollection({
        id: 'uc-dup-orig',
        name: 'Original uc-dup',
        content: FIXTURE_CANVAS_IDS.slice(0, 2).map((canvasId) =>
          makeCollectionElement({ canvasId, sourceId: source.id }),
        ),
      }),
    );
    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.duplicateCollection('uc-dup-orig', 'Copie uc-dup');
    });

    expect(toasts(store.getState())).toEqual([infoToast('toast_collection_duplicated')]);

    // Façade observable du hook : la liste émise compte le duplicata sous le NOUVEAU
    // nom, sous un id distinct, et sa ligne se relit par le VRAI repository.
    await waitFor(() => expect(result.current.collectionCount).toBe(2));
    const duplicate = result.current.collections.find(
      (collection) => collection.id !== 'uc-dup-orig',
    );
    expect(duplicate?.name).toBe('Copie uc-dup');
    const read = await getCollectionRepository().getById(duplicate!.id);
    if (!read.ok) throw read.error;
    expect(read.value.contentSize).toBe(2);
    expect(await getCollectionRepository().getById('uc-dup-orig')).toMatchObject({ ok: true });

    unmount();
  });

  it('échec (id inconnu, seule voie observable du hook — caractérisation 4) : pushError du message du repository, aucun toast succès', async () => {
    await seedCollection(makeCollection({ id: 'uc-dup-fond', name: 'Fond uc-dup' }));
    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Le `duplicate` du repository résout un FunctionResult err sur collection
    // absente (jamais ne rejette sur ce chemin) : le hook le convertit en pushError.
    await act(async () => {
      await result.current.duplicateCollection('uc-dup-inconnue', 'Fantôme uc-dup');
    });

    expect(toasts(store.getState())).toEqual([
      errorToast('Collection with id uc-dup-inconnue not found'),
    ]);
    expect(result.current.collectionCount).toBe(1);
    expect(await db.collections.count()).toBe(1);

    unmount();
  });
});

describe('useCollections — addSelectionToCollection', () => {
  it("sélection mixte [connu, inconnu] : le nouveau canvas s'ajoute APRÈS le contenu existant, annotation pour le seul nouveau, toast multiple calibré sur la sélection (caractérisation 6, TEL QUEL)", async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-sel-mixte' }));
    const [canvasA, canvasB] = FIXTURE_CANVAS_IDS;
    await seedCollection(
      makeCollection({
        id: 'uc-sel-mixte',
        // Entrées à la forme du générateur (couche data verrouillée) : pas de manifestId.
        content: [{ canvasId: canvasA, sourceId: source.id }],
      }),
    );
    // Annotation témoin sur A : la déduplication ne doit ni la toucher ni en doubler.
    await getAnnotationRepository().addAll([
      makeAnnotation({ id: 'uc-sel-an-a', collectionId: 'uc-sel-mixte', canvasId: canvasA }),
    ]);

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addSelectionToCollection({
        selection: selectionFromFixture([canvasA, canvasB]),
        collectionId: 'uc-sel-mixte',
        sourceId: source.id,
      });
    });

    // État final en base réelle (relecture par le VRAI repository) : A conservé une
    // seule fois, B ajouté à la suite — la déduplication est silencieuse, sans erreur.
    const read = await getCollectionRepository().getById('uc-sel-mixte');
    if (!read.ok) throw read.error;
    expect(read.value.content).toEqual([
      { canvasId: canvasA, sourceId: source.id },
      { canvasId: canvasB, sourceId: source.id },
    ]);
    expect(read.value.contentSize).toBe(2);

    // Annotations : le témoin de A est intact (aucune doublure) ; B a reçu SON
    // annotation initiale, écrite par le vrai annotationRepository.addAll. La sémantique
    // de génération (région plein canvas, order) est verrouillée couche data — seule
    // l'existence portée par le couple (collection, canvas) est observée ici.
    expect(
      await getAnnotationRepository().getByScope({
        collectionId: 'uc-sel-mixte',
        canvasId: canvasA,
      }),
    ).toEqual([expect.objectContaining({ id: 'uc-sel-an-a' })]);
    const onB = await getAnnotationRepository().getByScope({
      collectionId: 'uc-sel-mixte',
      canvasId: canvasB,
    });
    expect(onB).toHaveLength(1);
    expect(onB[0]).toMatchObject({ collectionId: 'uc-sel-mixte', canvasId: canvasB });

    // TEL QUEL (caractérisation 6) : sélection de taille 2 → toast multiple avec
    // count 2, quand bien même UN seul canvas est réellement ajouté (l. 135-138).
    expect(toasts(store.getState())).toEqual([
      infoToast('toast_multiple_elements_added', { count: 2 }),
    ]);
    // L'alias i18next des tests rend la clé brute sans interpolation : le passage de
    // l'argument count n'est observable que sur l'appel du mock t lui-même.
    expect(vi.mocked(i18n.t)).toHaveBeenCalledWith('toast_multiple_elements_added', { count: 2 });

    // La liste émise par le hook suit l'écriture (preuve de traversée liveQuery).
    await waitFor(() =>
      expect(
        result.current.collections.find((collection) => collection.id === 'uc-sel-mixte')
          ?.contentSize,
      ).toBe(2),
    );

    unmount();
  });

  it('sélection unitaire nouvelle sur collection vide : entrée et annotation en base, toast toast_one_element_added', async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-sel-unitaire' }));
    const canvas = FIXTURE_CANVAS_IDS[3];
    await seedCollection(makeCollection({ id: 'uc-sel-unitaire' }));

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addSelectionToCollection({
        selection: selectionFromFixture([canvas]),
        collectionId: 'uc-sel-unitaire',
        sourceId: source.id,
      });
    });

    const read = await getCollectionRepository().getById('uc-sel-unitaire');
    if (!read.ok) throw read.error;
    expect(read.value.content).toEqual([{ canvasId: canvas, sourceId: source.id }]);
    expect(read.value.contentSize).toBe(1);
    expect(
      await getAnnotationRepository().getByScope({
        collectionId: 'uc-sel-unitaire',
        canvasId: canvas,
      }),
    ).toHaveLength(1);
    expect(toasts(store.getState())).toEqual([infoToast('toast_one_element_added')]);

    unmount();
  });

  it('sélection entièrement dédupliquée : la promesse du @remarks sans log ni erreur — base inchangée, console muette, pushError absent, mais toast succès posé quand même (caractérisation 6, TEL QUEL)', async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-sel-dedup' }));
    const [canvasA] = FIXTURE_CANVAS_IDS;
    await seedCollection(
      makeCollection({
        id: 'uc-sel-dedup',
        content: [{ canvasId: canvasA, sourceId: source.id }],
      }),
    );

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let logged: unknown[] = [];
    try {
      await act(async () => {
        await result.current.addSelectionToCollection({
          selection: selectionFromFixture([canvasA]),
          collectionId: 'uc-sel-dedup',
          sourceId: source.id,
        });
      });
    } finally {
      logged = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls];
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }

    // La promesse du @remarks (l. 99) verrouillée littéralement : AUCUN log, AUCUNE
    // erreur — la branche « canvas déjà présent » du générateur est silencieuse.
    expect(logged).toEqual([]);
    // Rien n'a été ajouté au contenu (le put est une réécriture à l'identique) et
    // generateFirstAnnotation, qui saute les canvas existants, n'a rien écrit.
    const read = await getCollectionRepository().getById('uc-sel-dedup');
    if (!read.ok) throw read.error;
    expect(read.value.content).toEqual([{ canvasId: canvasA, sourceId: source.id }]);
    expect(read.value.contentSize).toBe(1);
    expect(await getAnnotationRepository().getByScope({ collectionId: 'uc-sel-dedup' })).toEqual(
      [],
    );
    // TEL QUEL : le toast succès sort quand même, calibré sur la sélection (taille 1),
    // sans qu'aucun pushError ne l'accompagne — l'utilisateur croit à un ajout.
    expect(toasts(store.getState())).toEqual([infoToast('toast_one_element_added')]);

    unmount();
  });

  it("échec métier de getById (collection inconnue) : pushError du message du repository, AUCUNE écriture de contenu ni d'annotation (compteurs à zéro), aucun toast succès", async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-sel-absente' }));
    await seedCollection(
      makeCollection({
        id: 'uc-sel-fond',
        content: [{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }],
      }),
    );

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const counter = countCollectionWrites();
    try {
      await act(async () => {
        await result.current.addSelectionToCollection({
          selection: selectionFromFixture(FIXTURE_CANVAS_IDS.slice(1, 3)),
          collectionId: 'uc-sel-inconnue',
          sourceId: source.id,
        });
      });
    } finally {
      counter.detach();
    }

    // getById résout un { ok: false, EntityNotFoundError } (le repository ne lève
    // jamais sur ce chemin) : le hook pushError le message et s'arrête là.
    expect(toasts(store.getState())).toEqual([
      errorToast('Collection with id uc-sel-inconnue not found'),
    ]);
    expect(counter.writes()).toBe(0);
    const read = await getCollectionRepository().getById('uc-sel-fond');
    if (!read.ok) throw read.error;
    expect(read.value.content).toEqual([{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }]);
    expect(await db.annotations.count()).toBe(0);

    unmount();
  });

  it('échec INFRASTRUCTURE de getById (injection hook reading) : rejet brut SANS pushError — getById est hors du try (caractérisation 8, TEL QUEL), aucune écriture', async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-sel-lecture' }));
    await seedCollection(
      makeCollection({
        id: 'uc-sel-lecture',
        content: [{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }],
      }),
    );

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const counter = countCollectionWrites();
    const detach = failCollectionReads('uc-lecture-en-echec');
    let rejection: unknown = null;
    try {
      rejection = await result.current
        .addSelectionToCollection({
          selection: selectionFromFixture(FIXTURE_CANVAS_IDS.slice(1, 2)),
          collectionId: 'uc-sel-lecture',
          sourceId: source.id,
        })
        .then(
          () => null,
          (error: unknown) => error,
        );
    } finally {
      detach();
      counter.detach();
    }

    // Écart face à l'attente du plan (« getById en échec → pushError ») : par
    // l'API publique, le seul échec de getById qui RESOLVE en { ok: false } est
    // l'erreur métier (test précédent) ; la faute de lecture fait REJETER le
    // repository (getById non enveloppé) avant que le try du hook ne s'ouvre
    // (l. 110-116) — la promesse de l'appelant rejette, aucun toast. Verrouillé
    // TEL QUEL, défaut de façade remonté, pas corrigé (règle 7).
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toContain('uc-lecture-en-echec');
    expect(counter.writes()).toBe(0);
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it("échec d'écriture du contenu (injection hook updating de db.collections) : le catch du hook joue (l. 140-142), pushError, contenu rollbacké et annotations non tentées", async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-sel-ecriture' }));
    await seedCollection(
      makeCollection({
        id: 'uc-sel-ecriture',
        content: [{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }],
      }),
    );

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const detach = failCollectionUpdates('uc-contenu-en-echec');
    try {
      await act(async () => {
        await result.current.addSelectionToCollection({
          selection: selectionFromFixture(FIXTURE_CANVAS_IDS.slice(1, 2)),
          collectionId: 'uc-sel-ecriture',
          sourceId: source.id,
        });
      });
    } finally {
      detach();
    }

    // addContentToCollection REJETTE sur transaction avortée (voie réelle du catch du
    // hook) : pushError du message brut, aucune des écritures suivantes n'est tentée,
    // et le put partiel est annulé par la transaction — le contenu garde sa trace.
    const events = toasts(store.getState());
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(EventType.ERROR);
    expect(events[0]?.message).toContain('uc-contenu-en-echec');
    const read = await getCollectionRepository().getById('uc-sel-ecriture');
    if (!read.ok) throw read.error;
    expect(read.value.content).toEqual([{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }]);
    expect(await db.annotations.count()).toBe(0);

    unmount();
  });
});

describe('useCollections — updateCollection', () => {
  it("id absent : retour anticipé avant tout appel d'écriture — zéro mutation (compteurs updating des deux tables) et zéro toast", async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-upd-noid' }));
    await seedCollection(
      makeCollection({
        id: 'uc-upd-noid',
        name: 'Témoin uc-upd-noid',
        content: [{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }],
      }),
    );

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Collection d'appel sans la clé id : le type `Collection` exige `id` (TimeStamp
    // Schema) et le repository n'écrit que des collections identifiées — le garde
    // `id === undefined` du hook (l. 157) n'est donc joignable, en TypeScript, qu'en
    // retirant la clé par décomposition (objet réel sans id au sens JS, comme un import
    // de collection non typée). Le test verrouille le contrat de ce garde : aucun appel
    // d'écriture, aucun toast.
    const { id: _omise, ...sansId } = makeCollection({
      id: 'uc-upd-noid',
      name: 'Renommée sans id',
    });
    void _omise;

    let writes = 0;
    const countWrite = (): void => {
      writes += 1;
    };
    db.collections.hook('updating', countWrite);
    db.collectionContents.hook('updating', countWrite);
    try {
      await act(async () => {
        await result.current.updateCollection(sansId as Collection);
      });
    } finally {
      db.collections.hook('updating').unsubscribe(countWrite);
      db.collectionContents.hook('updating').unsubscribe(countWrite);
    }

    expect(writes).toBe(0);
    expect(toasts(store.getState())).toEqual([]);
    const read = await getCollectionRepository().getById('uc-upd-noid');
    if (!read.ok) throw read.error;
    expect(read.value.name).toBe('Témoin uc-upd-noid');

    unmount();
  });

  it('nominal : seuls les champs listés dans le source sont écrits en base réelle — createdAt intouchable et contentSize NON mis à jour (caractérisation 7, TEL QUEL), toast toast_collection_saved', async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-upd-ok' }));
    await seedCollection(
      makeCollection({
        id: 'uc-upd-ok',
        content: [
          { canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id },
          { canvasId: FIXTURE_CANVAS_IDS[1], sourceId: source.id },
        ],
      }),
    );

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // L'appelant apporte un contentSize prétendument recalculé (99) et des timestamps
    // empoisonnés : le destructuring du hook (l. 146-155) et la liste du repository
    // filtrent — ces valeurs ne doivent jamais atteindre la base.
    await act(async () => {
      await result.current.updateCollection({
        id: 'uc-upd-ok',
        name: 'Renommée uc-upd',
        about: 'À propos uc-upd',
        tags: ['tag-uc-upd'],
        content: [{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }],
        contentSize: 99,
        modelId: 'mod-uc-upd',
        postLayoutModifierChainId: 'plm-uc-upd',
        postOcrModifierChainId: 'pom-uc-upd',
        createdAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
      });
    });

    const read = await getCollectionRepository().getById('uc-upd-ok');
    if (!read.ok) throw read.error;
    expect(read.value.name).toBe('Renommée uc-upd');
    expect(read.value.about).toBe('À propos uc-upd');
    expect(read.value.tags).toEqual(['tag-uc-upd']);
    expect(read.value.modelId).toBe('mod-uc-upd');
    expect(read.value.postLayoutModifierChainId).toBe('plm-uc-upd');
    expect(read.value.postOcrModifierChainId).toBe('pom-uc-upd');
    // Le contenu passe par la table des contenus, à la portée du repository réel.
    expect(read.value.content).toEqual([{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }]);
    // TEL QUEL (caractérisation 7) : contentSize reste à la valeur d'enregistrement —
    // ni le hook ni repository.update n'écrivent ce champ ici, même contradictoire.
    expect(read.value.contentSize).toBe(2);
    // `createdAt` n'est pas dans la liste des champs écrits : intouché. En revanche,
    // le hook d'horodatage re-stampe `updatedAt` à toute écriture, champ listé ou non.
    expect(read.value.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(read.value.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');

    expect(toasts(store.getState())).toEqual([infoToast('toast_collection_saved')]);
    await waitFor(() =>
      expect(result.current.getCollectionById('uc-upd-ok')?.name).toBe('Renommée uc-upd'),
    );

    unmount();
  });

  it("échec d'écriture (injection hook updating de db.collections) : rollback de la transaction, pushError, base intacte et aucun toast succès", async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-upd-err' }));
    await seedCollection(
      makeCollection({
        id: 'uc-upd-err',
        name: 'Intouchable uc-upd',
        content: [{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }],
      }),
    );

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // repository.update ne transforme pas ses rejets : c'est LE catch du hook (l. 171)
    // qu'instrumente cette injection — le message brut du rejet traverse getErrorMessage.
    const detach = failCollectionUpdates('uc-maj-en-echec');
    try {
      await act(async () => {
        await result.current.updateCollection(
          makeCollection({ id: 'uc-upd-err', name: 'Renommée avortée' }),
        );
      });
    } finally {
      detach();
    }

    const events = toasts(store.getState());
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(EventType.ERROR);
    expect(events[0]?.message).toContain('uc-maj-en-echec');
    const read = await getCollectionRepository().getById('uc-upd-err');
    if (!read.ok) throw read.error;
    expect(read.value.name).toBe('Intouchable uc-upd');
    expect(read.value.content).toEqual([{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }]);

    unmount();
  });
});

describe('useCollections — removeElementFromCollection', () => {
  it('délégation pure au succès : le FunctionResult du repository est renvoyé sans transformation, hook silencieux (caractérisation 9) — sémantique de deleteElement non re-testée', async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-del-elem' }));
    await seedCollection(
      makeCollection({
        id: 'uc-del-elem',
        content: [
          { canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id },
          { canvasId: FIXTURE_CANVAS_IDS[1], sourceId: source.id },
        ],
      }),
    );

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const removal = await act(
      async () =>
        await result.current.removeElementFromCollection('uc-del-elem', FIXTURE_CANVAS_IDS[0]),
    );

    // La valeur retournée EST le FunctionResult brut du repository (mêmes clés), sans
    // que le hook y touche ni n'émet le moindre toast (l. 176-178).
    expect(removal.ok).toBe(true);
    if (!removal.ok) throw new Error('inatteignable : suppression attendue réussie');
    expect(Object.keys(removal)).toEqual(['ok', 'value']);
    expect(removal.value.id).toBe('uc-del-elem');
    expect(toasts(store.getState())).toEqual([]);

    // Preuve de traversée seule : le canvas est sorti du contenu en base réelle. Le
    // reliquat (recompute de contentSize, purge des annotations du canvas) appartient
    // à la sémantique deleteElement verrouillée couche data — pas re-testé (règle de
    // non-duplication du plan).
    const read = await getCollectionRepository().getById('uc-del-elem');
    if (!read.ok) throw read.error;
    expect(read.value.content).toEqual([{ canvasId: FIXTURE_CANVAS_IDS[1], sourceId: source.id }]);

    unmount();
  });

  it("délégation pure à l'échec (collection inconnue) : le { ok: false, error } résolu est propagé tel quel, aucun pushError, base intacte", async () => {
    await seedCollection(makeCollection({ id: 'uc-del-fond' }));

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const removal = await act(
      async () =>
        await result.current.removeElementFromCollection('uc-del-inconnue', FIXTURE_CANVAS_IDS[0]),
    );

    // Le repository RESOUT son erreur métier (jamais ne rejette ici) : le hook la
    // relaie brute, silencieusement — l'appelant porte seul l'affichage (caract. 9).
    expect(removal.ok).toBe(false);
    if (removal.ok) throw new Error('inatteignable : suppression attendue en échec');
    expect(Object.keys(removal)).toEqual(['ok', 'error']);
    expect(removal.error.message).toBe('Collection with id uc-del-inconnue not found');
    expect(toasts(store.getState())).toEqual([]);
    expect(await db.collections.count()).toBe(1);

    unmount();
  });
});

describe('useCollections — removeCollection', () => {
  it('échec métier de getById (id inconnu) : pushError du message du repository, aucune suppression, aucun toast succès', async () => {
    await seedCollection(makeCollection({ id: 'uc-rem-fond', name: 'Témoin uc-rem' }));

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.removeCollection('uc-rem-inconnue');
    });

    expect(toasts(store.getState())).toEqual([
      errorToast('Collection with id uc-rem-inconnue not found'),
    ]);
    expect(await db.collections.count()).toBe(1);
    expect((await getCollectionRepository().getById('uc-rem-fond')).ok).toBe(true);
    expect(result.current.collectionCount).toBe(1);

    unmount();
  });

  it('échec de deleteById (injection hook deleting de db.collections) : pushError du DBError wrappé, collection et annotations toujours présentes (rollback), aucun toast succès', async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-rem-echec' }));
    await seedCollection(
      makeCollection({
        id: 'uc-rem-echec',
        content: [{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }],
      }),
    );
    await getAnnotationRepository().addAll([
      makeAnnotation({
        id: 'uc-rem-an',
        collectionId: 'uc-rem-echec',
        canvasId: FIXTURE_CANVAS_IDS[0],
      }),
    ]);

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Contrairement aux autres lectures/écritures du repository, deleteById ENVELOPPE
    // sa transaction (FunctionResult.fromPromise) : la faute injectée RESOUT en
    // { ok: false, DBError } et emprunte la voie pushError du hook (l. 187-189).
    const detach = failCollectionDeletes('uc-suppression-en-echec');
    try {
      await act(async () => {
        await result.current.removeCollection('uc-rem-echec');
      });
    } finally {
      detach();
    }

    const events = toasts(store.getState());
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(EventType.ERROR);
    expect(events[0]?.message).toContain('uc-suppression-en-echec');
    // La suppression des annotations précède le delete de la ligne dans la même
    // transaction : l'injection en fin de parcours fait rollbacker l'ensemble.
    expect((await getCollectionRepository().getById('uc-rem-echec')).ok).toBe(true);
    expect(await db.annotations.count()).toBe(1);

    unmount();
  });

  it('nominal : collection absente de la base réelle et de la liste émise, toast toast_collection_deleted', async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source uc-rem-ok' }));
    await seedCollection(
      makeCollection({
        id: 'uc-rem-ok',
        name: 'À supprimer uc-rem',
        content: [{ canvasId: FIXTURE_CANVAS_IDS[0], sourceId: source.id }],
      }),
    );

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.removeCollection('uc-rem-ok');
    });

    expect(toasts(store.getState())).toEqual([infoToast('toast_collection_deleted')]);
    expect((await getCollectionRepository().getById('uc-rem-ok')).ok).toBe(false);
    expect(await db.collections.count()).toBe(0);
    await waitFor(() => expect(result.current.collectionCount).toBe(0));

    unmount();
  });
});

describe('useCollections — removeMultipleCollections', () => {
  it("scénario mixte (id inconnu puis id existant) : le continue (l. 197-200) joue — pushError du premier puis suppression réussie du second, dans l'ordre des ids", async () => {
    await seedCollection(makeCollection({ id: 'uc-mix-deux', name: 'Seconde uc-mix' }));

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.removeMultipleCollections(['uc-mix-un', 'uc-mix-deux']);
    });

    // L'échec du premier id n'interrompt PAS la boucle : les deux toasts sortent,
    // l'erreur d'abord (voie getById, pushError), le succès ensuite (voie deleteById).
    expect(toasts(store.getState())).toEqual([
      errorToast('Collection with id uc-mix-un not found'),
      infoToast('toast_collection_deleted'),
    ]);
    expect(await db.collections.count()).toBe(0);
    await waitFor(() => expect(result.current.collectionCount).toBe(0));

    unmount();
  });

  it('échec de deleteById pour chaque id (injection hook deleting) : le second continue (l. 201-205) joue aussi — deux pushError ordonnés, rien supprimé, aucun toast succès', async () => {
    await seedCollection(makeCollection({ id: 'uc-mix-f-a', name: 'Première uc-mix-f' }));
    await seedCollection(makeCollection({ id: 'uc-mix-f-b', name: 'Seconde uc-mix-f' }));

    const { result, store, unmount } = renderCollections();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const detach = failCollectionDeletes('uc-suppressions-en-echec');
    try {
      await act(async () => {
        await result.current.removeMultipleCollections(['uc-mix-f-a', 'uc-mix-f-b']);
      });
    } finally {
      detach();
    }

    // Chaque id échoué produit SON pushError (DBError wrappé par deleteById, message
    // préfixé par l'id) : la boucle a bien itéré sur les deux, tous survivent.
    const events = toasts(store.getState());
    expect(events).toHaveLength(2);
    for (const [index, id] of ['uc-mix-f-a', 'uc-mix-f-b'].entries()) {
      expect(events[index]?.type).toBe(EventType.ERROR);
      expect(events[index]?.message).toContain(`Failed to delete collection with id ${id}`);
    }
    expect(await db.collections.count()).toBe(2);
    expect(result.current.collectionCount).toBe(2);

    unmount();
  });
});
