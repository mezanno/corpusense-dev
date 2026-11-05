# Plan d’exécution — tests des repositories IndexedDB (Q2)

_Branche : `plan/q2-repository-tests` · Préparé le 2026-11-05_

## Objectif

Étendre les tests des repositories sur le vrai stack Dexie + `fake-indexeddb`, conformément à D-004 et D-010. Couvrir les contrats métier, les résultats typés et les écritures multi-tables sans simuler la base ni les repositories appelés.

Ce plan porte sur les repositories IndexedDB et leurs adaptateurs réactifs. Il ne couvre pas les tests de la saga worker, de `useJobRealtime`, des plugins, d’Excel ni du client OpenAI, qui restent des sujets Q2 distincts.

## État de départ vérifié

- `createTestDb()` existe dans `src/data/repositories/indexeddb/__tests__/testDb.ts` et réinitialise la base Dexie réelle.
- Vitest : **99 tests réussis, 1 todo, 25 fichiers réussis et 1 ignoré**.
- Le seul test direct de repository IndexedDB est `workers.test.ts` : transitions, migration v31 → v32 et surface de type du repository Worker.
- Une mesure exploratoire du périmètre instrumenté (repositories, saga et plugins) donne **10,76 % pour les repositories IndexedDB**. Ce chiffre n’est ni une mesure globale de l’application ni un seuil CI.
- Les tests de la CI exécutent Vitest sans activer la couverture.

## Périmètre

### Repositories de commandes à couvrir

`annotations`, `annotationsTemp`, `collections`, `database`, `fsHandle`, `models`, `modifierChain`, `namedEntities`, `projects`, `results`, `sources`, `tags` et `workers`.

Les fonctions pass-through de `dbFactory.ts` ne nécessitent pas de tests isolés : les tests doivent exercer les repositories concrets et leur comportement observable.

### Repositories réactifs à couvrir dans une tranche distincte

Les onze modules `liveQuery/` : annotations, annotations temporaires, collections, modèles, chaînes de modificateurs, entités nommées, projets, résultats, sources, tags et workers. Ils utilisent le même IndexedDB réel, mais leurs contrats d’émission et de désabonnement sont différents des commandes CRUD ; les traiter séparément évite de confondre tests de repository et tests de hooks React.

## Règles d’exécution

1. Co-localiser les tests sous `src/data/repositories/indexeddb/__tests__/` (et sous `liveQuery/__tests__/` si cela rend les imports plus clairs), avec des noms `<repository>.test.ts`.
2. Réinitialiser la base avec `createTestDb()` dans `beforeEach`. Utiliser des données minimales, typées et valides selon les modèles existants.
3. Ne pas `vi.mock` Dexie, `db`, `dbFactory` ou les repositories collaborants. Les opérations multi-repositories doivent s’exercer sur la même base de test.
4. N’ajouter un helper de fixture partagé que si plusieurs fichiers répètent réellement la même construction ; éviter un nouveau framework de test.
5. Pour chaque lot, écrire les tests avant tout correctif, constater le rouge, corriger uniquement le contrat concerné, puis lancer les tests ciblés et la suite complète.
6. Ne pas viser un pourcentage global arbitraire : privilégier les contrats publics, les branches d’échec et les invariants de transaction.

## Exécution en sessions séparées et relais

- **Chaque lot, y compris le lot 0, doit être réalisé dans une nouvelle session OpenCode.** Ne pas enchaîner deux lots dans la même session, même si le premier semble terminé rapidement. Toutes les sessions continuent sur la branche `plan/q2-repository-tests`.
- À l’ouverture d’une session, relire ce plan, `docs/roadmap.md` et l’état Git. Ne commencer que le lot indiqué comme prochain dans la section de suivi ci-dessous ; vérifier que son lot précédent est clôturé et documenté.
- **La clôture d’un lot comprend obligatoirement une mise à jour documentaire avant l’ouverture de la session suivante.** Mettre à jour ce plan : statut du lot, fichiers/comportements couverts, décisions prises, commandes et résultats de vérification, problèmes restants et instructions précises pour le lot suivant.
- Mettre aussi à jour `docs/roadmap.md` lorsque les preuves changent l’état ou le bilan de Q2. Si un lot tranche une décision architecturale qui dépasse le plan, consigner la décision dans `docs/DECISIONS.md` et la référencer ici.
- Ne pas marquer un lot terminé ni démarrer le suivant tant que ses tests et vérifications ne sont pas exécutés et que le relais documentaire n’est pas à jour. La session suivante doit pouvoir reprendre à partir des documents et de l’état du dépôt, sans dépendre de l’historique de conversation.

### Suivi des lots et prochain relais

| Lot                                 | État    | Relais vers la session suivante  |
| ----------------------------------- | ------- | -------------------------------- |
| 0 — contrats ambigus et régressions | À faire | À documenter à la clôture du lot |
| 1 — repositories simples            | À faire | À documenter à la clôture du lot |
| 2 — Worker                          | À faire | À documenter à la clôture du lot |
| 3 — annotations                     | À faire | À documenter à la clôture du lot |
| 4 — sources                         | À faire | À documenter à la clôture du lot |
| 5 — collections                     | À faire | À documenter à la clôture du lot |
| 6 — export/import/effacement        | À faire | À documenter à la clôture du lot |
| 7 — `liveQuery`                     | À faire | Clôture finale à documenter      |

## Lots d’exécution

### Lot 0 — Fixer les contrats ambigus et les régressions déjà connues

- **`WorkerRepository.deleteByScope`** : tester les ids réellement supprimés pour un scope collection (y compris les descendants reconnus par `startsWithIgnoreCase`) et un scope exact ; vérifier aussi la suppression des résultats liés. Le code actuel renvoie `[]` après la suppression : le test doit échouer avant le correctif, puis le retour doit correspondre aux ids calculés, conformément à R3.2.
- **`AnnotationRepository.deleteByScopeAndType`** : avant d’écrire le test, résoudre le décalage entre l’interface (paramètre `isTemp` obligatoire) et l’implémentation/appelant (deux paramètres). Le grep actuel n’a trouvé qu’un appelant, avec deux arguments, et les annotations temporaires ont leur propre repository. Recommandation : supprimer le paramètre fantôme de l’interface s’il n’existe pas de sémantique métier à préserver ; tester ensuite les annotations temporaires via leur repository dédié.
- Confirmer que `WorkerRepository.add` reste aligné entre interface et implémentation (`WorkerCreateDTO → Promise<Worker>`), sans créer un test redondant de signature.

### Lot 1 — Repositories simples, mono-store

Fichiers : `tags.test.ts`, `fsHandle.test.ts`, `models.test.ts`, `modifierChain.test.ts`, `namedEntities.test.ts`, `projects.test.ts` et `results.test.ts`.

Pour chaque repository, choisir les comportements applicables parmi : ajout et lecture persistée, recherche par id/nom/clé, mise à jour ou remplacement, suppression, résultat vide ou erreur typée en cas d’absence, gestion d’identifiants multiples et ordre demandé par le contrat. Ajouter les cas métier propres à chaque module :

- **Projects** : ajout d’une source, source déjà présente, projet absent.
- **Results** : calcul de `scopeKey`, recherche par worker/tâche et par scope/nom, ordre des tâches, résultat absent.
- **Named entities** : recherche par un id d’annotation et par plusieurs ids, suppression ciblée.
- **Models / Modifier chains** : recherche par nom et id, mise à jour/remplacement et suppression.
- **Tags / FS handles** : lecture de tous les éléments et insertion simple/multiple selon le contrat.

### Lot 2 — Repository Worker sur le vrai stack

Compléter `workers.test.ts` au-delà de la loi de statut déjà couverte :

- `getAll`, `getById` (présent/absent), `getByScope` exact et sous-scope, `getByNamesAndScope` avec l’ordre par `createdAt` ;
- `add`, `addAll` et `patch`, en vérifiant que le patch ne contourne pas l’exclusion de `status` et `queue` au niveau de type ;
- `updateWorkerStatus` : succès, transition refusée et worker absent ; `updateTaskStatus` : tâche absente en plus des transitions déjà testées ;
- `deleteById` et `deleteByScope` : suppression des résultats associés, conservation des données hors scope, ids retournés ;
- `deleteResultById` : ne supprimer que le résultat correspondant au couple worker/tâche.

Les assertions de transition restent cohérentes avec `workerStatusLaw.test.ts` ; ce lot vérifie l’intégration transactionnelle du repository, pas une seconde implémentation de la loi.

### Lot 3 — Annotations et annotations temporaires

Créer `annotations.test.ts` et `annotationsTemp.test.ts` :

- recherche par id, collection, canvas et annotation ; filtrage par type, ordre et isolement entre scopes ;
- ordre suivant pour un scope/type vide et non vide ; `addAll` et affectation d’ordre ;
- mise à jour sans changement de type et avec changement de type ; réindexation après suppression et permutation d’ordre ;
- suppression par ids, scope et type, y compris ids absents et absence d’effet sur les autres canvas/types ;
- calcul du parent d’une annotation de ligne : parent contenant, choix du parent de plus petite surface, parent absent et type non éligible ;
- côté temporaire : lecture par canvas, insertion, absence de fuite vers les annotations permanentes, suppression par collection.

### Lot 4 — Sources et contenu/blob

Créer `sources.test.ts`. Prioriser les invariants de stockage groupé :

- ajout d’une source locale et distante et persistance cohérente dans `sources`, `sourceContents` et `storedBlobs` ;
- vérification des lectures jointes (contenu, miniature/base64), des erreurs d’absence et de la recherche par URL de manifeste/canvas ;
- mises à jour de nom et de métadonnées, y compris le chemin `githubManifestUrl` du contenu local ;
- suppression d’une source : source, contenu et miniature supprimés ensemble ; source absente renvoyée comme erreur typée ;
- comptage des migrations restantes, en distinguant manifeste/fichier déjà migré ;
- migration explicite des anciens manifests et fichiers, mise à jour des références de collection et nettoyage des anciennes tables.

Les accès externes à un fichier ou à la miniature doivent être déterministes : si nécessaire, stubber uniquement le helper à cette frontière IO, jamais Dexie. Ne pas ajouter de seam d’injection en production sans besoin démontré. Vérifier les cas d’échec qui peuvent laisser des tables incohérentes.

### Lot 5 — Collections et transactions multi-repositories

Créer `collections.test.ts` après les lots Worker, Annotation et Source. Utiliser les repositories réels appelés par `IndexedDBCollectionRepository` :

- création/ajout avec détails et contenu, lecture d’une collection sans contenu et collection absente ;
- tags, sources, canvas et lookup par scope, y compris références absentes ;
- déplacement d’éléments : ordre obtenu, indices invalides, égalité des positions et collection absente ;
- duplication : nouvel id, contenu conservé, annotations dupliquées et annotations originales préservées ;
- suppression d’un élément : contenu, taille et annotations correspondantes ;
- suppression d’une collection (simple et multiple) : nettoyage des annotations, workers et résultats dépendants, conservation des autres collections ;
- atomicité des écritures multi-tables : lorsqu’une écriture échoue, vérifier que les tables participant à la transaction ne sont pas partiellement modifiées.

Ne tester les chemins de panne transactionnelle que de manière stable et reproductible sur `fake-indexeddb` ; ne pas dépendre de détails internes de Dexie.

### Lot 6 — Export, import et effacement de la base

Créer `database.test.ts` pour `IndexedDBDatabaseRepository` : export d’une base avec données représentatives, import dans la base de test, vérification des valeurs persistées et du remplacement demandé par `clearTablesBeforeImport`. Vérifier le callback de progression selon le contrat de `dexie-export-import`. Tester `clear()` avec une réouverture propre de la base afin d’éviter que le test ne laisse la connexion Dexie fermée pour les suivants.

### Lot 7 — Repositories `liveQuery`

Ajouter un fichier de test par module réactif, en commençant par workers, collections, annotations et sources, puis les stores plus simples. Avec la vraie base :

- vérifier la valeur initiale, puis les émissions après ajout, mise à jour et suppression pertinentes ;
- vérifier qu’une mutation hors du scope observé ne modifie pas le résultat ;
- désabonner systématiquement et s’assurer qu’aucune souscription ne fuit entre tests.

Ne pas monter de composants React dans ces tests si le repository expose directement une query observable. Les comportements de hooks UI restent dans leur propre suite.

## Critères de sortie

- Chaque repository du périmètre possède des tests directs sur Dexie + `fake-indexeddb`, sans mock du stockage.
- Chaque méthode publique a au moins un scénario représentatif ; les méthodes qui retournent un `FunctionResult` couvrent succès et absence/erreur pertinente.
- Les opérations multi-tables couvrent l’invariant de cohérence et, quand applicable, leur atomicité.
- Les deux points du lot 0 ont une décision explicite et des tests de non-régression.
- Tests ciblés, `npx vitest run`, `npx tsc -b` et `git diff --check` passent.
- Le relevé de couverture est comparé à la base de départ pour les repositories, sans transformer le pourcentage exploratoire en seuil CI implicite.

## Commandes de vérification

```bash
npx vitest run src/data/repositories/indexeddb
npx vitest run
npx tsc -b
npm run test:coverage -- --run --coverage.include='src/data/repositories/indexeddb/**/*.ts'
git diff --check
```

La couverture ne devient bloquante en CI que dans un changement distinct, avec un périmètre et un seuil explicitement décidés.
