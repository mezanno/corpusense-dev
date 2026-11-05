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
- **À la clôture de chaque lot, créer un commit dédié** contenant les changements du lot, les tests et le relais documentaire. Ne pas inclure de changements étrangers au lot ; s'il y en a dans l'arbre de travail, les préserver et isoler le commit.
- **Après le commit d'un lot, passer automatiquement au lot suivant dans une nouvelle session OpenCode**, sans attendre une nouvelle demande de l'utilisateur. La nouvelle session doit repartir du relais documenté et du commit du lot précédent. Répéter ce cycle jusqu'à la clôture du lot 7 ; ne pas faire deux lots dans une session.
- À l’ouverture d’une session, relire ce plan, `docs/roadmap.md` et l’état Git. Ne commencer que le lot indiqué comme prochain dans la section de suivi ci-dessous ; vérifier que son lot précédent est clôturé et documenté.
- **La clôture d’un lot comprend obligatoirement une mise à jour documentaire avant son commit et l’ouverture de la session suivante.** Mettre à jour ce plan : statut du lot, fichiers/comportements couverts, décisions prises, commandes et résultats de vérification, problèmes restants et instructions précises pour le lot suivant.
- Mettre aussi à jour `docs/roadmap.md` lorsque les preuves changent l’état ou le bilan de Q2. Si un lot tranche une décision architecturale qui dépasse le plan, consigner la décision dans `docs/DECISIONS.md` et la référencer ici.
- Ne pas marquer un lot terminé, le commiter ni démarrer le suivant tant que ses tests et vérifications ne sont pas exécutés et que le relais documentaire n’est pas à jour. Une fois le commit confirmé, ouvrir automatiquement une nouvelle session pour le prochain lot. Cette session doit pouvoir reprendre à partir des documents, du commit et de l’état du dépôt, sans dépendre de l’historique de conversation.

### Suivi des lots et prochain relais

| Lot                                 | État                 | Relais vers la session suivante           |
| ----------------------------------- | -------------------- | ----------------------------------------- |
| 0 — contrats ambigus et régressions | Terminé (2026-11-05) | Ouvrir une nouvelle session pour le lot 1 |
| 1 — repositories simples            | Terminé (2026-11-05) | Ouvrir une nouvelle session pour le lot 2 |
| 2 — Worker                          | Terminé (2026-11-05) | Ouvrir une nouvelle session pour le lot 3 |
| 3 — annotations                     | Terminé (2026-11-05) | Ouvrir une nouvelle session pour le lot 4 |
| 4 — sources                         | À faire              | À documenter à la clôture du lot          |
| 5 — collections                     | À faire              | À documenter à la clôture du lot          |
| 6 — export/import/effacement        | À faire              | À documenter à la clôture du lot          |
| 7 — `liveQuery`                     | À faire              | Clôture finale à documenter               |

### Relais — lot 0 terminé (2026-11-05)

- **Comportements couverts** : `WorkerRepository.deleteByScope` supprime les workers à scope collection exact et descendant (y compris une clé descendante en casse différente), supprime leurs résultats liés, conserve les données d'un autre scope et retourne les ids supprimés. Le cas de scope canvas vérifie la correspondance exacte et la conservation d'un autre canvas.
- **Décisions** : `AnnotationRepository.deleteByScopeAndType` garde les deux paramètres effectivement utilisés (`scope`, `types?`) ; le paramètre fantôme `isTemp` est supprimé de l'interface. Le grep des appels dans `src/` ne trouve qu'un seul appelant, à deux arguments ; les annotations temporaires restent de la responsabilité du repository dédié. `WorkerRepository.add` est déjà aligné entre interface et implémentation (`WorkerCreateDTO → Promise<Worker>`), sans test de signature redondant.
- **TDD** : les deux scénarios Worker ont échoué avant correctif parce que `deleteByScope` retournait `[]` ; après correction, ils passent. L'ordre des ids n'étant pas un contrat documenté, le test vérifie les ids sans imposer leur ordre.
- **Fichiers** : `workers.test.ts`, `workers.ts`, `types.ts`.
- **Vérifications** : `npx vitest run src/data/repositories/indexeddb/__tests__/workers.test.ts` (8 tests réussis) ; `npx vitest run` (25 fichiers réussis, 1 ignoré ; 101 tests réussis, 1 todo) ; `npx tsc -b` ; `git diff --check` — tout passe.
- **Restant / relais précis** : la mesure de couverture comparative est à refaire au bilan du chantier, elle n'a pas été recalculée par ce lot. La prochaine session doit relire ce plan, `docs/roadmap.md` et l'état Git, constater le lot 0 clôturé, puis réaliser uniquement le lot 1 (tests directs mono-store : tags, fsHandle, models, modifierChain, namedEntities, projects et results), en TDD. Ne pas démarrer le lot 2 dans cette session.

### Relais — lot 1 terminé (2026-11-05)

- **Comportements couverts** : tags (ajout simple/multiple, lectures par ids et lecture complète), handles filesystem (insertion, remplacement par id et lecture complète), modèles (recherche par id/nom, tri alphabétique, mise à jour, suppression et absence typée), chaînes de modificateurs (recherche par id/nom, remplacement, suppression et absence typée), entités nommées (recherche par un ou plusieurs ids d’annotation et suppression ciblée), projets (lecture, ajout de source, doublon et projet absent), résultats (calcul de `scopeKey`, recherches worker/tâche et scope/nom, tri des tâches et absence typée).
- **Correctif révélé par TDD** : `getByAnnotationIds` renvoyait deux fois une entité liée à plusieurs ids recherchés, car l’index multi-entry produit une entrée par correspondance. L’ajout de `distinct()` conserve une seule entité ; le test échouait avant le correctif et passe après.
- **Fichiers** : sept nouveaux tests sous `src/data/repositories/indexeddb/__tests__/` et `namedEntities.ts`.
- **Vérifications** : tests ciblés du lot (7 fichiers, 20 tests réussis) ; `npx vitest run src/data/repositories/indexeddb` (8 fichiers, 28 tests réussis) ; `npx vitest run` (32 fichiers réussis, 1 ignoré ; 121 tests réussis, 1 todo) ; `npx tsc -b` ; Prettier ciblé ; couverture exploratoire (23,62 % lignes sur le périmètre que le rapport a inclus) — tout passe.
- **Couverture / limites** : le relevé ne se compare pas directement au 10,76 % de départ, qui instrumentait repositories, saga et plugins ; le filtre de la commande actuelle inclut également `liveQuery`, et le rapport ne liste pas les sept fichiers mono-store malgré leur exécution. Aucun seuil n’est déduit ; refaire une mesure correctement bornée au bilan final.
- **Restant / relais précis** : aucun défaut découvert dans les six autres modules. La prochaine session doit relire ce plan, `docs/roadmap.md` et l'état Git, constater les lots 0 et 1 clôturés, puis réaliser uniquement le lot 2 : compléter `workers.test.ts` sur les méthodes non encore couvertes (lecture, add/addAll/patch, statuts worker/tâche manquants, suppressions et résultats liés), sans redoubler les tests de la loi pure. Ne pas démarrer le lot 3 dans cette session.

### Relais — lot 2 terminé (2026-11-05)

- **Comportements couverts** : lectures `getAll`/`getById` avec absence typée ; recherches de scope exact et descendant ; recherche par noms et scope avec tri décroissant de `createdAt` ; `add`, `addAll`, valeurs par défaut et persistance de `patch` ; transition worker acceptée/refusée et worker absent ; tâche absente ; suppressions de worker/résultats liés et suppression ciblée par couple worker/tâche. L'assertion de type existante confirme que `patch` exclut `status` et `queue`.
- **Correctif révélé par TDD** : le préfixe `startsWithIgnoreCase('collection-1')` capturait aussi `collection-10`. Le filtrage exige désormais une égalité ou une frontière `-` pour les scopes descendants, dans `getByScope` et `deleteByScope` ; les tests vérifient que le worker et le résultat de `collection-10` restent hors du scope `collection-1`. Le test de recherche a échoué avant le correctif, puis les tests Worker sont passés.
- **Fichiers** : `workers.test.ts`, `workers.ts`.
- **Vérifications** : test Worker (16 réussis) ; `npx vitest run src/data/repositories/indexeddb` (8 fichiers, 36 tests réussis) ; `npx vitest run` (32 fichiers réussis, 1 ignoré ; 129 tests réussis, 1 todo) ; `npx tsc -b` ; Prettier ciblé ; `git diff --check` — tout passe.
- **Décisions / restant** : aucun doublon de la loi pure de statut ; la couverture exploratoire sera recalculée au bilan final. Après le commit de ce lot, ouvrir une nouvelle session, relire ce plan, `docs/roadmap.md` et l'état Git, puis réaliser uniquement le lot 3 : créer `annotations.test.ts` et `annotationsTemp.test.ts` et couvrir les contrats listés ci-dessous, en TDD, en commençant par les recherches, ordres et isolement des scopes/types. Ne pas démarrer le lot 4.

### Relais — lot 3 terminé (2026-11-05)

- **Comportements couverts — annotations permanentes** : lecture par id (présent/absent typé), scopes annotation/canvas/collection, tri par ordre au canvas, filtre de type et isolement des scopes ; prochain ordre pour type vide/non vide et affectation indépendante par type ; mise à jour sans changement de type et réindexation lors d'un changement de type ; permutation d'ordre ; suppression par ids (dont ids absents), id, scope et type, avec réindexation et conservation des autres canvas/types ; recherche du parent contenant de plus petite surface, absence de parent et type non éligible.
- **Comportements couverts — annotations temporaires** : lecture complète et par canvas triée, insertion, séparation du store permanent, suppression par collection avec conservation des autres collections.
- **Fichiers** : `annotations.test.ts`, `annotationsTemp.test.ts` et helper partagé `annotationFixtures.ts`. Aucun correctif de production n'a été nécessaire : les tests n'ont pas révélé de régression supplémentaire.
- **Décisions / limites** : les assertions n'imposent pas d'ordre pour `getAll()` des temporaires ni entre canvases où les ordres peuvent être égaux ; les fixtures `addAll` permanentes restent dans un scope homogène, conformément au contrat d'affectation d'ordre du repository.
- **Vérifications** : tests ciblés annotations (2 fichiers, 11 tests réussis) ; `npx vitest run` (34 fichiers réussis, 1 ignoré ; 140 tests réussis, 1 todo) ; `npx tsc -b` ; Prettier ciblé sur les tests et ce plan ; `git diff --check` — tout passe. Le contrôle Prettier de `docs/roadmap.md` signale un écart de formatage préexistant sur l'ensemble du tableau Q1–Q9 ; il est laissé intact pour éviter un reformatage sans rapport avec ce lot.
- **Couverture / limites** : pas de mesure de couverture recalculée à ce lot ; la mesure correctement bornée reste à faire au bilan final.
- **Restant / relais précis** : après le commit de ce lot, ouvrir une nouvelle session, relire ce plan, `docs/roadmap.md` et l'état Git, puis réaliser uniquement le lot 4 : créer `sources.test.ts` et tester les écritures groupées source/contenu/blob, les lectures et erreurs typées, les mises à jour, les suppressions, le comptage et les migrations décrits ci-dessous. Stubber seulement les helpers à la frontière IO si nécessaire ; ne pas démarrer le lot 5.

## Lots d’exécution

### Lot 0 — Fixer les contrats ambigus et les régressions déjà connues

- ✅ **`WorkerRepository.deleteByScope`** : tests Dexie du scope collection (scope exact et descendant reconnu par `startsWithIgnoreCase`), du scope exact non-collection et de la suppression des résultats liés. Le retour correspond désormais aux ids supprimés (R3.2) ; les tests rouges puis verts sont détaillés dans le relais ci-dessus.
- ✅ **`AnnotationRepository.deleteByScopeAndType`** : le grep des appels confirme un seul appelant à deux paramètres ; `isTemp` est supprimé de l’interface. Les annotations temporaires restent testées via leur repository dédié au lot 3.
- ✅ `WorkerRepository.add` est aligné entre interface et implémentation (`WorkerCreateDTO → Promise<Worker>`), sans test redondant de signature.

### Lot 1 — Repositories simples, mono-store

✅ Terminé (2026-11-05) ; détails et relais vers le lot 2 ci-dessus.

Fichiers : `tags.test.ts`, `fsHandle.test.ts`, `models.test.ts`, `modifierChain.test.ts`, `namedEntities.test.ts`, `projects.test.ts` et `results.test.ts`.

Pour chaque repository, choisir les comportements applicables parmi : ajout et lecture persistée, recherche par id/nom/clé, mise à jour ou remplacement, suppression, résultat vide ou erreur typée en cas d’absence, gestion d’identifiants multiples et ordre demandé par le contrat. Ajouter les cas métier propres à chaque module :

- **Projects** : ajout d’une source, source déjà présente, projet absent.
- **Results** : calcul de `scopeKey`, recherche par worker/tâche et par scope/nom, ordre des tâches, résultat absent.
- **Named entities** : recherche par un id d’annotation et par plusieurs ids, suppression ciblée.
- **Models / Modifier chains** : recherche par nom et id, mise à jour/remplacement et suppression.
- **Tags / FS handles** : lecture de tous les éléments et insertion simple/multiple selon le contrat.

### Lot 2 — Repository Worker sur le vrai stack ✅

✅ Terminé (2026-11-05) ; détails et relais vers le lot 3 ci-dessus.

`workers.test.ts` complète désormais la couverture au-delà de la loi de statut déjà couverte :

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
