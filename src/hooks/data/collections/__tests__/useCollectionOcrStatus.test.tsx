/**
 * Lot 32 — useCollectionOcrStatus, palier 2 (cf. docs/roadmap.md, Q11).
 *
 * Pas de requalification ici, à la différence du jumeau lot 31 : le hook
 * (useCollectionOcrStatus.tsx, 17 lignes) EST une coquille pure.
 * Une seule liveQuery, aucune surface propre : `hasOcr` =
 * `useLiveQuery(annotationLiveRepository.hasOcrAnnotations({ collectionId }),
 * [collectionId], false)` (l. 8-12), où le querier est un `count()` par index
 * composé `[collectionId+type]` filtré sur TEXT_LINE (annotations.live.ts:27-45)
 * ET le retour du hook est le booléen lui-même (l. 14), pas un objet. La
 * réactivité, le filtre de type et le distinguo vide/présent sont déjà verrouillés
 * couche data par `annotations.live.test.ts:66-100` (campagne Q2) : AUCUN scénario
 * de données n'est dupliqué ici — seul le comportement d'abonnement de la coquille
 * est testé (tests 1-3).
 *
 * Contrat commun, point par point :
 * - état initial : DÉVIATION caractérisée, la même qu'au jumeau lot 31 — le hook
 *   passe `false` comme defaultResult (l. 11) : `hasOcr` est un booléen dès le
 *   premier rendu synchronique, jamais `undefined`, et rien de chargé n'est
 *   exposé. Le motif « undefined → loading » de `liveLoading.test.tsx` ne
 *   s'applique pas (rien à distinguer côté hook — même raison qu'aux lots
 *   24-25/30/31 pour ne pas étendre la table de cette suite). Conséquence :
 *   chargement et « aucune annotation OCR » sont INDISTINGUABLES (test 2) ;
 * - bascule après première émission : `false` → `true` sous annotation TEXT_LINE
 *   présente, vérifiée par `waitFor` (test 1, partie 2). Seconde bascule propre :
 *   les deps `[collectionId]` (l. 10) font que le changement de `collectionId` AU
 *   SEUL rerender relance l'abonnement — `true` → `false` quand la nouvelle
 *   collection n'a pas d'annotation OCR (test 1, partie 4) ; ce re-déclenchement
 *   sert aussi de re-lecture sous injection (test 3) ;
 * - remontée d'erreur : DÉVIATION caractérisée, PLUS forte qu'au jumeau lot 31.
 *   Le querier est un `count()` en égalité stricte sur l'index composé : Dexie
 *   4.4.4 prend la voie « key-only » (`isPlainKeyRange` → `coreTable.count`,
 *   aucune valeur matérialisée), si bien qu'une faute injectée par l'API réelle
 *   `db.annotations.hook('reading')` n'est JAMAIS ATTEINTE par la requête du hook
 *   — à la différence du `count().anyOf` du jumeau qui traversait les lignes et
 *   avalait la faute en `false` (caractérisation 8 du lot 31). Ici la requête
 *   rend la VALEUR CORRECTE sous injection (test 3), et le mécanisme
 *   dexie-react-hooks « erreur de liveQuery = jet en phase de rendu jusqu'à la
 *   ErrorBoundary », déjà verrouillé aux lots 24/29/30 sur des queriers `toArray`
 *   où l'échec est joignable, n'a AUCUNE voie atteignable par la seule API réelle
 *   pour cette coquille : trou de contrat documenté, pas inventé (caractérisation
 *   3) ;
 * - désabonnement au démontage : preuve comportementale (une émission ne peut
 *   venir que d'un abonnement vivant) et compteur `countLiveQuerySubscribers`
 *   comparé APRÈS matérialisation à une référence « providers du harnais seuls »
 *   (leçon des lots 16/24-31 : jamais en delta synchrone, la souscription étant
 *   différée via `setTimeout(0)` dans dexie). Le hook ajoute EXACTEMENT 1 abonné ;
 *   stable sous `rerender` sans changement de deps (la closure querier recréée à
 *   chaque rendu ne re-souscrit pas, `useObservable` est indexé sur les deps
 *   seules) ; retour EXACT à la valeur d'avant-montage après `unmount`, dans les
 *   trois tests.
 *
 * Spécificité table (plan, lot 32) : aucune — confirmée par la source.
 *
 * Frontière pour l'erreur : injection par l'API publique RÉELLE des hooks Dexie,
 * `db.annotations.hook('reading')`, retirée en `finally` (discipline des lots
 * 24-31), posée APRÈS émission prouvée de la liveQuery du hook (le flip initial
 * `false` → `true` atteste la première exécution terminée — précédent lot 27 pour
 * l'ancrage), sous une ErrorBoundary de test (précédents lots 4 et 24-30 — le
 * jumeau lot 31 n'en montait pas, sa faute étant au moins avalée) dont
 * l'inaction même porte la preuve négative du trou de contrat. Aucune mutation
 * de table sous injection : aucun provider du harnais
 * ne liveQuery la table annotations (les trois liveQuery de référence sont
 * collections, workers, results — WorkerContext.tsx:45-46, CollectionContext.tsx),
 * donc rien d'autre que le rerun déclenché par le changement de deps du hook ne
 * lit la table pendant la fenêtre. La voie key-only du count est une propriété du
 * querier, pas une hypothèse : la table est déclarée avec l'index composé
 * `[collectionId+type]` (db.ts:56-57) et `where({ '[collectionId+type]': [c, t] })`
 * compile en égalité stricte sans filtre (dexie.mjs `Table.where`/
 * `Collection.count`). L'armement de la faute est prouvé dans le test par une
 * lecture matérialisante directe (`db.annotations.get`, API publique) qui REJETTE,
 * immédiatement avant de montrer que la requête du hook reste vraie.
 * Écritures en base par les VRAIS repositories (`getAnnotationRepository().addAll`
 * — précédent `useCollectionIO.test.tsx` — et `seedCollection` du harnais) ; pas
 * de mock de Dexie, pas de `vi.spyOn`, pas de délai artificiel, aucun appel
 * réseau, pas de registre de plugins (à la différence du jumeau — aucune surface
 * `getResultData` ici).
 *
 * Call sites (production, vérifiés — grep `useCollectionOcrStatus`, unique hors
 * la source) :
 * - `OcrStatus` (OcrStatus.tsx:11) consomme le booléen BRUT (pas d'objet retourné,
 *   différence avec le jumeau `LlmStatus`) : `if (!hasOcr) return null` (l.
 *   13-15) — la déviation d'état initial signifie que le bouton est ABSENT
 *   pendant le chargement, faux négatif caractérisé (caractérisation 1). Le clic
 *   délègue à `generateTextForCollection` (utils/export, couche data) : hors du
 *   périmètre du hook, et le `void handleClick()` (l. 39) n'est pas une voie
 *   observable par la coquille ;
 * - `OcrStatus` est monté par `CollectionTable` (CollectionTable.tsx:166, un
 *   bouton par ligne de collection) et `CollectionInspectorContent`
 *   (CollectionInspectorContent.tsx:93) — le changement de `collectionId` est donc
 *   un scénario d'appel réel (ligne sélectionnée ≠ ligne survolée).
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * 1. defaultResult `false` (l. 11) : `hasOcr` ne distingue jamais chargement et
 *   absence d'annotation OCR — côté `OcrStatus`, le bouton est absent pendant le
 *   chargement (faux négatif symétrique du jumeau) ; verrouillé tel
 *   qu'implémenté (test 2), pas corrigé ;
 * 2. deps `[collectionId]` SEULES (l. 10) : à la différence du jumeau
 *   (`[collectionId, workerLiveRepository]`), l'instance mémoïsée du live
 *   repository (useMemo l. 6, neuve à chaque appel de `getAnnotationLiveRepository`
 *   — dbFactory.ts:30-32) ne figure PAS dans les deps ; `useObservable` n'étant
 *   indexé que par les deps (useLiveQuery → `useObservable(() =>
 *   Dexie.liveQuery(querier), deps, default)`), le useMemo l. 6 est décoratif du
 *   point de vue de la souscription — même sans lui, un rerender ne re-souscrirait
 *   pas. Vérifié par la stabilité exacte du compteur sous rerender (test 1) ;
 * 3. voie d'erreur INJOIGNABLE par la requête du hook : le `count()` key-only ne
 *   matérialise AUCUNE ligne, donc aucune injection par l'API réelle de Dexie ne
 *   peut le faire échouer — une panne de lecture de la table annotations est
 *   TOTALEMENT invisible pour la coquille (valeur juste, aucune erreur), y compris
 *   là où le jumeau lot 31 dégradait au moins `false`. La remontée d'erreur
 *   « par le rendu » reste verrouillée aux lots 24/29/30 sur queriers joignables.
 *   Consigné pour l'audit : le contrat commun « remontée d'erreur » n'est
 *   vérifiable ICI que NÉGATIVEMENT (test 3) ;
 * 4. le hook retourne le booléen BRUT (l. 14) : pas de nom de membre, pas
 *   d'extension possible sans casse d'appel — symétriquement, le `hasOcrAnnotations`
 *   de `useOcrAnnotations` (lot 36, périmètre canvas) retourne un objet : deux
 *   API pour un même querier couche data, consigné sans trancher.
 */
import { ElementType } from '@/data/models/annotations/annotation';
import { db } from '@/data/repositories/indexeddb/db';
import { getAnnotationRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  makeAnnotation,
  makeCollection,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedCollection,
} from '@/hooks/__tests__/harness';
import { waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import useCollectionOcrStatus from '../useCollectionOcrStatus';

resetTestDbBeforeEach();

/** Écriture par le VRAI repository annotations (default : type TEXT_LINE, voie OCR). */
async function seedAnnotation(
  id: string,
  collectionId: string,
  type: ElementType = ElementType.TEXT_LINE,
): Promise<void> {
  await getAnnotationRepository().addAll([makeAnnotation({ id, collectionId, type })]);
}

/**
 * ErrorBoundary de test (frontière d'affichage, pas un mock — même précédent que
 * les lots 4 et 24-30) : capte en ref l'erreur que `useLiveQuery` jetterait en
 * phase de rendu. Son INACTION est la preuve négative de la caractérisation 3.
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

describe('useCollectionOcrStatus — coquille liveQuery (contrat commun)', () => {
  it('état initial false (defaultResult), bascule a la premiere emission, +1 abonné, retournement par deps, zéro fuite au démontage', async () => {
    // Annotations écrites par le VRAI repository AVANT le montage : seul ce que
    // le hook doit voir à l'émission ; aucune mutation en cours de test
    // (réactivité = couche data, verrouillée annotations.live.test.ts:66-100).
    await seedCollection(makeCollection({ id: 'collection-shell-32-a', name: 'A' }));
    await seedCollection(makeCollection({ id: 'collection-shell-32-b', name: 'B' }));
    await seedAnnotation('annotation-32-a', 'collection-shell-32-a');

    const subscribersBefore = countLiveQuerySubscribers();

    // Référence « providers du harnais seuls » (3 liveQuery : collections,
    // workers, results) : on matérialise leurs abonnements différés puis on les
    // relâche avant de monter le hook (leçon des lots 16/24-31).
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    let collectionId = 'collection-shell-32-a';
    const { result, rerender, unmount } = renderHookWithHarness(() =>
      useCollectionOcrStatus({ collectionId }),
    );

    // Synchrone, avant toute macrotâche : la liveQuery vaut `undefined` mais le
    // defaultResult `false` en fait un booléen dès le premier rendu (DÉVIATION
    // caractérisée, cf. en-tête). Le retour du hook EST la valeur — pas d'objet,
    // pas d'`isLoading` (caractérisation 4).
    expect(result.current).toBe(false);
    expect(typeof result.current).toBe('boolean');

    // Bascule après première émission : false → true (TEXT_LINE en base).
    await waitFor(() => expect(result.current).toBe(true));

    // Abonnement prouvé deux façons : l'émission observée ne peut venir que d'un
    // abonnement vivant, et le compteur — mesuré APRÈS matérialisation — vaut la
    // référence providers + exactement la 1 liveQuery du hook.
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

    // Caractérisation 2 : la closure querier est recréée à chaque rendu mais
    // `useObservable` n'est indexé que sur `[collectionId]` — un re-render sans
    // changement de deps ne re-souscrit pas.
    rerender();
    expect(result.current).toBe(true);
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);

    // Contrat propre à la coquille (l. 10) : changer `collectionId` relance
    // l'abonnement — la collection B n'a pas d'annotation OCR, `hasOcr` retombe,
    // et le compteur reste à +1 : la souscription périmée a été remplacée, pas
    // doublée.
    collectionId = 'collection-shell-32-b';
    rerender();
    await waitFor(() => expect(result.current).toBe(false));
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('base sans annotation OCR : chargement et absence indiscernables (défaut false, rien de chargé exposé)', async () => {
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() =>
      useCollectionOcrStatus({ collectionId: 'collection-shell-32-vide' }),
    );

    // Premier rendu synchrone : false (defaultResult, caractérisation 1).
    expect(result.current).toBe(false);

    // On laisse la requête de l'arbre (providers + hook) avoir le temps de
    // tourner (preuve de matérialisation par le compteur, la valeur seule ne
    // dirait rien) : même après émission d'une base sans TEXT_LINE du périmètre,
    // la valeur reste false et rien ne permettra jamais de distinguer les deux
    // (côté `OcrStatus`, le bouton est simplement absent — en-tête).
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    expect(result.current).toBe(false);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('faille injectee dans la lecture des annotations : la query count key-only ne la rencontre jamais, valeur juste, aucune erreur', async () => {
    // Deux collections AVEC annotations TEXT_LINE (les lignes doivent exister
    // pour qu'une lecture matérialisante puisse les frapper — cf. frontière en
    // en-tête), dont B n'est lue QU'après l'injection, via le seul changement de
    // deps du hook : aucune mutation de table sous injection et aucun provider
    // du harnais ne lit annotations, donc seule la requête du hook tourne pendant
    // la fenêtre.
    await seedCollection(makeCollection({ id: 'collection-shell-32-err-a', name: 'A' }));
    await seedCollection(makeCollection({ id: 'collection-shell-32-err-b', name: 'B' }));
    await seedAnnotation('annotation-32-err-a', 'collection-shell-32-err-a');
    await seedAnnotation('annotation-32-err-b', 'collection-shell-32-err-b');

    const subscribersBefore = countLiveQuerySubscribers();
    let collectionId = 'collection-shell-32-err-a';
    // Filet de sécurité, JAMAIS attendu (caractérisation 3) : si le mécanisme
    // « erreur de liveQuery = jet au rendu » des lots 24/29/30 devenait
    // joignable pour cette coquille, la boundary porterait le diagnostic au lieu
    // de laisser crasher la suite sans attribution.
    const crashes: unknown[] = [];
    const { result, rerender, unmount } = renderHookWithHarness(
      () => useCollectionOcrStatus({ collectionId }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <CrashBoundary onError={(error) => crashes.push(error)}>{children}</CrashBoundary>
        ),
      },
    );

    // Émission ancrée avant injection (précédent lot 27) : flip false → true.
    await waitFor(() => expect(result.current).toBe(true));
    const subscribersMounted = countLiveQuerySubscribers();

    // Injection par l'API publique RÉELLE des hooks Dexie, retirée en `finally`
    // (lots 24-31) : toute lecture MATÉRIALISANTE d'une ligne de db.annotations
    // échoue désormais.
    const failReading = (): void => {
      throw new Error('annotations-lecture-en-echec-32');
    };
    db.annotations.hook('reading', failReading);
    try {
      // L'injection est bien ARMÉE sur la table : une lecture matérialisante
      // (API publique `get`) rejette. Sans cette preuve, le test suivant ne
      // distinguerait pas « voie key-only » de « injection inactive ».
      await expect(db.annotations.get('annotation-32-err-a')).rejects.toThrow(
        'annotations-lecture-en-echec-32',
      );

      collectionId = 'collection-shell-32-err-b';
      rerender();

      // Caractérisation 3 : le count() en égalité stricte sur l'index composé
      // `[collectionId+type]` ne matérialise AUCUNE valeur — la faute injectée
      // n'est pas atteinte, la requête rend la valeur JUSTE (`true`), ni
      // dégradée (jumeau lot 31 : `false` avalé) ni en échec. Rien n'éclate,
      // rien ne remonte au retour du hook.
      await waitFor(() => expect(result.current).toBe(true));
      expect(countLiveQuerySubscribers()).toBe(subscribersMounted); // re-run ciblé, pas de re-souscription
      expect(crashes).toEqual([]); // preuve négative : la boundary n'a rien eu à capter

      // Symétrique du jumeau : ici une panne de lecture de la table annotations
      // NE peut pas éteindre le bouton comme une collection vide — elle reste
      // totalement invisible pour la coquille.
      collectionId = 'collection-shell-32-err-a';
      rerender();
      await waitFor(() => expect(result.current).toBe(true));
    } finally {
      db.annotations.hook('reading').unsubscribe(failReading);
    }

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });
});
