# Décisions d'architecture (ADR)

Journal des décisions techniques structurantes de CorpuSense, consolidé à partir des plans, audits et revues antérieurs (série `public/doc/optimization/`, `docs/plan-*.md`, revues de septembre–octobre 2026). Une entrée = une décision prise, avec son contexte et ses conséquences. Le travail en cours ou différé vit dans [roadmap.md](./roadmap.md).

---

## D-001 — Architecture Local-First, IndexedDB comme source de vérité

Statut : active · Décidée fin 2025, confirmée en janvier 2026

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

Statut : active · Adoptée début 2026, amendée et clôturée par règles le 2026-10-08

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

Statut : active · Décidée en 2026 (audit doc 12)

**Contexte.** Difficulté réelle identifiée : pas de point d'injection stable pour les repositories (testabilité, contournement de `dbFactory` par deux plugins). Candidats : conteneur Awilix vs solutions natives.

**Décision.** **Ne pas adopter Awilix.** Les factories module-scope (`dbFactory.ts`) + imports directs restent le mécanisme. Raisons : incompatibilité avec la réactivité `useLiveQuery`, friction avec Redux-Saga, disproportion avec un projet solo, coût de refactoring élevé.

**Conséquences.** Si le besoin d'injection se précise : `RepositoryContext` React côté UI et `context` de Redux-Saga (`run(saga, deps)`) avant toute dépendance externe. Le futur module « statut worker » est un import pur, pas un service injecté.

---

## D-004 — Correctif direct proportionné (fake-indexeddb)

Statut : active · Décidée le 2026-10-01

**Contexte.** L'audit d'architecture du 2026-09-29 diagnostique : `dbFactory` pass-through contournable, ~25 factories superficielles, contrats non tenus par l'interface (`deleteByScope` retourne `[]` alors que le contrat promet des ids), dette de duplication par repository.

**Décision.** Traiter le symptôme, pas la cause, sans nouvelle abstraction :

- rétablir les contrats non tenus par l'interface **en direct**, sans nouvelle abstraction ;
- tester le **vrai** stack Dexie sous Vitest grâce à `fake-indexeddb` — l'outil recommandé pour tout test touchant un repository (plus de `vi.mock` des factories). **État 2026-10-12** : dépendance installée ; le helper `createTestDb()` réinitialise la base entre les tests et est utilisé par les tests du repository Worker (roadmap R3.1) ;
- « small-repo collapse » : quand un petit repository monostore est touché pour une vraie raison, le réduire à des délégations **dans ce commit** — pas de migration big-bang ;
- supprimer `mergeAnnotations` (code mort) et les `getById` morts des live repos models/workers.

**Conséquences.** Environ 80 % de la valeur d'une refonte structurelle pour 20 % de son coût ; la dette est couverte par des correctifs directs et des tests sur le vrai stack. L'alternative par interface de découplage, un temps consignée, a depuis été abandonnée (D-005).

---

## D-005 — Interface de découplage Table/Provider/Descriptor : abandonnée

Statut : abandonnée · Étudiée le 2026-10-01, abandonnée le 2026-10-09

**Contexte.** Conséquence de D-004 : un design complet de l'interface de découplage (Table/Provider/Descriptor, design-it-twice, trois options A/B/C, hybride retenu) avait été étudié et consigné.

**Décision.** Elle ne sera **pas** implémentée : la complexité de l'implémentation rendait la base de code beaucoup trop complexe pour un projet de cette taille. L'architecture cible est celle de D-004 — repositories instanciés par `dbFactory.ts`, testés avec `fake-indexeddb` sur le vrai stack Dexie. Le design n'est pas conservé comme plan de réactivation.

**Conséquences.** Cet abandon est définitif : pas de réactivation tant que D-004 reste la réponse proportionnée au problème.

---

## D-006 — Redux-Saga conservé jusqu'à l'extraction du moteur de file

Statut : active · Confirmée fin 2026 (docs 04/10, revue d'architecture)

**Contexte.** Le départ de Redux-Saga est un objectif documenté de longue date, mais la saga `workers.ts` (~420 lignes) contient à la fois la loi de statut, la boucle de file, la reprise après arrêt inopiné et le mapping Realtime : la retirer maintenant serait une réécriture non testable.

**Décision.** La retraite de la saga se fait **par l'aval** et dans l'ordre : d'abord le module pur « statut law » (roadmap R1), ensuite un moteur de file headless (`queueEngine.run(worker, plugin, ports)` avec ports repository/horloge/notifieur) dont la saga, `useJobRealtime` et la récupération au démarrage ne deviennent que des adaptateurs fins. Les plugins émettent des **événements**, jamais des statuts bruts.

**Conséquences.** La conception du module de loi doit prévoir dès l'origine cet adaptateur (aucun import Redux/Dexie/React/Supabase dans le module). En attendant : UI ≠ données — l'IHM ne dispatche que start/stop/recover, la donnée worker circule par live queries.

---

## D-007 — Plugin registry par découverte dynamique (`import.meta.glob`)

Statut : active

**Décision.** Workers et importers sont des modules autonomes de `src/state/sagas/plugins/{workers,importers}/`, découverts au build par `import.meta.glob` (eager), filtrés au runtime par le drapeau `experimental` (les plugins marqués expérimentaux ne se chargent que si l'utilisateur active les fonctionnalités expérimentales).

**Conséquences.** Ajouter un traitement = déposer un fichier, sans registry à maintenir. Corollaire technique : le glob ne descend pas dans les sous-répertoires — les anciens workers `workers/old/` sont donc du code mort assumé, archivé depuis le 2026-10-12 dans `archive/legacy-workers/` (roadmap Q5). Depuis Q6 (2026-11-05), `plugins/registry.ts` possède une instance unique des registres workers/importers ; le bootstrap attend i18n avant l'import des plugins et démarre ensuite l'app et les sagas.

---

## D-008 — Loi de statut du worker : un seul foyer (module pur)

Statut : active — loi implémentée (R1) · Proposition du 2026-09-29, reprise le 2026-10-08, loi consolidée le 2026-10-09 dans [statuts.md](./statuts.md), décisions D3 et D5 closes le 2026-10-12

**Contexte.** La loi de transition des statuts (tâches et workers) est implémentée **quatre fois** (repo `updateTaskStatus`, saga, `useJobRealtime`, UI — avec deux mappings d'icônes divergents) et dérive déjà : sweeper qui force `COMPLETED` sur des tâches jamais démarrées, plugins qui écrivent `POSTING`/`POSTED` directement dans le code.

**Décision.** La loi est centralisée dans `workerStatusLaw.ts`, module pur près de l'enum et testable sans jsdom ni Dexie. Les événements typés gouvernent les transitions ; les fonctions de dérivation et prédicats alimentent le repository, la saga et l'UI, et l'adaptateur traduit les statuts Supabase. Un refus de transition renvoie `FunctionResult.err(StatusChangeError)`, conformément à D-002. L'invariant est appliqué : le realtime peut faire évoluer les tâches, la file dérive le statut worker, et `patch()` ne permet plus de modifier le statut ou la file.

**Décisions closes par la loi consolidée** ([statuts.md](./statuts.md), 2026-10-09) : D1 exhaustivité (alphabets clos + mapping total, valeur inconnue = erreur typée), D2 sweeper (ne jamais fabriquer de succès : interruption → rejeu `WAITING`, timeout `POSTING` → `COMPLETED_WITH_ERRORS`), D4 scission `TaskStatus`/`WorkerStatus` (deux alphabets distincts dans la spec).

**Décisions closes** : **D3** verrou de la galerie (tranchée 2026-10-12, contre la recommandation initiale « scope canvas ») : un traitement en cours verrouille **toute la galerie**, pas seulement le canvas traité. Le comportement actuel (scope collection, `isWorkerOrTaskRunning({ collectionId })` dans `CollectionInspectorGalleryItemContent.tsx`) est la loi. **D5** table unique de présentation des statuts (tranchée 2026-10-12) : **un seul foyer de présentation côté UI** — une table par enum, `Record<TaskStatus, …>` et `Record<WorkerStatus, …>` (split D4), exhaustivité garantie par le typage, **aucun `default` runtime**. Les tables sont dans `features/`, sans dépendance UI dans `workerStatusLaw.ts` ; les mappings de l'interface ont été centralisés par R1. Overlay des vignettes de la galerie : **vignette neutre au repos** (pas d'icône sur `COMPLETED`), **`ERROR` signalé** par une icône d'alerte discrète — les échecs ne sont plus masqués. **Aucune décision D-008 n'est encore ouverte.**

**Conséquences.** C'est la condition préalable de D-006. `ALL` reste un filtre UI hors de la loi.

---

## D-009 — Restructuration « feature-first » des composants : adoptée et appliquée

Statut : active · Cible adoptée en 2026, migration R7 terminée le 2026-10-12

**Décision.** La cible `src/components/{ui,common,layout,features/<domaine>}` est appliquée progressivement, par tranches cohérentes et sans migration globale : `ui/` conserve les primitives génériques sans logique métier ; `common/` accueille les composants applicatifs transversaux ; `layout/` contient le shell et la navigation ; `features/<domaine>/` regroupe l'UI métier avec ses styles et tests lorsque possible. Les pages, hooks, services, modèles et contextes restent dans leurs couches respectives. Les nouveaux composants métier rejoignent directement leur feature ; les primitives génériques vont dans `ui/`.

**Conséquences.** Les domaines migrés et leurs consommateurs utilisent leurs nouveaux chemins ; aucun barrel ou wrapper n'est ajouté uniquement pour masquer les frontières. Les composants historiques ou techniques restants ne sont déplacés que si une évolution apporte une valeur nette. Le bilan d'exécution et les validations figurent dans [roadmap.md](./roadmap.md).

---

## D-010 — Politique de tests (pyramide) et harnais

Statut : active · Formalisée en 2026, harnais réparé le 2026-09-30, E2E déployés le 2026-10-13 (Q9)

**Décision.** Pyramide à trois niveaux : majoritairement des tests unitaires de fonctions pures ; tests de composants/hooks via React Testing Library (rôles accessibles, `user-event`, jamais les détails d'implémentation) ; E2E Playwright en nombre limité sur les parcours critiques (déployés le 2026-10-13 : 14 tests dans `e2e/`, chromium seul, job sur les PR — voir [roadmap Q9](./roadmap.md#qualité--outillage)). Standards :

- tests co-localisés dans `__tests__/` à côté du fichier source ;
- `fake-indexeddb` pour tout test touchant un repository (D-004) ; le helper `createTestDb()` réinitialise la base Dexie entre les tests ;
- harnais Vitest : stub `ResizeObserver` requis par `@dnd-kit`, mock i18n exportant `useTranslation` **et** `Trans` (les assertions ciblent les clés, que le mock renvoie à l'identique), mock WebGL fourni par `vitest-webgl-canvas-mock` ;
- Vitest vérifié le 2026-11-19 : 103 fichiers réussis, 1 ignoré, 1 385 tests réussis et 3 todo (campagnes closes : Q2 cœur données, Q11 couche hooks — 93,29 % de lignes sur `src/hooks/**` ; harnais et frontières de mock dans developpement.md §3). Baseline statique : tsc vert, ESLint `src` (ratchet) : 48 erreurs / 2 warnings (backlog roadmap Q1) ;
- E2E : specs dans `e2e/` (non co-localisées — la co-localisation est la règle Vitest), requêtes HTTP externes abandonnées (fixtures servies en `page.route` sur un hôte factice ; WebSockets non filtrés par cette interception), assertions par rôles accessibles et libellés FR réels, sans `data-testid` ; une spec ne se commite qu'après 10 runs consécutifs verts.

**Conséquences.** Le mock i18n renvoie les clés à l'identique : les tests vérifient les clés, pas les phrases. Toute nouvelle dépendance qui touche IndexedDB en production se teste sur le vrai stack, pas en `vi.mock`.

---

## D-011 — Mono-utilisateur local assumé (pas de guards de routes)

Statut : active · Décision de design, actée lors de la consolidation de l'audit de sécurité

**Contexte.** L'audit VULN-01 pointait l'absence de garde de routes. L'authentification Supabase existe (`ConnectedUserContext`) mais protège une feature (jobs distants), pas l'accès à l'app.

**Décision.** L'application est conçue pour un usage local mono-utilisateur : les données vivent dans le navigateur de l'utilisateur, il n'y a pas de multi-locataire à protéger. Les pages restent publiques. Les clés API tierces saisies par l'utilisateur sont stockées en `localStorage` — risque accepté et documenté (voir [securite.md](./securite.md) S-04), cohérent avec D-001 : la machine de l'utilisateur est sa frontière de confiance.

**Conséquences.** Cette décision doit être réexaminée si un accès distant ou multi-utilisateur devient un besoin réel (implémenter la note du registre S-01 plutôt que de la rouvrir).

---

## D-012 — Cohérence UI : boutons shadcn, palette sémantique et patron de page

Statut : active · Décidée le 2026-11-16, issue de l'audit du 2026-11-13 et du plan de cohérence UI exécuté (`plan-ui-coherence`, lots 1-9, supprimé après consolidation)

**Contexte.** Trois systèmes visuels cohabitaient (classes CSS maison, primitives shadcn hors thème, couleurs Tailwind brutes) et trois systèmes de boutons concurrents ; l'accessibilité présentait des points bloquants et six idiomes d'état vide différents.

**Décision.** La couche UI converge sur trois socles uniques :

- **boutons** : le `Button` de `components/ui/button.tsx` et ses variantes (`soft`, `ghost`, `icon`, alertes tokenisées) — les classes `.soft-button*` et les `<button>`/`<div onClick>` ad hoc sont supprimés (D-009 : `IconButtonWithTooltip` dans `common/`) ;
- **palette** : les tokens sémantiques de `src/index.css` (`--background`, --foreground-secondary, `--success`/`--warning`/`--info`, messages de journal inclus) sont la seule source de couleur de l'IHM ; les hex ne subsistent que comme **données utilisateur** (annotations OSD, drapeaux SVG) et pour les couleurs de rôle des thèmes hors-marque (statuts, journaux). Le thème sombre n'est plus dormant mais **en place** (lot 10 exécuté) : matrice mode (clair/sombre/système) × palettes — dix thèmes livrés (héritage, dérivé des échelles de marque, plus neuf thèmes hors-marque des lots 11 et 12), moteur maison en attributs de données, `next-themes` abandonné (voir [D-013](#d-013--moteur-de-thème-maison--attributs-de-données-abandon-de-next-themes)) ;
- **patron de page** : conteneur `.panel` + `PageHeader` (`components/layout/`) — un seul `h1` visible par page, icône alignée sur la barre latérale, actions à droite ; `Layout` ne rend de `h1` `sr-only` que pour les routes sans en-tête visible. Les états suivent un idiome unique : `Loading`/`AsyncState` (chargement ≠ vide, dans l'esprit de D-002), `NothingToShow` (vide), toast `sonner` (erreur).

**Conséquences.** Toute nouvelle page applique le patron (conventions détaillées dans [developpement.md §4](./developpement.md)) ; aucune nouvelle classe de style maison dans `index.css` sans second site d'appel prouvé (D-004) ; les libellés et rôles modifiés se propagent dans les tests Vitest et `e2e/helpers/selectors.ts` **dans le même commit**. Le produit reste desktop-first (point de rupture d'usage ~800 px, consigné dans [architecture.md §1](./architecture.md)).

---

## D-013 — Moteur de thème maison : attributs de données, abandon de next-themes

Statut : active · Décidée le 2026-11-17, exécutée aux lots 10-12 du plan de cohérence UI (`plan-ui-coherence`, supprimé après consolidation)

**Contexte.** Le mode sombre dormait dans un bloc `.dark` jamais activé : `next-themes` était une dépendance morte (aucun `ThemeProvider`, mono-dimensionnelle — une valeur de thème ne peut pas exprimer une matrice mode × palette — et pensée pour Next.js, script anti-flash SSR inutile en SPA Vite). Les lots 1 et 5 ayant intégralement tokenisé l'UI, un thème se réduit à un jeu de valeurs de variables CSS : aucun composant n'a besoin d'être touché.

**Décision.** Mécanisme maison en trois pièces :

- **attributs sur `<html>`** : `data-theme` (mode **résolu**, `light|dark`) et `data-palette` (source unique de la préférence de palette, toujours posé, `'heritage'` à ce jour). La variante Tailwind `dark:` est indexée sur l'attribut (`@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *))`) ;
- **`ThemeProvider`/`useTheme`** (`src/hooks/ui/useTheme.tsx`, même facture que `useExperimental`) : `mode: 'light' | 'dark' | 'system'`, `palette: 'heritage'` (union prête à s'étendre au lot 11), persistance `localStorage` (`themeMode`, `themePalette` — précédent des préférences UI, pas IndexedDB), abonnement `matchMedia('(prefers-color-scheme: dark)')` en mode système via `useSyncExternalStore` (mécanique de `useReducedMotion`) ; monté au plus haut de `App.tsx`, exposant le mode résolu (consommé par `ui/sonner.tsx`) ;
- **jeux de tokens dans `src/index.css`** : deux blocs complets et explicites par palette — `:root` (héritage clair) et `[data-theme='dark']` (héritage sombre) — chaque bloc redéfinissant tous les tokens sémantiques pour une cascade déterministe ; les curseurs, le rayon et les bindings `@theme inline` restent dans `:root`. Un script inline dans `index.html` pose les attributs avant le bundle (anti-flash, rôle du `ThemeScript` de next-themes).

Modèle exposé à l'utilisateur : **matrice** — sélecteur de mode (Clair/Sombre/Système) dans les paramètres (onglet « Thème ») ; le sélecteur de palette n'apparaîtra qu'au lot 11, quand une seconde palette existera. `next-themes` est désinstallée.

**Conséquences.** Chaque combinaison mode × palette livrée est une **porte d'entrée WCAG AA** : `src/components/common/__tests__/themeContrast.test.ts` parse les blocs par sélecteur, simule la cascade et mesure les binômes réellement utilisés dans les recettes (fonds/textes, boutons soft/confirmation/alerte, cartes, popover, champs, statuts, journaux) ≥ 4,5:1 — le produit cartésien texte × fond est impossible en sombre et a été remplacé par cette liste. Recette « ajouter une palette » dans [developpement.md §4](./developpement.md). **Conséquence de la croissance** : chaque thème hors-marque ajouté pèse ~110 lignes dans `src/index.css` (échelles brutes dans `@theme` + deux blocs de tokens complets), fichier volontairement maintenu comme source de vérité unique et littérale des thèmes — `themeContrast.test.ts` le parse par sélecteur. Quand il deviendra difficile à lire (ordre de grandeur : quinze thèmes, ≈ 2 000 lignes), la scission en fichiers importés est la suite logique : Tailwind v4 accepte `@theme` comme blocs de tokens dans du CSS importé (`src/styles/…`), moyennant deux disciplines — l'ordre des `@import` doit reproduire exactement l'ordre de cascade documenté en commentaire dans `index.css` (overrides clairs `[data-palette='…']` avant `[data-theme='dark']`, overrides sombres combinés après) et le parseur de `themeContrast.test.ts` doit lire les fichiers importés en plus d'`index.css`. À dix thèmes (~1 500 lignes), rien ne justifie encore cette scission. Déclencheur de réouverture : une variante « contraste élevé » (jeu de tokens supplémentaire branché sur un attribut dédié) ; tant qu'elle n'existe pas, l'échappatoire AA reste le thème clair héritage — la piste a depuis trouvé une première concrétisation sans attribut dédié (Charbon, addendum lot 12 ci-dessous).

**Addendum (exécution du lot 11, 2026-11-17).** Révision du principe de conception acté le 2026-11-17 : les palettes « céuléenne » et « ardoise » envisagées un temps, dérivées des échelles de marque, sont abandonnées ; les cinq thèmes supplémentaires sont **autonomes**, chacun avec ses propres échelles brutes (`forest`/`sand`, `plum`/`cream`, `copper`/`steel`, `ink`/`iron`, `mist`/`haze`), sans aucune référence aux échelles de marque (seules `--color-white`/`--color-black` sont tolérées) — la continuité de marque n'est plus assurée que par héritage, renoncement consenti. Thèmes livrés à ce jour (`data-palette`, par défaut entre parenthèses) : **héritage** (par défaut), **foret** (Forêt), **prune** (Prune), **cuivre** (Cuivre), **encre** (Encre), **brume** (Brume) — douze combinaisons mode × thème, toutes à portes AA vertes. L'exposition utilisateur parle de « thème » ; le terme interne « palette » subsiste (`data-palette`, `themePalette`, unions de types, blocs CSS). Les sélecteurs de thème et de mode sont tous deux dans l'onglet « Thème » de la configuration.

**Addendum (exécution du lot 12, 2026-11-17).** Quatre thèmes hors-marque de plus, sur le même gabarit, portent la liste à dix thèmes / **vingt combinaisons** AA vertes : **ocean** (Océan, échelles `ocean`/`nacre`), **rose** (Rose poudré, `blush`/`ivory`), **olive** (Olive, `olive`/`chalk`), **charbon** (Charbon, `charcoal`/`ash`). Charbon est délibérément à contraste élevé (noirs chauds contre blancs chauds, ≈ 16:1 texte/fond dans les deux modes) : première concrétisation de la piste « variante à contraste élevé » ci-dessus, sans attribut dédié.
