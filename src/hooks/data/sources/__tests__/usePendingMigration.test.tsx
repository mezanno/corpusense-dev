/**
 * Lot 30 — usePendingMigration, palier 2 (cf. docs/roadmap.md, Q11).
 *
 * REQUALIFICATION documentée (précédents lots 26-28) : `usePendingMigration` est
 * listé au palier 2 « coquilles liveQuery » avec une spécificité table « aucune »,
 * mais le hook (usePendingMigration.tsx, 33 lignes) n'est pas une coquille pure :
 * à côté de sa liveQuery unique (`pendingCount` = `useLiveQuery(() =>
 * sourceRepository.getPendingMigrationCount()) ?? 0`, l. 15), il porte une surface
 * d'action sans équivalent dans les lots 24-29 — un état local `isMigrating`
 * (useState, l. 11) et `migrateAll` (useCallback try/finally, l. 17-24) qui
 * délègue au VRAI `IndexedDBSourceRepository.migrateAllSources()`. La partie
 * coquille est traitée au cordon du contrat commun (tests 1-3) ; la surface
 * d'action n'est testée que pour ses comportements observables propres —
 * délégation prouvée par l'état final de la base réelle et propagation de
 * l'erreur par rejet (tests 4-5). LA SÉMANTIQUE DE MIGRATION elle-même (jointure
 * storedManifests/sourceContents du compteur, références de collection, skip sans
 * contenu, catches par élément) est verrouillée par `sources.test.ts:300-394`
 * (campagne Q2) : AUCUN scénario de ce type n'est dupliqué ici.
 *
 * Contrat commun, point par point :
 * - état initial : DÉVIATION caractérisée — le hook ne passe PAS de defaultResult
 *   (2e/3e arguments absents, l. 15) : la liveQuery vaut `undefined` avant la
 *   première émission, mais le repli `?? 0` le masque en un `0` numérique dès le
 *   premier rendu synchronique, et le hook n'expose AUCUN `isLoading`. Le motif
 *   « undefined → loading » de `liveLoading.test.tsx` ne s'applique donc pas à la
 *   valeur retournée (même raison qu'aux lots 24-25 pour ne pas étendre la table
 *   de cette suite : rien à distinguer côté hook ; `useLiveSources`, lui, y est
 *   déjà). Conséquence caractérisée : chargement et « aucune migration pendante »
 *   sont INDISTINGUABLES — test « base vide » ;
 * - bascule après première émission : `pendingCount` passe de 0 au nombre émis,
 *   vérifié par `waitFor` sous données présentes (test nominal). Écriture des
 *   lignes legacy AVANT le montage, aucune mutation en cours de test (réactivité
 *   = couche data), seule exception : la migration déclenchée par `migrateAll`
 *   elle-même, dont la retombée à 0 sert de preuve comportementale
 *   d'abonnement vivant (test 4) ;
 * - remontée d'erreur : AUCUNE surface d'erreur au retour pour la liveQuery —
 *   `useLiveQuery` de dexie-react-hooks relance l'erreur en phase de rendu
 *   (useObservable : `if (monitor.current.error) throw …`) : seule une
 *   ErrorBoundary consommateur la rattrape (test 3). La surface d'action, elle,
 *   remonte l'erreur PAR REJET (pas de catch, l. 19-23) — test 5 ;
 * - désabonnement au démontage : preuve comportementale (une émission ne peut
 *   venir que d'un abonnement vivant) et compteur `countLiveQuerySubscribers`
 *   comparé APRÈS matérialisation à une référence « providers du harnais seuls »
 *   (leçon des lots 16/24-29 : jamais en delta synchrone, la souscription étant
 *   différée via `setTimeout(0)` dans dexie). Le hook ajoute EXACTEMENT 1 abonné
 *   (sa liveQuery unique) ; stable sous `rerender` (deps `[]` implicites de
 *   `useLiveQuery(querier)`, caractérisation 3) ; retour EXACT à la valeur
 *   d'avant-montage après `unmount`, dans les cinq tests.
 *
 * Spécificité table (plan, lot 30) : aucune — les tests 4-5 ne couvrent que le
 * contrat observable de la surface d'action, conséquence de la requalification,
 * pas une spécificité ajoutée.
 *
 * Écritures en base : les tables legacy `storedManifests`/`storedManifestContents`
 * n'ont AUCUN repository vivant (le seul code de production qui les touche est
 * `getPendingMigrationCount`/`migrateAllSources` de `sources.ts` — grep
 * `db.storedManifests|db.convertedFiles` hors tests) ; les y écrire passe par
 * l'API publique RÉELLE de Dexie (`db.storedManifests.add`), même convention que
 * `sources.test.ts:300-337` — ce n'est pas un mock. Toute autre écriture ou
 * relecture de vérification passe par le vrai `getSourceRepository()`. Pas de
 * mock de Dexie, pas de `vi.spyOn`, pas de délai artificiel, et aucun appel
 * réseau : le contenu legacy est privé de `thumbnail` pour que
 * `getThumbnailBlob` (data/utils/manifest.ts:33-43) retourne un Blob vide sans
 * fetch.
 *
 * Frontière pour l'erreur : injection de faute via l'API publique RÉELLE
 * `table.hook('reading')` de Dexie sur `db.storedManifests` uniquement, posée
 * APRÈS la graine (le hook ne s'exécute que sur les lignes lues) et retirée en
 * `finally` (discipline des lots 26-29). Précédent lot 29 : `db.storedManifests`
 * n'est lu par AUCUN provider du harnais (collections, workers, results
 * seulement), donc l'injection ne peut pas faire échouer une re-lecture différée
 * d'un autre abonnement.
 *
 * Call sites (production, vérifiés — grep `usePendingMigration`, unique) :
 * - `Layout` (pages/Layout.tsx:26) déstructure les trois membres et les consomme
 *   tous : `pendingCount` gate le bouton de migration (`pendingCount > 0`,
 *   Layout.tsx:59) et son libellé (l. 63, 71) — la déviation d'état initial
 *   signifie que le bouton reste caché pendant le chargement (faux négatif,
 *   caractérisation 1) ; `isMigrating` pilote `disabled` (l. 65) et le libellé/
 *   spinner (l. 68-70) ; `migrateAll` est appelé en `void migrateAll()` (l. 64) —
 *   un rejet ne serait PAS rattrapé côté appelant (caractérisation 2, test 5).
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * 1. repli `?? 0` (usePendingMigration.tsx:15) : `pendingCount` ne distingue
 *   jamais chargement et base saine — côté `Layout`, le bouton de migration est
 *   absent pendant le chargement ; verrouillé tel qu'implémenté (test « base
 *   vide »), pas corrigé ;
 * 2. `migrateAll` (l. 17-24) n'a AUCUN catch : le rejet de
 *   `migrateAllSources` traverse le `finally` (qui remet bien `isMigrating` à
 *   false) et ressort à l'appelant, qui l'emploie en `void` → rejet non géré,
 *   sans toast ni log ; seul l'aspect observable (propagation + reset) est
 *   verrouillé au test 5 ;
 * 3. `getSourceRepository()` retourne une instance neuve à chaque appel
 *   (dbFactory.ts:54-56) : c'est le `useMemo(..., [])` du hook (l. 12) qui
 *   stabilise le repository capturé par le querier ; `useLiveQuery` sans deps
 *   mémoïde l'observable sur `[]` (dexie-react-hooks/dist/dexie-react-hooks.mjs:
 *   `useObservable(…, deps || [], …)`) — un rerender ne re-souscrit pas et ne
 *   relance pas la requête (vérifié par la stabilité exacte du compteur, test
 *   nominal) ;
 * 4. `pendingCount` comme `migrateAll` n'ont pas d'état d'erreur : une liveQuery
 *   en échec ne devient jamais un état visible, elle éclate le sous-arbre
 *   (ErrorBoundary) — le dernier rendu commité avant crash montre 0, comme le
 *   chargement (test 3) ;
 * 5. HORS FICHIER (couche data, remontée sans correction — l'exception « change-
 *   ment d'une ligne » du lot 14 ne vise que le fichier testé) :
 *   `migrateAllSources` loggue `console.log('manifestIdMap: ', …)` à chaque
 *   migration (sources.ts:363).
 */
import manifestFixture from '@/__tests__/manifest.json';
import { db } from '@/data/repositories/indexeddb/db';
import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  FIXTURE_CANVAS_IDS,
  countLiveQuerySubscribers,
  renderHookWithHarness,
  resetTestDbBeforeEach,
} from '@/hooks/__tests__/harness';
import type { Manifest } from '@iiif/presentation-3';
import { act, waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import usePendingMigration from '../usePendingMigration';

resetTestDbBeforeEach();

// Une seule et même URL de manifeste legacy suffit : le compteur ne retient que
// les ids de storedManifests absents des manifestes déjà présents en
// sourceContents (sémantique verrouillée par sources.test.ts:300-337).
const LEGACY_MANIFEST_URL = 'https://example.test/legacy-pending.json';

/**
 * Graine legacy par l'API publique RÉELLE de Dexie (cf. en-tête : pas de
 * repository vivant sur ces tables) — détail observable uniquement : le compte
 * des migrations pendantes.
 */
async function seedPendingManifest(name: string): Promise<void> {
  await db.storedManifests.add({
    id: LEGACY_MANIFEST_URL,
    name,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  });
}

/** Graine complète (détails + contenu) pour que la migration ait de quoi faire. */
async function seedPendingManifestWithContent(name: string): Promise<void> {
  await seedPendingManifest(name);
  const content = {
    ...manifestFixture,
    id: LEGACY_MANIFEST_URL,
    thumbnail: undefined,
  } as unknown as Manifest;
  await db.storedManifestContents.add({
    id: LEGACY_MANIFEST_URL,
    content,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  });
}

/**
 * ErrorBoundary de test (frontière d'affichage, pas un mock — même précédent que
 * les lots 4 et 24-29) : capte en ref l'erreur que `useLiveQuery` jette en phase
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

describe('usePendingMigration — coquille liveQuery (contrat commun)', () => {
  it('état initial 0 (?? 0), bascule à la première émission, +1 abonné, zéro fuite au démontage', async () => {
    // Graine posée AVANT le montage : seul ce que le hook doit voir à
    // l'émission ; aucune mutation en cours de test (réactivité = couche data).
    await seedPendingManifest('En attente');

    const subscribersBefore = countLiveQuerySubscribers();

    // Référence « providers du harnais seuls » (3 liveQuery : collections,
    // workers, results — AUCUNE sur les tables legacy) : on matérialise leurs
    // abonnements différés puis on les relâche avant de monter le hook (leçon
    // des lots 16/24-29).
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    const { result, rerender, unmount } = renderHookWithHarness(() => usePendingMigration());

    // Synchrone, avant toute macrotâche : la liveQuery vaut `undefined` mais le
    // repli `?? 0` en fait un 0 numérique dès le premier rendu (DÉVIATION
    // caractérisée, cf. en-tête — pas d'`undefined` exposé, pas d'`isLoading`).
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.isMigrating).toBe(false);
    expect(typeof result.current.migrateAll).toBe('function');

    // Bascule après première émission : 0 → 1 migration pendante.
    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    // Abonnement prouvé deux façons : l'émission observée ne peut venir que d'un
    // abonnement vivant, et le compteur — mesuré APRÈS matérialisation — vaut la
    // référence providers + exactement la 1 liveQuery du hook.
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

    // La liveQuery est mémoïdée sur deps `[]` (caractérisation 3) : un re-render
    // ne re-souscrit pas et ne relance pas la requête.
    rerender();
    expect(result.current.pendingCount).toBe(1);
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('base vide : chargement et zéro pendants indiscernables (repli ?? 0, pas d isLoading exposé)', async () => {
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() => usePendingMigration());

    // Avant émission : `undefined` replié en 0, `isMigrating` false.
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.isMigrating).toBe(false);

    // On laisse la requête avoir le temps de tourner (preuve de matérialisation
    // par le compteur, la valeur seule ne dirait rien) : même après émission
    // d'une base saine, la valeur reste 0 et rien ne permettra jamais de
    // distinguer le deux (caractérisation 1 ; côté `Layout`, le bouton de
    // migration est simplement absent pendant le chargement).
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    expect(result.current.pendingCount).toBe(0);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('requête en échec : l erreur éclate le rendu jusqu a la ErrorBoundary, jamais comme valeur au retour', async () => {
    // Une ligne au moins en base : le hook 'reading' de Dexie ne s'exécute que
    // sur les lignes effectivement lues, et c'est la lecture du querier
    // `getPendingMigrationCount` (db.storedManifests.toArray) qui doit échouer.
    await seedPendingManifest('En échec');

    const subscribersBefore = countLiveQuerySubscribers();
    const caught: { error?: unknown } = {};
    // Injection par l'API publique RÉELLE des hooks Dexie, retirée en `finally`
    // (lots 24-29) : toute lecture d'une ligne de db.storedManifests échoue
    // désormais, la liveQuery du hook comme les lectures ponctuelles du
    // repository — aucun provider du harnais ne lit cette table (cf. en-tête).
    const failReading = (): void => {
      throw new Error('pending-migration-lecture-en-echec');
    };
    db.storedManifests.hook('reading', failReading);
    try {
      const { result, unmount } = renderHookWithHarness(() => usePendingMigration(), {
        wrapper: ({ children }) => (
          <CrashBoundary onError={(error) => (caught.error = error)}>{children}</CrashBoundary>
        ),
      });

      await waitFor(() => expect(caught.error).toBeDefined());
      expect(String(caught.error)).toContain('pending-migration-lecture-en-echec');
      // La valeur d'erreur n'apparaît JAMAIS au retour du hook : le dernier
      // rendu commité avant le crash du sous-arbre montre le 0 du chargement
      // (caractérisation 4) — jamais l'erreur, jamais un état d'erreur.
      expect(result.current.pendingCount).toBe(0);

      // Le démontage du sous-arbre par la boundary, puis l'unmount complet
      // (boundary → providers), relâchent l'abonnement du hook : plus aucune
      // souscription ne subsiste au-delà de la valeur d'avant-montage.
      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.storedManifests.hook('reading').unsubscribe(failReading);
    }
  });
});

describe('usePendingMigration — surface d action migrateAll (requalification)', () => {
  it('délégation au repository réel : migration effectuée pour de vrai, isMigrating 0-1-0, pendingCount retombe par émission', async () => {
    await seedPendingManifestWithContent('Legacy remote');

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() => usePendingMigration());

    // Émission matérialisée : le hook est abonné et voit la ligne pendante.
    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    const migration = { current: undefined as Promise<void> | undefined };
    await act(async () => {
      migration.current = result.current.migrateAll();
    });
    // `setIsMigrating(true)` tient avant le premier await du corps (l. 18) :
    // `Layout` a bien son bouton désactivé pendant la migration.
    expect(result.current.isMigrating).toBe(true);

    await act(async () => {
      await migration.current;
    });
    expect(result.current.isMigrating).toBe(false);

    // Délégué au VRAI repository : la source migrée est relisible par lui
    // (nom, type et pageCount venus du contenu legacy — la sémantique détaillée
    // est verrouillée par sources.test.ts, non re-testée) ; la graine legacy a
    // été libérée.
    const repository = getSourceRepository();
    const migrated = await repository.getContentByManifestUrl(LEGACY_MANIFEST_URL);
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      const source = await repository.getById(migrated.value.id);
      expect(source).toMatchObject({
        ok: true,
        value: { name: 'Legacy remote', type: 'remote', pageCount: FIXTURE_CANVAS_IDS.length },
      });
    }
    expect(await db.storedManifests.count()).toBe(0);
    expect(await db.storedManifestContents.count()).toBe(0);

    // La liveQuery toujours abononnée suit la base : le compteur est retombé à
    // 0 — preuve comportementale que l'abonnement survit à toute la séquence,
    // pas un scénario de réactivité (couche data).
    await waitFor(() => expect(result.current.pendingCount).toBe(0));

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('migrateAll en échec de lecture : le rejet traverse (pas de catch), isMigrating retombe quand meme, rien n est écrit', async () => {
    await seedPendingManifest('À migrer en vain');

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() => usePendingMigration());
    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    // Injection posée APRÈS émission (aucune écriture n'aura lieu pendant sa
    // durée de vie, la liveQuery montée ne se relance donc pas — cf. en-tête) :
    // la première lecture de migrateAllSources (db.storedManifests.toArray,
    // sources.ts:266) échoue pour de vrai.
    const failReading = (): void => {
      throw new Error('pending-migration-lecture-en-echec');
    };
    db.storedManifests.hook('reading', failReading);
    try {
      const migration = { current: undefined as Promise<void> | undefined };
      act(() => {
        migration.current = result.current.migrateAll();
      });
      expect(result.current.isMigrating).toBe(true);

      // Pas de catch dans le hook (caractérisation 2) : l'erreur ressort en
      // REJET vers l'appelant — `Layout` l'emploie en `void`, ce serait un
      // rejet non géré (consigné, seul l'observable est verrouillé ici).
      let rejection: unknown;
      await act(async () => {
        try {
          await migration.current;
        } catch (error) {
          rejection = error;
        }
      });
      expect(String(rejection)).toContain('pending-migration-lecture-en-echec');
      // Le `finally` (l. 21-23) fait quand même retomber l'indicateur.
      expect(result.current.isMigrating).toBe(false);
    } finally {
      db.storedManifests.hook('reading').unsubscribe(failReading);
    }

    // Rien n'a été écrit : la graine est encore là, aucune source créée, le
    // compteur (relancé par aucune mutation) n'a pas bougé.
    expect(await db.storedManifests.count()).toBe(1);
    expect(await db.sources.count()).toBe(0);
    expect(result.current.pendingCount).toBe(1);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });
});
