/**
 * Lot 36 — useOcrAnnotations, palier 2 (cf. docs/roadmap.md, Q11).
 *
 * Périmètre : la COQUILLE SEULE (spécificité table du lot 36 : « idem : lecture
 * live, erreurs, désabonnement » — rien de plus). Le hook
 * (src/hooks/data/annotations/useOcrAnnotations.tsx, 18 lignes) EST une coquille
 * de valeur : une unique `useLiveQuery(annotationLiveRepository.hasOcrAnnotations(scope),
 * [scope, annotationLiveRepository], false)` (l. 9-13), dont le querier est le
 * `count() > 0` en égalité stricte sur l'index composé `[canvasId+collectionId+type]`
 * (annotations.live.ts:27-45, branche CanvasScope ; index déclaré db.ts:57-58).
 * C'est le JUMEAU de la branche « collection » du même querier, verrouillée au
 * lot 32 : la réactivité, le filtre TEXT_LINE et le distinguo vide/présent sont
 * déjà prouvés couche data par `annotations.live.test.ts:66-100` (campagne Q2) —
 * AUCUN scénario de données n'est dupliqué ici : les annotations sont écrites par
 * le VRAI repository AVANT le montage et jamais mutées pendant le test ; seuls des
 * changements de prop `scope` déplacent la requête (plumbing propre à la coquille,
 * précédent test 1 partie 4 du lot 32).
 *
 * Contrat commun, point par point :
 * - état initial : DÉVIATION caractérisée, la même qu'aux lots jumeaux 31/32 — le
 *   hook passe `false` comme troisième argument (defaultResult, l. 12) :
 *   `hasOcrAnnotations` est un booléen dès le premier rendu synchronique, jamais
 *   `undefined`, et rien de chargé n'est exposé (pas d'`isLoading`). Le motif
 *   « undefined → loading » de `liveLoading.test.tsx` ne s'applique pas (rien à
 *   distinguer côté hook — même verdict qu'aux lots 24/25/30/31/32, table de cette
 *   suite non étendue). Conséquence : chargement et « canvas sans annotation OCR »
 *   INDISTINGUABLES (test 2) ;
 * - bascule après première émission : `false` → `true` sous TEXT_LINE présente sur
 *   le canvas, vérifiée par `waitFor` (test 1) ; seconde bascule propre : les deps
 *   `[scope, annotationLiveRepository]` (l. 11) font qu'un changement de `scope`
 *   relance l'abonnement — `true` → `false` quand le nouveau canvas n'a pas de
 *   TEXT_LINE (test 1) ; ce re-déclenchement sert aussi de re-lecture sous
 *   injection (test 3) ;
 * - remontée d'erreur : DÉVIATION caractérisée, miroir exact du lot 32 : le querier
 *   est un `count()` key-only (Dexie 4.4.4, `isPlainKeyRange` → `coreTable.count`,
 *   AUCUNE valeur matérialisée) — une faute injectée par l'API publique RÉELLE
 *   `db.annotations.hook('reading')` n'est JAMAIS ATTEINTE par la requête du hook.
 *   La remontée d'erreur « jet en phase de rendu jusqu'à la ErrorBoundary »,
 *   verrouillée positivement aux lots 24/25/29/30/33/34/35 sur des queriers
 *   matérialisants, n'a ICI AUCUNE voie atteignable par la seule API réelle : trou
 *   de contrat documenté, pas inventé, vérifié NÉGATIVEMENT (test 3, caractérisation
 *   4) — l'armure de la faute est pourtant prouvée jointe par une lecture
 *   matérialisante directe (`db.annotations.get`) qui rejette ;
 * - désabonnement au démontage : preuve comportementale (une émission ne peut
 *   venir que d'un abonnement vivant) et compteur `countLiveQuerySubscribers`
 *   comparé APRÈS matérialisation à une référence « providers du harnais seuls »
 *   matérialisée puis relâchée DANS LE MÊME TEST (leçon des lots 16/24-35 : jamais
 *   en delta synchrone ni en comparaison absolue inter-test — les sources
 *   multicastées de dexie-react-hooks survivent CLEANUP_DELAY 3 s). Le hook ajoute
 *   EXACTEMENT 1 abonné (sa liveQuery unique), y compris sous swap de deps (la
 *   souscription périmée est REMPLACÉE, pas doublée) ; retour EXACT à la valeur
 *   d'avant-montage après `unmount`, dans les trois tests — chaque test n'démonte
 *   qu'après avoir observé une émission (ou une valeur confirmée sous injection),
 *   aucune requête donc en vol au démontage : quiescence déterministe avant le
 *   `createTestDb()` suivant (leçon du lot 35, transposée : coquille de lecture
 *   seule, aucun write fire-and-forget à flusher).
 *
 * Frontière pour l'erreur : injection par l'API publique RÉELLE des hooks Dexie,
 * `db.annotations.hook('reading')`, retirée en `finally` (discipline des lots
 * 24-35), posée APRÈS émission ancrée de la liveQuery du hook (flip `false` →
 * `true`, précédent lot 27 pour l'ancrage ; précédent lot 32 pour le mécanisme).
 * Aucune mutation de table sous injection : aucun provider du harnais ne liveQuery
 * `annotations` (les abonnements de référence sont collections, workers, results —
 * WorkerContext.tsx:45-46, CollectionContext.tsx) — donc seule la re-lecture
 * déclenchée par le changement de deps du hook tourne pendant la fenêtre. Error-
 * Boundary de test (frontière d'affichage, pas un mock — précédents lots 4 et
 * 24-35) : son INACTION même porte la preuve négative du trou de contrat
 * (précédent lot 32). Écritures en base par le VRAI
 * `IndexedDBAnnotationRepository` (`getAnnotationRepository().addAll`, précédent
 * lot 32) ; pas de mock de Dexie, pas de `vi.spyOn`, pas de `vi.mock`, pas de délai
 * artificiel, aucun appel réseau.
 *
 * Call sites (production, vérifiés — grep `useOcrAnnotations`, 1 seul fichier hors
 * la source et les commentaires du lot 32) :
 * - `CollectionInspectorGalleryItemContent.tsx:51` déstructure `.hasOcrAnnotations`
 *   du RETOUR (objet, pas le booléen brut du jumeau `useCollectionOcrStatus`,
 *   cf. caractérisation 1) et l'affiche en icône : `SpellCheck` vert si vrai,
 *   `SpellCheck2` destructif sinon (l. 119-123) — pendant le chargement l'icône
 *   « sans OCR » s'affiche, faux négatif caractérisé (caractérisation 2, symétrique
 *   du bouton absent d'`OcrStatus` au lot 32) ;
 * - le même call site MÉMOÏSE le scope (`useMemo` l. 42-45, deps les valeurs
 *   `collectionId`/`canvasId`) : cohérent avec la sémantique par identité des deps
 *   (caractérisation 3) — un appelant inline re-souscrirait à chaque rendu ;
 * - le scope transmis est toujours un `CanvasScope` complet : la branche
 *   `[canvasId+collectionId+type]` du querier est la voie réelle de production.
 * Aucun test de composants ne mocke ce hook (grep sur les suites existantes).
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * 1. le hook retourne un OBJET `{ hasOcrAnnotations }` (l. 15, littéral recréé à
 *   chaque rendu) là où le jumeau lot 32 retourne le booléen BRUT : deux API pour
 *   un même querier couche data — la consigne laissée « consignée sans trancher »
 *   par la caractérisation 4 du lot 32 est confirmée côté branche canvas, sans
 *   trancher non plus ;
 * 2. defaultResult `false` (l. 12) : `hasOcrAnnotations` ne distingue jamais
 *   chargement et absence d'annotation OCR sur le canvas — verrouillé tel
 *   qu'implémenté (test 2), pas corrigé ;
 * 3. deps `[scope, annotationLiveRepository]` (l. 11) comparées PAR IDENTITÉ
 *   (`Object.is` de React, dans `useMemo` comme dans `useEffect` de
 *   `useObservable`) : un rerender avec le MÊME objet scope ne re-souscrit pas ;
 *   un objet NEUF aux MÊMES valeurs re-souscrit (remplacement, compteur
 *   vérifié — test 1). À la différence des deps primitives du lot 32
 *   (`[collectionId]`), le `scope` est donc PORTANT par identité, non par valeur.
 *   L'instance mémoïsée du live repository (`useMemo(getAnnotationLiveRepository,
 *   [])` l. 7, fabrique neuve à chaque appel — dbFactory.ts:30-32) figure elle
 *   aussi dans les deps : portant au sens du lot 34 (sans mémoïsation, les deps
 *   changeraient à chaque rendu). Vérifié call site : le seul appelant mémoïse son
 *   scope — sans effet observable en production ;
 * 4. voie d'erreur INJOIGNABLE par la requête du hook (miroir de la
 *   caractérisation 3 du lot 32, branche canvas) : le `count()` key-only ne
 *   matérialise AUCUNE ligne, donc aucune injection par l'API réelle de Dexie ne
 *   peut le faire échouer — une panne de lecture de la table annotations est
 *   TOTALEMENT invisible pour la coquille : la requête rend sa valeur JUSTE sous
 *   injection (test 3), et le contrat commun « remontée d'erreur » n'est
 *   vérifiable ICI que négativement. Consigné pour l'audit ;
 * 5. le hook ne valide pas la forme du scope : `isCanvasScope` (scope.utils.ts:7-9)
 *   est tranché COUCHE DATA (annotations.live.ts:31) — un scope additif (type
 *   `AnnotationScope` passé structurellement) y retomberait sur la branche
 *   collection. Chemin sans contrat côté hook et hors palier 2 (discrimination de
 *   scope = couche data, verrouillée annotations.live.test.ts) ; call site vérifié :
 *   toujours un CanvasScope strict. Consigné, non inventé, non testé.
 */
import { ElementType } from '@/data/models/annotations/annotation';
import { CanvasScope } from '@/data/models/scope/scope';
import { db } from '@/data/repositories/indexeddb/db';
import { getAnnotationRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  FIXTURE_CANVAS_IDS,
  makeAnnotation,
  renderHookWithHarness,
  resetTestDbBeforeEach,
} from '@/hooks/__tests__/harness';
import { waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import useOcrAnnotations from '../useOcrAnnotations';

resetTestDbBeforeEach();

/** Écriture AVANT montage par le VRAI repository annotations (voie OCR : TEXT_LINE). */
async function seedAnnotation(
  id: string,
  collectionId: string,
  canvasId: string,
  type: ElementType = ElementType.TEXT_LINE,
): Promise<void> {
  await getAnnotationRepository().addAll([makeAnnotation({ id, collectionId, canvasId, type })]);
}

/** Relecture matérialisante par le VRAI repository (quiescence et inventaire, jamais une attente par délai). */
function readScopeAnnotations(collectionId: string, canvasId: string): Promise<number> {
  return getAnnotationRepository()
    .getByScopeAndTypes({ collectionId, canvasId }, [ElementType.TEXT_LINE])
    .then((items) => items.length);
}

/**
 * ErrorBoundary de test (frontière d'affichage, pas un mock — même précédent que
 * les lots 4 et 24-35) : capte en ref l'erreur que `useLiveQuery` jetterait en
 * phase de rendu. Son INACTION est la preuve négative de la caractérisation 4.
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

describe('useOcrAnnotations — coquille liveQuery (contrat commun)', () => {
  it('etat initial false par defaultResult, bascule a la premiere emission, +1 abonne, swap de scope par identite, zero fuite au demontage', async () => {
    // Annotations écrites par le VRAI repository AVANT le montage : seul ce que la
    // coquille doit émettre ; aucune mutation ensuite (réactivité = couche data,
    // verrouillée annotations.live.test.ts:66-100). Le canvas B n'a AUCUNE ligne :
    // le swap de scope ne déplace que la requête, pas les données.
    const [canvasAvecOcr, canvasSansOcr] = FIXTURE_CANVAS_IDS;
    const collectionId = 'ocr-36-nominal';
    await seedAnnotation('annotation-36-nominal', collectionId, canvasAvecOcr);

    const subscribersBefore = countLiveQuerySubscribers();
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    let scope: CanvasScope = { collectionId, canvasId: canvasAvecOcr };
    const { result, rerender, unmount } = renderHookWithHarness(() => useOcrAnnotations(scope));

    // Premier rendu SYNCHRONE, avant toute macrotâche : l'API est exactement
    // l'objet { hasOcrAnnotations } (caractérisation 1) et la valeur est le
    // defaultResult `false` — jamais `undefined` (DÉVIATION du contrat commun,
    // cf. en-tête, jumeau lot 32).
    expect(Object.keys(result.current)).toEqual(['hasOcrAnnotations']);
    expect(result.current.hasOcrAnnotations).toBe(false);

    // Bascule après première émission : false → true (TEXT_LINE sur le canvas A).
    await waitFor(() => expect(result.current.hasOcrAnnotations).toBe(true));

    // Abonnement prouvé deux façons : l'émission observée ne peut venir que d'un
    // abonnement vivant, et le compteur — mesuré APRÈS matérialisation — vaut la
    // référence providers + exactement la 1 liveQuery du hook.
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

    // Caractérisation 3 : rerender avec le MÊME objet scope (mêmes références de
    // deps, Object.is) — ni re-souscription ni nouvelle valeur.
    rerender();
    expect(result.current.hasOcrAnnotations).toBe(true);
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);

    // Contrat propre à la coquille (l. 11) : changer de scope relance l'abonnement
    // sur le canvas B, sans ligne OCR — `false` retombe et le compteur reste à +1 :
    // la souscription périmée a été REMPLACÉE, pas doublée.
    scope = { collectionId, canvasId: canvasSansOcr };
    rerender();
    await waitFor(() => expect(result.current.hasOcrAnnotations).toBe(false));
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

    // Caractérisation 3 (suite) : objet scope NEUF aux MÊMES valeurs — deps
    // comparées par IDENTITÉ, la souscription est remplacée une fois de plus ; la
    // valeur, elle, ne change pas (le swap est invisible à la valeur, seul le
    // compteur le prouve).
    scope = { collectionId, canvasId: canvasSansOcr };
    rerender();
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));
    expect(result.current.hasOcrAnnotations).toBe(false);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('canvas sans annotation OCR : chargement et absence indiscernables (defaut false, rien de charge expose)', async () => {
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() =>
      useOcrAnnotations({ collectionId: 'ocr-36-vide', canvasId: FIXTURE_CANVAS_IDS[0] }),
    );

    // Premier rendu synchrone : false (defaultResult, caractérisation 2).
    expect(result.current.hasOcrAnnotations).toBe(false);

    // On laisse la requête de l'arbre (providers + hook) avoir le temps de tourner
    // (preuve de matérialisation par le compteur, la valeur seule ne dirait rien) :
    // même après émission d'un canvas sans TEXT_LINE, la valeur reste false et rien
    // ne permettra jamais de distinguer le false du defaultResult du false émis
    // (côté call site, l'icône « sans OCR » s'affiche dès le premier rendu —
    // caractérisation 2).
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    expect(result.current.hasOcrAnnotations).toBe(false);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('faille injectee dans la lecture des annotations : le count key-only ne la rencontre jamais, valeur juste dans les deux sens du swap, aucune erreur', async () => {
    // Un canvas AVEC ligne TEXT_LINE (la lecture matérialisante de l'armure doit
    // pouvoir frapper une ligne réelle) et un canvas SANS ligne : chaque sens du
    // swap sous injection porte une valeur attendue DIFFÉRENTE, donc une bascule
    // réellement observée — la preuve que la re-lecture a ABOUTI sous injection,
    // non seulement qu'elle a démarré (quiescence déterministe, leçon du lot 35).
    const [canvasAvecOcr, canvasSansOcr] = FIXTURE_CANVAS_IDS;
    const collectionId = 'ocr-36-erreur';
    await seedAnnotation('annotation-36-arme', collectionId, canvasAvecOcr);

    const subscribersBefore = countLiveQuerySubscribers();
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    let scope: CanvasScope = { collectionId, canvasId: canvasAvecOcr };
    // Filet de sécurité, JAMAIS attendu (caractérisation 4) : si le mécanisme
    // « erreur de liveQuery = jet au rendu » des lots matérialisants devenait
    // joignable pour cette coquille, la boundary porterait le diagnostic au lieu
    // de laisser crasher la suite sans attribution.
    const crashes: unknown[] = [];
    const { result, rerender, unmount } = renderHookWithHarness(() => useOcrAnnotations(scope), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <CrashBoundary onError={(error) => crashes.push(error)}>{children}</CrashBoundary>
      ),
    });

    // Émission ancrée avant injection (précédent lot 27) : flip false → true.
    await waitFor(() => expect(result.current.hasOcrAnnotations).toBe(true));

    // Injection par l'API publique RÉELLE des hooks Dexie, retirée en `finally`
    // (lots 24-35) : toute lecture MATÉRIALISANTE d'une ligne de db.annotations
    // échoue désormais.
    const failReading = (): void => {
      throw new Error('annotations-lecture-en-echec-36');
    };
    db.annotations.hook('reading', failReading);
    try {
      // L'injection est bien ARMÉE sur la table : une lecture matérialisante
      // (API publique `get`, précédent lot 32) rejette. Sans cette preuve, la
      // valeur juste observée ensuite ne distinguerait pas « voie key-only » de
      // « injection inactive ».
      await expect(db.annotations.get('annotation-36-arme')).rejects.toThrow(
        'annotations-lecture-en-echec-36',
      );

      // Swap vers le canvas SANS ligne : la valeur attendue (`false`) est la
      // valeur JUSTE — le count a tourné (plage vide, range du query B) et la
      // faute matérialisante n'a jamais été rencontrée.
      scope = { collectionId, canvasId: canvasSansOcr };
      rerender();
      await waitFor(() => expect(result.current.hasOcrAnnotations).toBe(false));
      await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

      // Swap de RETOUR vers le canvas AUX lignes : la valeur attendue (`true`) est
      // la valeur JUSTE alors que la range contient une ligne que TOUTE lecture
      // matérialisante échoue — la voie key-only du count ne la rencontre pas
      // (caractérisation 4, miroir du lot 32 pour la branche canvas). Rien
      // n'éclate, rien ne remonte au retour du hook.
      scope = { collectionId, canvasId: canvasAvecOcr };
      rerender();
      await waitFor(() => expect(result.current.hasOcrAnnotations).toBe(true));
      await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

      expect(crashes).toEqual([]); // preuve négative : la boundary n'a rien eu à capter
    } finally {
      db.annotations.hook('reading').unsubscribe(failReading);
    }

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    // Quiescence : la dernière émission observée sous injection est ABOUTIE ; la
    // relecture réelle (injection retirée) confirme l'inventaire de la table — la
    // panne de lecture n'a rien écrit ni cassé — et place le test sur un tick où
    // plus aucune requête du hook ne peut rester en vol avant le createTestDb()
    // suivant.
    expect(await readScopeAnnotations(collectionId, canvasAvecOcr)).toBe(1);
    expect(await readScopeAnnotations(collectionId, canvasSansOcr)).toBe(0);
  });
});
