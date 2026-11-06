# Plan — interruption et reprise des workers

## Objectif et décisions confirmées

Fiabiliser le comportement décrit dans [statuts.md](./statuts.md), sans remplacer la loi de statut ni entreprendre l'extraction du moteur de file R2. Le plan couvre les stratégies synchrone et job, en particulier la coordination avec Supabase.

- **Interruption manuelle** : arrêter l'envoi et le suivi côté client, conserver l'état local et passer le worker en `UNFINISHED*`. Pour ce worker uniquement, demander le passage des jobs `pending` et `processing` à `paused` ; ne pas modifier les jobs terminaux. Un traitement déjà commencé côté serveur peut continuer et se terminer.
- **Fermeture ou crash** : aucune pause serveur n'est garantie. Au démarrage, les workers précédemment `INPROGRESS*` deviennent `UNFINISHED*` ; aucun worker ni job `paused` n'est automatiquement relancé.
- **Récupération au démarrage** : récupérer les jobs `completed` et `failed` de tous les workers concernés, y compris les workers interrompus, persister leurs résultats et statuts, puis acquitter les jobs. Un worker `UNFINISHED*` le reste même si toutes ses tâches sont terminales. Cette récupération ponctuelle n'est pas une reprise du suivi des jobs non terminaux.
- **Reprise manuelle** : pour le worker demandé uniquement, passer les jobs encore `paused` à `pending`, réconcilier tous les jobs existants et reprendre le suivi. Conserver les tâches réussies ; rejouer les tâches en échec ou interrompues seulement après vérification de l'absence de job correspondant. Si tout est déjà terminé, clôturer le worker sans lancer de nouveau travail.
- **Stratégie synchrone** : pas de job `cs_jobs` à pauser. L'arrêt de la saga ne garantit pas l'annulation d'une requête déjà envoyée ni de ses effets ; une tâche non réussie sera rejouée à la reprise.

La récupération des terminaux au démarrage et à la reprise est une exception ponctuelle à l'arrêt du suivi. Entre ces opérations, un worker interrompu ne doit pas recevoir de mises à jour Realtime ou de rattrapage périodique, y compris terminales. Un canal partagé peut rester ouvert pour les autres workers si les événements du worker interrompu sont effectivement ignorés.

## État initial et risques à vérifier

- `src/state/sagas/workers.ts` ne traite `stopWorkerProcessRequest` que dans la course associée à `startWorker`. Après la fin de la boucle d'envoi, un worker job peut rester actif côté serveur sans écouteur d'arrêt correspondant. La pause est actuellement appelée aussi pour la stratégie synchrone.
- `pauseWorkerJobs` lit puis met à jour chaque ligne par identifiant, sans condition sur le statut au moment de l'écriture ; `resumeJob` fait de même. Une fin de traitement concurrente pourrait être écrasée. Un post déjà engagé peut aussi aboutir après le balayage de pause.
- `src/hooks/useJobRealtime.tsx` utilise un canal global ; il accepte les terminaux des workers `UNFINISHED*` et le rattrapage dépend de `getWorkersWithTrackedJobs()`, qui ne sélectionne que certaines tâches. Cela ne garantit ni l'arrêt du suivi ni la récupération au démarrage de tous les terminaux, notamment pour `POSTING` ou une tâche déjà terminale.
- `initWorkersStatus` et le montage du hook ne sont pas explicitement ordonnés. Il faut éviter qu'un événement ou un rattrapage traite un worker avant sa mise en `UNFINISHED*` au démarrage.
- La suppression serveur suit l'écriture locale du statut, mais les plugins peuvent aussi produire des annotations ou d'autres effets dans `processResult`. Une interruption entre ces écritures et l'acquittement peut entraîner un retraitement : vérifier l'idempotence réelle, pas seulement le statut de tâche.
- Le code serveur du consommateur de `cs_jobs`, ses contraintes d'unicité et ses règles RLS ne sont pas établis par le code client. Le passage de `processing` à `paused` puis à `pending` ne prouve pas qu'un traitement en cours s'arrête ni qu'une seconde exécution ne démarre pas.

## Plan de réalisation

### Lot 0 — Contrat serveur et scénarios reproductibles

1. Identifier les plugins de stratégie `job`, les écritures et lectures `cs_jobs`, le mécanisme serveur de prise et de fin de job, les droits RLS et les contraintes effectives sur `(worker_id, task_id)`. Vérifier notamment si le serveur peut terminer un job devenu `paused` et s'il peut le reprendre alors qu'une exécution précédente continue.
2. Définir avec le propriétaire du serveur une stratégie testable pour les courses pause/fin, reprise/fin et post tardif : transitions conditionnelles atomiques, prise exclusive ou autre mécanisme compatible avec le serveur. Une simple lecture suivie d'une écriture par `id` ne suffit pas.
3. Vérifier comment empêcher les doubles créations lors d'un post dont la réponse est perdue ou arrive après l'interruption : unicité atomique côté serveur et gestion du conflit, ou protocole équivalent. Un lookup préalable seul ne garantit pas l'absence de doublons.
4. Construire un harnais partagé ou réutiliser celui de [plan-tests-workers-saga.md](./plan-tests-workers-saga.md) : vraie base Dexie avec `fake-indexeddb`, faux Supabase contrôlable, plugins déterministes et horloge simulée. Prévoir des barrières explicites pour imposer les courses sans délais réels.

**Sortie :** contrat de coordination et droits vérifiés, limites externes documentées, tests de caractérisation reproductibles. Si le serveur ou son schéma ne sont pas accessibles, signaler le blocage : ne pas annoncer l'absence de doublons ou la pause effective comme garanties.

### Lot 1 — Interruption fiable

1. Faire traiter la commande d'arrêt par identifiant pour tout worker `INPROGRESS*`, y compris après l'envoi de tous ses jobs. Ne pas dépendre exclusivement de la durée de vie de la boucle d'envoi ; arrêter et nettoyer les tâches et attentes locales concernées sans affecter les autres workers.
2. Persister `UNFINISHED*` et empêcher de nouvelles mises à jour de suivi, y compris celles déjà en file ou issues d'un snapshot périmé. Pour la stratégie synchrone, ne faire aucun appel à `cs_jobs`.
3. Pour la stratégie job, appliquer la pause serveur selon le contrat du lot 0, limitée au worker et conditionnée aux statuts non terminaux. Réconcilier les lignes effectivement modifiées sans écraser un statut terminal apparu entre-temps. Traiter le cas d'un post en cours et d'une création tardive selon le protocole retenu.
4. En cas d'échec réseau, RLS ou persistance, conserver l'état local disponible, signaler l'échec à l'utilisateur et prévoir une réconciliation ou une nouvelle tentative sûre ; ne pas présenter une pause distante non confirmée comme réussie.

**Tests :** arrêt pendant un traitement synchrone et pendant un post, arrêt après tous les posts, jobs de plusieurs workers, événements déjà en vol, job terminé pendant la pause, post tardif, échec partiel et commandes répétées. Vérifier l'absence d'attente ou de suivi orphelin et de tout appel Supabase pour l'arrêt synchrone.

### Lot 2 — Récupération des terminaux au démarrage

1. Ordonner explicitement l'initialisation : persister d'abord l'interruption des workers actifs après fermeture, puis lancer un balayage ponctuel des jobs terminaux pour les workers locaux concernés, indépendamment de leur statut de tâche. Ne pas réactiver les jobs non terminaux ni déclencher la reprise.
2. Réutiliser un chemin de livraison commun pour `completed` et `failed` : vérifier l'identité worker/tâche, appliquer le résultat et le statut local, puis acquitter uniquement après persistance réussie. Balayer aussi les terminaux déjà persistés mais non supprimés.
3. Rendre la livraison et le nettoyage rejouables après interruption à chaque étape ; vérifier les effets réels des plugins, notamment annotations et résultats. Ne pas supprimer la ligne serveur si la persistance ou le traitement du résultat échoue. Isoler les erreurs par job et permettre une nouvelle tentative.
4. Garder les workers `UNFINISHED*` gelés après le balayage ; filtrer les événements Realtime et les rattrapages périodiques selon l'état courant, y compris après une course avec l'arrêt.

**Tests :** démarrage avec workers actifs et interrompus, tâches `POSTING`, suivies et déjà terminales ; jobs `completed`, `failed`, `paused` et `processing` ; persistance et acquittement interrompus, erreur d'un job parmi plusieurs, plusieurs redémarrages et événements concurrents. Vérifier l'absence de doublon d'effets et l'absence de relance ou de suivi continu des workers interrompus.

### Lot 3 — Reprise et réconciliation

1. À la demande explicite, charger l'état local actuel et refuser les workers absents ou non récupérables. Réconcilier les jobs du worker, y compris les terminaux non encore livrés, avant de décider quelles tâches rejouer ou de clore le worker.
2. Appliquer `paused` → `pending` uniquement aux lignes encore `paused` du worker, par transition conditionnelle selon le contrat serveur ; relire et traiter la vérité serveur si la ligne a changé entre-temps. Ne pas modifier les autres workers ni les jobs `completed`/`failed`.
3. Reprendre le suivi des jobs existants sans les republier ; ne rejouer une tâche non réussie qu'après lookup fiable et avec la protection contre les doublons définie au lot 0. Une tâche déjà `COMPLETED` ne doit jamais être relancée.
4. Coordonner les commandes répétées, les événements déjà en vol, les erreurs et une nouvelle interruption pendant la reprise. Si la réconciliation découvre que toutes les tâches sont terminées, clôturer sans soumettre de travail supplémentaire.

**Tests :** tous les statuts serveur, reprise partielle ou répétée, terminal arrivé pendant la reprise, worker entièrement terminé, erreur réseau/RLS, reprise interrompue, post à réponse perdue et absence de double création ou exécution dans les limites du contrat serveur.

### Lot 4 — Validation et documentation

1. Exécuter les suites ciblées de saga, bridge Realtime, loi de statut et repositories ; compléter par un scénario intégré utilisant le serveur de test ou une vérification de contrat avec son propriétaire lorsque disponible.
2. Lancer `npx tsc -b`, `npm run lint:ratchet`, la suite Vitest complète et `git diff --check`. Documenter les éventuelles vérifications serveur non réalisables et leurs conséquences.
3. Mettre à jour [statuts.md](./statuts.md), la [roadmap](./roadmap.md) et, si nécessaire, le plan de tests Q2 pour refléter les garanties effectivement livrées et éviter les lots redondants. Ne pas déclarer une garantie serveur acquise sur la seule base d'un faux client.

**Critère de clôture :** les scénarios ci-dessus passent, les échecs sont visibles et récupérables, les limites serveur sont explicites, et la documentation distingue les comportements vérifiés des engagements encore externes.

## Périmètre et dépendances

- Ce chantier complète le lot 3 du plan Q2 et ajoute la couverture du bridge Realtime et du démarrage, actuellement hors de son périmètre. Réutiliser son harnais plutôt que créer deux suites concurrentes.
- Hors périmètre : annulation garantie d'un calcul déjà lancé, pause dédiée dans l'interface, retry individuel, historique de tentatives, support multi-onglets et extraction complète de `queueEngine` R2.
- Une modification du serveur ou de son schéma peut être indispensable pour les garanties de concurrence et d'unicité. Sa disponibilité et son déploiement sont un prérequis à confirmer, pas une hypothèse déjà satisfaite.
