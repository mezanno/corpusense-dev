/**
 * Lot 29 — useLiveSources, coquille liveQuery (cf. docs/roadmap.md, Q11, palier 2).
 *
 * Périmètre : le contrat commun de coquille, sur le vrai stack via le harnais du
 * lot 0 — rien sur la réactivité des sources filtrées par type, déjà verrouillée
 * par `sources.live.test.ts` et le repository sources (campagne Q2) : aucun
 * scénario de mutations en cours de montage n'est dupliqué ici (les sources sont
 * écrites par le VRAI repository AVANT le montage ; la seule mutation en cours
 * de montage du lot sert à rendre une cible « déjà absente » pour le sweep
 *   NotFound et n'assertionne rien sur l'émission intermédiaire, cf. test
 *   dédié).
 *
 * CONFORMITÉ AU CONTRAT COMMUN — pas de déviation lot 24-25 : contrairement à
 * `useTags`/`useProjects` (defaultResult `[]` masquant le chargement),
 * `useLiveSources` passe `undefined` comme résultat par défaut (aucun 3e
 * argument à `useLiveQuery`, useLiveSources.tsx:16,20) et EXPOSE deux drapeaux
 * `isLoadingRemoteSources`/`isLoadingLocalSources` (l. 70-71, égaux à
 * `query === undefined`) : le motif « undefined → loading » s'applique
 * tel quel. Les tableaux retournés ne sont jamais `undefined` (repli
 * `?? EMPTY_SOURCES`, l. 24-25, constante de module). C'est aussi pourquoi
 * `liveLoading.test.tsx` contient DÉJÀ ce hook dans sa table (« distingue les
 * deux listes de sources ») — PAS ÉTENDU ici : le cas existe, l'option du
 * palier 2 (« seulement si un cas manque ») ne s'applique pas.
 *
 * Contrat commun, point par point :
 * - état initial : avant toute macrotâche, les deux requêtes valent `undefined`
 *   → les deux drapeaux sont `true` et les deux listes `[]` (test nominal, base
 *   peuplée ; test « base vide » sans données) ;
 * - bascule après première émission : chaque drapeau passe à `false`
 *   indépendamment (remote à l'émission des lignes `type: 'remote'`, local à
 *   l'émission `[]` — la requête `local` ne lit AUCUNE ligne, son hook
 *   « reading » ne peut donc pas être déclenché, cf. frontière) ; `sourcesCount`
 *   (useMemo l. 27-32) suit les listes émises ;
 * - remontée d'erreur : aucune surface d'erreur au retour (pas de valeur
 *   d'erreur, pas de try/catch côté lecture) — `useLiveQuery` de
 *   dexie-react-hooks relance l'erreur en phase de rendu : seule une
 *   ErrorBoundary consommateur la rattrape (test « requête en échec ») ; le
 *   dernier rendu commité montre les listes en tableaux et le remote encore en
 *   chargement — une erreur liveQuery ne devient JAMAIS un état visible, elle
 *   éclate le sous-arbre, qui est démonté sans fuite d'abonnement ;
 * - désabonnement au démontage : preuve comportementale (une émission ne peut
 *   venir que d'un abonnement vivant) et compteur `countLiveQuerySubscribers`
 *   mesuré APRÈS matérialisation et comparé à une référence « providers seuls »
 *   (leçon des lots 16/24-28 : delta synchrone non probant, souscription
 *   différée via `setTimeout(0)` dans dexie). Le hook ajoute EXACTEMENT 2
 *   abonnés (ses deux `useLiveQuery`) ; stable sous `rerender` (deps
 *   `[sourceLiveRepository]`, useMemo l. 14) ; retour EXACT à la valeur
 *   d'avant-montage après `unmount`.
 *
 * Spécificité table (plan, lot 29) — `removeUnusedSources` : testée À LA LETTRE,
 * soit uniquement (a) que le sweep appelle les VRAIS repositories — la source
 * encore présente est supprimée par `deleteById` du repository réel, preuve de
 * délégation : la ligne de contenu suit (relecture par le repository réel), ce
 * qu'un `db.sources.delete` brut ne ferait pas ; et (b) qu'il ne lève PAS sur
 * NotFound déjà absent — le commentaire l. 63 de useLiveSources.tsx verrouille
 * cette tolérance, `deleteById` retourne l'erreur en VALEUR (sources.ts:215-217,
 * sémantique déjà prouvée par `sources.test.ts:245` « reports an absent
 * source ») que `Promise.all` (l. 64) ignore. LA LOGIQUE DE SÉLECTION (union des
 * ids de projets l. 39-40, jointure collections l. 46-59, différences l. 42/61)
 * est couche data : AUCUN scénario projet/collection n'est monté ici — base de
 * référence vide côté projets/collections, donc tous les remoteSources émises
 * sont candidates au sweep. La lecture `projectRepository.getAll()` /
 * `collectionRepository.getAllDetails()` passe par les vrais repositories (non
 * mockés, non espionnés) ; son résultat n'est observable que par la sélection,
 * hors périmètre — consignée comme telle, pas inventée.
 *
 * Frontière pour l'erreur : injection de faute via l'API publique RÉELLE
 * `table.hook('reading')` de Dexie sur `db.sources` (lots 24-25 pour le motif ;
 * lots 26-28 pour le retrait en `finally`), posée APRÈS la graine et une ligne
 * en base (le hook ne s'exécute que sur les lignes lues). Précédent lot 28 :
 * `db.sources` n'est lu par AUCUN provider du harnais (seulement collections/
 * workers/results), donc l'injection ne peut pas faire échouer une re-lecture
 * différée d'un autre abonnement. Pas de mock de Dexie, pas de `vi.spyOn`, pas
 * de délai artificiel ; écritures en base par les vrais repositories
 * (`seedRemoteSource` du harnais, `getSourceRepository()` pour la suppression
 * de préparation et les relectures).
 *
 * Call sites (production, vérifiés) :
 * - `IIIFSourcesDashboard` (`remoteSources`, `isLoadingRemoteSources`,
 *   IIIFSourcesDashboard.tsx:12 — passés à `AsyncState`, usage direct du
 *   distinctif vide/chargement) ;
 * - `LocalStorageDashboard` (`localSources`, `isLoadingLocalSources`,
 *   LocalStorageDashboard.tsx:12 — idem) ;
 * - `ListOfManifests` (`remoteSources`, `localSources`, ListOfManifests.tsx:22 —
 *   fusionnés localement) ;
 * - `ExpertPage` (`sourcesCount`, les deux drapeaux, ExpertPage.tsx:13,20-21 —
 *   portail global `<Loading/>`) ;
 * - `IIIFSourcesPage` (`removeUnusedSources`, IIIFSourcesPage.tsx:17,20 —
 *   `await` d'un handler passé en `void` au menu : un rejet ne serait PAS
 *   rattrapé côté appelant, cf. caractérisation 3).
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * 1. `getSourceLiveRepository()` retourne une instance neuve à chaque appel
 *   (dbFactory.ts:58-60) : c'est le `useMemo(..., [])` du hook qui stabilise les
 *   deps des DEUX `useLiveQuery` — un rerender ne re-souscrit pas (vérifié par
 *   la stabilité exacte du compteur, test nominal). À noter : le premier
 *   argument (`sourceLiveRepository.getAll(type)`) est recréé à chaque rendu,
 *   mais dexie-react-hooks mémoïde l'observable sur les deps seules — la
 *   requête en vol reste celle du premier rendu, sans effet observable (le
 *   querier relit la base à chaque tour) ;
 * 2. `removeUnusedSources` n'est PAS mémoïsée (fermée à chaque rendu, l. 34) et
 *   balaye le snapshot `remoteSources` DU RENDU qui l'a produite — appelé avant
 *   la première émission, c'est un no-op (vérifié) ; appelé via une closure
 *   périmée, il peut viser une source déjà absente — c'est précisément la
 *   branche NotFound tolérée (vérifiée). Les repositories d'E/S sont résolus à
 *   chaque appel (l. 38/45/62, instance neuve, dbFactory.ts:42/54/114) ;
 * 3. hors NotFound EN VALEUR, le sweep n'a AUCUNE surface d'erreur : un rejet
 *   (lecture ou `deleteById` qui LÈVE — transaction en échec) traverse
 *   `Promise.all` et rejette `removeUnusedSources`, sans toast ni log, et son
 *   unique appelant production l'emploie en `void` (IIIFSourcesPage.tsx:19-21)
 *   → rejet non géré. Joignable seulement par injection sur un chemin que le
 *   plan borne aux deux assertions du sweep : consignée, pas testée ;
 * 4. les erreurs des liveQuery non plus n'ont aucune surface au retour : le
 *   hook ne peut que faire éclater son sous-arbre (ErrorBoundary) — pendant le
 *   chargement comme après échec, `remoteSources`/`localSources` restent des
 *   tableaux (`?? EMPTY_SOURCES` l. 24-25), l'information « en train de
 *   charger » ne vit que dans les deux drapeaux.
 */
import { Event } from '@/data/models/event';
import { SourceWithContent } from '@/data/models/source/source';
import { db } from '@/data/repositories/indexeddb/db';
import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  FIXTURE_CANVAS_IDS,
  countLiveQuerySubscribers,
  makeRemoteSource,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedRemoteSource,
} from '@/hooks/__tests__/harness';
import { RootState } from '@/state/store';
import { act, waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import useLiveSources from '../useLiveSources';

resetTestDbBeforeEach();

/** Écriture par le VRAI repository sources (type `remote`, comme `makeRemoteSource`). */
async function seedSource(name: string): Promise<SourceWithContent> {
  return seedRemoteSource(makeRemoteSource({ name }));
}

/** Les toasts tels que posés dans la slice `events` du store réel du harnais. */
function toasts(state: RootState): Event[] {
  return state.events.allEvents;
}

/**
 * ErrorBoundary de test (frontière d'affichage, pas un mock — même précédent que
 * les lots 4 et 24-25) : capte en ref l'erreur que `useLiveQuery` jette en phase
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

describe('useLiveSources — coquille liveQuery (contrat commun)', () => {
  it('état initial undefined → loading, bascule à la première émission, +2 abonnés, zéro fuite au démontage', async () => {
    // Écriture par le vrai repository AVANT le montage : seul ce que le hook doit
    // voir à l'émission ; aucune mutation en cours de test (réactivité = couche data).
    const remote = await seedSource('Nominal');

    const subscribersBefore = countLiveQuerySubscribers();

    // Référence « providers du harnais seuls » (3 liveQuery : collections, workers,
    // results — AUCUNE sur db.sources) : on matérialise leurs abonnements différés
    // puis on les relâche avant de monter le hook (leçon des lots 16/24-28).
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    const { result, rerender, unmount } = renderHookWithHarness(() => useLiveSources());

    // Synchrone, avant toute macrotâche : les deux requêtes valent `undefined` →
    // les deux drapeaux sont `true` et les tableaux vides viennent du repli
    // `?? EMPTY_SOURCES`, pas d'une émission (CONFORMITÉ au motif « undefined →
    // loading », cf. en-tête — pas de déviation lot 24-25 ici).
    expect(result.current.isLoadingRemoteSources).toBe(true);
    expect(result.current.isLoadingLocalSources).toBe(true);
    expect(result.current.remoteSources).toEqual([]);
    expect(result.current.localSources).toEqual([]);
    expect(result.current.sourcesCount).toEqual({ remote: 0, local: 0 });

    // Bascule après première émission : chaque drapeau retombe INDÉPENDAMMENT —
    // remote sur les lignes `type: 'remote'`, local sur l'émission `[]` (base
    // sans aucune source locale : la requête `where('type').equals('local')` ne
    // lit pas de ligne, mais résout bien une valeur). Le filtrage par type est
    // verrouillé par sources.live.test.ts, non re-testé ici.
    await waitFor(() => {
      expect(result.current.isLoadingRemoteSources).toBe(false);
      expect(result.current.isLoadingLocalSources).toBe(false);
    });
    expect(result.current.remoteSources).toHaveLength(1);
    const remoteSource = result.current.remoteSources[0];
    expect({ ...remoteSource, createdAt: '', updatedAt: '' }).toEqual({
      id: remote.id,
      name: 'Nominal',
      type: 'remote',
      pageCount: FIXTURE_CANVAS_IDS.length,
      thumbnailBlobId: remote.thumbnailBlobId,
      createdAt: '',
      updatedAt: '',
    });
    expect(z.iso.datetime().safeParse(remoteSource.createdAt).success).toBe(true);
    expect(z.iso.datetime().safeParse(remoteSource.updatedAt).success).toBe(true);
    expect(result.current.localSources).toEqual([]);
    expect(result.current.sourcesCount).toEqual({ remote: 1, local: 0 });

    // Abonnement prouvé deux façons : les émissions observées ne peuvent venir
    // que d'abonnements vivants, et le compteur — mesuré APRÈS matérialisation —
    // vaut la référence providers + exactement les 2 liveQuery du hook.
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 2));

    // L'instance stable du live repository (useMemo, caractérisation 1) et les
    // deps `[sourceLiveRepository]` font une souscription unique par requête :
    // re-render ne re-souscrit pas et ne change rien aux valeurs.
    rerender();
    expect(result.current.remoteSources).toHaveLength(1);
    expect(result.current.sourcesCount).toEqual({ remote: 1, local: 0 });
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 2);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('base vide : chargement et vide distinguables de bout en bout (les deux drapeaux, pas les tableaux)', async () => {
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() => useLiveSources());

    // Avant émission : `undefined` → les deux drapeaux à `true` (la distinction
    // que le defaultResult `[]` des lots 24-25 rendait impossible existe ici).
    expect(result.current.isLoadingRemoteSources).toBe(true);
    expect(result.current.isLoadingLocalSources).toBe(true);

    // Après émission : les drapeaux retombent, les tableaux restent `[]` — le
    // vide n'est jamais un chargement prolongé (cas verrouillé sous mock dans
    // `liveLoading.test.tsx`, établi ici sur le vrai stack).
    await waitFor(() => {
      expect(result.current.isLoadingRemoteSources).toBe(false);
      expect(result.current.isLoadingLocalSources).toBe(false);
    });
    expect(result.current.remoteSources).toEqual([]);
    expect(result.current.localSources).toEqual([]);
    expect(result.current.sourcesCount).toEqual({ remote: 0, local: 0 });

    // Les deux abonnements du hook sont bien pris (preuve comportementale : les
    // émissions observées viennent d'abonnements vivants ; le delta exact vs
    // providers est verrouillé au test nominal).
    expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore);
    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('requête en échec : l erreur éclate le rendu jusqu a la ErrorBoundary, jamais comme valeur au retour', async () => {
    // Une ligne remote au moins en base : le hook 'reading' de Dexie ne
    // s'exécute que sur les lignes effectivement lues, et c'est la lecture du
    // premier querier qui doit échouer (le querier `local` ne lit rien et ne
    // peut pas échouer par cette voie — cf. en-tête).
    await seedSource('En échec');

    const subscribersBefore = countLiveQuerySubscribers();
    const caught: { error?: unknown } = {};
    // Injection par l'API publique RÉELLE des hooks Dexie, retirée en `finally`
    // (lots 24-28) : toute lecture d'une ligne de db.sources échoue — les deux
    // queriers `where('type').equals(…).toArray()` du hook compris.
    const failReading = (): void => {
      throw new Error('sources-lecture-en-echec');
    };
    db.sources.hook('reading', failReading);
    try {
      const { result, unmount } = renderHookWithHarness(() => useLiveSources(), {
        wrapper: ({ children }) => (
          <CrashBoundary onError={(error) => (caught.error = error)}>{children}</CrashBoundary>
        ),
      });

      await waitFor(() => expect(caught.error).toBeDefined());
      expect(String(caught.error)).toContain('sources-lecture-en-echec');
      // La valeur d'erreur n'apparaît JAMAIS au retour du hook : le dernier
      // rendu commité montre des tableaux (`?? EMPTY_SOURCES`) et le remote
      // encore en chargement — une erreur liveQuery ne devient jamais un état
      // « loaded en erreur », elle éclate le sous-arbre (caractérisation 4).
      expect(Array.isArray(result.current.remoteSources)).toBe(true);
      expect(Array.isArray(result.current.localSources)).toBe(true);

      // Le démontage du sous-arbre par la boundary, puis l'unmount complet
      // (boundary → providers), relâchent les deux abonnements du hook : plus
      // aucune souscription ne subsiste au-delà de la valeur d'avant-montage.
      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.sources.hook('reading').unsubscribe(failReading);
    }
  });
});

describe('useLiveSources — removeUnusedSources (spécificité table, lot 29)', () => {
  it('sweep par les vrais repositories : source présente supprimée pour de vrai, source déjà absente (NotFound en valeur) non levée, aucun toast', async () => {
    const doomed = await seedSource('À balayer');
    const stale = await seedSource('Déjà partie');

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, store, unmount } = renderHookWithHarness(() => useLiveSources());

    // Émission matérialisée : le snapshot balayable vaut les deux sources.
    await waitFor(() => expect(result.current.remoteSources).toHaveLength(2));

    // La closure du sweep figée À CE RENDU (caractérisation 2 : c'est
    // exactement l'usage de `IIIFSourcesPage`, qui tient la fonction de son
    // dernier rendu). La suppression qui suit n'est qu'une PRÉPARATION pour
    // rendre une cible « déjà absente » à l'appel, sans mock ni injection :
    // aucune assertion ne porte sur l'émission intermédiaire (réactivité =
    // couche data).
    const sweep = result.current.removeUnusedSources;
    await act(async () => {
      const deleted = await getSourceRepository().deleteById(stale.id);
      expect(deleted.ok).toBe(true);
    });

    // Le NotFound de la cible déjà absente EST LA VALEUR retournée par le
    // repository réel (sources.ts:215-217) — `Promise.all` de l. 64 l'ignore,
    // le sweep résout sans lever : c'est la branche verrouillée par le
    // commentaire l. 63 et la spécificité du lot.
    await act(async () => {
      await expect(sweep()).resolves.toBeUndefined();
    });

    // Délégué aux VRAIS repositories : la source encore présente est partie,
    // content compris (relecture repository — un contournement brut de la
    // table sources aurait laissé la ligne de contenu ; le détail de la
    // cascade relève de sources.test.ts, non re-testé).
    const repository = getSourceRepository();
    expect((await repository.getById(doomed.id)).ok).toBe(false);
    expect((await repository.getContentById(doomed.id)).ok).toBe(false);
    expect((await repository.getById(stale.id)).ok).toBe(false);

    // Aucune surface de toast dans le sweep (caractérisation 3).
    expect(toasts(store.getState())).toEqual([]);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('sweep appelé avant la première émission : no-op résolu — il balaye le snapshot du rendu, pas la base', async () => {
    const remote = await seedSource('Attendra');

    const { result, unmount } = renderHookWithHarness(() => useLiveSources());

    // Fermeture capturée au premier rendu synchrone : `remoteSources` y vaut
    // encore le repli vide (aucune émission n'a eu lieu) — le sweep n'a rien à
    // cible, lit des bases projets/collections vides par les vrais
    // repositories et résout sans rien écrire (caractérisation 2).
    const earlySweep = result.current.removeUnusedSources;
    await act(async () => {
      await expect(earlySweep()).resolves.toBeUndefined();
    });

    // La première émission, elle, finit par arriver — et la source survit au
    // sweep précipité.
    await waitFor(() => expect(result.current.remoteSources).toHaveLength(1));
    expect((await getSourceRepository().getById(remote.id)).ok).toBe(true);

    unmount();
  });
});
