/**
 * Lot 34 — useModifierChainLive, palier 2 (cf. docs/roadmap.md, Q11).
 *
 * Périmètre : la COQUILLE liveQuery (useModifierChainLive.tsx, 50 lignes : une
 * unique `useLiveQuery(modifierChainLiveRepository.getAll(), [repo])`, l. 14-16,
 * querier `db.modifierChains.toArray()`, modifierChain.live.ts:7) plus les deux
 * spécificités de la table du plan. La réactivité, le contenu des lignes et
 * l'index `name` sont déjà verrouillés couche data par `modifierChain.live.ts`
 * et `modifierChain.test.ts` (campagne Q2) : AUCUN scénario de mutation en cours
 * de montage n'est dupliqué ici — les chaînes sont écrites par le VRAI
 * repository AVANT le montage. Les MUTATIONS de chaînes (save/load/remove)
 * appartiennent au lot 18 (`useModifierChainIO.test.tsx`) : ce fichier ne
 * déclenche AUCUNE écriture depuis le hook testé.
 *
 * PAS DE REQUALIFICATION pour le contrat commun : à l'instar du lot 33
 * (`useModels`) et à la différence des lots 24-25 (defaultResult `[]`) et 30
 * (`?? 0`), le hook ne passe AUCUN troisième argument à `useLiveQuery` (l. 14) —
 * le motif « `undefined` → loading » s'applique TEL QUEL, parce que le hook
 * expose `isLoading: modifierChainsQuery === undefined` (l. 43). Le cas est DU
 * RESTE DÉJÀ dans la table de `liveLoading.test.tsx` (l. 36, entrée « chaînes »)
 * : rien à y ajouter (règle du palier 2, « seulement si un cas manque »).
 *
 * Contrat commun, point par point :
 * - état initial : `modifierChainsQuery` vaut `undefined` au premier rendu
 *   synchronique → `isLoading` est `true` et la VALEUR `modifierChains` est
 *   masquée par le repli `?? EMPTY_MODIFIER_CHAINS` (l. 17, constante de module
 *   l. 10) : les deux helpers répondent « introuvable » alors même que des
 *   lignes existent en base — `nameAlreadyExists` rend `false` et
 *   `applyModifierChainToCollection` d'un id pourtant présent REJETTE
 *   `NotFoundError` (l. 32-35, `find` sur le repli vide ; test 1, test 4 pour
 *   la voie nominale). C'est le seul membre `isLoading` qui porte la
 *   distinction chargement/vide (caractérisation 1) ;
 * - bascule après première émission : `isLoading` passe à `false` et
 *   `modifierChains` devient le tableau ÉMIS (identité différente du repli,
 *   contenu égal à la relecture du VRAI repository), `modifierCount` suit
 *   (`useMemo` sur `modifierChains.length`, l. 19-21) — vérifié par `waitFor`
 *   sous données présentes (test 1) comme sur base vide (test 2, où seul
 *   `isLoading` bouge — caractérisation 6) ;
 * - remontée d'erreur : AUCUNE surface d'erreur au retour (pas de valeur
 *   d'erreur, pas de try/catch côté lecture) — `useObservable` de
 *   dexie-react-hooks relance l'erreur en PHASE DE RENDU, seule une
 *   ErrorBoundary consommateur la rattrape (test 3). Le querier est un
 *   `toArray()` MATÉRIALISANT : l'injection par l'API publique RÉELLE
 *   `db.modifierChains.hook('reading')` est ATTEIGNABLE (contrairement aux
 *   `count()` des lots 31/32) — mécanisme verrouillé positivement, gabarit des
 *   lots 24/25/29/30/33. Le dernier rendu commis étant celui du chargement,
 *   une panne de lecture de la table chaînes laisse `isLoading` à `true`
 *   indéfiniment, sans message (caractérisation 5) ;
 * - désabonnement au démontage : preuve comportementale (une émission ne peut
 *   venir que d'un abonnement vivant) et compteur `countLiveQuerySubscribers`
 *   comparé APRÈS matérialisation à une référence « providers du harnais seuls »
 *   (leçon des lots 16/24-33 : jamais en delta synchrone, la souscription étant
 *   différée via `setTimeout(0)` dans dexie). Le hook ajoute EXACTEMENT 1
 *   abonné (sa liveQuery unique) ; stable sous `rerender` (deps
 *   `[modifierChainLiveRepository]`, caractérisation 2) ; retour EXACT à la
 *   valeur d'avant-montage après `unmount`, dans les quatre tests.
 *
 * Spécificités table (plan, lot 34), CONTRACT OBSERVABLE SEULEMENT :
 * - `nameAlreadyExists` (l. 23-25) : booléen lu sur le tableau ÉMIS, égalité
 *   STRICTE sur `name` (caractérisation 3) — testé (vrai/faux/pendant le
 *   chargement, tests 1 et 2), sans rien sur l'écriture que le formulaire
 *   aurait ensuite déclenchée (lot 18, côté `useModifierChainIO`) ;
 * - `applyModifierChainToCollection` (l. 27-39) : d'un id absent du tableau
 *   émis, le hook lève lui-même `NotFoundError` (message et `context` verrouillés,
 *   test 4) ; d'un id présent, il délègue à `getModifiersAndValues` puis
 *   `applyModifiersToScope` (`src/data/utils/modifierChain.ts`, couche data).
 *   L'APPLICATION DES MODIFICATEURS ÉTANT DÉJÀ VERROUILLÉE COUCHE DATA, rien
 *   n'est asserti sur elle : la voie « trouvée » est exercée avec une chaîne
 *   SANS AUCUN modificateur, pour laquelle la délégation est un non-op
 *   (`modifiers.length === 0` → retour anticipé, modifierChain.ts:51) — seule
 *   l'absence de rejet et l'invariance de la base sont observées (test 4).
 *
 * Frontière pour l'erreur : injection par l'API publique RÉELLE des hooks Dexie,
 * `db.modifierChains.hook('reading')`, retirée en `finally` (discipline des lots
 * 24-33) — pas un mock : le mécanisme d'accès reste réel, la lecture échoue pour
 * de vrai. Posée AVANT le montage (gabarit lots 24/25/33) : aucune écriture
 * pendant la fenêtre d'injection, et AUCUN provider du harnais ne liveQuery
 * `modifierChains` (les trois abonnements de référence sont collections,
 * workers, results — WorkerContext.tsx:45-46, CollectionContext.tsx:28) : seule
 * la requête du hook bute sur l'injection, donc le diagnostic reste
 * attribuable. ErrorBoundary de test (frontière d'affichage, pas un mock —
 * précédents lots 4 et 24-33). Écritures en base par le VRAI
 * `IndexedDBModifierChainRepository` (`getModifierChainRepository().put`),
 * relectures d'attente par son `getAll()`. Pas de mock de Dexie, pas de
 * `vi.spyOn`, pas de délai artificiel, aucun appel réseau.
 *
 * Call sites (production, vérifiés — grep `useModifierChainLive`, 5 fichiers
 * hors la source et ses tests ; chaque membre de l'API retournée a au moins un
 * appelant réel) :
 * - `modifierChains` : `ModifierChainDashboard` (ModifierChainDashboard.tsx:15,
 *   rendu des cartes l. 25), `LoadModifierChainForm.tsx:39,74` (options du
 *   select de chargement), `CollectionMetadataForm.tsx:58,344,396` (options des
 *   deux selects de chaînes post-OCR/post-layout) ;
 * - `isLoading` : `ModifierChainDashboard.tsx:15,21` (`<AsyncState
 *   isLoading={isLoading} isEmpty={modifierChains.length === 0}>`, type
 *   d'appelant du contrat d'état initial) et `ExpertPage.tsx:16` (cumulé aux
 *   autres chargements l. 18-24, `<Loading/>` rendu l. 25) ;
 * - `modifierCount` : `ExpertPage.tsx:16` (carte de synthèse l. 59) ;
 * - `nameAlreadyExists` : `SaveModifierChainForm.tsx:33` — garde d'écrasement
 *   du `superRefine` du formulaire (l. 43-49) et indicateur de doublon sur les
 *   valeurs watchées (l. 73-74). C'est la « garde en amont » consignée par le
 *   lot 18 (en-tête, branches upsert) : au niveau du hook IO, aucune garde ;
 * - `applyModifierChainToCollection` : `CollectionMetadataForm.tsx:175-196`,
 *   deux boutons `onClick={() => void …}` — le rejet `NotFoundError` n'y est
 *   NI capturé NI toasté (caractérisation 4, consigné, non corrigé).
 * Rien de `useModifierChainIO` (lot 18) n'est testé ici.
 * `CollectionMetadataForm.test.tsx:15-17` MOCKE `@/hooks/data/modifiers/
 * useModifierChainLive` côté composants — précédent toléré par le plan, non
 * étendu ici.
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * 1. repli `?? EMPTY_MODIFIER_CHAINS` sur une constante de MODULE (l. 10) :
 *   `modifierChains` ne vaut JAMAIS `undefined`, est `[]` pendant le chargement
 *   comme sur base vide, et son IDENTITÉ est partagée par toutes les instances
 *   montées — un appelant qui muterait le tableau corromprait le repli de toute
 *   l'application. Vérifié call sites : lecture seule (`.map`, `.some`,
 *   `.find`, `.length`). La distinction chargement/vide n'existe DONC QUE par
 *   `isLoading` ; le pendant du défaut `[]` des lots 24/25 (helper répondant
 *   « false » pendant le chargement) est ICI doublé d'un SECOND défaut, plus
 *   sévère : `applyModifierChainToCollection` levé pendant le chargement rejette
 *   `NotFoundError` alors que la ligne existe en base (test 1). Vérifié call
 *   sites : `CollectionMetadataForm` ne peut proposer au clic qu'une chaîne déjà
 *   émise (le select est construit sur `modifierChains`), et l'appel passe par
 *   le rendu courant — le défaut n'est pas déclenchable par l'UI courante ;
 *   consigné, pas corrigé ;
 * 2. deps `[modifierChainLiveRepository]` (l. 14-16) : contrairement au
 *   `useMemo(..., [])` DÉCORATIF du lot 33 (deps `[]` littérales), il est ici
 *   PORTANT — la fabrique retourne une instance neuve à chaque appel
 *   (dbFactory.ts:110-112) et sans mémoïsation les deps changeraient à chaque
 *   rendu, relançant l'abonnement. Vérifié : un `rerender` ne re-souscrit pas
 *   (compteur stable, identité de l'émission conservée, test 1) ;
 * 3. `nameAlreadyExists` compare en ÉGALITÉ STRICTE (`chain.name === name`,
 *   l. 24) alors que `useProjects.projectNameAlreadyExists` compare en minuscules
 *   (lot 25) : deux chaînes « Nominal » et « nominal » peuvent coexister (index
 *   `name` non unique, db.ts:65) et le `superRefine` du formulaire les accepte —
 *   même asymétrie que la caractérisation 3 du lot 33, verrouillée (test 1), pas
 *   corrigée ;
 * 4. `nameAlreadyExists` et `applyModifierChainToCollection` ne sont PAS
 *   mémoïsées (définies en corps de composant, recréées à chaque rendu —
 *   vérifié test 1) et closent sur le `modifierChains` DU RENDU qui les a
 *   produites (risque symétrique des caractérisations 3 des lots 29/31) : un
 *   appelant qui garderait une référence périmée lit une liste obsolète. Vérifié
 *   call sites : tous déstructurent depuis le rendu courant, aucun ne conserve
 *   la référence — sans effet observable en production, consigné ;
 * 5. panne de lecture = chargement PERPÉTUEL côté API (test 3) : aucune valeur
 *   d'erreur n'est exposée et le dernier rendu commis reste `isLoading: true`,
 *   si bien que `ModifierChainDashboard`/`ExpertPage` tournent au spinner sans
 *   jamais de message — canal d'erreur de la coquille uniquement, le jet en
 *   phase de rendu étant lui verrouillé par le test 3 ;
 * 6. sur base sans chaîne, le contenu ne change pas (`[]` avant comme après
 *   l'émission) mais l'IDENTITÉ oui (constante de module → tableau relu par
 *   Dexie) : `modifierCount`, `useMemo` branché sur `modifierChains` (l. 19-21),
 *   est recalculé — même conséquence qu'au lot 33 (caractérisation 7), sans
 *   effet aux call sites vérifiés ;
 * 7. chaînes défensives `modifierChains?.some(...)` (l. 24) et
 *   `modifierChains?.find(...)` (l. 32) : `modifierChains` n'est jamais
 *   nullisable (repli de module, l. 17) — code défensif, chemin non joignable
 *   par les seules API du hook, précédent lot 24, pas un trou de test ;
 * 8. chaîne présente dans le tableau émis puis SUPPRIMÉE en base entre
 *   l'émission et le clic : le `find` du hook la « trouve » et la délégation
 *   `getModifiersAndValues` rejette alors `EntityNotFoundError` (repository
 *   data) — TYPE D'ERREUR DIFFÉRENT du `NotFoundError` levé par le hook
 *   lui-même, jamais rattrapé par le call site (`void`, caractérisation 4).
 *   C'est un chemin de RÉACTIVITÉ (mutation pendant le montage) : hors palier 2
 *   (couche data), consigné, non testé.
 */
import { ElementType } from '@/data/models/annotations/annotation';
import { ModifierChainDTO } from '@/data/models/modifiers/Modifier';
import { db } from '@/data/repositories/indexeddb/db';
import { getModifierChainRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  renderHookWithHarness,
  resetTestDbBeforeEach,
} from '@/hooks/__tests__/harness';
import { NotFoundError } from '@/utils/NotFoundError';
import { waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import useModifierChainLive from '../useModifierChainLive';

resetTestDbBeforeEach();

/** Écriture par le VRAI repository chaînes, puis relecture de la base émise. */
async function seedChains(chains: ModifierChainDTO[]): Promise<ModifierChainDTO[]> {
  const modifierChainRepository = getModifierChainRepository();
  for (const chain of chains) {
    await modifierChainRepository.put(chain);
  }
  return modifierChainRepository.getAll();
}

function readChains(): Promise<ModifierChainDTO[]> {
  return getModifierChainRepository().getAll();
}

/**
 * ErrorBoundary de test (frontière d'affichage, pas un mock — même précédent que
 * les lots 4 et 24-33) : capte en ref l'erreur que `useObservable` relance en
 * phase de rendu et rend un fallback à la place du sous-arbre démonté.
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

describe('useModifierChainLive — coquille liveQuery (contrat commun)', () => {
  it('etat initial isLoading true, bascule a la premiere emission, +1 abonne, helpers branches sur emis, zero fuite', async () => {
    // Chaînes écrites par le VRAI repository AVANT le montage : seul ce que la
    // coquille doit émettre ; aucune mutation ensuite (réactivité = couche data).
    const emitted = await seedChains([
      { id: 'mcl-shell-34-nominal', name: 'Nominal', modifiers: [] },
      { id: 'mcl-shell-34-seconde', name: 'Seconde', modifiers: [] },
    ]);

    const subscribersBefore = countLiveQuerySubscribers();

    // Référence « providers du harnais seuls » : on matérialise leurs abonnements
    // différés (setTimeout(0) dans dexie) puis on les relâche avant de monter le
    // hook (leçon des lots 16/24-33).
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    const { result, rerender, unmount } = renderHookWithHarness(() => useModifierChainLive());

    // SYNCHRONE, avant toute macrotâche : contrat commun APPLIQUÉ (aucun
    // defaultResult, l. 14) — la liveQuery vaut `undefined`, donc `isLoading` est
    // `true` dès le premier rendu, pendant que la VALEUR est masquée par le repli
    // `EMPTY_MODIFIER_CHAINS` (caractérisation 1) : les deux helpers répondent
    // « introuvable » alors que les deux lignes sont bien en base.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.modifierChains).toEqual([]);
    expect(result.current.modifierCount).toBe(0);
    expect(result.current.nameAlreadyExists('Nominal')).toBe(false);
    await expect(
      result.current.applyModifierChainToCollection(
        'mcl-shell-34-nominal',
        { collectionId: 'mcl-shell-34-collection' },
        ElementType.TEXT_LINE,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    const fallbackChains = result.current.modifierChains;

    // Bascule après première émission : `isLoading` retombe et `modifierChains`
    // devient le tableau émis, c'est-à-dire exactement ce que rend le vrai
    // repository.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.modifierChains).toEqual(emitted);
    // Repli et émission sont deux tableaux distincts (caractérisation 1).
    expect(result.current.modifierChains).not.toBe(fallbackChains);
    expect(result.current.modifierCount).toBe(emitted.length);

    // Les helpers de l'API exportée (call sites SaveModifierChainForm et
    // CollectionMetadataForm) lisent le tableau ÉMIS, sans seconde lecture.
    expect(result.current.nameAlreadyExists('Nominal')).toBe(true);
    expect(result.current.nameAlreadyExists('Seconde')).toBe(true);
    expect(result.current.nameAlreadyExists('Chaîne jamais enregistrée')).toBe(false);
    // Caractérisation 3 : égalité stricte, contrairement à useProjects (lot 25).
    expect(result.current.nameAlreadyExists('nominal')).toBe(false);

    // Abonnement prouvé deux façons : l'émission observée ne peut venir que d'un
    // abonnement vivant, et le compteur — mesuré APRÈS matérialisation — vaut la
    // référence providers + exactement la 1 liveQuery du hook.
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

    // Caractérisation 2 : deps `[modifierChainLiveRepository]` avec instance
    // mémoïsée — un re-render ne re-souscrit pas et ne relance pas la requête
    // (identité de l'émission conservée, donc `modifierCount` mémoïdé dessus
    // aussi). Seules les deux fonctions non mémoïsées (l. 23, l. 27 —
    // caractérisation 4) changent d'identité.
    const api = {
      modifierChains: result.current.modifierChains,
      modifierCount: result.current.modifierCount,
      nameAlreadyExists: result.current.nameAlreadyExists,
      applyModifierChainToCollection: result.current.applyModifierChainToCollection,
    };
    rerender();
    expect(result.current.modifierChains).toBe(api.modifierChains);
    expect(result.current.modifierCount).toBe(api.modifierCount);
    expect(result.current.nameAlreadyExists).not.toBe(api.nameAlreadyExists);
    expect(result.current.applyModifierChainToCollection).not.toBe(
      api.applyModifierChainToCollection,
    );
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('base vide : seul isLoading discrimine le chargement, identite du repli partagee puis remplacee', async () => {
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, rerender, unmount } = renderHookWithHarness(() => useModifierChainLive());

    // Premier rendu synchronique : chargement en cours, valeur = repli de module.
    expect(result.current.isLoading).toBe(true);
    const fallbackChains = result.current.modifierChains;
    expect(fallbackChains).toEqual([]);

    // Caractérisation 1 : tant que rien n'est émis, `modifierChains` est LA MÊME
    // constante de module à chaque rendu — aucune nouvelle souscription, aucune
    // nouvelle valeur.
    rerender();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.modifierChains).toBe(fallbackChains);
    expect(result.current.nameAlreadyExists('Import n importe quoi')).toBe(false);

    // Émission d'une base vide : le contenu ne dit toujours rien (`[]`), seul
    // `isLoading` bascule — et l'identité change (caractérisation 6).
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.modifierChains).toEqual([]);
    expect(result.current.modifierChains).not.toBe(fallbackChains);
    expect(result.current.modifierCount).toBe(0);
    expect(result.current.nameAlreadyExists('Import n importe quoi')).toBe(false);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('requete en echec : le toArray materialisant rencontre la faute, jet au rendu jusqu a la boundary, jamais de valeur d erreur', async () => {
    // Une ligne au moins en base : le hook 'reading' de Dexie ne s'exécute que
    // sur les lignes effectivement lues, et c'est la lecture qui doit échouer.
    await seedChains([{ id: 'mcl-shell-34-erreur', name: 'En échec', modifiers: [] }]);

    const subscribersBefore = countLiveQuerySubscribers();
    const caught: { error?: unknown } = {};
    // Injection par l'API publique RÉELLE des hooks Dexie (cf. en-tête) : toute
    // lecture matérialisante de db.modifierChains échoue désormais — le
    // `toArray()` de la coquille compris (contrairement aux `count()` des lots
    // 31/32) — tant que ce filtre est monté.
    const failReading = (): void => {
      throw new Error('modifier-chains-lecture-en-echec-34');
    };
    db.modifierChains.hook('reading', failReading);
    try {
      const { result, unmount } = renderHookWithHarness(() => useModifierChainLive(), {
        wrapper: ({ children }) => (
          <CrashBoundary onError={(error) => (caught.error = error)}>{children}</CrashBoundary>
        ),
      });

      await waitFor(() => expect(caught.error).toBeDefined());
      expect(String(caught.error)).toContain('modifier-chains-lecture-en-echec-34');

      // La valeur d'erreur n'apparaît JAMAIS au retour du hook : le dernier rendu
      // commis est celui du chargement (la liveQuery n'a jamais émis de valeur),
      // donc une panne de lecture de la table chaînes est, côté API, un
      // chargement perpétuel — caractérisation 5 (call sites `AsyncState`/
      // `<Loading/>`).
      expect(result.current.isLoading).toBe(true);
      expect(result.current.modifierChains).toEqual([]);
      expect(result.current.modifierCount).toBe(0);

      // Le démontage du sous-arbre par la boundary relâche l'abonnement du hook :
      // après unmount complet (boundary → providers), plus aucune souscription ne
      // subsiste au-delà de la valeur d'avant-montage.
      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.modifierChains.hook('reading').unsubscribe(failReading);
    }
  });

  it('applyModifierChainToCollection — contrat observable seulement : NotFoundError sur id absent du tableau emis, resolution deleguee sans ecriture pour id present', async () => {
    // La voie « trouvée » est exercée avec une chaîne SANS modificateur : la
    // délégation aux utilitaires data est un non-op vérifié (cf. en-tête,
    // spécificités table) — l'application des modificateurs elle-même reste
    // verrouillée couche data, non re-testée.
    await seedChains([{ id: 'mcl-shell-34-appliquee', name: 'Appliquée', modifiers: [] }]);
    const snapshot = await readChains();
    const scope = { collectionId: 'mcl-shell-34-collection' };

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() => useModifierChainLive());
    // Le contrat porte sur le tableau ÉMIS : on attend la première émission
    // (l'état « pendant le chargement » est verrouillé au test 1).
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Id présent dans l'émission : la promesse se résout sans lever, et le hook
    // n'écrit RIEN — la table reste identique à sa relecture d'avant l'appel
    // (aucune mutation n'est du ressort de la coquille : lot 18).
    await expect(
      result.current.applyModifierChainToCollection(
        'mcl-shell-34-appliquee',
        scope,
        ElementType.TEXT_LINE,
      ),
    ).resolves.toBeUndefined();
    expect(await readChains()).toEqual(snapshot);

    // Id absent : c'est le HOOK QUI LÈVE, avant toute délégation — NotFoundError
    // typée, message et contexte verrouillés (@/utils/NotFoundError, distinct
    // de l'EntityNotFoundError du repository, caractérisation 8).
    const notFound = await result.current
      .applyModifierChainToCollection('mcl-shell-34-inconnue', scope, ElementType.TEXT_REGION)
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(notFound).toBeInstanceOf(NotFoundError);
    expect(String(notFound)).toContain('Modifier chain with id mcl-shell-34-inconnue not found');
    expect((notFound as NotFoundError).context).toEqual({
      entity: 'Modifier chain',
      id: 'mcl-shell-34-inconnue',
    });
    expect(await readChains()).toEqual(snapshot);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });
});
