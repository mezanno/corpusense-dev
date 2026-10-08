# Décisions d'architecture (ADR)

Journal des décisions techniques structurantes de CorpuSense, consolidé à partir des plans, audits et revues antérieurs (série `public/doc/optimization/`, `docs/plan-*.md`, revues de septembre–octobre 2026). Une entrée = une décision prise, avec son contexte et ses conséquences. Le travail en cours ou différé vit dans [roadmap.md](./roadmap.md).

---

## D-001 — Architecture Local-First, IndexedDB comme source de vérité

_Statut : active · Décidée fin 2025, confirmée en janvier 2026_

**Contexte.** Application d'ingénierie documentaire utilisée dans un navigateur, sans backend applicatif propre. Les données de travail (collections, annotations, résultats) doivent survivre au offline et rester la propriété du chercheur.

**Décision.** Toutes les données métier persistantes vivent dans IndexedDB (base `mezanno`, ORM Dexie v4). L'IHM s'y abonne en réactif via `useLiveQuery` (dexie-react-hooks) à travers les hooks de `src/hooks/data/`. Les cinq mécanismes d'état ont chacun un rôle exclusif :

| Mécanisme              | Rôle exclusif                                                                    |
| ---------------------- | -------------------------------------------------------------------------------- |
| IndexedDB / Dexie      | Données métier persistantes, réactives                                           |
| Redux Toolkit (+ Saga) | Orchestration des workers, notifications/toasts uniquement (`workers`, `events`) |
| React Context          | États de session et contextes locaux de page                                     |
| Zustand                | Handles du File System Access API (`useFSHandleStore`)                           |
| localStorage           | Configuration utilisateur et clés API                                            |
| TanStack React Query   | Fetching de données externes ponctuelles (manifestes, conversion PDF)            |

**Conséquences.** Redux est volontairement maintenu vide de données métier. Toute nouvelle donnée métier va dans Dexie + un hook live, pas dans Redux.

---

## D-002 — Result Pattern typé (`FunctionResult<T, E>`)

_Statut : active · Adoptée début 2026, amendée et clôturée par règles le 2026-10-08_

**Contexte.** Les erreurs du domaine (entité absente, erreur DB, refus de transition de statut) doivent être traitables à l'appel sans `try/catch` dispersés ni perte de typage.

**Décision.** `FunctionResult<T, E> = { ok: true, value: T } | { ok: false, error: E }` (`src/utils/functionResult.ts`) est le type de retour standard aux frontières de commande : les méthodes faillibles des repositories IndexedDB le retournent, avec des erreurs typées (`DBError`, `NotFoundError`, `StatusChangeError`, `InvalidModelStructureError`…) subclassant toutes `BaseError` (`src/utils/BaseError.ts`) et portant un `context` JSON.

Discipline complète (issue de l'audit des ~60 sites de `throw`, appliquée par vagues et clôturée le 2026-10-08) :

1. **Un mode d'échec attendu et traitable à l'appel** traverse la frontière en `FunctionResult`.
2. **L'absence est une valeur, pas une erreur** : en collection réactive, un id absent donne un ensemble vide / `undefined` — les live repos ne retournent donc **pas** de Result (un Result à deux états ne peut pas exprimer `loading | missing | found`).
3. **Les incidents IO non récupérables restent des exceptions**, capturées **une seule fois** au boundary (saga supervisor, UI, `useJobRealtime`) et rapportées.
4. Un boundary **ne remplace jamais** l'erreur qu'il capture : il la relaie ou l'enrobe en conservant la `cause`.
5. Une erreur de plugin nomme le job fautif (plugin, tâche, URL) dans son message et son `context` (`src/state/sagas/plugins/errors.ts`).
6. Les helpers volontairement throwing (command utils, converters, importers) **doivent** lever une sous-classe de `BaseError` avec contexte, jamais un `Error` nu.
7. **Garde-fou mécanique** : règle ESLint `no-restricted-syntax` (sélecteurs `NewExpression[callee.name="Error"]` + classes étendant `Error`), liste blanche **au fichier** dans `eslint.config.js` — chaque ligne de la liste blanche est une décision documentée, pas une exception de confort.

**Conséquences.** Nouvelle erreur ⇒ subclasser `BaseError`, jamais `new Error`. Interdiction mécanique de créer un `Error` hors liste blanche. `NotFoundError` remplace l'alias déprécié `EntityNotFoundError` dans tout code neuf.

---

## D-003 — Pas de conteneur IoC (Awilix refusé)

_Statut : active · Décidée en 2026 (audit doc 12)_

**Contexte.** Difficulté réelle identifiée : pas de point d'injection stable pour les repositories (testabilité, contournement de `dbFactory` par deux plugins). Candidats : conteneur Awilix vs solutions natives.

**Décision.** **Ne pas adopter Awilix.** Les factories module-scope (`dbFactory.ts`) + imports directs restent le mécanisme. Raisons : incompatibilité avec la réactivité `useLiveQuery`, friction avec Redux-Saga, disproportion avec un projet solo, coût de refactoring élevé.

**Conséquences.** Si le besoin d'injection se précise : `RepositoryContext` React côté UI et `context` de Redux-Saga (`run(saga, deps)`) avant toute dépendance externe. Le futur module « statut worker » est un import pur, pas un service injecté.

---

## D-004 — Correctif direct proportionné (fake-indexeddb)

_Statut : active · Décidée le 2026-10-01_

**Contexte.** L'audit d'architecture du 2026-09-29 diagnostique : `dbFactory` pass-through contournable, ~25 factories superficielles, contrats non tenus par l'interface (`deleteByScope` retourne `[]` alors que le contrat promet des ids), dette de duplication par repository.

**Décision.** Traiter le symptôme, pas la cause, sans nouvelle abstraction :

- rétablir les contrats non tenus par l'interface **en direct**, sans nouvelle abstraction ;
- tester le **vrai** stack Dexie sous Vitest grâce à `fake-indexeddb` — l'outil recommandé pour tout test touchant un repository (plus de `vi.mock` des factories). **État 2026-10-09** : dépendance pas encore installée ; l'adoption passe par le harnais `createTestDb()` (roadmap R3.1) ;
- « small-repo collapse » : quand un petit repository monostore est touché pour une vraie raison, le réduire à des délégations **dans ce commit** — pas de migration big-bang ;
- supprimer `mergeAnnotations` (code mort) et les `getById` morts des live repos models/workers.

**Conséquences.** Environ 80 % de la valeur d'une refonte structurelle pour 20 % de son coût ; la dette est couverte par des correctifs directs et des tests sur le vrai stack. L'alternative par interface de découplage, un temps consignée, a depuis été abandonnée (D-005).

---

## D-005 — Interface de découplage Table/Provider/Descriptor : abandonnée

_Statut : abandonnée · Étudiée le 2026-10-01, abandonnée le 2026-10-09_

**Contexte.** Conséquence de D-004 : un design complet de l'interface de découplage (Table/Provider/Descriptor, design-it-twice, trois options A/B/C, hybride retenu) avait été étudié et consigné.

**Décision.** Elle ne sera **pas** implémentée : la complexité de l'implémentation rendait la base de code beaucoup trop complexe pour un projet de cette taille. L'architecture cible est celle de D-004 — repositories instanciés par `dbFactory.ts`, testés avec `fake-indexeddb` sur le vrai stack Dexie. Le design n'est pas conservé comme plan de réactivation.

**Conséquences.** Cet abandon est définitif : pas de réactivation tant que D-004 reste la réponse proportionnée au problème.

---

## D-006 — Redux-Saga conservé jusqu'à l'extraction du moteur de file

_Statut : active · Confirmée fin 2026 (docs 04/10, revue d'architecture)_

**Contexte.** Le départ de Redux-Saga est un objectif documenté de longue date, mais la saga `workers.ts` (~420 lignes) contient à la fois la loi de statut, la boucle de file, la reprise après arrêt inopiné et le mapping Realtime : la retirer maintenant serait une réécriture non testable.

**Décision.** La retraite de la saga se fait **par l'aval** et dans l'ordre : d'abord le module pur « statut law » (roadmap R1), ensuite un moteur de file headless (`queueEngine.run(worker, plugin, ports)` avec ports repository/horloge/notifieur) dont la saga, `useJobRealtime` et la récupération au démarrage ne deviennent que des adaptateurs fins. Les plugins émettent des **événements**, jamais des statuts bruts.

**Conséquences.** La conception du module de loi doit prévoir dès l'origine cet adaptateur (aucun import Redux/Dexie/React/Supabase dans le module). En attendant : UI ≠ données — l'IHM ne dispatche que start/stop/recover, la donnée worker circule par live queries.

---

## D-007 — Plugin registry par découverte dynamique (`import.meta.glob`)

_Statut : active_

**Décision.** Workers et importers sont des modules autonomes de `src/state/sagas/plugins/{workers,importers}/`, découverts au build par `import.meta.glob` (eager), filtrés au runtime par le drapeau `experimental` (les plugins marqués expérimentaux ne se chargent que si l'utilisateur active les fonctionnalités expérimentales).

**Conséquences.** Ajouter un traitement = déposer un fichier, sans registry à maintenir. Corollaire technique : le glob ne descend pas dans les sous-répertoires — `workers/old/` est donc du code mort assumé (suppression listée en roadmap). **Dette connue** : deux instances du registry coexistent (`App.tsx` exporte un `workerPlugins` mutable, `sagas/workers.ts` recharge indépendamment) — à unifier (roadmap Q6).

---

## D-008 — Loi de statut du worker : un seul foyer (module pur)

_Statut : planifiée, décisions ouvertes reportées · Proposition du 2026-09-29, reprise le 2026-10-08_

**Contexte.** La loi de transition des statuts (tâches et workers) est implémentée **quatre fois** (repo `updateTaskStatus`, saga, `useJobRealtime`, UI — avec deux mappings d'icônes divergents) et dérive déjà : sweeper qui force `COMPLETED` sur des tâches jamais démarrées, plugins qui écrivent `POSTING`/`POSTED` directement dans le code.

**Décision.** La loi aura un foyer unique : `workerStatusLaw.ts` — module pur près de l'enum, testable sans jsdom ni Dexie — avec une algèbre d'événements (`START · POST · JOB_ACCEPTED · RESULT_OK · RESULT_ERR · REQUEUE`), deux dérivations (`workerStatusOf(queue)`, `recoveredOf(worker)`), des prédicats de capacité pour l'UI, et un adaptateur `taskStatusOfJobStatus`. Refus de transition = `FunctionResult.err(StatusChangeError)`, conformément à D-002. Invariant visé : le realtime peut bouger les tâches, la dérivaison de file peut bouger le worker — plus personne ne modifie le statut directement (`patch()`).

**Décisions encore ouvertes** (à trancher dans roadmap R1) : exhaustivité par liste blanche (D1), sémantique du sweeper (D2), verrou de la galerie par collection plutôt que par canvas (D3), table unique de présentation des statuts (D5). La scission d'enum `TaskStatus`/`WorkerStatus` (D4) est **différée** tant que les quatre copies existent.

**Conséquences.** C'est la condition préalable de D-006. `ALL` reste un filtre UI hors de la loi.

---

## D-009 — Restructuration « feature-first » des composants : validée, différée

_Statut : différée · Proposition 2026 (doc 07), statut confirmé aux revues_

**Décision.** La cible `components/{ui,common,layout,features/<domaine>}` est retenue (ui/ = atomes shadcn sans logique métier ; features/ = composants métier par domaine, colocalisés avec leurs styles). Elle n'est **pas** appliquée : la migration se ferait par gros déplacements sans valeur fonctionnelle immédiate. Règle d'atterrissage : composer les nouveaux composants directement dans `features/` pour garder le delta petit.

**Conséquences.** `src/components/` reste majoritairement plat entre-temps ; la proposition complète (arborescence cible) est à re-dériver de cette entrée si le chantier s'ouvre.

---

## D-010 — Politique de tests (pyramide) et harnais

_Statut : active · Formalisée en 2026, harnais réparé le 2026-09-30_

**Décision.** Pyramide à trois niveaux : majoritairement des tests unitaires de fonctions pures ; tests de composants/hooks via React Testing Library (rôles accessibles, `user-event`, jamais les détails d'implémentation) ; E2E Playwright en nombre limité sur les parcours critiques (non encore déployés). Standards :

- tests co-localisés dans `__tests__/` à côté du fichier source ;
- `fake-indexeddb` pour tout test touchant un repository (D-004 ; objectif — la dépendance et le harnais arrivent avec roadmap R3.1) ;
- harnais Vitest : stub `ResizeObserver` requis par `@dnd-kit`, mock i18n exportant `useTranslation` **et** `Trans` (les assertions ciblent les clés, que le mock renvoie à l'identique), mock WebGL fourni par `vitest-webgl-canvas-mock` ;
- baseline mesurée 2026-10-08 : tsc vert, 24 fichiers / 82 tests verts (+1 fichier ignoré, 1 todo), ESLint `src` : 48 erreurs / 2 warnings (backlog roadmap Q1).

**Conséquences.** Le mock i18n renvoie les clés à l'identique : les tests vérifient les clés, pas les phrases. Toute nouvelle dépendance qui touche IndexedDB en production se teste sur le vrai stack, pas en `vi.mock`.

---

## D-011 — Mono-utilisateur local assumé (pas de guards de routes)

_Statut : active · Décision de design, actée lors de la consolidation de l'audit de sécurité_

**Contexte.** L'audit VULN-01 pointait l'absence de garde de routes. L'authentification Supabase existe (`ConnectedUserContext`) mais protège une feature (jobs distants), pas l'accès à l'app.

**Décision.** L'application est conçue pour un usage local mono-utilisateur : les données vivent dans le navigateur de l'utilisateur, il n'y a pas de multi-locataire à protéger. Les pages restent publiques. Les clés API tierces saisies par l'utilisateur sont stockées en `localStorage` — risque accepté et documenté (voir [securite.md](./securite.md) S-04), cohérent avec D-001 : la machine de l'utilisateur est sa frontière de confiance.

**Conséquences.** Cette décision doit être réexaminée si un accès distant ou multi-utilisateur devient un besoin réel (implémenter la note du registre S-01 plutôt que de la rouvrir).
