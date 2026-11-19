# Audit de la suite de tests — 2026-11-19

_Rapport d'audit systématique de la suite de tests (couverture des comportements critiques, qualité des tests existants, scénarios manquants), produit par la méthode « test-audit » : cartographie par graphe d'imports test→source avec neutralisation des arêtes mockées, lecture des corps de tests, exécution de la suite et couverture c8 ciblée, recoupement avec [statuts.md](./statuts.md), [DECISIONS.md](./DECISIONS.md) (D-002, D-010), les plans Q2/Q11 et le [registre de sécurité](./securite.md). Audit non destructif : aucun fichier modifié pendant l'audit. État : document de référence tant que ses constats restent ouverts ; au fur et à mesure des closures, consolider dans la [roadmap](./roadmap.md) et supprimer._

## 1. Résumé exécutif

**Qualité générale : élevée, avec un effet entonnoir.** La base (repositories Dexie, loi de statut côté tâches, hooks de données — chantiers Q2/Q11) est testée avec une discipline remarquable : vraie base via `fake-indexeddb`, aucun mock du stockage dans les suites hooks, contrats `FunctionResult` verrouillés, harnais auto-testés. En remontant vers la surface, l'assurance décroît : la saga workers est couverte partiellement (lot 3 de Q2 suspendu), et **les plugins workers qui parlent réellement à Supabase/OCR/LLM (~1 900 lignes) ne sont exécutés par aucun test**, ni unitaire ni E2E.

**Exécution vérifiée le 2026-11-19** : suite Vitest complète **verte — 1 359 tests passés, 3 `todo`, 1 fichier ignoré** (`ManifestDetails.test.tsx`, corps `it.todo`). Couverture globale mesurée : 61,8 % lignes / 46,8 % branches (v8). Périmètres bornés déjà prouvés : `indexeddb` 93,05 % (2026-11-05), hooks 89,14 % (2026-11-18), `useJobRealtime` 63,15 %. Les E2E Playwright n'ont pas été exécutés pendant l'audit (limite d'environnement : serveur de dev + Chromium) ; leurs caractéristiques proviennent de la campagne Q9 et de la lecture des specs.

**Domaines critiques à assurance insuffisante**, par ordre de risque :

1. **Cycle de vie des jobs distants** : trois défauts de classe perte de données confirmés par le code (TA-001, TA-002, TA-003) — acquittement malgré erreur de traitement, garde anti-double-livraison morte, relaunch qui ne livre pas les terminaux.
2. **Plugins workers réels** : jamais instanciés dans la suite (registre mocké dans les suites saga, seuls des plugins factices tournent).
3. **Boot/reprise post-crash** : `initWorkersStatus`, sweep du bridge et repli de sondage sans aucun test.
4. **Fausses assurances ponctuelles** : trois suites « fantômes » vertes à zéro assertion, mocks périmés, un demi-flow d'interruption jamais exécuté (hitcount 0).
5. **Invariants inter-stores morts** (cascades `namedEntities`/`annotationsTemp`) et absence totale de scénarios concurrents dans le DAL.

Aucun outil de mutation testing n'est configuré (§6).

## 2. Architecture et carte des domaines critiques

Application local-first : UI React → hooks `useLiveQuery` → repositories Dexie (couverts) ; commandes → Redux → saga `workers.ts` (540 lignes, partiellement couverte) → plugins (~1 880 lignes, **non couverts**) → services externes (Supabase `cs_jobs` + Realtime via `useJobRealtime.tsx` 283 lignes, LLM/OCR) → persistance des résultats via repositories. Frontières à haut risque : IndexedDB (données utilisateur uniques, pas de serveur de secours), `cs_jobs` (source de vérité des jobs, ack = suppression définitive), parsing des réponses d'API payantes, `localStorage` (clés API — posture assumée en D-011).

## 3. Matrice de couverture

| Domaine / comportement                                | Nominal                                                                         | Cas limites                                                    | Échecs                                                         | Intégration / concurrence                                    | Évaluation                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------- |
| Repositories IndexedDB + liveQuery                    | Covered                                                                         | Covered                                                        | Covered (rollback tx ajout)                                    | **Missing** (aucune écriture concurrente testée)             | **Bon** — zone de référence   |
| Loi de statut worker/tâche                            | Covered (table tâches 6×13 exhaustive)                                          | Partiel — matrice refus **worker** incomplète, prédicats morts | Covered                                                        | Partiel (collant `UNFINISHED` non verrouillé niveau repo)    | Bon, trous ciblés             |
| Saga workers (flows)                                  | Covered (start S1/S2, file, timeout 60 s simulé)                                | Partiel (timeout dont la ligne a été créée ; CWE→COMPLETED)    | Partiel (livraison terminale ❌)                               | Partiel (courses de pause ✅ ; stop différé, double post ❌) | **Partiel** — lot 3/Q2 ouvert |
| Plugins workers réels (run/processResult/post/export) | **Missing** (~1 900 l. ; seul `peroocr.exportResult` tourne indirectement)      | Missing                                                        | Missing (`JobPostError` jamais émis en test)                   | Missing (insert/upload/auth jamais exercés)                  | **Critique — trou n°1**       |
| Pont Supabase `useJobRealtime`                        | Partiel (63 %, un seul fichier le fait tourner)                                 | Partiel                                                        | Missing (échec persistance ⇒ pas d'ack ; erreur processResult) | Missing (sondage 20 s, chunking, `withWorkerLock` en course) | **Faible**                    |
| Boot / reprise post-crash                             | **Missing** (`initWorkersStatus` : 0 référence en test)                         | Missing (redémarrages répétés)                                 | Missing (sweep, isolation par worker)                          | Missing (ordonnancement boot vs abonnement)                  | **Faible**                    |
| Import manifests / gallica / ZIP collections          | Covered                                                                         | Covered                                                        | Partiel (réimport = succès trompeur caractérisé)               | Partiel (fetch stubbé, pas de vrai Gallica)                  | Bon                           |
| Annotations UI (dessin, resize, DnD galerie)          | Partiel (hooks ✅ ; geste UI ❌, drop jamais effectué même en E2E)              | Partiel                                                        | Partiel                                                        | **Missing** (aucun composant `collectionInspector/` testé)   | **Moyen-faible**              |
| Collections/CSV/ZIP/XLSX export                       | Partiel (ZIP collections ✅ hook + E2E ; résultats données ❌, `excel.utils` 0) | Partiel                                                        | Partiel                                                        | Partiel                                                      | Moyen                         |
| Backup/restore DB (S-08)                              | Covered (hook, frontière mockée)                                                | Partiel (stores riches non vérifiés au round-trip)             | Caractérisé (absence de validation de schéma)                  | Missing (reload réel post-import, E2E)                       | Moyen                         |
| Pages / navigation                                    | Partiel (8/15 testées ; `App.tsx` jamais rendu)                                 | Partiel (`AsyncState` ✅)                                      | Partiel                                                        | Partiel (features storage/projects/modifiers inaccessibles)  | Moyen                         |
| Modifier chains                                       | Covered (modèle + E2E clavier)                                                  | Covered                                                        | Partiel                                                        | Partiel (`ModifierChainFlow` 365 l. sans test direct)        | Bon-moyen                     |

## 4. Constats

### 4.1 Défauts d'implémentation confirmés

**TA-001 — Un job `completed` dont le `processResult` échoue est quand même acquitté (ligne `cs_jobs` supprimée)** · HIGH · Confirmed (code ; hitcount 0 sur les branches d'erreur).
Preuve : `src/hooks/useJobRealtime.tsx:161-181` (exception ou `RESULT_ERR` → statut CWE) puis `:196-204` — `isTaskTerminal(CWE)` → `acknowledgeJob`. Le plan Q2 (Lot 2.4) exige le contraire. Impact : le résultat d'un job OCR/LLM payant et réussi côté serveur devient inatteignable (la seule référence était la ligne) ; récupération = re-run complet du job, fichier uploadé orphelin. Scénario de test manquant : livrer un job `completed` dont le plugin lève → la ligne doit survivre et rester rejouable.

**TA-002 — Garde anti double-livraison morte : `deletedJobIds` est consulté, jamais alimenté** · HIGH · Confirmed (code) pour la garde, Potential pour la course.
Preuve : `src/hooks/useJobRealtime.tsx:74` (créé) vs `:116` (consulté) ; aucun `.add()` dans le fichier. La protection repose alors uniquement sur `task.status === COMPLETED` ; une tâche `COMPLETED_WITH_ERRORS` re-livrée rejoue `processResult`, et `layoutExtraction.ts:174` / `customWorker.ts:194` font `annotationRepository.deleteByScope` **avant** `addAll` → les annotations manuelles ajoutées entre-temps sont effacées. Scénario manquant : deux livraisons sérielles de la même tâche CWE, assertion sur l'état final de la base.

**TA-003 — Relaunch/boot : les jobs terminaux trouvés au lookup ne sont jamais livrés** · HIGH · Confirmed.
Preuve : `src/state/sagas/workers.ts:255-263` (branche `completed`/`failed` : `continue` sans événement) ; `workers.recovery.test.ts:71` (tâche figée `POSTING`) et les deux `it.todo` `:250-253`. En cascade : une tâche repartie `POSTING` n'est jamais `isTaskJobTracked` → exclue du rattrapage du bridge → worker gelé `INPROGRESS*` et ligne serveur jamais supprimée. Écart frontal avec [statuts.md](./statuts.md) (relaunch étape 3, flow crash étape 2). Déjà planifié (lot 3 de Q2) — à clore.

**TA-004 — `stopWorkerProcessRequest` inerte après la fin de la boucle de posts (« fuite R2 »)** · HIGH · Confirmed, verrouillé TEL QUEL par `interruption.characterization.test.tsx:245`.
Le stop n'est écouté que dans la course `forkStartWorker` (`workers.ts:194-199`). Un worker en phase d'écoute seule ne peut pas être interrompu : il reste `INPROGRESS` sans suivi, contrairement à statuts.md (interruption, étapes 1-4). Le correctif d'attente du stop-listener est le chantier R2.

**TA-005 — `resumeJob` écrit `pending` par `id` seul** · MEDIUM · Confirmed (code).
`workers.ts:76-90`, asymétrique avec la pause corrigée en écriture conditionnelle (`:102-109`, verrouillée par les tests de caractérisation). Un aboutissement serveur concurrent pendant le flip relaunch peut être écrasé. Scénario manquant : miroir du test « does not overwrite a job taken and completed concurrently » côté resume.

**TA-006 — Ack par couple `(worker_id, task_id)` au lieu de l'identifiant de ligne** · MEDIUM · Potential.
`useJobRealtime.tsx:95-100`. Si des doublons serveur existent (unicité non garantie, statuts.md invariant 6), supprimer le couple peut détruire une ligne jamais livrée. Le seul test qui passe (`interruption.characterization.test.tsx:374`) verrouille le comportement avec une ligne unique.

**TA-007 — L'interruption d'un worker synchrone fait quand même un appel `cs_jobs`** · MEDIUM · Likely.
`workers.ts:465` appelle `pauseWorkerJobs` sans conditionner à la stratégie ; viole « la stratégie 1 ne laisse aucune trace serveur » (statuts.md l.11/95). Aucun test n'interrompt un worker synchrone (tous les scénarios utilisent le plugin `job`).

**TA-008 — Cascade `annotations → namedEntities` morte** · MEDIUM · Confirmed (code).
`namedEntities.deleteByAnnotationIds` n'est appelée par aucun code de production (vérifié par grep : seuls la définition et le type). `annotations.deleteByIds/deleteByScope` et `collections.deleteById` (`collections.ts:294-323`) laissent des entités orphelines (index multivalué `*annotationIds`). C'est d'abord un trou de **code** : un test d'invariant échouerait aujourd'hui.

**TA-009 — `annotationsTemp` non cascade à la suppression d'une collection** · MEDIUM · Confirmed (code).
`collections.ts:294-323` ne touche pas `db.annotationsTemp` ; `collections.test.ts:310-374` vérifie workers/results/annotations mais ignore le store temp.

**TA-010 — Read-modify-write non transactionnel sur `collectionContents`** · MEDIUM · Likely (code).
`shiftCollectionElements` (`collections.ts:247,273`) et `deleteElement` (`:340-363`) lisent puis écrivent hors transaction. Aucun test concurrent nulle part dans le DAL (0 `Promise.all` dans les suites données). Perte de mise à jour sur double onglet ou double geste rapide.

**TA-011 — `addAll` multi-canvas calcule l'ordre sur `annotations[0]` pour tout le batch** · MEDIUM · Confirmed (TODO reconnu `annotations.ts:109,122-127`).
Tous les tests passent des lots homogènes ; l'ordre peut être dupliqué ou faux pour tout batch mixte (imports, duplications). Aucune caractérisation ne documente le comportement.

**TA-012 — IIFE de cleanup jamais invoquée dans `useAnnotationModifierActions.tsx:43`** · MEDIUM · Confirmed (`await … deleteByCollection(…) });` sans `()` d'invocation).
Le ménage des doublons TEMP au montage n'a jamais lieu (seulement au changement de scope et au démontage), aggravé par un `useEffect` à deps `[]` qui fige la `collectionId` initiale. Consigné « défaut confirmé » dans la roadmap Q11 ; correctif non livré.

### 4.2 Trous de couverture

**TA-013 — Les plugins workers réels ne sont exécutés par aucun test** · HIGH · Confirmed.
`workers.test.ts:28` et `workers.recovery.test.ts:22` mockent le registre (`workerPlugins: {}`) ; l'analyse d'atteinte montre que `mistral.ts` (315 l.), `mistralOcr.ts` (332 l.), `openai.ts` (311 l.), `openai/OpenAICompatibleClient.ts` (526 l.), `layoutExtraction.ts` (213 l.), `customWorker.ts` (233 l.), `excel.utils.ts` (177 l.) et `supabase/utils.ts` (73 l.) sont chargés au module mais que leurs `run()`/`processResult()`/post (upload + insert) ne tournent jamais — seul `peroocr.exportResult()` est exercé indirectement (`useWorkers.test.tsx`). Le `JobPostError` « insert sans ligne retournée » (`layoutExtraction.ts:94-99`), le parsing ALTO Mistral et la génération XLSX sont inertes.

**TA-014 — Boot/reprise post-crash : aucun test** · HIGH · Confirmed.
`initWorkersStatus` (`workers.ts:505-520`) n'est référencé par aucune suite ; le corps de `fetchJobUpdates` (`useJobRealtime.tsx:214-232`) n'est jamais exécuté (le seul test qui monte le hook neutralise `getWorkersWithTrackedJobs`) ; branche sweep (`:138-141`) et callback du `setInterval` 20 s jamais déclenchés. L'ordonnancement « réécriture `UNFINISHED*` **avant** tout rattrapage realtime » n'est vérifié nulle part.

**TA-015 — La moitié locale de l'interruption n'est prouvée par rien** · HIGH · Confirmed (hitcount v8).
`workers.ts:488` (application du mapping `JOB_PAUSED` → tâche `POSTED` en local) a un hitcount 0 dans toute la suite. Le seul test proche (`interruption.characterization.test.tsx:173`) n'assertionne que le serveur ; son `saga.cancel()` + `testDb.close()` avortent la transaction locale et font apparaître, non asserté, un `Unable to persist interruption… DatabaseClosedError` dans les logs.

**TA-016 — `useCollections` sans suite propre** · HIGH · Likely.
23 % de lignes (roadmap Q11) ; mocké par tous les tests de composants avec des surfaces partielles qui driflent (§5.4). C'est le hook central des flows « créer / dupliquer / supprimer collection, retirer une page » (usecase 2).
_Statut 2026-11-19 : clos — suite `src/hooks/data/collections/__tests__/useCollections.test.tsx` livrée par les lots 39–40 du suivi Q11 ([roadmap](./roadmap.md), « Suivi post-audit Q12 ») (26 tests sur le vrai stack ; hook à 98,83 % de lignes mesurés au lot 43 de clôture)._

**TA-017 — UI métier : trous structurants** · MEDIUM · Confirmed.
Aucun des huit composants `features/collectionInspector/` n'a de suite ; le drag-drop galerie n'est testé **jusqu'au drop** à aucun niveau (l'E2E `gallery-selection.spec.ts:56-61` annule par Escape) ; l'édition de régions (resize/déplacement/`removeAnnotationsInside`) n'est testée ni en UI ni en E2E ; `ModelViewer` (322 l.) et `WorkerTable` (152 l.) sont mockés partout ; `App.tsx` et sept pages (Storage, IIIFSources, Project, ModifierChainManager, Expert, Home, `main.tsx`) ne sont jamais rendus.

**TA-018 — Migrations Dexie incomplètes** · MEDIUM · Confirmed.
v30→v31 (tri par `position` puis suppression du champ, `db.ts:104-115`) jamais exercée alors que le harnais `createVersion31Database` est transposable ; quatre branches de v31→v32 non couvertes (rejet `'all'`, `'unfinished_with_errors'`, queues vides `waiting/posting`, statut worker valide persisté).

**TA-019 — Table des transitions worker et prédicats de la loi non exhaustifs** · MEDIUM · Confirmed.
Manquent les refus `REQUEUE` sur `INPROGRESS`/`COMPLETED*`, `INTERRUPT` sur `UNFINISHED*`/`COMPLETED*` et le statut collant via `updateTaskStatus` **niveau repository** ; les prédicats `hasWorkerErrors`/`canRecoverWorker`/`isTaskJobTracked`/`isTaskPendingOrRunning`… (`workerStatusLaw.ts:75-107`) ne sont appelés par aucun test — une inversion `||`/`&&` survivrait alors qu'ils pilotent UI et sagas.

**TA-020 — E2E : le flow signature du produit absent** · MEDIUM · Confirmed.
Zéro occurrence worker/OCR dans `e2e/` ; fixture à un seul canvas ; reload post-restauration de backup jamais observé ; export des **résultats** (CSV/JSON/XLSX, usecase 12) non testé à aucun niveau. Les parcours couverts (manifest→collection, annotation persistée après reload, export ZIP) sont eux de très bonne qualité.

**TA-021 — Export/import Dexie : vérifications partielles** · MEDIUM · Confirmed.
Round-trip réel mais spot-check limité à deux stores (`database.test.ts:14-91`) ; blobs structurés et `results` (`++id`, voie d'import distincte) non vérifiés ; rejet d'un import malformé avec base inchangée absent niveau DAL (S-08 caractérisé seulement via hook mocké).

**TA-022 — Gouvernance : les E2E ne protègent pas le déploiement** · MEDIUM · Confirmed.
`ci.yml:72` : job E2E `if: pull_request` uniquement ; `deploy.yml` appelle `ci.yml` en `workflow_call`, où l'E2E est sauté. Un push direct sur `develop` déploie sans E2E, et le verrouillage à la fusion dépend d'une protection de branche hors dépôt, non vérifiée (Q3).

### 4.3 Ambiguïtés de spécification (à trancher avant d'écrire les tests concernés)

**TA-023** — Trois textes se contredisent sur les terminaux d'un worker gelé : statuts.md (« plus aucun suivi »), le plan interruption-reprise (canal partagé acceptable si les événements sont ignorés « y compris terminaux »), et le test `interruption.characterization.test.tsx:343` qui verrouille le comportement inverse (« still delivers terminal updates »). Tant que TA-003 n'est pas livré, ce comportement est le seul rattrapage existant pour les tâches `POSTED`.

**TA-024** — `JOB_DELIVERED` accepté depuis `WAITING`/`POSTING` par la loi (`workerStatusLaw.ts:159-163`) alors que le tableau de statuts.md ne liste que `POSTED`/`INPROGRESS`. Le test verrouille le code, pas le document.

**TA-025** — Reprise prudente (plan Q2 Lot 3 : pas de re-post sans preuve de non-post) versus relaunch « régime unique » (statuts.md l.117 : ré-exécuter toute tâche non-`COMPLETED` si lookup vide). Les tests actuels suivent statuts.md ; les deux critères de clôture sont contradictoires.

## 5. Problèmes de qualité des tests existants

1. **Suites fantômes vertes (le plus trompeur)** — `CanvasGallery.test.tsx:34-48`, `CanvasViewer.test.tsx:4-18` (deux `it` au corps intégralement commenté), `ManifestDetails.test.tsx` (`it.todo` seul) : comptées comme réussies, verrouillant zéro comportement. La galerie virtualisée et le visualiseur OSD n'ont aucun test de rendu côté composant.
2. **Mocks périmés** — `ManifestExplorerPage.test.tsx:11` mocke `@/hooks/data/manifests/useManifests`, chemin inexistant ; `:12-16` expose une surface `loadManifest` que `useConvertedFileIO` n'a plus (le hook ne retourne que `requestPermission`) et que la page n'importe plus.
3. **Assertion tautologique + harnais sensible** — `collections.live.test.ts:56-59` : le prédicat d'attente est déjà vrai avant la mutation ; le mécanisme `observe` de `liveQueryTestUtils` peut laisser passer un prédicat sur une valeur périmée déjà vraie.
4. **Sur-mockage drifant** — les suites de composants mockent `useCollections` avec des surfaces partielles (`CollectionInspectorPage.test.tsx:16-22` sans `getCanvasById`/`hasNextCanvas` que le hook et la page utilisent).
5. **Couplage à l'implémentation** — `liveLoading.test.tsx:27,42` assertent l'arité des appels `useLiveQuery` ; casse sur un réordonnancement innocent du hook.
6. **Hygiène des harnais saga** — faux `cs_jobs` : `.in()` exécute la requête (tout `.eq()` chaîné après est silencieusement ignoré, `fakeJobs.ts:36-39`) ; `calls` ne compte que des noms de table ; faux timers installés dans le callback `run` du plugin (`workers.test.ts:444`) ; `saga.cancel()` en fin de test masque le travail asynchrone pendable (TA-015).
7. **Partage d'état inter-tests** — `src/__tests__/utils.tsx:17-20,36` : `QueryClient` partagé au niveau module ; `userEvent.setup()` au scope module (`ConfigurationPage.test.tsx:9`, `CollectionsManagerPage.test.tsx:14`) ; `renderWithProviders` monte le routeur sous les providers de dialogue, contrairement à `App.tsx` (consigné roadmap Q11, non corrigé) ; fragilité d'ordre connue du `harness.test.tsx` sous `--sequence.shuffle`.
8. **Fragilité E2E structurelle** — géométrie du rectangle dessinée par calcul (`journeys.ts:157-194` : boundingBox ± offsets, pari sur zoom 0,5 + image 1024×768 + viewport figé), avec `retries: 2` en CI qui masquerait un flake récurrent ; couleurs littérales dans `gallery-selection.spec.ts:31-54` face aux palettes livrées par D-013.
9. **Smoke tests à un cas** — `CollectionMetadataForm.test.tsx` (438 lignes de composant, un seul `it`), `CollectionInspectorPage.test.tsx` (un `it`), `edwinMagic`/`peroConverter` (un `toStrictEqual` chacun), une douzaine de fichiers mono-`it`.
10. **Catalogue « TEL QUEL »** — six comportements cassés verrouillés par tests mais bien documentés dans la roadmap Q11 : réimport trompeur et branche `ConstraintError` morte (`useCollectionImporter.test.tsx:653-698`), écritures partielles ZIP non isolées (`:883-923`), `done` posé avant les dernières écritures (`usePdfConverter.test.tsx:88-104`), entités LLM calculées puis jetées (`useNamedEntities.test.tsx:433-478`), fuite TEMP (TA-012), import sans validation de schéma (S-08, `useDbBackup.test.tsx:412-447`). Le risque est l'oubli : à basculer au backlog produit avec les tests appelés à changer.
11. **Constat documentaire clos par l'audit** — S-10 du registre de sécurité était obsolète : le nettoyage legacy est actif (`sources.ts:383-385`, dé-commenté en `dc1088e5`) et verrouillé par `sources.test.ts:339-394` ; le registre a été mis à jour le 2026-11-19.

## 6. Mutation testing

Aucun outil configuré. Recommandation : StrykerJS avec `@stryker-mutator/vitest-runner`, périmètre pilote `src/data/**` + `src/utils/functionResult.ts` (suite DAL dense en assertions d'état, harnais isolés, exécution rapide). Cibles à haut signal identifiées par inspection, où une mutation de comparaison ou de booléen survivrait probablement : prédicats de `workerStatusLaw.ts:75-107` (TA-019), bornes de `shiftCollectionElements` (`collections.ts:254-267`), `containsAtLeast2Corners`/`getSurface` (`data/utils/annotations.ts:32-53`), `isScopeKeyOrDescendant` (`repositories/indexeddb/workers.ts:20-27`), comparaisons d'ordre de `deleteByIds` (`annotations.ts:232-249`). Inutile sur les plugins tant que TA-013 n'est pas couvert.

## 7. Plan d'amélioration priorisé

### Immédiat (risques HIGH et fausses assurances)

| #   | Action                                                                                                                                                                                                    | Constats | Scope        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ |
| 1   | Corriger + tester : ne pas acquitter une ligne `cs_jobs` quand `processResult` échoue                                                                                                                     | TA-001   | Small        |
| 2   | Réalimenter la garde de double livraison (ou re-check de la tâche en base sous `withWorkerLock`) + test de deux livraisons sérielles                                                                      | TA-002   | Small        |
| 3   | Livrer la reprise des terminaux au relaunch/boot avec ack (clore les deux `it.todo` ; frontière saga/bridge à établir d'abord)                                                                            | TA-003   | Medium       |
| 4   | Suite par plugin : contrat `run`/`processResult`/post contre un faux fidèle de `fetch`/Supabase (auth, upload, insert, réponse ambigüe, mapping d'erreurs, parsing ALTO/XLSX), découpée en lots façon Q11 | TA-013   | Large        |
| 5   | Supprimer/réécrire les trois suites fantômes ; retirer les deux mocks périmés                                                                                                                             | §5.1-2   | Small        |
| 6   | Suite `useCollections` sur le vrai stack (harnais Q11 existant) — close 2026-11-19 par les lots 39–40 du suivi Q11 (roadmap, « Suivi post-audit Q12 »)                                                    | TA-016   | Medium       |
| 7   | Réécrire le test d'interruption pour attendre la fin de la transaction locale et assertionner le `POSTED` local                                                                                           | TA-015   | Small-Medium |

### Ensuite

| #   | Action                                                                                                                                                                 | Constats       | Scope                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------- |
| 8   | Tests `initWorkersStatus` (réécriture, isolation par worker, ordonnancement avant rattrapage)                                                                          | TA-014         | Small-Medium          |
| 9   | Exercer `fetchJobUpdates`, repli sondage 20 s (timers simulés), sweep, échec de persistance ⇒ pas d'ack                                                                | TA-014, TA-001 | Medium                |
| 10  | Arrêt effectif après la boucle de posts + interruption d'un worker synchrone sans appel `cs_jobs`                                                                      | TA-004, TA-007 | Medium                |
| 11  | Écritures concurrentes DAL (`Promise.all` sur `collectionContents`, delete contre write avec rollback de la transaction `deleteById`)                                  | TA-010         | Medium                |
| 12  | Trancher puis implanter les cascades (`namedEntities`, `annotationsTemp`) et les verrouiller                                                                           | TA-008, TA-009 | Medium (code d'abord) |
| 13  | Migration v30→v31 + branches v31→v32 manquantes ; table worker 6×2 exhaustive + collant niveau repo + prédicats                                                        | TA-018, TA-019 | Small-Medium          |
| 14  | E2E : parcours worker avec plugin `synchronous` local (UI→saga→résultat visible→export, sans Supabase) ; fixture 2-3 canvas + drop clavier ; export résultats CSV/JSON | TA-020         | Medium                |
| 15  | `resumeJob` en écriture conditionnelle + ack par `id` de ligne (avec la décision invariant 6)                                                                          | TA-005, TA-006 | Medium                |
| 16  | UI : test de geste région (draw→update→resize→`removeAnnotationsInside`) et du drop dnd-kit ; caractérisation `addAll` multi-canvas                                    | TA-017, TA-011 | Medium                |
| 17  | Exécuter les E2E au moins sur `workflow_call` (ou garantir la protection de branche)                                                                                   | TA-022         | Small                 |

### Plus tard

18. Pilote Stryker (`src/data/**` puis sagas) — Medium.
19. Élargir le round-trip backup aux stores riches + import malformé niveau DAL (avec la décision S-08) — Medium.
20. Rendre les pages muettes et dé-mocker `ModelViewer`/`WorkerTable` ; corrections de harnais partagées (`QueryClient` par test, ordre du routeur, `userEvent` par test, vidange dans le harnais) — Medium-Large. Volet harnais partagé clos 2026-11-19 par le lot 41 du suivi Q11 (roadmap, « Suivi post-audit Q12 ») : `QueryClient` par test, ordre du routeur, vidange dans le harnais ; le reste — pages muettes, dé-mockage `ModelViewer`/`WorkerTable`, `userEvent` par test — reste ouvert.
21. Harmonisation inter-hooks (canaux d'erreur traduits versus bruts, comparaisons sensibles à la casse, `updatedAt`, `hasResult`) — chantier produit, pas de tests — Medium.
22. Nettoyage code mort (`data/models/converters/suryaSchema.ts` orphelin, `components/ui/dialog.tsx` sans consommateur) et résidus `console.log` de production (famille S-09, dont `CollectionInspectorGallery.tsx:28`) — Small.

## 8. Questions ouvertes (décisions produit/domaine requises avant tests)

1. Les cascades inter-stores (`namedEntities`, `annotationsTemp`) appartiennent-elles à la couche repository ou aux flux (hook/saga) ? (TA-008, TA-009)
2. `JOB_DELIVERED` doit-il être accepté depuis `WAITING`/`POSTING` ? (TA-024)
3. Relaunch sans preuve de non-post : régime unique (statuts.md) ou reprise prudente (plan Q2) ? (TA-025 — bloque les tests du plan interruption-reprise Lot 1.1)
4. Les terminaux en realtime d'un worker `UNFINISHED` sont-ils livrés ou ignorés ? (TA-023 — dépendance de TA-003)
5. Quand plusieurs `results` partagent scope + workerName, que doit renvoyer `getByScopeAndWorkerName` (le `.first()` arbitraire dont dépend `data/utils/export.ts`) ?
6. `collections.update` ne rafraîchit jamais `updatedAt` : voulu ?
7. `workers.live.hasResult` : présence de workers nommés ou de résultats ? (nom et test divergent, `liveQuery/workers.live.ts:12-21`)
8. La protection de branche GitHub rend-elle le job E2E bloquant à la fusion ? (réglage hors dépôt — TA-022)

## 9. Méthodologie et limites

- Suite Vitest exécutée deux fois (run complet puis run de couverture) : 1 359 tests passés, 3 todo, 1 fichier ignoré, 0 échec. Lors d'un premier run en charge CPU concurrente, trois lancements de workers pool ont expiré ; les trois fichiers passent isolément (27 tests verts) — problème environnemental, pas de suite.
- Hitcounts v8 ciblés obtenus par les investigations en sous-suite pour TA-001, TA-005 et TA-015 ; le reste repose sur la lecture croisée code↔tests et le graphe d'imports (les imports `import type` seuls ne comptent pas comme exécution ; les arêtes neutralisées par `vi.mock` sont coupées, y compris les mocks globaux de `vitest.setup.ts`).
- E2E non exécutés pendant l'audit ; analyse statique des specs + chiffres de la campagne Q9 (14/14 verts sur 10 runs, 2026-10-13).
- Les constats « Confirmed » reposent sur le code ou une exécution ; les scénarios de course non reproduits sont marqués Likely/Potential et nécessitent un test de reproduction avant toute correction.
