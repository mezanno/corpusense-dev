/**
 * Lot 35 — useAnnotationModifierActions, palier 2 (cf. docs/roadmap.md, Q11).
 *
 * REQUALIFICATION assumée (discipline des lots 26-28) : `useAnnotationModifierActions`
 * (src/hooks/data/annotations/useAnnotationModifierActions.tsx, 96 lignes) n'est PAS
 * une coquille de valeur. Sa `useLiveQuery` (l. 39, querier
 * `annotationLiveRepository.getByScopeAndType(scope, applyModifierChainTo)` —
 * `db.annotations.where('[canvasId+collectionId+type]').sortBy('order')`,
 * annotations.live.ts:47-54, lecture MATÉRIALISANTE) n'est JAMAIS exposée : le seul
 * membre retourné est l'action `applyModifierChain` (l. 93). Le contrat commun
 * s'applique DONC PAR LES EFFETS OBSERVABLES DE LA LECTURE LIVE : la liveQuery
 * alimente (a) l'écriture des duplicatas TEMP dans `db.annotationsTemp` à chaque
 * changement d'émission quand `showPreview` est vrai (l. 53-65), et (b) le contenu
 * sur lequel `applyModifierChain` travaille (l. 67-91). Spécificité table du plan :
 * « lecture live attendue uniquement » — AUCUN scénario de mutation de données en
 * cours de montage n'est dupliqué ici (réactivité des annotations et sémantique des
 * repositories = campagne Q2) : les annotations sont écrites par le VRAI repository
 * AVANT le montage ; seuls des changements de PROPS (scope, showPreview) déplacent
 * la requête, ce qui est le plumbing propre au hook.
 *
 * Contrat commun, point par point :
 * - état initial (`undefined` → loading) : DÉVIATION caractérisée, verrouillée telle
 *   qu'implémentée — `useLiveQuery` reçoit `[]` comme troisième argument
 *   (defaultResult, l. 39) ET le hook n'expose aucune valeur : depuis l'API,
 *   chargement et base vide sont INDISTINGUABLES (aucun `isLoading`, aucune liste).
 *   Le pendant observable : au premier rendu synchronique, l'effet
 *   `[scopeAnnotations, showPreview]` tourne sur le repli `[]` — il NE PEUT RIEN
 *   dupliquer — et la bascule de l'émission devient visible par l'APPARITION des
 *   copies TEMP en base (l. 56-59 ; test 1). `liveLoading.test.tsx` n'est PAS
 *   étendu : ce hook n'a pas d'`isLoading` à distinguer, même verdict qu'aux lots
 *   24/25 ;
 * - bascule après première émission : les duplicatas TEMP de l'émission réelle
 *   apparaissent dans `annotationsTemp` (contenu = l'émission, ids nouveaux —
 *   `duplicateAnnotation`+`changeType`, couche data) alors que la table
 *   `annotations` n'a pas bougé (test 1) ; un changement de `scope` en cours de
 *   montage déPLACE la requête (deps de `useCallback` l. 34-37 = valeurs de scope +
 *   `applyModifierChainTo`) et donc le contenu dupliqué, sans re-souscription
 *   (tests 1 et 2) ;
 * - remontée d'erreur : AUCUNE surface d'erreur au retour (pas de valeur, pas de
 *   try/catch côté lecture) — `useLiveQuery` relance la panne de lecture en PHASE
 *   DE RENDU : seule une ErrorBoundary consommateur la rattrape (test 4). Pour
 *   l'action, le hook ne rattrape rien non plus : le rejet (échec de `schema.parse`
 *   avant toute écriture, ou échec d'écriture APRÈS effacement du repli preview)
 *   remonte BRUT à l'appelant (test 7, caractérisations 6 et 7) ;
 * - désabonnement au démontage : preuve comportementale (une écriture de duplicatas
 *   ne peut venir que d'une émission, donc d'un abonnement vivant) et compteur
 *   `countLiveQuerySubscribers` comparé APRÈS matérialisation à une référence
 *   « providers du harnais seuls » (leçon des lots 16/24-34) — le hook ajoute
 *   EXACTEMENT 1 abonné (sa liveQuery unique), stable sous `rerender` et sous
 *   changement de scope, retour EXACT à la valeur d'avant-montage après `unmount`,
 *   dans les sept tests.
 *
 * Frontière d'erreur : injection par l'API publique RÉELLE des hooks Dexie —
 * `db.annotations.hook('reading')` (le querier `sortBy` matérialise, contrairement
 * aux `count()` des lots 31/32 : atteignable, mécanisme des lots 24/25/34) et
 * `db.annotationsTemp.hook('creating')` (voie d'écriture de l'action) ; compteurs
 * d'écritures par `hook('creating')`/`hook('deleting')` pour observer la voie
 * nominale sans rien mocker (précédent lot 6). Tout est retiré en `finally`.
 * ErrorBoundary de test : frontière d'affichage, pas un mock (précédents lots 4 et
 * 24-34). Écritures en base par les VRAIS repositories (`getAnnotationRepository`,
 * `getAnnotationTempRepository`) ; pas de mock de Dexie, pas de `vi.mock`, pas de
 * délai artificiel, aucun appel réseau.
 *
 * Call sites (production, vérifiés — grep `useAnnotationModifierActions`, 1 seul
 * fichier hors la source et ses tests) :
 * - `applyModifierChain` (SEUL membre de l'API) : `ScopedModifierChainToolbar.tsx`
 *   (l. 31-35 ; appelé par `applyChain` l. 37-39, déclenché par le bouton « apply »
 *   `onClick={() => void applyChain()}` et par l'aperçu `debouncePreview` —
 *   le rejet n'y est NI capturé NI toasté, caractérisation 7) ;
 * - la toolbar n'est rendue QUE par `ModifierChainFlow.tsx` l. 321-330, quand
 *   `scope` est fourni ET `modifiers.length > 0` : en pratique la page viewer
 *   (`CanvasViewer.tsx:91`, scope = collection + canvas courants) ; la page
 *   `ModifierChainManagerPage.tsx:24` monte le flow SANS scope → le hook n'y est
 *   jamais monté. `showPreview` y est un état initial `false` et
 *   `applyModifierChainTo` un `ElementType.TEXT_REGION` par défaut
 *   (ModifierChainFlow.tsx:59-60, 63) : le hook est toujours monté avec un
 *   `CanvasScope` complet.
 * Aucun test de composants ne mocke ce hook (grep sur les suites existantes).
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * 1. aucune valeur ni indicateur de chargement exposés (defaultResult `[]` l. 39 +
 *   retour limité à l'action l. 93) : le contrat d'état initial du palier 2 ne peut
 *   être observé QUE par les effets de la bascule (test 1) ;
 * 2. effet de montage/démontage à deps `[]` (l. 41-51) : l'effacement de
 *   `collectionId` est figé sur le scope du PREMIER rendu — changer de collection
 *   en cours de montage laisse le repli de l'ancienne collection en place (jamais
 *   effacé au changement, l. 55 n'effaçant que la NOUVELLE) et, au démontage,
 *   n'efface que l'ANCIENNE : le repli de la collection COURANTE fuite. Verrouillé
 *   TEL QUEL au test 3 (suite à un correctif éventuel à remonter) ;
 * 3. `applyModifierChain` n'est pas mémoïsée (l. 67, recréée à chaque rendu) et
 *   clôt sur l'émission DU RENDU qui l'a produite : risque symétrique de la
 *   caractérisation 4 du lot 34. Vérifié call sites : la toolbar l'appelle depuis
 *   le rendu courant — sans effet observable en production, consigné (test 1) ;
 * 4. effets en `void (async …)()` fire-and-forget (l. 42-44, 47-49, 54-60) : aucune
 *   promesse n'est exposée pour attendre ces écritures ; elles ne sont observables
 *   que par l'état FINAL de la base (`waitFor` sur relecture réelle), jamais par un
 *   délai — conformément à l'interdiction des délais artificiels ;
 * 5. en mode commit, une chaîne SANS AUCUNE valeur renseignée déclenche quand même
 *   le aller-retour `deleteByIds` + `addAll` (l. 88-89, hors boucle) : les lignes
 *   sont supprimées puis réécrites identiques (leurs `order` sont recomputés par
 *   `addAll` — sémantique repository verrouillée Q2, non assertée) — compteur
 *   public `creating` au test 5 ;
 * 6. en mode preview, l'action efface le repli AVANT d'écrire (l. 85-86) : si
 *   l'écriture échoue, `annotationsTemp` reste VIDÉ — intermédiaire destructif non
 *   rattrapé (test 7b) ;
 * 7. aucun try/catch dans `applyModifierChain` : rejet brut remonté à l'appelant,
 *   que le call site jette en `void` (rejet non traité, pas de toast) — consigné,
 *   non corrigé ;
 * 8. `values[modifier.id] ?? {}` (l. 78) : côté droit structurellement
 *   inatteignable, la garde l. 77 (`!== undefined`) l'a exclue — code défensif,
 *   pas un trou de test ;
 * 9. panne de lecture live = démontage du sous-arbre consommateur par la boundary
 *   (test 4) : le « chargement perpétuel » caractérisé aux lots 29-34 est ici
 *   d'autant plus invisible que le hook n'expose RIEN — la panne ne se voit que
 *   par l'écran cassé ;
 * 10. les duplicatas TEMP portent des ids neufs à chaque réécriture
 *     (`duplicateAnnotation`, couche data) : les ids ne sont donc JAMAIS assertés
 *     comme stables ; seul le contenu (portée + type + valeur) est comparé, et la
 *     réécriture prouvée par les compteurs `creating` (tests 1 et 6).
 */
import { Annotation, ElementType } from '@/data/models/annotations/annotation';
import { getAnnotationType, getAnnotationValue } from '@/data/models/annotations/annotation.utils';
import { ReOrderModifier } from '@/data/models/modifiers/ReOrderModifier';
import { CanvasScope } from '@/data/models/scope/scope';
import { db } from '@/data/repositories/indexeddb/db';
import {
  getAnnotationRepository,
  getAnnotationTempRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  FIXTURE_CANVAS_IDS,
  makeAnnotation,
  renderHookWithHarness,
  resetTestDbBeforeEach,
} from '@/hooks/__tests__/harness';
import { act, waitFor } from '@testing-library/react';
import type { EntityTable } from 'dexie';
import { Component, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import useAnnotationModifierActions from '../useAnnotationModifierActions';

resetTestDbBeforeEach();

type HookProps = {
  scope: CanvasScope;
  showPreview: boolean;
  applyModifierChainTo: ElementType;
};

/** Mounte le hook sur des props rendues MUTABLES : un `setProps` re-rend sans délai. */
function renderActions(initialProps: HookProps) {
  let currentProps = initialProps;
  const rendered = renderHookWithHarness(() => useAnnotationModifierActions(currentProps));
  return {
    ...rendered,
    setProps: (patch: Partial<HookProps>) => {
      currentProps = { ...currentProps, ...patch };
      rendered.rerender();
    },
  };
}

/** Écritures AVANT montage, par le VRAI repository annotations (`update` = put, ids et ordres explicites — précédent lots 6-7). */
async function seedAnnotations(annotations: Annotation[]): Promise<void> {
  const annotationRepository = getAnnotationRepository();
  for (const annotation of annotations) {
    await annotationRepository.update(annotation);
  }
}

async function seedTemp(annotations: Annotation[]): Promise<void> {
  await getAnnotationTempRepository().addAll(annotations);
}

function readScopeAnnotations(collectionId: string, canvasId: string): Promise<Annotation[]> {
  return getAnnotationRepository().getByScopeAndTypes({ collectionId, canvasId }, [
    ElementType.TEXT_LINE,
  ]);
}

function readTemp(): Promise<Annotation[]> {
  return getAnnotationTempRepository().getAll();
}

/** Signature contenu hors id, hors order et hors type (les duplicatas sont TEMP par construction) : ce que le hook doit préserver. */
function payload(annotations: Annotation[]): string[] {
  return annotations.map((a) => `${a.collectionId}|${a.canvasId}|${getAnnotationValue(a)}`).sort();
}

function ids(annotations: { id: string }[]): string[] {
  return annotations.map((a) => a.id).sort();
}

/** Compteurs d'écritures par l'API publique RÉELLE des hooks Dexie (précédent lot 6) — jamais des mocks. */
function trackWrites(table: EntityTable<Annotation, 'id'>) {
  let created = 0;
  let deleted = 0;
  const onCreate = (): void => {
    created += 1;
  };
  const onDelete = (): void => {
    deleted += 1;
  };
  table.hook('creating', onCreate);
  table.hook('deleting', onDelete);
  return {
    counts: () => ({ created, deleted }),
    stop: () => {
      table.hook('creating').unsubscribe(onCreate);
      table.hook('deleting').unsubscribe(onDelete);
    },
  };
}

/**
 * Quiescence déterministe après `unmount` : le cleanup de l'effet de montage écrit
 * en fire-and-forget (caractérisation 4). Un `deleteByCollection` awaited par le
 * VRAI repository ouvre sa transaction sur la même table APRÈS celle du cleanup
 * (les transactions readwrite Dexie sont sérialisées à l'ouverture) : l'attendre
 * garantit que la transaction résiduelle du hook est terminée AVANT le
 * `createTestDb()` du test suivant — sinon `db.close()` l'interrompt et Dexie émet
 * un rejet `DatabaseClosedError` non traité. Pas un délai : une écriture réelle.
 */
async function flushTemp(...collectionIds: string[]): Promise<void> {
  for (const collectionId of collectionIds) {
    await getAnnotationTempRepository().deleteByCollection(collectionId);
  }
}

/**
 * ErrorBoundary de test (frontière d'affichage, pas un mock — même précédent que
 * les lots 4 et 24-34) : capte en ref l'erreur que `useLiveQuery` relance en phase
 * de rendu et rend un fallback à la place du sous-arbre démonté.
 */
class CrashBoundary extends Component<
  { children: ReactNode; onError: (error: unknown) => void },
  { crashed: boolean }
> {
  state = { crashed: false };

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    if (this.state.crashed) {
      return <div>rendu éclaté</div>;
    }
    return this.props.children;
  }
}

describe('useAnnotationModifierActions — coquille d action liveQuery (contrat commun)', () => {
  it('api surface action seule, bascule a la premiere emission par les duplicatas temp, +1 abonne, stable au rerender, wipe au demontage', async () => {
    const canvasId = FIXTURE_CANVAS_IDS[0];
    await seedAnnotations([
      makeAnnotation({
        id: 'ama-35-t1-ligne-1',
        collectionId: 'ama-35-t1-collection',
        canvasId,
        type: ElementType.TEXT_LINE,
        value: 'Premiere ligne',
        order: 0,
      }),
      makeAnnotation({
        id: 'ama-35-t1-ligne-2',
        collectionId: 'ama-35-t1-collection',
        canvasId,
        type: ElementType.TEXT_LINE,
        value: 'Seconde ligne',
        order: 1,
      }),
    ]);
    const emitted = await readScopeAnnotations('ama-35-t1-collection', canvasId);

    // Référence « providers du harnais seuls » : matérialiser leurs abonnements
    // différés, les relâcher, puis mesurer (leçon des lots 16/24-34).
    const subscribersBefore = countLiveQuerySubscribers();
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    const { result, rerender, unmount } = renderActions({
      scope: { collectionId: 'ama-35-t1-collection', canvasId },
      showPreview: true,
      applyModifierChainTo: ElementType.TEXT_LINE,
    });

    // Premier rendu SYNCHRONE : l'API est exactement l'action seule — ni valeur, ni
    // loading (caractérisation 1 : le defaultResult `[]` masque undefined → loading,
    // indistinguable d'une base vide depuis l'API).
    expect(Object.keys(result.current)).toEqual(['applyModifierChain']);
    expect(typeof result.current.applyModifierChain).toBe('function');

    // Bascule de la première émission, SEUL canal observable : l'effet preview
    // (l. 53-65) n'a pu écrire les duplicatas qu'APRÈS avoir reçu l'émission réelle
    // (sur le repli `[]` initial, `duplicateAnnotations` ne produit rien).
    let temp: Awaited<ReturnType<typeof readTemp>> = [];
    await waitFor(async () => {
      temp = await readTemp();
      expect(temp).toHaveLength(2);
    });
    // Les lignes live n'ont PAS bougé : le preview écrit dans annotationsTemp, jamais
    // dans annotations (spécificité « lecture live attendue uniquement »).
    expect(await readScopeAnnotations('ama-35-t1-collection', canvasId)).toEqual(emitted);
    // Les duplicatas portent des ids neufs (caractérisation 10) et le type TEMP, pour
    // le contenu exact de l'émission.
    expect(ids(temp)).not.toEqual(ids(emitted));
    expect(temp.map((a) => getAnnotationType(a))).toEqual([ElementType.TEMP, ElementType.TEMP]);
    expect(payload(temp)).toEqual(payload(emitted));
    const effectTempIds = ids(temp);

    // Abonnement prouvé deux façons : l'émission observée ci-dessus ne peut venir
    // que d'un abonnement vivant, et le compteur vaut la référence + 1 (liveQuery
    // unique du hook).
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

    // Rerender à valeurs égales (objet scope neuf) : deps du `useCallback` l. 34-37
    // comparées PAR VALEUR → pas de re-souscription, pas de nouvelle émission,
    // l'effet ne se relance pas (le repli garde ses lignes). Caractérisation 3 :
    // l'action, non mémoïsée, change d'identité à chaque rendu.
    rerender();
    expect(Object.keys(result.current)).toEqual(['applyModifierChain']);
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);
    expect(ids(await readTemp())).toEqual(effectTempIds);

    unmount();
    // Désabonnement : retour EXACT à la valeur d'avant-montage…
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    // …et le cleanup de l'effet de montage (l. 46-50) efface le repli de la
    // collection : l'écriture étant fire-and-forget (caractérisation 4), on
    // l'observe par l'état final de la base, sans délai.
    await waitFor(async () => {
      expect(await readTemp()).toEqual([]);
    });
    await flushTemp('ama-35-t1-collection');
  });

  it('changement de canvas dans la meme collection deplace la requete live sans re-souscription', async () => {
    const [canvas1, canvas2] = FIXTURE_CANVAS_IDS;
    await seedAnnotations([
      makeAnnotation({
        id: 'ama-35-t2-c1-ligne',
        collectionId: 'ama-35-t2-collection',
        canvasId: canvas1,
        type: ElementType.TEXT_LINE,
        value: 'Ligne du canvas 1',
        order: 0,
      }),
      makeAnnotation({
        id: 'ama-35-t2-c2-ligne',
        collectionId: 'ama-35-t2-collection',
        canvasId: canvas2,
        type: ElementType.TEXT_LINE,
        value: 'Ligne du canvas 2',
        order: 0,
      }),
    ]);

    // Référence « providers du harnais seuls » (gabarit des lots 24-34) : les
    // sources liveQuery multicastées par dexie-react-hooks survivent CLEANUP_DELAY
    // (3 s) après le démontage — seul un socle matérialisé puis relâché dans le
    // même test donne une base de comparaison stable pour les assertions ci-dessous.
    const subscribersBefore = countLiveQuerySubscribers();
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    const { setProps, unmount } = renderActions({
      scope: { collectionId: 'ama-35-t2-collection', canvasId: canvas1 },
      showPreview: true,
      applyModifierChainTo: ElementType.TEXT_LINE,
    });

    // Émission du scope initial → repli du canvas 1 seul.
    await waitFor(async () => {
      const temp = await readTemp();
      expect(temp).toHaveLength(1);
      expect(payload(temp)).toEqual(
        payload(await readScopeAnnotations('ama-35-t2-collection', canvas1)),
      );
    });
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

    // Changer la prop scope (pas les données) re-exécute la liveQuery aux nouvelles
    // deps (l. 34-39) : l'émission change, l'effet preview remplace le repli de la
    // collection d'un bloc. Toujours UN SEUL abonné (la liveQuery unique du hook).
    setProps({ scope: { collectionId: 'ama-35-t2-collection', canvasId: canvas2 } });
    await waitFor(async () => {
      const temp = await readTemp();
      expect(temp).toHaveLength(1);
      expect(payload(temp)).toEqual(
        payload(await readScopeAnnotations('ama-35-t2-collection', canvas2)),
      );
    });
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    await waitFor(async () => {
      expect(await readTemp()).toEqual([]);
    });
    await flushTemp('ama-35-t2-collection');
  });

  it('changement de collection : le repli de lancienne survit au switch et au demontage (caracterisation 2, verrouille tel quel)', async () => {
    const canvasId = FIXTURE_CANVAS_IDS[0];
    await seedAnnotations([
      makeAnnotation({
        id: 'ama-35-t3-a-ligne',
        collectionId: 'ama-35-t3-collection-a',
        canvasId,
        type: ElementType.TEXT_LINE,
        value: 'Collection A',
        order: 0,
      }),
      makeAnnotation({
        id: 'ama-35-t3-b-ligne',
        collectionId: 'ama-35-t3-collection-b',
        canvasId,
        type: ElementType.TEXT_LINE,
        value: 'Collection B',
        order: 0,
      }),
    ]);

    const subscribersBefore = countLiveQuerySubscribers();
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    const { setProps, unmount } = renderActions({
      scope: { collectionId: 'ama-35-t3-collection-a', canvasId },
      showPreview: true,
      applyModifierChainTo: ElementType.TEXT_LINE,
    });

    await waitFor(async () => {
      const temp = await readTemp();
      expect(temp).toHaveLength(1);
      expect(payload(temp)).toEqual(
        payload(await readScopeAnnotations('ama-35-t3-collection-a', canvasId)),
      );
    });
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

    // L'effet de l'émission n'efface que la collection COURANTE (useEffectEvent,
    // l. 55) : le repli de l'ancienne collection, écrit au tour précédent, SURVIT.
    setProps({ scope: { collectionId: 'ama-35-t3-collection-b', canvasId } });
    await waitFor(async () => {
      expect(await readTemp()).toHaveLength(2);
    });
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);

    // Au démontage, le cleanup de l'effet de montage à deps `[]` (l. 41-51) est figé
    // sur la collection A du premier rendu (caractérisation 2 — soupçonné défaut,
    // verrouillé TEL QUEL, règle 7) : c'est le repli de A qui part, celui de B FUITE.
    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    await waitFor(async () => {
      const temp = await readTemp();
      expect(temp).toHaveLength(1);
      expect(payload(temp)).toEqual(
        payload(await readScopeAnnotations('ama-35-t3-collection-b', canvasId)),
      );
    });
    // Repli « qui fuite » : vérifié comme implémenté, puis nettoyé pour la
    // quiescence de la table avant le test suivant (flushTemp).
    await flushTemp('ama-35-t3-collection-a', 'ama-35-t3-collection-b');
  });

  it('lecture live en echec : jet au rendu jusqu a la boundary, aucune surface d erreur, rien ecrit, zero fuite', async () => {
    const canvasId = FIXTURE_CANVAS_IDS[0];
    await seedAnnotations([
      makeAnnotation({
        id: 'ama-35-t4-ligne',
        collectionId: 'ama-35-t4-collection',
        canvasId,
        type: ElementType.TEXT_LINE,
        order: 0,
      }),
    ]);
    const scope = { collectionId: 'ama-35-t4-collection', canvasId };

    const subscribersBefore = countLiveQuerySubscribers();
    const caught: { error?: unknown } = {};
    // Injection par l'API publique RÉELLE (le querier `sortBy` matérialise —
    // contrairement aux `count()` des lots 31/32 — la faute est donc ATTEIGNABLE) :
    // posée AVANT le montage, aucune écriture pendant la fenêtre, et AUCUN provider
    // du harnais ne liveQuery `annotations` (AnnotationContext est un contexte de
    // page, hors wrapper) : seule la requête du hook bute sur l'injection.
    const failReading = (): void => {
      throw new Error('annotations-lecture-en-echec-35');
    };
    db.annotations.hook('reading', failReading);
    try {
      const { result, unmount } = renderHookWithHarness(
        () =>
          useAnnotationModifierActions({
            scope,
            showPreview: true,
            applyModifierChainTo: ElementType.TEXT_LINE,
          }),
        {
          wrapper: ({ children }) => (
            <CrashBoundary onError={(error) => (caught.error = error)}>{children}</CrashBoundary>
          ),
        },
      );

      // Caractérisation 9 : la panne de lecture ne produit aucune valeur d'erreur —
      // le dernier rendu commis est celui du repli `[]`, l'API reste l'action seule ;
      // c'est le sous-arbre consommateur qui saute (le « chargement perpétuel » des
      // lots 29-34, aggravé : ici, rien n'est exposé du tout).
      await waitFor(() => expect(caught.error).toBeDefined());
      expect(String(caught.error)).toContain('annotations-lecture-en-echec-35');
      expect(Object.keys(result.current)).toEqual(['applyModifierChain']);

      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.annotations.hook('reading').unsubscribe(failReading);
    }

    // La lecture en échec n'a rien écrit : ni duplicata (aucune émission n'a jamais
    // eu lieu), ni mutation des lignes réelles (la voie preview n'écrit que TEMP).
    expect(await readScopeAnnotations(scope.collectionId, scope.canvasId)).toHaveLength(1);
    expect(await readTemp()).toEqual([]);
    await flushTemp(scope.collectionId);
  });

  it('voie commit (showPreview faux) : wipe du repli au montage, chaine vide sans effet, chaine sans valeur = aller-retour, resolution avec modificateur reel', async () => {
    const canvasId = FIXTURE_CANVAS_IDS[0];
    const scope = { collectionId: 'ama-35-t5-collection', canvasId };
    await seedAnnotations([
      makeAnnotation({
        id: 'ama-35-t5-ligne-1',
        ...scope,
        type: ElementType.TEXT_LINE,
        value: 'Ligne 1',
        order: 0,
      }),
      makeAnnotation({
        id: 'ama-35-t5-ligne-2',
        ...scope,
        type: ElementType.TEXT_LINE,
        value: 'Ligne 2',
        order: 1,
      }),
    ]);
    // Ligne TEMP préexistante de la collection : le hook doit l'effacer AU MONTAGE
    // (l. 41-51), et ne plus JAMAIS y toucher tant que showPreview est faux
    // (l. 56 `if (showPreview === false) return`).
    await seedTemp([
      makeAnnotation({ id: 'ama-35-t5-temp-residue', ...scope, type: ElementType.TEMP }),
    ]);

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderActions({
      scope,
      showPreview: false,
      applyModifierChainTo: ElementType.TEXT_LINE,
    });

    await waitFor(async () => {
      expect(await readTemp()).toEqual([]);
    });
    const emitted = await readScopeAnnotations(scope.collectionId, scope.canvasId);

    // — chaîne vide : retour ANTICIPÉ (l. 68), AUCUNE écriture, dans aucune table.
    const emptyChainTracker = trackWrites(db.annotations);
    const tempTrackerForEmpty = trackWrites(db.annotationsTemp);
    try {
      await act(async () => {
        await expect(result.current.applyModifierChain([], {})).resolves.toBeUndefined();
      });
      expect(emptyChainTracker.counts()).toEqual({ created: 0, deleted: 0 });
      expect(tempTrackerForEmpty.counts()).toEqual({ created: 0, deleted: 0 });
    } finally {
      emptyChainTracker.stop();
      tempTrackerForEmpty.stop();
    }
    expect(await readScopeAnnotations(scope.collectionId, scope.canvasId)).toEqual(emitted);
    expect(await readTemp()).toEqual([]);

    // — modificateur RÉEL sans valeur renseignée (l. 77 `!== undefined` → skip) :
    // la voie commit fait quand même son aller-retour deleteByIds + addAll
    // (caractérisation 5, compteurs par API publique) — ids et contenus préservés,
    // annotationsTemp toujours vierge.
    const inertChainTracker = trackWrites(db.annotations);
    const modifier = new ReOrderModifier();
    try {
      await act(async () => {
        await expect(result.current.applyModifierChain([modifier], {})).resolves.toBeUndefined();
      });
      expect(inertChainTracker.counts().created).toBe(2);
    } finally {
      inertChainTracker.stop();
    }
    const afterRoundTrip = await readScopeAnnotations(scope.collectionId, scope.canvasId);
    expect(ids(afterRoundTrip)).toEqual(ids(emitted));
    expect(payload(afterRoundTrip)).toEqual(payload(emitted));
    expect(await readTemp()).toEqual([]);

    // — modificateur réel AVEC valeur : `schema.parse` puis `apply` (sémantique
    // d'application des modificateurs VERROUILLÉE COUCHE DATA — rien n'est asserté
    // dessus ; la voie « trouvée » est exercée avec une valeur au schéma valide).
    await act(async () => {
      await expect(
        result.current.applyModifierChain([modifier], { [modifier.id]: { order: 'TL2BR' } }),
      ).resolves.toBeUndefined();
    });
    const afterApply = await readScopeAnnotations(scope.collectionId, scope.canvasId);
    expect(ids(afterApply)).toEqual(ids(emitted));
    expect(await readTemp()).toEqual([]);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    await waitFor(async () => {
      expect(await readTemp()).toEqual([]);
    });
    await flushTemp(scope.collectionId);
  });

  it('voie preview de l action : chaine vide sans effet, chaine sans valeur reecrit le repli TEMP depuis l emission, annotations intactes', async () => {
    const canvasId = FIXTURE_CANVAS_IDS[0];
    const scope = { collectionId: 'ama-35-t6-collection', canvasId };
    await seedAnnotations([
      makeAnnotation({
        id: 'ama-35-t6-ligne-1',
        ...scope,
        type: ElementType.TEXT_LINE,
        value: 'Ligne 1',
        order: 0,
      }),
      makeAnnotation({
        id: 'ama-35-t6-ligne-2',
        ...scope,
        type: ElementType.TEXT_LINE,
        value: 'Ligne 2',
        order: 1,
      }),
    ]);

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderActions({
      scope,
      showPreview: true,
      applyModifierChainTo: ElementType.TEXT_LINE,
    });

    // Repli posé par l'effet de l'émission (l. 56-59) — la liveQuery a bien émis.
    await waitFor(async () => {
      expect(await readTemp()).toHaveLength(2);
    });
    const emitted = await readScopeAnnotations(scope.collectionId, scope.canvasId);
    const tempFromEffect = await readTemp();

    // — chaîne vide : l. 68 retourne AVANT même d'effacer le repli : rien n'est
    // écrit, le repli existant survit intact (mêmes lignes, mêmes ids).
    const tempTracker = trackWrites(db.annotationsTemp);
    const annotationsTracker = trackWrites(db.annotations);
    try {
      await act(async () => {
        await expect(result.current.applyModifierChain([], {})).resolves.toBeUndefined();
      });
      expect(tempTracker.counts()).toEqual({ created: 0, deleted: 0 });
      expect(annotationsTracker.counts()).toEqual({ created: 0, deleted: 0 });
    } finally {
      tempTracker.stop();
      annotationsTracker.stop();
    }
    expect(ids(await readTemp())).toEqual(ids(tempFromEffect));

    // — modificateur réel sans valeur (branche skip l. 77) : le repli est REÉCRIT à
    // partir de l'émission (l. 85-86 : effacement + addAll des duplicatas) — preuve
    // par le compteur que c'est bien l'ACTION qui écrit, et que l'action lit la
    // lecture live (le repli reproduit l'émission). Les ids bougent (duplicats
    // neufs, caractérisation 10) ; le contenu, lui, est celui de l'émission.
    const writeTracker = trackWrites(db.annotationsTemp);
    const modifier = new ReOrderModifier();
    try {
      await act(async () => {
        await expect(result.current.applyModifierChain([modifier], {})).resolves.toBeUndefined();
      });
      expect(writeTracker.counts().created).toBe(2);
    } finally {
      writeTracker.stop();
    }
    const tempAfterAction = await readTemp();
    expect(payload(tempAfterAction)).toEqual(payload(emitted));
    expect(tempAfterAction.map((a) => getAnnotationType(a))).toEqual([
      ElementType.TEMP,
      ElementType.TEMP,
    ]);
    // Le preview ne TOUCHE JAMAIS les annotations réelles (voie l. 84-86 uniquement).
    expect(await readScopeAnnotations(scope.collectionId, scope.canvasId)).toEqual(emitted);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    await flushTemp(scope.collectionId);
  });

  it('erreurs de l action : rejet ZodError sans aucune ecriture, rejet d ecriture temp remonte brut en repli vide (caracterisations 6 et 7)', async () => {
    const canvasId = FIXTURE_CANVAS_IDS[0];
    const scope = { collectionId: 'ama-35-t7-collection', canvasId };
    await seedAnnotations([
      makeAnnotation({
        id: 'ama-35-t7-ligne-1',
        ...scope,
        type: ElementType.TEXT_LINE,
        value: 'Ligne 1',
        order: 0,
      }),
      makeAnnotation({
        id: 'ama-35-t7-ligne-2',
        ...scope,
        type: ElementType.TEXT_LINE,
        value: 'Ligne 2',
        order: 1,
      }),
    ]);

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderActions({
      scope,
      showPreview: true,
      applyModifierChainTo: ElementType.TEXT_LINE,
    });
    await waitFor(async () => {
      expect(await readTemp()).toHaveLength(2);
    });
    const emitted = await readScopeAnnotations(scope.collectionId, scope.canvasId);
    const tempFromEffect = await readTemp();
    const modifier = new ReOrderModifier();

    // — valeur invalide au schéma : `schema.parse` JETTE DANS LA BOUCLE (l. 79),
    // avant `apply` et avant toute écriture : rejet ZodError brut (aucun try/catch,
    // caractérisation 7), les deux tables restent telles quelles.
    const parseTracker = trackWrites(db.annotationsTemp);
    let parseRejection: unknown;
    try {
      await act(async () => {
        parseRejection = await result.current
          .applyModifierChain([modifier], { [modifier.id]: { order: 'INEXISTANT' } })
          .then(
            () => undefined,
            (error: unknown) => error,
          );
      });
    } finally {
      parseTracker.stop();
    }
    expect(parseRejection).toBeInstanceOf(z.ZodError);
    expect(parseTracker.counts().created).toBe(0);
    expect(ids(await readTemp())).toEqual(ids(tempFromEffect));
    expect(await readScopeAnnotations(scope.collectionId, scope.canvasId)).toEqual(emitted);

    // — échec d'écriture du repli (injection par l'API publique RÉELLE, retirée en
    // finally) : la promesse rejette ET `annotationsTemp` reste VIDÉ — l'action a
    // effacé avant d'échouer à réécrire (caractérisation 6, intermédiaire
    // destructif). Les lignes réelles, elles, sont intactes.
    const failCreating = (): void => {
      throw new Error('temp-ecriture-en-echec-35');
    };
    db.annotationsTemp.hook('creating', failCreating);
    try {
      let writeRejection: unknown;
      await act(async () => {
        writeRejection = await result.current
          .applyModifierChain([modifier], { [modifier.id]: { order: 'TL2BR' } })
          .then(
            () => undefined,
            (error: unknown) => error,
          );
      });
      expect(String(writeRejection)).toContain('temp-ecriture-en-echec-35');
      expect(await readTemp()).toEqual([]);
    } finally {
      db.annotationsTemp.hook('creating').unsubscribe(failCreating);
    }
    expect(await readScopeAnnotations(scope.collectionId, scope.canvasId)).toEqual(emitted);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    await flushTemp(scope.collectionId);
  });
});
