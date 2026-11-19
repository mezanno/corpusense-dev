/**
 * Lots 16-17 — useNamedEntities (cf. docs/roadmap.md, Q11), un fichier pour les deux
 * lots (règle « un fichier de test par hook ») : lot 16 addEntity, lot 17 loadEntities.
 *
 * Périmètre du lot 16 — `addEntity` (useNamedEntities.tsx l. 129-153), vérifié par
 * relecture des lignes écrites via le VRAI repository `getNamedEntityRepository()` :
 * - un sélecteur par `annotationId` (regroupement par `find` sur l'accumulateur) : l'entrée
 *   apparaît à la PREMIÈRE occurrence de son annotationId et les `annotationWordIndex` des
 *   rects s'y empilent dans l'ordre de passage (`push`) ;
 * - `value` = mots des rects joints par une espace, DANS L'ORDRE DES RECTS (pas dans
 *   l'ordre des index — verrouillé par le cas « index dans le désordre ») ;
 * - `annotationIds` dédupliqués (`uniq`, premier passage), alors que les `indexes` d'un
 *   même sélecteur NE le sont PAS : le doublon exact (même rect passé deux fois) donne
 *   `[i, i]` — asymétrie caractérisée telle qu'implémentée, pas légitimée ;
 * - `dataFieldId` = `type.id` du champ fourni ; `id` tiré par `uuid()` à chaque appel —
 *   deux appels identiques produisent deux lignes distinctes (aucun garde « le mot
 *   appartient déjà à une entité » : le TODO du repository namedEntities.ts:13 n'est pas
 *   implémenté, vérifié en base) ;
 * - rects vides : entité `value: ''`, sélecteurs vides, TOUJOURS écrite en base (aucune
 *   garde d'entrée côté hook) — ligne sans `annotationId` étant injoignable par les seules
 *   API du repository (index multiEntrée `*annotationIds`), ce cas-là est relu directement
 *   sur la table réelle `db.namedEntities` (vrai stockage, pas un mock) ;
 * - abonnement : vérifié seulement par son effet observable dans le test « deux appels »
 *   (écriture → ligne visible sur la facette live du hook via `waitFor` de RTL, jamais un
 *   délai fixe ; compteur d'abonnés revenu à sa valeur d'avant-montage au démontage). La
 *   mesure SYNCHRONE du delta n'est pas probante sur ce hook : les providers du harnais
 *   souscrivent de façon différée (constat fait sous `waitFor`, cf. test de fumée du lot 0).
 *   Le contrat complet de coquille (état initial loading, remontée d'erreur) n'a pas de lot
 *   dédié pour `useNamedEntities` dans le palier 2 du plan — à arbitrer au lot 38 (audit).
 *
 * Call sites (vérifiés, règle des lots 16-17) : dans toute l'application, seul
 * `Entities.tsx:8` consomme `useNamedEntities`, et uniquement sa facette `namedEntities`.
 * `addEntity` n'a AUCUN appelant en production — sa sémantique de fusion est verrouillée
 * ici telle que le source la définit ; aucun contrat supplémentaire n'est inventé. C'est
 * cohérent avec la branche morte de `loadEntities` documentée au lot 17 : les deux
 * fonctions d'écriture du hook sont des API orphelines, remontées en rapport de lots.
 *
 * Périmètre du lot 17 — `loadEntities` (useNamedEntities.tsx l. 56-127), call sites
 * vérifiés d'abord (aucun, cf. ci-dessus) et, conformément au plan, testé UNIQUEMENT pour
 * ses effets observables :
 * - les quatre branches `pushError`, relues dans la slice `events` du store réel : résultat
 *   absent pour le couple (scope, worker « openai ») — dont le cas, caractérisé à part, du
 *   nom de worker codé en dur à la l. 60 (TODO du source : un résultat écrit sous un autre
 *   nom de worker est traité comme absent) ; collection absente ; `modelId` non défini sur
 *   la collection ; ligne modèle absente sous le `modelId` porté (deux derniers cas
 *   distincts bien que partageant le même message `error_model_undefined`) ;
 * - le parse du JSON de résultat, hors du bloc try (l. 99) : valeur mal formée, ou valeur
 *   non string que `JSON.parse` coercit (objet → « [object Object] »), se traduit par un
 *   REJET de la promesse (SyntaxError), sans aucun `pushError` — comportement verrouillé
 *   tel quel, sans lui inventer de contrat d'erreur gérée.
 *
 * Branches mortes (caractérisées comme ouvert, jamais garanties comme contrat — règle 7,
 * remontées au lot 38 pour la roadmap) :
 * - la liste `entities` calculée (l. 101-125) est JETÉE : le `yield put(loadEntitiesSuccess(
 *   entities))` est commenté à la l. 126. Sur le chemin nominal complet (résultat +
 *   collection + modèle + annotations présents, JSON valide — tableau ou objet isolé,
 *   items valides ou ignorés par les gardes `position`), rien d'observable ne passe après
 *   le parse : ni écriture dans `namedEntities`, ni toast. C'est ce « rien » qui est
 *   verrouillé par les tests concernés ;
 * - le `catch` du bloc collection/modèle (l. 89-92, `pushError(error_model_undefined)`)
 *   est inatteignable sur le vrai stack : les méthodes utilisées (`collection.getById`,
 *   `model.getById`) livrent un FunctionResult et ne lèvent pas sur ces lectures ;
 *   aucun test ne l'atteint sans injecter dans Dexie (hors frontières du plan) — non
 *   couvert, documenté.
 *
 * Frontières : aucune — base Dexie réelle (harnais du lot 0), store réel (les erreurs
 * `pushError` du lot 17 se lisent dans la slice `events`), `annotationIds` passés au hook
 * par référence stable locale. Pas de mock, pas de délai artificiel.
 *
 * Couverture : `useNamedEntities.tsx` à 96,66 % des énoncés, 100 % des branches et
 * 100 % des fonctions, 96,55 % des lignes (v8, mesuré à l'issue du lot 17) — le seul
 * trou, lignes 90-91 (le `catch` l. 89), est la branche morte ci-dessus, inatteignable
 * sur le vrai stack ; aucune ligne muette non documentée ailleurs.
 */
import { DataModel } from '@/data/models/dataModel/dataModel';
import { Event, EventType } from '@/data/models/event';
import { NamedEntity } from '@/data/models/namedEntity';
import { CanvasScope } from '@/data/models/scope/scope';
import { db } from '@/data/repositories/indexeddb/db';
import {
  getAnnotationRepository,
  getModelRepository,
  getNamedEntityRepository,
  getResultRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  FIXTURE_CANVAS_IDS,
  makeAnnotation,
  makeCollection,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedCollection,
} from '@/hooks/__tests__/harness';
import { RootState } from '@/state/store';
import { waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import useNamedEntities from '../useNamedEntities';

resetTestDbBeforeEach();

/* ------------------------------------------------------------------ */
/* Aides locales — la base réelle est la source d'observation          */
/* ------------------------------------------------------------------ */

/** Champ de modèle minimal (seul `id` est lu par addEntity — le reste documente l'intention). */
function makeField(id: string) {
  return { id, name: `champ-${id}`, type: 'string', color: '#a4d6f6' };
}

/** Un mot sélectionné : seul (annotationId, annotationWordIndex, word) est lu par le hook. */
function makeRect(annotationId: string, annotationWordIndex: number, word: string, line = 0) {
  return {
    line,
    rect: { x: 0, y: line * 20, width: 50, height: 18 },
    word,
    annotationId,
    annotationWordIndex,
  };
}

/** Relecture des entités touchant l'un des annotations donnés, par le VRAI repository. */
async function readEntitiesByAnnotationIds(annotationIds: string[]): Promise<NamedEntity[]> {
  return await getNamedEntityRepository().getByAnnotationIds(annotationIds);
}

function renderNamedEntities(annotationIds: string[]) {
  return renderHookWithHarness(() => useNamedEntities(annotationIds));
}

/** Les toasts tels que posés dans la slice `events` du store réel du harnais. */
function toasts(state: RootState): Event[] {
  return state.events.allEvents;
}

/* Aides du lot 17 — loadEntities : stack complet réel, séquence résultat → collection →
 * modèle → annotations, chaque ligne écrite par son VRAI repository. */

const LE_CANVAS_ID = FIXTURE_CANVAS_IDS[0];

function leScope(collectionId: string): CanvasScope {
  return { collectionId, canvasId: LE_CANVAS_ID };
}

/** Résultat de canvas écrit par le VRAI repository results (worker « openai » par défaut). */
async function seedCanvasResult(
  scope: CanvasScope,
  value: unknown,
  workerName = 'openai',
): Promise<void> {
  await getResultRepository().add({
    scope,
    workerName,
    workerId: 'le-worker-1',
    taskId: 1,
    value,
    params: null,
  });
}

/** Collection liée à un modèle à un champ « montant », écrit par les vrais repositories. */
async function seedCollectionWithModel(collectionId: string, modelId: string): Promise<void> {
  const model: DataModel = {
    id: modelId,
    name: `Modèle ${modelId}`,
    prompt: 'prompt de test',
    fields: [{ id: `${modelId}-field`, name: 'montant', type: 'number', color: '#a4d6f6' }],
  };
  await getModelRepository().update(model);
  await seedCollection(makeCollection({ id: collectionId, name: 'Collection', modelId }));
}

/** Une ligne d'annotation sur le canvas (update = put, sans reclassement — id neuf). */
async function seedCanvasAnnotation(annotationId: string, collectionId: string): Promise<void> {
  await getAnnotationRepository().update(
    makeAnnotation({
      id: annotationId,
      collectionId,
      canvasId: LE_CANVAS_ID,
      value: 'total 42 euros',
    }),
  );
}

/* ------------------------------------------------------------------ */
/* addEntity — fusion des sélecteurs et écriture en base réelle        */
/* ------------------------------------------------------------------ */

describe('useNamedEntities — addEntity : fusion des sélecteurs, écriture vérifiée en base', () => {
  it('mots d’une même annotation : un seul sélecteur, index empilés dans l’ordre des rects, value jointe dans cet ordre', async () => {
    const ids = ['ne-a1'];
    const { result, unmount } = renderNamedEntities(ids);

    await act(async () => {
      await result.current.addEntity({
        rects: [
          makeRect('ne-a1', 2, 'dort'),
          makeRect('ne-a1', 0, 'le'),
          makeRect('ne-a1', 1, 'chat'),
        ],
        type: makeField('field-personne'),
      });
    });

    const entities = await readEntitiesByAnnotationIds(ids);
    expect(entities).toHaveLength(1);
    const entity = entities[0];
    // `value` suit l'ordre des RECTS (dictionnaire de progression), pas celui des index.
    expect(entity.value).toBe('dort le chat');
    expect(entity.dataFieldId).toBe('field-personne');
    expect(entity.selector).toEqual([{ annotationId: 'ne-a1', indexes: [2, 0, 1] }]);
    expect(entity.annotationIds).toEqual(['ne-a1']);
    expect(typeof entity.id).toBe('string');
    expect(entity.id).not.toBe('');

    unmount();
  });

  it('annotationIds chevauchants et entrelacés : sélecteurs à la première occurrence, index regroupés par annotation, ids dédupliqués', async () => {
    const ids = ['ne-b1', 'ne-b2'];
    const { result, unmount } = renderNamedEntities(ids);

    await act(async () => {
      await result.current.addEntity({
        rects: [
          makeRect('ne-b1', 0, 'Jean'),
          makeRect('ne-b2', 5, 'Dupont'),
          makeRect('ne-b1', 3, 'et'),
          makeRect('ne-b2', 0, 'Marie'),
          makeRect('ne-b1', 7, 'Courval'),
        ],
        type: makeField('field-noms'),
      });
    });

    const entities = await readEntitiesByAnnotationIds(ids);
    expect(entities).toHaveLength(1);
    const entity = entities[0];
    expect(entity.value).toBe('Jean Dupont et Marie Courval');
    // Ordre d'apparition des annotationId (premier passage), index groupés par annotation.
    expect(entity.selector).toEqual([
      { annotationId: 'ne-b1', indexes: [0, 3, 7] },
      { annotationId: 'ne-b2', indexes: [5, 0] },
    ]);
    expect(entity.annotationIds).toEqual(['ne-b1', 'ne-b2']);

    unmount();
  });

  it('doublon exact (même rect passé deux fois) : annotationIds dédupliqués mais indexes NON dédupliqués (asymétrie caractérisée)', async () => {
    const ids = ['ne-c1'];
    const { result, unmount } = renderNamedEntities(ids);

    await act(async () => {
      await result.current.addEntity({
        rects: [
          makeRect('ne-c1', 3, 'mot'),
          makeRect('ne-c1', 3, 'mot'),
          makeRect('ne-c1', 4, 'suivant'),
        ],
        type: makeField('field-c'),
      });
    });

    const entities = await readEntitiesByAnnotationIds(ids);
    expect(entities).toHaveLength(1);
    const entity = entities[0];
    expect(entity.value).toBe('mot mot suivant');
    // Le push sur index n'a aucune garde : le doublon exact reste présent…
    expect(entity.selector).toEqual([{ annotationId: 'ne-c1', indexes: [3, 3, 4] }]);
    // …alors que uniq() dédouble la liste des ids. Différence verrouillée telle quelle.
    expect(entity.annotationIds).toEqual(['ne-c1']);

    unmount();
  });

  it('deux appels avec les mêmes rects : deux lignes distinctes (uuid par appel, aucune garde d’appartenance) — et la coquille ne fuit pas au démontage', async () => {
    const ids = ['ne-d1'];
    const before = countLiveQuerySubscribers();
    const { result, unmount } = renderNamedEntities(ids);

    const payload = {
      rects: [makeRect('ne-d1', 1, 'encore')],
      type: makeField('field-d'),
    };
    await act(async () => {
      await result.current.addEntity(payload);
    });
    await act(async () => {
      await result.current.addEntity(payload);
    });

    // Preuve d'écriture en base par le VRAI repository (canal d'observation de référence).
    const entities = await readEntitiesByAnnotationIds(ids);
    expect(entities).toHaveLength(2);
    expect(entities[0].id).not.toBe(entities[1].id);
    // Le repository ne refuse pas le mot déjà entité (TODO namedEntities.ts:13 non implémenté).
    expect(entities[0].selector).toEqual(entities[1].selector);
    expect(entities[0].value).toBe('encore');

    // La coquille `namedEntities` est bien vivante : les mêmes lignes ressortent de sa
    // facette live (abonnement effectif — mesuré par `waitFor` de RTL, jamais par un
    // délai fixe ; la mesure SYNCHRONE du compteur d'abonnés n'est pas probante ici, les
    // providers du harnais souscrivant de façon différée — cf. test de fumée du lot 0).
    await waitFor(() => expect(result.current.namedEntities).toHaveLength(2));
    expect(result.current.namedEntities.map((entity) => entity.id)).toEqual(
      expect.arrayContaining(entities.map((entity) => entity.id)),
    );

    unmount();
    // Zéro fuite : le démontage relâche l'abonnement du hook ET ceux des providers.
    expect(countLiveQuerySubscribers()).toBe(before);
  });

  it('rects vides : aucune garde d’entrée — entité vide écrite en base (relu sur la table, injoignable par le repository)', async () => {
    const ids = ['ne-e1'];
    const { result, unmount } = renderNamedEntities(ids);

    await act(async () => {
      await result.current.addEntity({ rects: [], type: makeField('field-e') });
    });

    // getByAnnotationIds est indexé sur *annotationIds : une entité au tableau vide n'y
    // apparaît pas. Seule fenêtre d'observation honnête : la table réelle elle-même.
    const all = await db.namedEntities.toArray();
    expect(all).toHaveLength(1);
    const entity = all[0];
    expect(entity.value).toBe('');
    expect(entity.selector).toEqual([]);
    expect(entity.annotationIds).toEqual([]);
    expect(entity.dataFieldId).toBe('field-e');
    // Et elle est bien invisible aux relectures par ids (aucune annotation portée).
    expect(await readEntitiesByAnnotationIds(ids)).toEqual([]);

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* loadEntities — effets observables uniquement (lot 17)               */
/* ------------------------------------------------------------------ */

describe('useNamedEntities — loadEntities : erreurs pushError et parse, branche morte documentée', () => {
  it('aucun résultat pour le couple (scope, „openai“) : pushError(error_result_undefined), rien d’autre ne se passe', async () => {
    const scope = leScope('le-res-manquant');
    const { result, store, unmount } = renderNamedEntities(['le-res-manquant-ann']);

    await act(async () => {
      await result.current.loadEntities(scope);
    });

    expect(toasts(store.getState())).toEqual([
      { message: 'error_result_undefined', type: EventType.ERROR },
    ]);
    expect(await db.namedEntities.toArray()).toEqual([]);

    unmount();
  });

  it('résultat écrit sous un autre nom de worker : traité comme absent — worker „openai“ codé en dur (caractérisation du TODO l. 60)', async () => {
    const scope = leScope('le-res-worker');
    await seedCanvasResult(scope, '[]', 'mistral');
    const { result, store, unmount } = renderNamedEntities(['le-res-worker-ann']);

    await act(async () => {
      await result.current.loadEntities(scope);
    });

    expect(toasts(store.getState())).toEqual([
      { message: 'error_result_undefined', type: EventType.ERROR },
    ]);

    unmount();
  });

  it('résultat présent mais collection absente : pushError(error_collection_undefined)', async () => {
    const scope = leScope('le-collection-absente');
    await seedCanvasResult(scope, '[]');
    const { result, store, unmount } = renderNamedEntities(['le-collection-absente-ann']);

    await act(async () => {
      await result.current.loadEntities(scope);
    });

    expect(toasts(store.getState())).toEqual([
      { message: 'error_collection_undefined', type: EventType.ERROR },
    ]);

    unmount();
  });

  it('collection sans modelId : pushError(error_model_undefined)', async () => {
    const scope = leScope('le-sans-modele');
    await seedCanvasResult(scope, '[]');
    await seedCollection(makeCollection({ id: 'le-sans-modele', name: 'Collection' }));
    const { result, store, unmount } = renderNamedEntities(['le-sans-modele-ann']);

    await act(async () => {
      await result.current.loadEntities(scope);
    });

    expect(toasts(store.getState())).toEqual([
      { message: 'error_model_undefined', type: EventType.ERROR },
    ]);

    unmount();
  });

  it('modelId pointant un modèle absent : pushError(error_model_undefined) — même message, branche distincte', async () => {
    const scope = leScope('le-model-missing');
    await seedCanvasResult(scope, '[]');
    await seedCollection(
      makeCollection({
        id: 'le-model-missing',
        name: 'Collection',
        modelId: 'le-model-inexistant',
      }),
    );
    const { result, store, unmount } = renderNamedEntities(['le-model-missing-ann']);

    await act(async () => {
      await result.current.loadEntities(scope);
    });

    expect(toasts(store.getState())).toEqual([
      { message: 'error_model_undefined', type: EventType.ERROR },
    ]);

    unmount();
  });

  it('chaîne complète, JSON tableau (valides et items ignorés) : entités calculées puis JETÉES — ni écriture, ni toast (branche morte l. 126, caractérisée)', async () => {
    const scope = leScope('le-full-array');
    await seedCollectionWithModel('le-full-array', 'le-model-1');
    await seedCanvasAnnotation('le-full-array-ann', 'le-full-array');
    await seedCanvasResult(
      scope,
      JSON.stringify([
        null,
        42,
        'str',
        { position: 'abc' }, // position non-array de numbers → item ignoré (garde isNumberArray)
        { autre: true }, // pas de position → item ignoré
        { position: [0] }, // position valide mais aucun champ du modèle → fields.forEach garde l. 115
        { position: [0], montant: '42' }, // item valide : entité générée… puis jetée
      ]),
    );
    const { result, store, unmount } = renderNamedEntities(['le-full-array-ann']);

    await act(async () => {
      await expect(result.current.loadEntities(scope)).resolves.toBeUndefined();
    });

    // Rien d'observable après le parse : le `yield put(loadEntitiesSuccess(entities))` est
    // commenté (l. 126) — verrouillé comme « aucun effet », PAS comme contrat de succès.
    expect(toasts(store.getState())).toEqual([]);
    expect(await db.namedEntities.toArray()).toEqual([]);

    unmount();
  });

  it('chaîne complète, JSON objet isolé (non tableau) : wrappé en liste, même — rien d’observable (branche morte l. 126)', async () => {
    const scope = leScope('le-full-object');
    await seedCollectionWithModel('le-full-object', 'le-model-2');
    await seedCanvasAnnotation('le-full-object-ann', 'le-full-object');
    await seedCanvasResult(scope, JSON.stringify({ position: [0], montant: '42' }));
    const { result, store, unmount } = renderNamedEntities(['le-full-object-ann']);

    await act(async () => {
      await expect(result.current.loadEntities(scope)).resolves.toBeUndefined();
    });

    expect(toasts(store.getState())).toEqual([]);
    expect(await db.namedEntities.toArray()).toEqual([]);

    unmount();
  });

  it('valeur de résultat mal formée : JSON.parse hors du try — rejet SyntaxError, aucun toast, rien d’écrit (caractérisation du parse)', async () => {
    const scope = leScope('le-bad-json');
    await seedCollectionWithModel('le-bad-json', 'le-model-3');
    await seedCanvasAnnotation('le-bad-json-ann', 'le-bad-json');
    await seedCanvasResult(scope, 'ceci n’est pas du json');
    const { result, store, unmount } = renderNamedEntities(['le-bad-json-ann']);

    await expect(result.current.loadEntities(scope)).rejects.toThrow(SyntaxError);

    expect(toasts(store.getState())).toEqual([]);
    expect(await db.namedEntities.toArray()).toEqual([]);

    unmount();
  });

  it('valeur de résultat non string (objet) : coercée en « [object Object] » par JSON.parse — même rejet, aucun toast (caractérisation)', async () => {
    const scope = leScope('le-object-value');
    await seedCollectionWithModel('le-object-value', 'le-model-4');
    await seedCanvasAnnotation('le-object-value-ann', 'le-object-value');
    await seedCanvasResult(scope, { deja: 'passe en objet' });
    const { result, store, unmount } = renderNamedEntities(['le-object-value-ann']);

    await expect(result.current.loadEntities(scope)).rejects.toThrow(SyntaxError);

    expect(toasts(store.getState())).toEqual([]);
    expect(await db.namedEntities.toArray()).toEqual([]);

    unmount();
  });
});
