/**
 * Lot 31 — useCollectionLlmStatus, palier 2 (cf. docs/roadmap.md, Q11).
 *
 * REQUALIFICATION documentée (précédents lots 26-30) : `useCollectionLlmStatus`
 * est listé au palier 2 « coquilles liveQuery » avec une spécificité table
 * « aucune », mais le hook (useCollectionLlmStatus.tsx, 39 lignes) n'est pas une
 * coquille pure : à côté de sa liveQuery unique (`hasLlmResult` = `useLiveQuery(
 * workerLiveRepository.hasResult({ collectionId }, ['openai', 'mistral']),
 * [collectionId, workerLiveRepository], false)`, l. 30-34), il porte une surface
 * de lecture propre, `getResultData` (l. 13-28) : recherche des ouvriers
 * `openai`/`mistral` du périmètre par le VRAI repository workers, sélection de
 * `workers[0]`, lookup dans le registre RÉEL `workerPlugins` et délégation à
 * `saga.extractData` des résultats lus par le VRAI repository results. La partie
 * coquille est traitée au cordon du contrat commun (tests 1-3) ; la surface
 * `getResultData` n'est testée que pour ses comportements observables propres —
 * filtrage par la liste de noms du hook, sélection `workers[0]`, court-circuit
 * sans ouvrier, rejet traversant (tests 4-7). LA SÉMANTIQUE DE DONNÉES reste
 * verrouillée ailleurs (campagne Q2) : réactivité de `hasResult` par
 * `workers.live.test.ts:49-61`, ordre `createdAt` descendant de
 * `getByNamesAndScope` par `workers.test.ts:165-169`. La sémantique interne
 * d'`extractData`, elle, n'est verrouillée NULLE PART (`__tests__` des plugins
 * ne contient que `errors.test.ts`) : les tests 4 et 6 ne fixent que le
 * passage de témoin du hook (quels résultats, quel plugin), pas le détail de
 * l'extraction — consigné pour l'audit (lot 38).
 *
 * Contrat commun, point par point :
 * - état initial : DÉVIATION caractérisée — le hook passe `false` comme 3e
 *   argument (defaultResult) de `useLiveQuery` (l. 33) : `hasLlmResult` est un
 *   booléen dès le premier rendu synchronique, jamais `undefined`, et le hook
 *   n'expose AUCUN `isLoading`. Le motif « undefined → loading » de
 *   `liveLoading.test.tsx` ne s'applique donc pas (même raison qu'aux lots
 *   24-25/30 pour ne pas étendre la table de cette suite : rien à distinguer
 *   côté hook ; le hook n'y figure pas). Conséquence caractérisée : chargement
 *   et « aucun ouvrier LLM » sont INDISTINGUABLES — test « base sans ouvrier » ;
 * - bascule après première émission : `false` → `true` sous ouvrier présent,
 *   vérifié par `waitFor` (test nominal). Plus une seconde bascule propre au
 *   hook : les deps `[collectionId, workerLiveRepository]` (l. 32) font que le
 *   changement de `collectionId` AU SEUL rerender relance l'abonnement —
 *   `true` → `false` quand la nouvelle collection n'a pas d'ouvrier LLM (test
 *   nominal, partie 3) ; ce re-déclenchement ciblé sert aussi de re-lecture
 *   sous injection (test 3) ;
 * - remontée d'erreur : DÉVIATION caractérisée pour la liveQuery — son
 *   querier est un `count()` par index composé et la faute injectable par
 *   l'API réelle de Dexie y est AVALÉE (cf. frontière et caractérisation 8) :
 *   la requête ne lève jamais, elle résout `false` comme si la collection
 *   n'avait aucun ouvrier — rien n'éclate, rien ne remonte au retour du hook
 *   (test 3). Le mécanisme dexie-react-hooks « erreur de liveQuery = jet en
 *   phase de rendu jusqu'à la ErrorBoundary » est déjà verrouillé aux lots
 *   24/29/30 sur des queriers où l'échec est joignable (`toArray`) : il ne
 *   passe ICI par aucune voie observable propre au hook, consigné sans être
 *   inventé. La surface `getResultData`, elle, remonte l'erreur PAR REJET,
 *   sans catch ni toast (test 7) ;
 * - désabonnement au démontage : preuve comportementale (une émission ne peut
 *   venir que d'un abonnement vivant) et compteur `countLiveQuerySubscribers`
 *   comparé APRÈS matérialisation à une référence « providers du harnais seuls »
 *   (leçon des lots 16/24-30 : jamais en delta synchrone, la souscription étant
 *   différée via `setTimeout(0)` dans dexie). Le hook ajoute EXACTEMENT 1
 *   abonné ; stable sous `rerender` sans changement de deps (`useMemo` l. 11 +
 *   deps mémoïdées) ; retour EXACT à la valeur d'avant-montage après
 *   `unmount`, dans les sept tests.
 *
 * Spécificité table (plan, lot 31) : aucune — les tests 4-7 ne couvrent que le
 * contrat observable de `getResultData`, conséquence de la requalification.
 *
 * Frontière pour l'erreur : injections par l'API publique RÉELLE des hooks
 * Dexie, retirées en `finally` (discipline des lots 26-30), à deux niveaux de
 * prise différents.
 * - `db.results.hook('reading')` (tests 5 et 7) : la lecture
 *   `getAllByWorkerId` de `getResultData` (l. 23) échoue pour de vrai — la
 *   voie `toArray` rejette (précédents lots 27/30). Précédent lot 27 pour
 *   l'ancrage : injection posée APRÈS émission prouvée de la liveQuery
 *   results des providers (sonde `useWorkerContext().hasResult`), plus aucune
 *   mutation ensuite, donc aucune re-lecture différée ne bute dessus pendant
 *   l'injection ;
 * - `db.workers.hook('reading')` (test 3) : la table est PARTAGÉE avec la
 *   liveQuery `getAll` du `WorkerProvider` du harnais — un `toArray`, qui lui
 *   REJETTE sous cette faute (lots 24/30) et ferait éclater l'arbre entier
 *   sans attribution possible. Double prudence donc : injection posée APRÈS
 *   émission ancrée des providers (sonde `useWorkerContext().workers`) et
 *   déclenchée par le seul changement de deps du hook (rerender vers une
 *   collection dont les lignes sont en base), jamais par une mutation de
 *   table — seule la requête du hook tourne sous l'injection. Et là, sonde
 *   empirique (Dexie 4.4.4 + fake-indexeddb, consignée en caractérisation 8) :
 *   le `count()` de `hasResult` lit bien les lignes (matérialisation pour la
 *   déduplication `anyOf`), la faute les frappe, mais le count de Dexie
 *   AVALE l'erreur et rend 0 — la liveQuery résout `false` sans jamais
 *   émettre d'erreur. La remontée d'erreur par le rendu n'a donc AUCUNE voie
 *   atteignable par l'API réelle pour cette coquille : c'est un trou de
 *   contrat caractérisé, pas un test inventé.
 * Écritures en base par les VRAIS repositories (`getWorkerRepository().add/
 * patch`, `getResultRepository().add`, `seedCollection` du harnais) ; registre
 * des plugins chargé par `initializePluginRegistries()` en `beforeAll`
 * (précédents lots 27 et 28 — `openai`/`mistral` ne sont pas marqués
 * expérimentaux, le drapeau localStorage n'a pas à être levé). Pas de mock de
 * Dexie, pas de `vi.spyOn`, pas de délai artificiel, aucun appel réseau :
 * `extractData` ne fait que parser les valeurs lues en base (`toGallicaUrl`
 * est hors chemin, les scopes des résultats sont des scopes collection).
 *
 * Call sites (production, vérifiés — grep `useCollectionLlmStatus`, unique) :
 * - `LlmStatus` (LlmStatus.tsx:11) déstructure les deux membres : `hasLlmResult`
 *   gate le rendu de la pastille (l. 13-15 — la déviation d'état initial
 *   signifie qu'elle est absente pendant le chargement, caractérisation 1) ;
 *   `getResultData` est `await`é dans `handleClick`, lui-même appelé en
 *   `void handleClick()` (l. 17-18, 37) : un rejet NE SERAIT PAS rattrapé côté
 *   appelant (caractérisation 5, test 7) ; la valeur `undefined` y affiche
 *   « oups » (l. 23-27), `[]` est vrai — le texte « oups » n'est atteignable
 *   qu'avec un plugin sans `extractData` (caractérisation 4).
 * - `LlmStatus` est monté par `CollectionTable` (CollectionTable.tsx:167, une
 *   pastille par ligne de collection) et `CollectionInspectorContent`
 *   (CollectionInspectorContent.tsx:94) — le changement de `collectionId` est
 *   donc un scénario d'appel réel (ligne sélectionnée ≠ ligne survolée).
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * 1. defaultResult `false` (l. 33) : `hasLlmResult` ne distingue jamais
 *   chargement et absence d'ouvrier LLM — côté `LlmStatus`, la pastille est
 *   absente pendant le chargement (faux négatif) ; verrouillé tel
 *   qu'implémenté (test « base sans ouvrier »), pas corrigé ;
 * 2. `hasLlmResult` est un NOM TROMPEUR : le prédicat compté
 *   (`workers.live.ts:12-21`) porte sur l'EXISTENCE D'OUVRIER `[scopeKey+name]`,
 *   pas sur celle d'un résultat — ouvrier sans aucun résultat → pastille
 *   affichée et `getResultData` qui résout `[]` (test 6), alors que « pas de
 *   résultat » voudrait dire `undefined`/`oups`. Sémantique de la couche data
 *   (verrouillée `workers.live.test.ts`), consignée ici côté hook car c'est ce
 *   que le call site consomme ;
 * 3. `getResultData` n'est PAS mémoïsée (l. 13, recréée à chaque rendu) et
 *   ferme sur le `collectionId` DU RENDU qui l'a produite — identité instable
 *   sous `rerender` (vérifiée, test 4) ; appelée via une closure périmée, elle
 *   extrairait les résultats de l'ancienne collection (risque symétrique du
 *   lot 29 ; non déclenchable par le call site, qui la rappelle à chaque clic) ;
 * 4. branche `saga?.extractData` fausse (l. 25) — plugin absent du registre ou
 *   sans `extractData` : la résolution `undefined` n'est JOIGNABLE que si
 *   `initializePluginRegistries()` n'a jamais tourné (main.tsx:11-12 le fait au
 *   démarrage, et `openai` comme `mistral` ont un `extractData`,
 *   openai.ts:182 / mistral.ts:186). Sans contrat observable par la seule API
 *   du hook dans une app démarrée : DOCUMENTÉE, pas inventée ;
 * 5. `getResultData` n'a AUCUN catch : le rejet des repositories (ou d'un
 *   `extractData` qui lèverait) traverse jusqu'à l'appelant, qui l'emploie en
 *   `void` → rejet non géré, sans toast ni log (test 7, verrouillé côté hook
 *   uniquement) ;
 * 6. `getWorkerLiveRepository()` retourne une instance neuve à chaque appel
 *   (dbFactory.ts:98-100) : c'est le `useMemo(..., [])` du hook (l. 11) qui
 *   stabilise la 2e deps de `useLiveQuery` — un rerender sans changement de
 *   `collectionId` ne re-souscrit pas (vérifié par la stabilité exacte du
 *   compteur, test nominal) ;
 * 7. sélection `workers[0]` (l. 18-20) : un seul ouvrier pilote l'extraction —
 *   les résultats des autres ouvriers LLM de la même collection sont ignorés
 *   (vérifié au test 4 ; l'ordre qui désigne `workers[0]` est couche data,
 *   caractérisation d'implémentation du hook, pas un scénario de réactivité) ;
 * 8. faute de lecture AVALÉE par le querier de la liveQuery : le `count()` par
 *   index composé de `hasResult` matérialise les lignes pour dédoublonner
 *   l'`anyOf`, et une erreur qui frappe ces lectures (hook « reading ») ne
 *   rejette pas la requête — elle rend 0. Une panne de lecture de la table
 *   workers éteint donc la pastille comme une collection vide, SANS erreur
 *   ni crash (test 3) : à la différence des queriers `toArray` des lots 24/30
 *   qui éclatent le sous-arbre, celle-ci est invisible. Caractérisation de la
 *   pile de test (Dexie 4.4.4 + fake-indexeddb) consignée pour l'audit,
 *   mécanique interne non verrouillée (couche data).
 */
import { useWorkerContext } from '@/components/reducers/WorkerContext';
import { Event } from '@/data/models/event';
import { Worker } from '@/data/models/worker/worker';
import { db } from '@/data/repositories/indexeddb/db';
import { getResultRepository, getWorkerRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  makeCollection,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedCollection,
} from '@/hooks/__tests__/harness';
import { initializePluginRegistries } from '@/state/sagas/plugins/registry';
import { RootState } from '@/state/store';
import { act, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import useCollectionLlmStatus from '../useCollectionLlmStatus';

resetTestDbBeforeEach();

// Le registre `workerPlugins` est peuplé par `main.tsx` en production ; on
// démarre le vrai chargeur — `openai` et `mistral`, non expérimentaux, y sont
// enregistrés avec leur `extractData` réel (cf. en-tête).
beforeAll(() => {
  initializePluginRegistries();
});

/** Écriture par le VRAI repository workers (scope collection). */
async function seedWorker(id: string, collectionId: string, name = 'openai'): Promise<Worker> {
  return getWorkerRepository().add({ id, name, scope: { collectionId }, params: {} });
}

/** Écriture par le VRAI repository results — valeur JSON brute, comme un résultat LLM. */
async function seedResult(worker: Worker, taskId: number, value: string) {
  return getResultRepository().add({
    scope: worker.scope,
    workerName: worker.name,
    workerId: worker.id,
    taskId,
    value,
    params: {},
  });
}

/** Les toasts tels que posés dans la slice `events` du store réel du harnais. */
function toasts(state: RootState): Event[] {
  return state.events.allEvents;
}

describe('useCollectionLlmStatus — coquille liveQuery (contrat commun)', () => {
  it('état initial false (defaultResult), bascule a la premiere emission, +1 abonné, retournement par deps, zéro fuite au démontage', async () => {
    // Ouvriers écrits par le VRAI repository AVANT le montage : seul ce que le
    // hook doit voir à l'émission ; aucune mutation en cours de test
    // (réactivité = couche data, verrouillée workers.live.test.ts).
    await seedCollection(makeCollection({ id: 'collection-shell-31-a', name: 'A' }));
    await seedCollection(makeCollection({ id: 'collection-shell-31-b', name: 'B' }));
    await seedWorker('worker-31-a', 'collection-shell-31-a');

    const subscribersBefore = countLiveQuerySubscribers();

    // Référence « providers du harnais seuls » (3 liveQuery : collections,
    // workers, results) : on matérialise leurs abonnements différés puis on les
    // relâche avant de monter le hook (leçon des lots 16/24-30).
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    let collectionId = 'collection-shell-31-a';
    const { result, rerender, unmount } = renderHookWithHarness(() =>
      useCollectionLlmStatus({ collectionId }),
    );

    // Synchrone, avant toute macrotâche : la liveQuery vaut `undefined` mais le
    // defaultResult `false` en fait un booléen dès le premier rendu (DÉVIATION
    // caractérisée, cf. en-tête — pas d'`undefined` exposé, pas d'`isLoading`).
    expect(result.current.hasLlmResult).toBe(false);
    expect(typeof result.current.getResultData).toBe('function');

    // Bascule après première émission : false → true (ouvrier openai en base).
    await waitFor(() => expect(result.current.hasLlmResult).toBe(true));

    // Abonnement prouvé deux façons : l'émission observée ne peut venir que d'un
    // abonnement vivant, et le compteur — mesuré APRÈS matérialisation — vaut la
    // référence providers + exactement la 1 liveQuery du hook.
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1));

    // L'instance mémoïsée du live repository (caractérisation 6) et les deps
    // `[collectionId, workerLiveRepository]` font une souscription unique : un
    // re-render sans changement de deps ne re-souscrit pas.
    rerender();
    expect(result.current.hasLlmResult).toBe(true);
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);

    // Contrat propre au hook (l. 32) : changer `collectionId` relance
    // l'abonnement — la collection B n'a pas d'ouvrier LLM, `hasLlmResult`
    // retombe, et le compteur reste à +1 : la souscription périmée a été
    // remplacée, pas doublée.
    collectionId = 'collection-shell-31-b';
    rerender();
    await waitFor(() => expect(result.current.hasLlmResult).toBe(false));
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly + 1);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('base sans ouvrier LLM : chargement et absence indiscernables (défaut false, pas d isLoading exposé)', async () => {
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() =>
      useCollectionLlmStatus({ collectionId: 'collection-shell-31-vide' }),
    );

    // Premier rendu synchrone : false (defaultResult, caractérisation 1).
    expect(result.current.hasLlmResult).toBe(false);

    // On laisse la requête de l'arbre (providers + hook) avoir le temps de
    // tourner (preuve de matérialisation par le compteur, la valeur seule ne
    // dirait rien) : même après émission d'une base sans ouvrier du périmètre,
    // la valeur reste false et rien ne permettra jamais de distinguer les deux
    // (côté `LlmStatus`, la pastille est simplement absente — en-tête).
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    expect(result.current.hasLlmResult).toBe(false);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('faille injectee dans la lecture des ouvriers : la query count degrade en false sans erreur, rien ne remonte, aucune fuite', async () => {
    // Deux collections AVEC ouvriers (les lignes doivent exister pour que le
    // hook « reading » frappe quelque chose — cf. frontière en en-tête), dont
    // B ne sera lue QU'après l'injection, via le seul changement de deps du
    // hook : aucune mutation de table sous injection, les providers ne relisent
    // donc jamais (leur toArray, lui, REJETTERAIT et ferait éclater l'arbre).
    await seedCollection(makeCollection({ id: 'collection-shell-31-err-a', name: 'A' }));
    await seedCollection(makeCollection({ id: 'collection-shell-31-err-b', name: 'B' }));
    await seedWorker('worker-31-err-a', 'collection-shell-31-err-a');
    await seedWorker('worker-31-err-b', 'collection-shell-31-err-b');

    const subscribersBefore = countLiveQuerySubscribers();
    let collectionId = 'collection-shell-31-err-a';
    const { result, rerender, unmount } = renderHookWithHarness(() => ({
      ...useCollectionLlmStatus({ collectionId }),
      // Sonde d'ancrage : `workers` vient du WorkerProvider monté par le
      // harnais ; son émission avec les deux lignes prouve que la liveQuery
      // `getAll` du provider a fini sa première exécution AVANT l'injection
      // (précédent lot 27).
      workers: useWorkerContext().workers,
    }));

    await waitFor(() => expect(result.current.hasLlmResult).toBe(true));
    await waitFor(() =>
      expect(result.current.workers.map((worker) => worker.id).sort()).toEqual([
        'worker-31-err-a',
        'worker-31-err-b',
      ]),
    );
    const subscribersMounted = countLiveQuerySubscribers();

    // Injection par l'API publique RÉELLE des hooks Dexie, retirée en `finally`
    // (lots 24-30) : toute lecture matérialisée d'une ligne de db.workers
    // échoue désormais — y compris les lignes que le count() de la liveQuery
    // du hook traverse pour dédoublonner son anyOf.
    const failReading = (): void => {
      throw new Error('workers-lecture-en-echec-31');
    };
    db.workers.hook('reading', failReading);
    try {
      collectionId = 'collection-shell-31-err-b';
      rerender();

      // Caractérisation 8 : la faute de lecture est AVALÉE par le count — la
      // liveQuery résout `false` comme si la collection B était vide, sans
      // jamais émettre d'erreur. Rien n'éclate (aucun ErrorBoundary nécessaire)
      // et aucune erreur n'apparaît au retour du hook : `hasLlmResult` reste un
      // booléen tout du long.
      await waitFor(() => expect(result.current.hasLlmResult).toBe(false));
      expect(result.current.workers.length).toBe(2); // le provider n'a rien relu
      expect(countLiveQuerySubscribers()).toBe(subscribersMounted); // re-run ciblé, pas de re-souscription
    } finally {
      db.workers.hook('reading').unsubscribe(failReading);
    }

    // Preuve finale de l'absence d'état d'erreur dans le hook : une erreur
    // capturée par `useObservable` éclaterait le RENDER suivant (mécanisme des
    // lots 24/30) ; retirée la faute, le retour sur A rallume simplement la
    // pastille — la liveQuery n'a jamais été en échec, juste mal renseignée.
    collectionId = 'collection-shell-31-err-a';
    rerender();
    await waitFor(() => expect(result.current.hasLlmResult).toBe(true));

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });
});

describe('useCollectionLlmStatus — surface getResultData (requalification)', () => {
  it('délégation au plugin réel : les resultats de l ouvrier le plus recent traversent seuls l extraction', async () => {
    await seedCollection(makeCollection({ id: 'collection-shell-31-data', name: 'Data' }));
    const mistralWorker = await seedWorker(
      'worker-31-mistral',
      'collection-shell-31-data',
      'mistral',
    );
    const openaiWorker = await seedWorker('worker-31-openai', 'collection-shell-31-data', 'openai');
    // Ordre déterministe, par le VRAI repository (`patch` admet createdAt) : la
    // sélection `workers[0]` (caractérisation 7) doit tomber sur openai.
    await getWorkerRepository().patch(mistralWorker.id, { createdAt: '2020-01-01T00:00:00.000Z' });
    await getWorkerRepository().patch(openaiWorker.id, { createdAt: '2021-01-01T00:00:00.000Z' });
    await seedResult(mistralWorker, 1, '{"src":"mistral"}');
    await seedResult(openaiWorker, 1, '{"src":"openai"}');

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, rerender, unmount } = renderHookWithHarness(() =>
      useCollectionLlmStatus({ collectionId: 'collection-shell-31-data' }),
    );
    await waitFor(() => expect(result.current.hasLlmResult).toBe(true));
    const subscribersMounted = countLiveQuerySubscribers();

    const data = await act(() => result.current.getResultData());
    // Plumbing du hook seul : les résultats de workers[0] SEULS (le worker
    // mistral et sa ligne sont ignorés — caractérisation 7), valeur JSON reluë
    // en base et traversée telle quelle par l'extractData RÉEL du plugin
    // (canvasId undefined : scope collection, pas de gallica — le détail de
    // l'enrichissement est hors périmètre, cf. en-tête).
    expect(data).toEqual([{ src: 'openai', canvasId: undefined }]);

    // `getResultData` n'est pas mémoïsée (caractérisation 3) : identité
    // recréée à chaque rendu, le compteur lui ne bouge pas.
    const getDataBefore = result.current.getResultData;
    rerender();
    expect(result.current.getResultData).not.toBe(getDataBefore);
    expect(countLiveQuerySubscribers()).toBe(subscribersMounted);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('sans ouvrier LLM dans le périmetre : résolution undefined, la table results n est pas lue', async () => {
    // Ouvrier peroocr + résultat leurrant : la liste ['openai', 'mistral'] du
    // hook (l. 15) est le filtre — un ouvrier hors liste ne déclenche NI la
    // pastille NI la lecture des résultats (court-circuit l. 18, prouvé par
    // l'injection results sous laquelle la résolution reste undefined).
    await seedCollection(makeCollection({ id: 'collection-shell-31-decoy', name: 'Decoy' }));
    const decoy = await seedWorker('worker-31-decoy', 'collection-shell-31-decoy', 'peroocr');
    await seedResult(decoy, 1, '{"leurre":true}');

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() => ({
      ...useCollectionLlmStatus({ collectionId: 'collection-shell-31-decoy' }),
      // Sonde d'ancrage (précédent lot 27) : le resultat leurrant est
      // matérialisé dans la liveQuery results du provider → plus aucune
      // re-lecture différée pendant l'injection.
      hasDecoyResult: useWorkerContext().hasResult('worker-31-decoy'),
    }));
    await waitFor(() => expect(result.current.hasDecoyResult).toBe(true));
    expect(result.current.hasLlmResult).toBe(false);

    const failReading = (): void => {
      throw new Error('results-lecture-en-echec-31');
    };
    db.results.hook('reading', failReading);
    try {
      const data = await act(() => result.current.getResultData());
      // Undefined malgré une injection sur db.results : le hook n'a PAS lu la
      // table — court-circuit sur `workers.length === 0` (l. 18).
      expect(data).toBeUndefined();
    } finally {
      db.results.hook('reading').unsubscribe(failReading);
    }

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('ouvrier LLM sans aucun resultat : delegation quand meme — resolution [] et pas undefined', async () => {
    await seedCollection(
      makeCollection({ id: 'collection-shell-31-vide-resultats', name: 'Vide' }),
    );
    await seedWorker('worker-31-sans-resultats', 'collection-shell-31-vide-resultats');

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() =>
      useCollectionLlmStatus({ collectionId: 'collection-shell-31-vide-resultats' }),
    );
    await waitFor(() => expect(result.current.hasLlmResult).toBe(true));

    // Le contrat observable du distinguo []/undefined (pastille allumée alors
    // qu'aucun résultat n'existe, caractérisation 2) : la délégation est bien
    // allée jusqu'à l'extractData réel, qui reçoit [] et le retourne (son
    // console.warn interne est un détail du plugin, non assertionné).
    const data = await act(() => result.current.getResultData());
    expect(data).toEqual([]);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('getResultData en echec de lecture des resultats : rejet traversant (pas de catch), aucun toast', async () => {
    await seedCollection(makeCollection({ id: 'collection-shell-31-erreur', name: 'Erreur' }));
    const worker = await seedWorker('worker-31-erreur', 'collection-shell-31-erreur');
    await seedResult(worker, 1, '{"src":"openai"}');

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, store, unmount } = renderHookWithHarness(() => ({
      ...useCollectionLlmStatus({ collectionId: 'collection-shell-31-erreur' }),
      hasWorkerResult: useWorkerContext().hasResult('worker-31-erreur'),
    }));
    await waitFor(() => expect(result.current.hasLlmResult).toBe(true));
    await waitFor(() => expect(result.current.hasWorkerResult).toBe(true));

    // Injection posée APRÈS émission prouvée des deux surfaces (cf. en-tête) :
    // la lecture `getAllByWorkerId` du hook (l. 23) échoue pour de vrai.
    const failReading = (): void => {
      throw new Error('results-lecture-en-echec-31');
    };
    db.results.hook('reading', failReading);
    try {
      const read = { current: undefined as Promise<unknown> | undefined };
      act(() => {
        read.current = result.current.getResultData();
      });
      // Aucun catch dans le hook (caractérisation 5) : l'erreur ressort en
      // REJET vers l'appelant — `LlmStatus` l'emploie en `void`, ce serait un
      // rejet non géré (consigné, seul l'observable est verrouillé ici).
      await expect(read.current).rejects.toThrow('results-lecture-en-echec-31');
      expect(toasts(store.getState())).toEqual([]);
    } finally {
      db.results.hook('reading').unsubscribe(failReading);
    }

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });
});
