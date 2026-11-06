# Plan d’action — tests de la saga workers

_Périmètre du chantier Q2 de la [roadmap](./roadmap.md) ; estimation initiale : 4 à 6 jours-personne, hors corrections importantes révélées par les tests._

## Objectif et périmètre

Ajouter une suite de tests ciblés pour `src/state/sagas/workers.ts`, couvrant les flows métier critiques des workers sans tester les détails internes de Redux-Saga ni viser un pourcentage global de couverture.

Le chantier s’appuie sur la loi de statut déjà testée dans `workerStatusLaw.test.ts`, le repository IndexedDB testé sur Dexie réel et `fake-indexeddb`, ainsi que le harnais `createTestDb()` de `src/data/repositories/indexeddb/__tests__/testDb.ts`.

**Hors périmètre de ce plan :** tests des plugins pris individuellement, du hook `useJobRealtime`, de `excel.utils.ts` et de `OpenAICompatibleClient` — ces éléments sont aussi listés comme restant à couvrir dans Q2. L’extraction du moteur headless prévue par R2 et le correctif de fuite du stop-listener sont des chantiers distincts ; les tests doivent porter sur les comportements, pour limiter leur dépendance à la structure actuelle.

## Règles d’exécution des lots

1. Chaque lot ci-dessous démarre dans une **nouvelle session** d’agent, sur la branche de travail dédiée ou la branche qui lui succède explicitement.
2. Au début de la session, relire ce plan, vérifier la branche et l’état Git, puis relire les fichiers source et tests touchés par le lot. La session ne doit pas dépendre d’un contexte conversationnel précédent.
3. Un lot ne commence que si le précédent est commité et que l’arbre de travail est propre. Ne pas mélanger deux lots dans un même commit.
4. À la fin de chaque lot, lancer ses tests ciblés, `npx tsc -b` si le lot touche le typage, puis `git diff --check`. Corriger les échecs introduits par le lot avant de le déclarer terminé.
5. Faire **un commit par lot terminé**, avec le message proposé ci-dessous (ou un message équivalent). Ne pas passer au lot suivant avec du travail non commité.
6. Si un test révèle un défaut préexistant hors du périmètre du lot, le documenter et le remonter plutôt que d’élargir silencieusement le chantier. Le lot reste ouvert tant que son état ne permet pas une suite verte ou qu’une décision explicite n’a pas été prise.

## Lots

### Lot 0 — Harnais d’exécution et frontières de test

**Estimation : 0,5 à 1 jour.**

- Créer une suite dédiée à la saga et vérifier qu’elle peut exécuter les générateurs avec les outils Redux-Saga (`runSaga` ou équivalent déjà disponible), sans tester l’implémentation ligne par ligne.
- Réinitialiser la base Dexie réelle entre les tests avec `createTestDb()` ; utiliser de vrais repositories IndexedDB pour les transitions worker/tâche et la persistance des résultats.
- Isoler les plugins via le registre (réinitialisé entre tests) et fournir des plugins de test déterministes pour les stratégies `synchronous` et `job`.
- Encadrer les appels Supabase utilisés par cette saga (`cs_jobs`) par un faux minimal et contrôlable ; compléter le mock global uniquement sans affecter les autres tests.
- Ajouter une fabrique de fixtures worker/tâche lisibles et des utilitaires de nettoyage des actions/effets capturés.
- Vérifier l’isolation entre tests et l’absence de dépendance à des délais réels.

**Critère de sortie :** un test de fumée exécute la saga dans un environnement isolé et les tests existants restent verts.

**Commit :** `test(workers): add saga test harness`

### Lot 1 — Démarrage et stratégie synchrone

**Estimation : 0,75 à 1 jour.**

- Vérifier le traitement d’un plugin inconnu sans création de worker.
- Couvrir les scopes annotation/canvas (une tâche) et collection (une tâche par canvas, liens `previousTask`) ; vérifier le retour anticipé sur collection vide ou introuvable.
- Couvrir l’exécution séquentielle d’un plugin synchrone et la persistance d’un résultat texte ou d’annotations.
- Vérifier les erreurs plugin, erreur de persistance du résultat et réponse dont l’événement ne correspond pas à la stratégie ; vérifier que la file poursuit son traitement lorsque la loi métier le prévoit.
- Vérifier la mise à jour de la durée estimée et les notifications terminales pertinentes, sans figer les textes traduits inutilement.

**Critère de sortie :** les principaux chemins de création et d’exécution synchrone sont couverts avec le repository réel.

**Commit :** `test(workers): cover synchronous worker flow`

### Lot 2 — Stratégie job et timeout de post

**Estimation : 1 à 1,5 jour.**

- Vérifier la transition de départ `POST`, l’acceptation d’un job et le passage à la tâche suivante sans attendre son résultat distant.
- Couvrir le rejet/échec du plugin de post et les réponses invalides.
- Tester le timeout de 60 secondes avec des timers simulés, sans attendre réellement une minute ; vérifier la transition `POST_TIMEOUT` et le message associé.
- Vérifier qu’une tâche en attente est postée une seule fois dans le flow normal et que les notifications indiquent que les tâches sont postées quand le worker reste en écoute.
- Garder séparés le timeout d’acceptation du post et le statut `processing` : la saga ne doit pas inventer de timeout client pour un job déjà accepté.

**Critère de sortie :** les chemins d’acceptation, d’échec et de timeout sont déterministes et n’utilisent ni délai réel ni appel réseau.

**Commit :** `test(workers): cover job posting and timeout`

### Lot 3 — Reprise, jobs existants et interruption

**Estimation : 1 à 1,5 jour.**

- Vérifier le relaunch d’un worker récupérable et le refus d’un worker absent ou non récupérable.
- Couvrir le lookup d’un job par `(worker_id, task_id)`, notamment les statuts `paused`, `pending`, `processing`, `completed` et `failed` ; s’assurer qu’un job déjà suivi n’est pas republié.
- Vérifier qu’une tâche sans job est re-queue/rejouée conformément à la loi de statut, et qu’une tâche déjà réussie n’est pas retentée.
- Simuler l’arrêt pendant un worker synchrone et pendant un worker job : interruption locale, pause des jobs non terminaux et mise à jour des tâches concernées.
- Tester les erreurs Supabase de lookup/pause et les erreurs pendant la récupération sans perdre l’état local persisté.
- Ajouter un test de non-régression pour l’attente du stop-listener. Si le test confirme la fuite connue de R2, traiter le correctif minimal dans ce lot ou isoler explicitement le point bloquant avant de le clôturer.

**Critère de sortie :** reprise et interruption suivent les scénarios documentés dans `docs/statuts.md`, sans double post ni attente orpheline.

**Commit :** `test(workers): cover recovery and interruption`

### Lot 4 — Démarrage application, erreurs globales et plugins exposés

**Estimation : 0,5 à 0,75 jour.**

- Tester `initWorkersStatus` : seuls les workers restés `INPROGRESS*` deviennent `UNFINISHED*`, avec isolation des erreurs par worker.
- Tester `loadWorkerPluginsInfo` : métadonnées et formats exposés par le registre deviennent l’action `setPlugins` attendue.
- Vérifier la gestion d’une erreur inattendue dans l’exécution du worker et l’interruption best-effort de l’état local.
- Vérifier les watchers `workerSaga` sur les actions start/recover, sans dupliquer les tests déjà faits sur les flows.

**Critère de sortie :** les fonctions publiques/exportées de la saga et ses points d’entrée sont couverts.

**Commit :** `test(workers): cover startup and saga entry points`

### Lot 5 — Audit et clôture de la saga dans Q2

**Estimation : environ 0,5 jour.**

- Relire les cas couverts contre `docs/statuts.md` et ajouter uniquement les cas critiques manquants (pas de tests d’ordre d’effets non contractuel).
- Confirmer l’absence de mocks du repository IndexedDB, de délais artificiels et de fuites de timers/abonnements dans la suite de saga.
- Lancer `npx vitest run <suite ciblée>`, `npx tsc -b`, `npm run lint:ratchet` et `git diff --check` ; lancer la suite Vitest complète avant clôture.
- Mettre à jour la ligne Q2 de `docs/roadmap.md` avec les tests livrés et les limites restantes ; ne pas marquer comme couverts les plugins, le hook realtime ou les clients/utilitaires hors périmètre.

**Critère de sortie :** vérifications vertes, roadmap exacte, suite testable indépendamment et aucun changement non commité.

**Commit :** `test(workers): finalize saga coverage`

## Estimation et risques

Le total planifié est d’environ **4 à 6 jours-personne**. Prévoir une marge supplémentaire si les tests mettent au jour des écarts de comportement dans la saga, les repositories ou les flows Supabase. L’estimation n’inclut pas les autres éléments Q2 explicitement restants (plugins individuels, `useJobRealtime`, `excel.utils.ts`, `OpenAICompatibleClient`) ni l’extraction de `queueEngine` de R2.
