/**
 * Lot 33 — useModels, palier 2 (cf. docs/roadmap.md, Q11).
 *
 * Périmètre : la COQUILLE SEULE (spécificité table du lot 33 : « `useModelIO` a déjà
 * son lot 15 » — cf. `src/hooks/data/models/__tests__/useModelIO.test.tsx`). Le hook
 * (useModels.tsx, 80 lignes) porte bien une liveQuery unique, `modelsQuery` =
 * `useLiveQuery(modelLiveRepository.getAll(), [])` (l. 18), dont le querier est un
 * `db.models.orderBy('name').toArray()` (models.live.ts:7). La réactivité, l'ordre
 * `name` et le contenu des lignes sont déjà verrouillés couche data par
 * `models.live.test.ts` et `models.test.ts` (campagne Q2) : AUCUN scénario de données
 * n'est dupliqué ici — les modèles sont écrits par le VRAI repository AVANT le montage
 * et jamais modifiés pendant le test.
 *
 * PAS DE REQUALIFICATION pour le contrat commun : à la différence des lots 24-25
 * (defaultResult `[]`), 30 (`?? 0`), 31 et 32 (defaultResult `false`), `useModels` NE
 * passe aucun troisième argument à `useLiveQuery` (l. 18) — c'est la seule coquille
 * testée à ce jour du palier 2 où le motif « `undefined` → loading » s'applique TEL
 * QUEL, parce que le hook expose `isLoading: modelsQuery === undefined` (l. 73). Le cas
 * est DU RESTE DÉJÀ dans la table de `liveLoading.test.tsx` (l. 35, mock `useLiveQuery`)
 * : rien à y ajouter (règle du palier 2, « seulement si un cas manque »).
 *
 * Contrat commun, point par point :
 * - état initial : `modelsQuery` vaut `undefined` au premier rendu synchronique →
 *   `isLoading` est `true` (l. 73) et la VALEUR `models` est masquée par le repli
 *   `?? EMPTY_MODELS` (l. 19, constante de module l. 12) : les helpers répondent
 *   « introuvable » alors même que des lignes existent en base (test 1). C'est le seul
 *   membre `isLoading` qui porte la distinction (caractérisation 1) ;
 * - bascule après première émission : `isLoading` passe à `false` et `models` devient le
 *   tableau ÉMIS (identité différente du repli, contenu égal à la relecture du VRAI
 *   repository), vérifiés par `waitFor` sous données présentes (test 1) comme sur base
 *   vide (test 2, où seul `isLoading` bouge — caractérisation 7) ;
 * - remontée d'erreur : AUCUNE surface d'erreur au retour (pas de valeur d'erreur, pas de
 *   try/catch côté lecture) — `useObservable` de dexie-react-hooks relance l'erreur en
 *   PHASE DE RENDU (`if (monitor.current.error) throw …`), seule une ErrorBoundary
 *   consommateur la rattrape (test 3). Contrairement aux trous de contrat caractérisés
 *   des lots 31 et 32 (queriers `count()`, faute injoignable par l'API réelle), le
 *   querier ICI est un `toArray()` MATÉRIALISANT : l'injection par l'API publique RÉELLE
 *   `db.models.hook('reading')` est ATTEIGNABLE et le mécanisme est verrouillé
 *   POSITIVEMENT — même gabarit que les lots 24/25/29/30. Le dernier rendu commis étant
 *   celui du chargement, une panne de lecture de la table modèles laisse `isLoading` à
 *   `true` indéfiniment, sans message (caractérisation 5) ;
 * - désabonnement au démontage : preuve comportementale (une émission ne peut venir que
 *   d'un abonnement vivant) et compteur `countLiveQuerySubscribers` comparé APRÈS
 *   matérialisation à une référence « providers du harnais seuls » (leçon des lots
 *   16/24-32 : jamais en delta synchrone, la souscription étant différée via
 *   `setTimeout(0)` dans dexie). Le hook ajoute EXACTEMENT 1 abonné (sa liveQuery
 *   unique) ; stable sous `rerender` (deps `[]` littérales, caractérisation 2) ; retour
 *   EXACT à la valeur d'avant-montage après `unmount`, dans les trois tests.
 *
 * Spécificité table (plan, lot 33) : « coquille seule ; `useModelIO` a son lot 15 » —
 * respectée à la lettre par les trois tests du contrat commun, qui ne déclenchent
 * AUCUNE écriture en base depuis le hook et n'exercent ni
 * `saveModel`/`removeModel`/`exportModel`/`importModel` (lot 15) ni `createModel`.
 *
 * COMPLÉMENT AUDIT (lot 38) — trou n°1 CONSIGNÉ PUIS COMBLÉ : la classification
 * « coquille » du plan laissait `createModel` (l. 43-69), SEULE MUTATION du source,
 * sans contrat nulle part (caractérisation 6) — le renvoi aux mutations du lot 15 ne
 * couvrait que `useModelIO`, autre hook, alors que l'appelant `NewModelForm` est en
 * production. La table du lot 33 était donc incomplète, exactement comme les
 * requalifications des lots 26-31. Arbitrage de l'audit : COMBLER, non justifier —
 * le describe final verrouille les branches de la mutation sur le VRAI repository
 * modèles et l'API publique réelle de Dexie (`hook('creating')`), sans réinventer la
 * réactivité (campagne Q2) ni inventer de contrat. Les tests du contrat commun sont
 * inchangés.
 *
 * Frontière pour l'erreur : injection par l'API publique RÉELLE des hooks Dexie,
 * `db.models.hook('reading')`, retirée en `finally` (discipline des lots 24-32) — pas un
 * mock : le mécanisme d'accès reste réel, la lecture échoue pour de vrai. Posée AVANT le
 * montage (gabarit des lots 24/25) : faute de prise sur les deps (caractérisation 2), la
 * seule exécution de la requête du hook joignable sans muter la table est la première —
 * les lots 31/32 relançant la leur par un changement de deps, ce que cette coquille ne
 * permet pas, et une mutation de table serait de la réactivité (couche data). Aucune
 * écriture pendant la fenêtre d'injection, et AUCUN provider du harnais ne liveQuery
 * `models` (les trois abonnements de référence sont collections, workers, results —
 * WorkerContext.tsx:45-46, CollectionContext.tsx:28) : seule la requête du hook bute sur
 * l'injection, donc le diagnostic reste attribuable. ErrorBoundary de test (frontière
 * d'affichage, pas un mock — précédents lots 4 et 24-32). Écritures en base par le VRAI
 * `IndexedDBModelRepository` (`getModelRepository().add`), relectures d'attente par son
 * `getAll()`. Pas de mock de Dexie, pas de `vi.spyOn`, pas de délai artificiel, aucun
 * appel réseau.
 *
 * Call sites (production, vérifiés — grep `useModels`, 7 fichiers hors la source et ses
 * tests, chaque membre de l'API retournée a au moins un appelant réel) :
 * - `models` : `ModelsDashboard` (ModelsDashboard.tsx:19, rendu de la liste dans
 *   `<AsyncState isLoading={isLoading} isEmpty={models.length === 0}>`, l. 40-53 — le
 *   consommateur TYPE du contrat d'état initial), `ImportModelForm` (ImportModelForm.tsx
 *   :37, effet `useEffect(…, [models])` l. 47-51 qui ne ferme le dialogue que si
 *   `isSubmitted`, cf. caractérisation 7), `CollectionMetadataForm`
 *   (CollectionMetadataForm.tsx:57, `models.map` en options de select, l. 269 — select
 *   vide pendant le chargement, le composant ne consulte pas `isLoading`) ;
 * - `isLoading` : `ModelsDashboard.tsx:19` et `ExpertPage.tsx:15` (cumulé aux autres
 *   chargements l. 18-24, `<Loading/>` rendu l. 25) ;
 * - `modelCount` : `ExpertPage.tsx:15` ;
 * - `getModelById` : `ModelViewer.tsx:51` (puis `if (model === undefined) return
 *   <error_model_undefined>` l. 74-76 — erreur affichée PENDANT le chargement, le
 *   composant ne consulte pas `isLoading` ; le `useEffect([model])` l. 68-72 rattrape
 *   ensuite la valeur émise par `onModel`, cf. caractérisation 1) ;
 * - `getDatafieldById` : `EntityViewer.tsx:5` (`datafield?.name` — nom affiché vide
 *   pendant le chargement, le composant ne consulte pas `isLoading`) ;
 * - `nameAlreadyExists` : `NewModelForm.tsx:29` puis `superRefine` l. 40-47 (validation
 *   de nom du formulaire, cf. caractérisation 3) ;
 * - `createModel` : `NewModelForm.tsx:29` puis `await createModel(…)` dans `onSubmit`
 *   l. 64-68 — mutation, HORS du périmètre de ce lot (caractérisation 6).
 * `useModelIO` (lot 15) est un autre hook ; `CollectionMetadataForm.test.tsx:12-13`
 * MOCKE `@/hooks/data/models/useModels` côté composants — précédent toléré par le plan,
 * non étendu ici.
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * 1. repli `?? EMPTY_MODELS` (l. 19) sur une constante de MODULE (l. 12) : `models` ne
 *   vaut JAMAIS `undefined`, est `[]` pendant le chargement comme sur base vide, et son
 *   IDENTITÉ est partagée par toutes les instances montées — un appelant qui muterait le
 *   tableau corromprait le repli de toute l'application. Vérifié call sites : lecture
 *   seule (`.map`, `.find`, `.some`, `.length`). La distinction chargement/vide n'existe
 *   DONC QUE par `isLoading` (l. 73) : `ModelViewer` et `CollectionMetadataForm` ne le
 *   lisent pas et affichent respectivement une erreur et un select vide pendant le
 *   chargement — caractérisé (test 1), pas corrigé ;
 * 2. deps `[]` LITTÉRALES (l. 18) : la closure querier est recréée à chaque rendu
 *   (`modelLiveRepository.getAll()`) mais `useObservable` mémoïde l'observable sur les
 *   deps seules — la première closure est conservée pour toute la durée du montage, et
 *   le `useMemo(() => getModelLiveRepository(), [])` (l. 16), dont la fabrique retourne
 *   pourtant une instance neuve à chaque appel (dbFactory.ts:74-76), est DÉCORATIF du
 *   point de vue de la souscription. Conséquence : aucune voie, par la seule API du hook
 *   (aucun argument, aucun setter), ne relance l'abonnement — vérifié par la stabilité
 *   exacte du compteur ET de l'identité de `models` sous `rerender` (test 1) ;
 * 3. `nameAlreadyExists` compare en ÉGALITÉ STRICTE (`m.name === name`, l. 39) alors que
 *   `useProjects.projectNameAlreadyExists` compare en minuscules (useProjects.tsx:15-17)
 *   : deux modèles « Alpha » et « alpha » peuvent coexister et le `superRefine` de
 *   `NewModelForm` les accepte — asymétrie entre coquilles sœurs, verrouillée (test 1),
 *   pas corrigée ;
 * 4. sentinelles de « non trouvé » ASYMÉTRIQUES dans la même coquille : `getModelById`
 *   rend `undefined` (l. 25, `.find` nu), `getDatafieldById` rend `null` (l. 33) — les
 *   deux appelants les consomment en `?.`, la différence n'a donc pas d'effet observable
 *   en production ; consignée pour l'audit (aucun contrat de normalité) ;
 * 5. panne de lecture = chargement PERPÉTUEL côté API (test 3) : aucune valeur d'erreur
 *   n'est exposée et le dernier rendu commis reste `isLoading: true`, si bien que
 *   `ModelsDashboard`/`ExpertPage` tournent au spinner sans jamais de message — canal
 *   d'erreur de la coquille uniquement, le jet en phase de rendu étant lui verrouillé par
 *   le test 3 ;
 * 6. TROU DE PLAN consigné pour l'audit (lot 38), pas inventé : `createModel` (l. 43-69)
 *   est la SEULE mutation de `useModels.tsx` et elle vit DANS la coquille. La table du
 *   plan renvoie les mutations du domaine modèles au lot 15, mais la suite du lot 15
 *   n'exerce que `useModelIO` (`saveModel`/`removeModel`/`exportModel`/`importModel`) :
 *   `useModels.createModel` n'est testé NULLE PART (grep `createModel` : NewModelForm
 *   comme seul appelant de production, `useDialog.tsx:60,89,227` pour l'identifiant du
 *   dialogue, aucun test). Ses branches restent donc sans contrat verrouillé — `NotFoundError`
 *   sur `fromModelId` inconnu AVALÉE par le `catch` du hook lui-même (l. 52-58,
 *   `console.error` puis la création poursuit avec `fields: []` et le prompt par défaut
 *   codé en dur), rejet du `modelRepository.add` (l. 68) ni capturé ni toasté remontant à
 *   l'`await` de `NewModelForm.tsx:64`, et closure sur le `models` DU RENDU qui l'a
 *   produite (risque symétrique des caractérisations 3 des lots 29/31). Ce lot s'en tient
 *   à l'identité de la fonction — non mémoïsée, recréée à chaque rendu (vérifiée test 1) —
 *   et ne déclenche aucune écriture. TROU TRANCHÉ À L'AUDIT (lot 38) : comblé par le
 *   describe final, qui verrouille ces branches telles qu'implémentées, sans rien d'inventé ;
 * 7. le repli est un tableau DIFFÉRENT de l'émission vide : sur base sans modèle, le
 *   contenu ne change pas (`[]` avant comme après) mais l'IDENTITÉ oui (constante de
 *   module → tableau relu par Dexie), si bien qu'un `useEffect(…, [models])` comme
 *   celui d'`ImportModelForm.tsx:47-51` tourne une fois de plus que le contenu ne le
 *   justifie — sans effet à ce call site, vérifié (test 2).
 */
import { DataModel } from '@/data/models/dataModel/dataModel';
import { db } from '@/data/repositories/indexeddb/db';
import { getModelRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  renderHookWithHarness,
  resetTestDbBeforeEach,
} from '@/hooks/__tests__/harness';
import { RootState } from '@/state/store';
import { waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useModels } from '../useModels';

resetTestDbBeforeEach();

/**
 * Modèle minimal valide au sens `DataModelSchema` (strict), avec un champ pour que
 * `getDatafieldById` de l'API exportée soit joignable.
 */
function makeModel(id: string, name: string): DataModel {
  return {
    id,
    name,
    prompt: 'prompt de test',
    fields: [{ id: `${id}-field`, name: 'titre', type: 'string', color: '#a4d6f6' }],
  };
}

/**
 * Écriture par le VRAI repository modèles (`add`), puis relecture par son `getAll()` :
 * le tableau attendu du hook est celui de la couche data, pas une copie reformulée ici.
 */
async function seedModels(models: DataModel[]): Promise<DataModel[]> {
  const modelRepository = getModelRepository();
  for (const model of models) {
    await modelRepository.add(model);
  }
  return modelRepository.getAll();
}

/**
 * ErrorBoundary de test (frontière d'affichage, pas un mock — même précédent que
 * les lots 4 et 24-32) : capte en ref l'erreur que `useObservable` relance en phase de
 * rendu et rend un fallback à la place du sous-arbre démonté.
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

describe('useModels — coquille liveQuery (contrat commun)', () => {
  it('etat initial isLoading true, bascule a la premiere emission, +1 abonné, helpers branches sur emis, zero fuite', async () => {
    // Modèles écrits par le VRAI repository AVANT le montage : seul ce que la
    // coquille doit émettre ; aucune mutation ensuite (réactivité = couche data).
    const emitted = await seedModels([
      makeModel('models-shell-33-beta', 'Beta'),
      makeModel('models-shell-33-alpha', 'Alpha'),
    ]);

    const subscribersBefore = countLiveQuerySubscribers();

    // Référence « providers du harnais seuls » : on matérialise leurs abonnements
    // différés (setTimeout(0) dans dexie) puis on les relâche avant de monter le
    // hook (leçon des lots 16/24-32).
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    const { result, rerender, unmount } = renderHookWithHarness(() => useModels());

    // SYNCHRONE, avant toute macrotâche : contrat commun APPLIQUÉ (aucun
    // defaultResult, l. 18) — la liveQuery vaut `undefined`, donc `isLoading` est
    // `true` dès le premier rendu, pendant que la VALEUR est masquée par le repli
    // `EMPTY_MODELS` (caractérisation 1) : les helpers répondent « introuvable »
    // alors que les deux lignes sont bien en base.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.models).toEqual([]);
    expect(result.current.modelCount).toBe(0);
    expect(result.current.getModelById('models-shell-33-alpha')).toBeUndefined();
    expect(result.current.getDatafieldById('models-shell-33-alpha-field')).toBeNull();
    expect(result.current.nameAlreadyExists('Alpha')).toBe(false);
    const fallbackModels = result.current.models;

    // Bascule après première émission : `isLoading` retombe et `models` devient le
    // tableau émis, c'est-à-dire exactement ce que rend le vrai repository.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models).toEqual(emitted);
    // Repli et émission sont deux tableaux distincts (caractérisation 1).
    expect(result.current.models).not.toBe(fallbackModels);
    expect(result.current.modelCount).toBe(emitted.length);

    // Les helpers de l'API exportée lisent le tableau ÉMIS, sans clonage ni seconde
    // lecture (call sites ModelViewer, EntityViewer, NewModelForm) : mêmes références.
    const snapshot = result.current.models;
    expect(result.current.getModelById(snapshot[0].id)).toBe(snapshot[0]);
    expect(result.current.getDatafieldById(snapshot[0].fields[0].id)).toBe(snapshot[0].fields[0]);
    expect(result.current.getModelById('model-inexistant')).toBeUndefined();
    expect(result.current.getDatafieldById('field-inexistant')).toBeNull();
    expect(result.current.nameAlreadyExists('Alpha')).toBe(true);
    // Caractérisation 3 : égalité stricte, contrairement à useProjects (lot 25).
    expect(result.current.nameAlreadyExists('ALPHA')).toBe(false);

    // Abonnement prouvé deux façons : l'émission observée ne peut venir que d'un
    // abonnement vivant, et le compteur — mesuré APRÈS matérialisation — vaut la
    // référence providers + exactement la 1 liveQuery du hook.
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

    // Caractérisation 2 : deps `[]` littérales et instance mémoïsée — un re-render
    // ne re-souscrit pas et ne relance pas la requête (identité de l'émission
    // conservée, donc identités des helpers `useCallback` aussi). Seule `createModel`,
    // non mémoïsée (l. 43), change d'identité (caractérisation 6, identité seulement).
    const api = {
      models: result.current.models,
      modelCount: result.current.modelCount,
      getModelById: result.current.getModelById,
      getDatafieldById: result.current.getDatafieldById,
      nameAlreadyExists: result.current.nameAlreadyExists,
      createModel: result.current.createModel,
    };
    rerender();
    expect(result.current.models).toBe(api.models);
    expect(result.current.modelCount).toBe(api.modelCount);
    expect(result.current.getModelById).toBe(api.getModelById);
    expect(result.current.getDatafieldById).toBe(api.getDatafieldById);
    expect(result.current.nameAlreadyExists).toBe(api.nameAlreadyExists);
    expect(result.current.createModel).not.toBe(api.createModel);
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('base vide : seul isLoading discrimine le chargement, identite du repli partagee puis remplacee', async () => {
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, rerender, unmount } = renderHookWithHarness(() => useModels());

    // Premier rendu synchronique : chargement en cours, valeur = repli de module.
    expect(result.current.isLoading).toBe(true);
    const fallbackModels = result.current.models;
    expect(fallbackModels).toEqual([]);

    // Caractérisation 1 : tant que rien n'est émis, `models` est LA MÊME constante de
    // module à chaque rendu — aucune nouvelle souscription, aucune nouvelle valeur.
    rerender();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.models).toBe(fallbackModels);

    // Émission d'une base vide : le contenu ne dit toujours rien (`[]`), seul
    // `isLoading` bascule — et l'identité change (caractérisation 7).
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models).toEqual([]);
    expect(result.current.models).not.toBe(fallbackModels);
    expect(result.current.modelCount).toBe(0);
    expect(result.current.nameAlreadyExists('Import n importe quoi')).toBe(false);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('requete en echec : le toArray materialisant rencontre la faute, jet au rendu jusqu a la boundary, jamais de valeur d erreur', async () => {
    // Une ligne au moins en base : le hook 'reading' de Dexie ne s'exécute que sur
    // les lignes effectivement lues, et c'est la lecture qui doit échouer.
    await seedModels([makeModel('models-shell-33-erreur', 'En échec')]);

    const subscribersBefore = countLiveQuerySubscribers();
    const caught: { error?: unknown } = {};
    // Injection par l'API publique RÉELLE des hooks Dexie (cf. en-tête) : toute
    // lecture matérialisante de db.models échoue désormais — le
    // `orderBy('name').toArray()` de la coquille compris (contrairement aux `count()`
    // des lots 31/32) — tant que ce filtre est monté.
    const failReading = (): void => {
      throw new Error('models-lecture-en-echec-33');
    };
    db.models.hook('reading', failReading);
    try {
      const { result, unmount } = renderHookWithHarness(() => useModels(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <CrashBoundary onError={(error) => (caught.error = error)}>{children}</CrashBoundary>
        ),
      });

      await waitFor(() => expect(caught.error).toBeDefined());
      expect(String(caught.error)).toContain('models-lecture-en-echec-33');

      // La valeur d'erreur n'apparaît JAMAIS au retour du hook : le dernier rendu
      // commis est celui du chargement (la liveQuery n'a jamais émis de valeur), donc
      // une panne de lecture de la table modèles est, côté API, un chargement
      // perpétuel — caractérisation 5 (call sites `AsyncState`/`<Loading/>`).
      expect(result.current.isLoading).toBe(true);
      expect(result.current.models).toEqual([]);
      expect(result.current.modelCount).toBe(0);

      // Le démontage du sous-arbre par la boundary relâche l'abonnement du hook :
      // après unmount complet (boundary → providers), plus aucune souscription ne
      // subsiste au-delà de la valeur d'avant-montage.
      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.models.hook('reading').unsubscribe(failReading);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Audit lot 38 — trou n°1 comblé : createModel, seule mutation du source */
/* ------------------------------------------------------------------ */

describe('useModels — createModel : mutation de la coquille (comblée par l’audit lot 38)', () => {
  /** Les toasts posés dans la slice `events` du store réel (précédent lots 16-17). */
  function toasts(state: RootState): unknown[] {
    return state.events.allEvents;
  }

  /** Relecture d'une ligne PAR NOM via le VRAI repository : l'id est un uuid inconnu d'avance. */
  async function rowByName(name: string): Promise<DataModel> {
    const rows = await getModelRepository().getAll();
    const row = rows.find((m) => m.name === name);
    if (!row) throw new Error(`Ligne absente en base : ${name}`);
    return row;
  }

  it('nominal sans fromModelId : ligne créée sous uuid neuf, fields vides, prompt par défaut, aucun toast', async () => {
    const { result, store, unmount } = renderHookWithHarness(() => useModels());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.createModel({ name: 'Modèle neuf 38', description: 'créé par le hook' });

    // Vérification par relecture du VRAI repository (la sémantique `add` est verrouillée
    // couche data, campagne Q2) : id tiré par uuid() (l. 44), pass-through intégral du
    // DTO (l. 45, 63-64), `fields: []` (l. 46) et prompt par défaut codé en dur (l. 48).
    const created = await rowByName('Modèle neuf 38');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.description).toBe('créé par le hook');
    expect(created.fields).toEqual([]);
    expect(typeof created.prompt).toBe('string');
    expect(created.prompt.length).toBeGreaterThan(0);

    // Preuve de plumbing : l'écriture a atteint le store RÉEL que la liveQuery de la
    // coquille lit (la réactivité elle-même reste verrouillée par `models.live.test.ts`).
    await waitFor(() => expect(result.current.nameAlreadyExists('Modèle neuf 38')).toBe(true));

    // Canal caractérisé tel qu'implémenté : création réussie SILENCIEUSE — aucun
    // pushInfo, contrairement à `useModelIO.saveModel` (lot 15) qui toast `info_model_saved`
    // pour la même écriture de ligne (asymétrie inter-hooks consignée, point F de l'audit).
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('avec fromModelId connu : fields et prompt copiés du modèle source, id neuf, source intacte', async () => {
    const [source] = await seedModels([makeModel('models-38-t2-source', 'Source 38')]);

    const { result, store, unmount } = renderHookWithHarness(() => useModels());
    // Émission attendue AVANT l'appel : `createModel` closure sur le `models` DU RENDU qui
    // l'a produite (l. 43, dernier volet de la caractérisation 6) — le `fromModelId` n'est
    // trouvable que si la closure le contient. C'est exactement la situation du call site
    // `NewModelForm` (l. 29), monté dans un tableau de rendu où les modèles sont affichés.
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.createModel({ name: 'Copie 38', fromModelId: source.id });

    const created = await rowByName('Copie 38');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.id).not.toBe(source.id);
    // `description` absent du DTO (l. 45) traversé tel quel — pas de valeur par défaut.
    expect(created.description).toBeUndefined();
    // Copie PAR RÉFÉRENCE depuis le tableau émis (l. 53-54) : valeurs égales, lignes distinctes
    // (le clonage de l'écriture sépare les deux en base).
    expect(created.fields).toEqual(source.fields);
    expect(created.prompt).toBe(source.prompt);

    // La source n'a rien perdu de sa copie : relecture indépendante.
    const reread = await rowByName('Source 38');
    expect(reread.fields).toEqual(source.fields);
    expect(reread.id).toBe(source.id);
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('fromModelId inconnu : NotFoundError AVALÉE par le catch du hook, poursuite avec les défauts nominaux', async () => {
    await seedModels([makeModel('models-38-t3-existant', 'Existant 38')]);
    const { result, store, unmount } = renderHookWithHarness(() => useModels());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Repère d'abord créé sans fromModelId : c'est LUI qui fixe « le prompt par défaut »
    // (l. 48 est un littéral non exporté — comparé, jamais reformulé ici).
    await result.current.createModel({ name: 'Repère 38' });
    const reference = await rowByName('Repère 38');

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    // L'appel RÉSOUT (un rejet ferait échouer cette ligne) : le NotFoundError jeté l. 52
    // est rattrapé par le catch du hook lui-même (l. 55-58) et n'atteint JAMAIS l'appelant.
    await result.current.createModel({
      name: 'Orphelin 38',
      fromModelId: 'modele-inexistant-38',
    });
    const errorCall: unknown[] | undefined = consoleError.mock.calls.find(
      (call) => call[0] === 'Error fetching model by ID:',
    );
    consoleError.mockRestore();

    // Seule trace observable de la branche avalée.
    expect(errorCall?.[0]).toBe('Error fetching model by ID:');
    expect(String(errorCall?.[1])).toContain('modele-inexistant-38');

    // La création POURSUIT avec les défauts du nominal — pas de champ ni de prompt
    // copiés partials : `fields` et `prompt` gardent leurs initiales (l. 46-48), le
    // `fromModelId` inconnu n'empêche ni l'écriture ni le succès apparent.
    const created = await rowByName('Orphelin 38');
    expect(created.fields).toEqual(reference.fields);
    expect(created.prompt).toBe(reference.prompt);

    // Aucun canal utilisateur pour cette erreur avalée : ni toast ni pushError.
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('rejet de modelRepository.add : rejet remonté à l’appelant sans capture ni toast, aucune ligne écrite', async () => {
    // Une ligne témoin AVANT l'injection : prouve que l'échec n'abîme rien de existant
    // (et évite que le hook Dexie n'intercepte une écriture de graine).
    const seeded = await seedModels([makeModel('models-38-t4-temoin', 'Témoin 38')]);

    const { result, store, unmount } = renderHookWithHarness(() => useModels());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Injection par l'API publique RÉELLE de Dexie, `table.hook('creating')` (pratique
    // établie lots 4/24+, ici en variante « creating » comme `hook('deleting')` du lot 27) :
    // l'écriture échoue pour de vrai au niveau stockage, sans mock du repository.
    const failCreating = (): void => {
      throw new Error('models-creation-en-echec-38');
    };
    db.models.hook('creating', failCreating);
    let rejection: unknown = null;
    try {
      rejection = await result.current.createModel({ name: 'Fantôme 38' }).then(
        () => null,
        (error: unknown) => error,
      );
    } finally {
      db.models.hook('creating').unsubscribe(failCreating);
    }

    // Le `await modelRepository.add` (l. 68) n'est DANS AUCUN try : le rejet remonte
    // tel quel à l'appelant — c'est l'`await` de `NewModelForm.tsx:64` qui l'attrape.
    expect(rejection).toBeTruthy();
    expect(String(rejection)).toContain('models-creation-en-echec-38');

    // Base inchangée, et toujours aucun toast : le hook n'a pas de surface d'erreur.
    const rows = await getModelRepository().getAll();
    expect(rows).toEqual(seeded);
    expect(rows.some((m) => m.name === 'Fantôme 38')).toBe(false);
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });
});
