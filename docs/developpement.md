# Guide développeur

_Démarrage et CI vérifiés contre la configuration du dépôt le 2026-11-04. Architecture : [architecture.md](./architecture.md)._

## 1. Démarrage

Prérequis : **Node.js 22** et **npm 11.6.4**, versions utilisées en CI. Le serveur de développement habituel exige aussi un certificat HTTPS local.

```bash
git clone https://github.com/mezanno/corpusense-dev.git
cd corpusense-dev
npm ci
```

Le dépôt ne fournit ni `.env` ni certificats de développement. Créer un `.env.local` ignoré par Git, avec au minimum une URL Supabase valide et une clé anon pour que le client s'initialise :

```dotenv
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-anon
```

Utiliser une instance réellement configurée pour les fonctions distantes ; les autres variables et leurs usages sont décrits dans [architecture.md §9](./architecture.md#9-configuration). Ne jamais mettre de clé secrète dans une variable `VITE_*` : elle est exposée au navigateur.

Installer [mkcert](https://github.com/FiloSottile/mkcert), puis créer les fichiers attendus par `vite.config.ts` :

```bash
mkdir -p certs
mkcert -install
mkcert -key-file certs/localhost+2-key.pem -cert-file certs/localhost+2.pem localhost 127.0.0.1 ::1
npm run dev
```

Ouvrir l'URL HTTPS affichée par Vite. Les certificats et `.env.local` restent locaux. Pour les seuls E2E, aucun certificat n'est nécessaire : Playwright démarre son serveur HTTP dédié.

### Commandes de vérification (le contrôle qualité du dépôt)

```bash
npx tsc -b                              # types, comme en CI
npx vitest run                          # tests
npm run lint:ratchet                    # lint avec baseline, comme en CI
npx prettier . --check                  # format
```

Autres scripts utiles : `npm run build` (generate-env → tsc -b → vite build), `npm run preview`, `npm run test:coverage`, `npm run lint-fix`, `npm run format-fix`.

### Tests E2E (Playwright, Q9)

```bash
npx playwright install chromium  # première utilisation ; --with-deps sous Linux si nécessaire
npm run test:e2e           # npx playwright test — lance son propre serveur `dev:e2e` sur le port 5273
npm run test:e2e:ui        # mode interactif
```

- Specs dans `e2e/` (jamais co-localisées : D-010 réserve `__tests__/` à Vitest) ; chromium seul ; assertions par rôles accessibles et libellés FR réels via `e2e/helpers/selectors.ts` (aucun `data-testid`).
- **Requêtes HTTP interceptées** : `installE2ENetwork` abandonne les requêtes autres que celles du serveur local et de la fixture IIIF (manifest P2, image, `info.json` single-tile), servie sur l'hôte factice `https://iiif.e2e.test` (`e2e/fixtures/README.md`, régénération : `node scripts/generate-e2e-image.mjs`). `page.route` ne filtre pas les WebSockets.
- Environnement de test : `.env.e2e` versionné (valeurs Supabase factices — `createClient()` exige des valeurs valides), serveur HTTP en mode `e2e`, service worker PWA désactivé. Les variables déjà présentes dans l'environnement et `.env.e2e.local` peuvent prendre priorité : éviter d'y injecter une configuration réelle pour ces tests.
- État : IndexedDB vierge par test (contexte neuf) ; les parcours se reconstruisent via `e2e/helpers/journeys.ts`.
- Une spec ne se commite qu'après **10 runs consécutifs** `npx playwright test` verts ; le job CI (`ci.yml`, PR uniquement) téléverse le rapport si le job échoue. La protection de branche doit être configurée séparément pour imposer les checks à la fusion.
- Hors périmètre : workers et jobs distants, IIIF distant réel, import de fichiers locaux, PDF, chaînes de modificateurs, multi-onglets et PWA installée.

## 2. Conventions

- **Alias `@/`** obligatoire pour les imports internes (`@/data/models/…`).
- **Erreurs** : subclasser `BaseError` avec contexte JSON ; jamais `new Error` hors liste blanche ESLint (règle `no-restricted-syntax`, voir D-002). `NotFoundError`, pas l'alias déprécié `EntityNotFoundError`.
- **Résultats attendus** : `FunctionResult<T, E>` aux frontières de commande ; l'absence est une valeur (`undefined`, `[]`), pas une erreur (D-002).
- **Repository ≠ DAO** : le vocabulaire exact est dans `CONTEXT.md` ; tout accès passe par `dbFactory.ts`.
- **Tests co-localisés** dans `__tests__/` à côté de la source ; composants testés via les rôles accessibles et `user-event` (D-010). Ce qui touche un repository se teste avec `fake-indexeddb` sur le vrai stack Dexie, en réinitialisant la base via `createTestDb()` (D-004, R3.1).
- **Horodatages** : `createdAt` et `updatedAt` sont obligatoires et conformes à `z.iso.datetime()` dans les entités persistées héritant de `TimeStampSchema` ; ce sont les fonctions des repositories qui les posent (création : les deux initialisées ; modification : `updatedAt` avancé, `createdAt` du stockage préservé), jamais les DTO d'entrée, qui n'ont pas ces champs. Les hooks Dexie restent un filet tolérant pour les écritures hors repository (tests directs, migrations, restaurations), pas un lieu de politique stricte. Les imports capables d'écraser une ligne (modèles, annotations permanentes et temporaires, étiquettes) passent par une voie dédiée `importWithDates` : dates validées et préservées sous transaction marquée migration, rejet en `FunctionResult` traduit si elles sont invalides. Pour tester un retour de repository, comparer l'objet retourné à une relecture après écriture et contrôler l'horloge avec `vi.useFakeTimers({ toFake: ['Date'] })` quand des dates exactes sont assertées (état des garanties : voir [architecture.md](./architecture.md#7-modèle-de-données)).
- **Nommage de fichiers** : PascalCase pour les composants, kebab-case autorisé uniquement dans `components/ui/` (fichiers shadcn régénérés).
- **Zod** : toute entité persistée complexe a son schéma (`.strict()` là où c'est déjà le cas).
- **i18n** : les chaînes UI passent par les clés ; le mock de test renvoie les clés à l'identique, donc les tests vérifient les clés.
- **Sous-répertoire** : ne jamais hardcoder d'URL absolue — utiliser `VITE_BASE_PATH` et les helpers de `useAppNavigation`.

## 3. Harnais de test (à connaître avant de toucher les tests)

- `vitest.setup.ts` : stub `ResizeObserver` (**requis** par `@dnd-kit/dom` — sans lui, 8 fichiers ne se chargent plus), stub `matchMedia`, mock WebGL via `vitest-webgl-canvas-mock`.
- Mock i18n : `src/__tests__/react-i18next.ts` (alias du paquet réel via vite.config) exporte `useTranslation` **et** `Trans`.
- `src/__tests__/utils.tsx` : `renderWithProviders` monte le routeur **au-dessus de tous les providers**, comme `App.tsx`, et crée un `QueryClient` **neuf par test** (`retry: false` hérité du test) — depuis le suivi Q11 2026-11-19 ; ne pas réintroduire de `QueryClient` de module ni de contournement local d'ordre de providers.
- Couche hooks (`src/hooks/**`) : harnais dédié `src/hooks/__tests__/harness.tsx` (campagne Q11, close 2026-11-19) — wrapper `renderHook` sur store et base Dexie réels, `createTestDb()` entre les tests, vidange IDB de fin de test **centralisée** (`flushPendingIdbTransactions` : ne jamais remettre de `getById('__flush__')` fichier par fichier), compteur `countLiveQuerySubscribers` pour prouver l'absence de fuite d'abonnements au démontage (mesures APRÈS matérialisation, contre une référence « providers seuls »). La couche hooks est stable sous `--sequence.shuffle` (course `AbortError` éliminée par la vidange ; reproduction consignée dans `useTags.test.tsx`, seed 1337) — cette stabilité ne s'étend pas aux suites saga, voir la puce suivante.
- **Suites saga** (`src/state/sagas/__tests__/workers.test.ts`, `workers.recovery.test.ts`, `interruption.characterization.test.tsx`) : elles appellent `createTestDb()` **sans vidange** et annulent des sagas dont les écritures Dexie restent engagées. Mesure sur `workers.test.ts` seul : `npx vitest run src/state/sagas/__tests__/workers.test.ts --sequence.shuffle --sequence.seed=42`, plus les graines 7/13/21/99/1337 → **6/6 rouge**, à `HEAD` comme avec les correctifs du chantier horodatages ; **0 échec sur 11 runs en ordre naturel** — la fenêtre ne s'ouvre qu'au changement d'ordre ou sous contention. Les deux autres fichiers ont le même geste (`createTestDb()` nu + `saga.cancel()`), non mesuré séparément. Le `deleteDatabase()` du `beforeEach` suivant avorte la tâche différée de l'addon `dexie-observable` et le rejet non géré est **attribué au test en cours**, d'où une victime qui change à chaque tour. Le geste qui ferme la fenêtre existe côté hooks (`resetTestDbBeforeEach`, plus un drain de fin de test type `afterEach(settle)`) ; il n'est pas appliqué aux suites saga — ouvert en [roadmap Q8](./roadmap.md).
- **Frontières de mock acceptées** pour les tests de hooks (établies par la campagne Q11, vérifiées à ses deux audits) : `fetch` stubbé au bord du réseau ; APIs navigateur absentes de jsdom (File System Access, `URL.createObjectURL`, `window.location.reload`) stubbées au bord ; `Octokit`, `pdfjs-dist` et `file-saver` mockés à la frontière du module externe. Injections de faute par l'**API publique de Dexie** (`table.hook('reading'/'creating'/'deleting')`) ou `vi.spyOn` passants sur les fonctions natives. **Jamais** de mock de Dexie ni du stockage, jamais de mock des hooks de données quand le vrai stack peut tourner, jamais de délais artificiels (seul horodatage toléré : `vi.useFakeTimers({ toFake: ['Date'] })` de `useLogger`). Deux cantons historiques ne s'étendent pas : mock `useLiveQuery` de `liveLoading.test.tsx`, mock `../useSources` de `useTileSource.test.tsx`.
- **Non-duplication** : les coquilles `liveQuery` se testent sur le seul contrat abonnement / état initial / erreur / désabonnement — la réactivité est verrouillée couche repositories (campagne Q2). Un comportement cassé déjà caractérisé se verrouille **TEL QUEL** en référençant son constat d'audit, sans le légitimer.
- Vérification Vitest du 2026-11-19 : 103 fichiers réussis, 1 ignoré (`ManifestDetails.test.tsx`), 1 385 tests réussis et 3 `it.todo`. Couverture de la couche hooks : 93,29 % des lignes — mesure : `npx vitest run --coverage.enabled=true --coverage.include='src/hooks/**' --coverage.reporter=text`. Baseline statique : tsc vert ; ESLint `src` (ratchet) : 48 erreurs / 2 warnings.

## 4. Guides

### Ajouter une route

1. Clé dans `CorpusenseRoutes` (`src/hooks/useAppNavigation.tsx`) + helper `goTo…()`.
2. Page dans `src/pages/`.
3. `<Route …>` dans `App.tsx` sous `<Route element={<Layout />}>`.

### Conventions UI (boutons, couleurs, états, structure de page)

Issues du plan de cohérence UI exécuté (2026-11-13 → 2026-11-17, décision D-012) :

- **Boutons** : uniquement le `Button` de `ui/button.tsx` et ses variantes (`soft` par défaut, `size='icon'`/`'soft'`, `ghost`, `destructive`, `warning`…) ; jamais de classes maison. Icône seule ⇒ `aria-label` (ou `title`) obligatoire. L'ajout d'entité passe par `AddCardButton` ou `openForm` (R6).
- **Couleurs** : tokens sémantiques uniquement (`bg-background`, `text-muted-foreground`, `border-input`, `--success`/`--warning`/`--info`… définis dans `src/index.css`) ; jamais de hex ni de classes Tailwind brutes (`red-500`, `bg-white`…) hors données utilisateur (couleurs d'annotation OSD, drapeaux SVG).
- **Thème** (D-013) : `ThemeProvider`/`useTheme` (`src/hooks/ui/useTheme.tsx`) pose `data-theme` (mode résolu) et `data-palette` sur `<html>`, préférences en `localStorage` (`themeMode`, `themePalette`), sélecteurs de thème (héritage, Forêt, Prune, Cuivre, Encre, Brume, Océan, Rose poudré, Olive, Charbon) et de mode (clair/sombre/système) dans l'onglet « Thème » de la configuration. Écrire du style conditionné au mode : variante `dark:` (indexée sur `[data-theme='dark']`), jamais la classe `.dark` ni de lecture de `prefers-color-scheme` en JS ; les composants consomment les tokens, ils ne choisissent jamais un thème. **Ajouter une palette** = déclarer dans `@theme` les échelles brutes du thème (dominante et neutre pour un thème hors-marque ; les cinq thèmes du lot 11 n'utilisent **aucune** échelle de marque, seules `--color-white`/`--color-black` sont tolérées en exception), puis un bloc complet par mode dans `index.css` (`[data-palette='…']` inséré après `:root`, `[data-palette='…'][data-theme='dark']` après `[data-theme='dark']`, tous les tokens redéfinis dans chaque bloc) + clés i18n `theme_palette_*` fr/en + slug ajouté à l'union `ThemePalette` du hook + combinaisons ajoutées à `themeContrast.test.ts` (contrastes AA ≥ 4,5:1 sur les binômes de recettes). Chaque thème ajoute ainsi ~110 lignes à `index.css`, conservé comme source de vérité unique des thèmes (le test le parse par sélecteur) ; dès qu'il deviendra difficile à lire (ordre de grandeur : quinze thèmes, ≈ 2 000 lignes), scinder les blocs dans des fichiers importés (`src/styles/…`, Tailwind v4 l'accepte) en reproduisant l'ordre de cascade via l'ordre des `@import` — overrides clairs avant `[data-theme='dark']`, overrides sombres combinés après — et en adaptant le parseur de `themeContrast.test.ts` (voir D-013).
- **États** : chargement = `Loading`/`AsyncState` (un écran `useLiveQuery` distingue le chargement initial du vide) ; vide = `NothingToShow` avec message contextuel ; erreur utilisateur = toast `sonner` ou affichage inline thématisé. `role='alert'` est réservé aux erreurs.
- **Structure de page** : conteneur `.panel` + `PageHeader` (`src/components/layout/PageHeader.tsx`) — un seul `h1` visible par page (le titre de la route), icône optionnelle alignée sur la barre latérale, actions globales à droite. Routes sans en-tête visible (manifeste, expert, index de la doc) : `Layout` rend un `h1` en `sr-only` — ne pas en ajouter un second. Les chaînes passent par les clés i18n fr **et** en ; tout changement de libellé ou de rôle impose de mettre à jour tests Vitest et `e2e/helpers/selectors.ts` dans le même commit.
- **Échelles visuelles** : rayons via les tokens `--radius` (`rounded-md` pour les contrôles, `rounded-xl` pour les cartes), ombres sur l'échelle Tailwind (`shadow-sm` sur les cartes), transitions uniformes `transition duration-150 ease-linear` sur les cartes et éléments actionnables.

### Ajouter un worker (OCR / LLM / traitement)

1. Fichier dans `src/state/sagas/plugins/workers/` — découvert automatiquement (D-007). Marquer `experimental` si pertinent.
2. Le plugin émet des **événements de statut**, jamais des statuts bruts (D-008) ; erreurs en sous-classes de `BaseError` nommant le job (D-002).
3. Côté export : réutiliser les utilitaires communs, pas de nouvel utilitaire d'écriture.

### Ajouter un modèle métier

1. Type + schéma Zod dans `src/data/models/`.
2. Store dans `db.ts` : nouvelle `db.version(N+1)` avec la **liste complète des stores** et les index, migration dans `.upgrade()`.
3. Repository dans `src/data/repositories/indexeddb/` + getter dans `dbFactory.ts`.
4. Hook live dans `src/hooks/data/` (`useLiveQuery`).
5. Route + page + test.

### Carte de navigation (« où chercher quand… »)

| Je veux…                               | Regarder                                                        |
| -------------------------------------- | --------------------------------------------------------------- |
| Ajouter/modifier une page ou route     | `src/pages/`, `src/App.tsx`, `src/hooks/useAppNavigation.tsx`   |
| Modifier le visualiseur / l'annotation | `src/components/features/canvasViewer/CanvasViewerOSD*.tsx`     |
| Modifier le schéma de base             | `src/data/repositories/indexeddb/db.ts`                         |
| Ajouter un accesseur de données        | `src/data/repositories/indexeddb/` + `dbFactory.ts`             |
| Ajouter un worker / importer           | `src/state/sagas/plugins/`                                      |
| Modifier les types métier              | `src/data/models/`                                              |
| Suivi jobs distribués                  | `src/hooks/useJobRealtime.tsx`, `src/utils/supabase.ts`         |
| Configuration / clés API               | `src/utils/config.ts`, `src/components/features/configuration/` |
| Build, PWA, chunks                     | `vite.config.ts`                                                |
| Déploiement                            | `.github/workflows/deploy.yml`                                  |

## 5. Pièges connus

1. **Migrations Dexie** : `.upgrade()` ne fait que le structurel ; la migration `storedManifests/convertedFiles → sources` est déclenchée manuellement depuis l'UI (`migrateAllSources()`). Toujours figer l'ordre des tableaux avant de supprimer un champ de tri (cf. v31).
2. **Mock i18n** : ajouter une fonction i18n utilisée par un composant testé ⇒ l'ajouter au mock, sinon l'import explose.
3. **Plugins expérimentaux** : invisibles tant que le drapeau `experimental_features` (localStorage) est désactivé.
4. **Initialisation des plugins** : le bootstrap attend `initI18n()` avant d'importer et d'initialiser `state/sagas/plugins/registry.ts`. Garder cet ordre : certains plugins traduisent leur description au chargement du module. UI et exécution doivent importer les registres depuis `plugins/registry.ts`, jamais depuis `App.tsx` ou `sagas/workers.ts` (Q6).
5. **Frontières d'architecture** (roadmap Q4) : ESLint interdit les imports de `@/App` depuis `src/data/**` et les accès directs à Dexie hors de `src/data/repositories/indexeddb/`. Utiliser les repositories fournis par `dbFactory` ; la règle passe dans le lint ratchet de CI.
6. **Documentation de l'app** : `DocumentationPage` sert les Markdown de `public/doc/` listés dans `index.json` — la doc technique n'y a pas sa place (voir [README.md](./README.md)).
7. **E2E Playwright** (Q9, enseignements des specs `e2e/`) :
   - `download.path()` est la fin autoritaire du flux en Node — `download.finished()` n'existe pas côté JS ;
   - le build jszip installé rejette `loadAsync(stream)` : tamponner `createReadStream()` en mémoire avant lecture ;
   - ne pas remettre d'`id` explicite sur un `Checkbox` dans un `FormControl` : il court-circuite l'id injecté et casse l'association `FormLabel`↔contrôle (corrigé dans `ExportCollectionForm` grâce à l'E2E) ;
   - `fill` ne déclenche pas la validation react-hook-form : tout champ pilotant un bouton `disabled` se remplit au clavier (`pressSequentially`) ;
   - le drawer WebGL d'OpenSeadragon 5 n'émet **jamais** `tile-drawn` : attendre le rendu par le réseau (`info.json` + tuile) et assertir sur l'overlay annotorious (`svg.a9s-annotationlayer`) ; après un reload, seules les peintures WebGL et la preuve IndexedDB/menu subsistent, pas le nœud SVG ;
   - le geste de dessin repose sur la géométrie figée du viewport du projet chromium (1280×720, `defaultZoomLevel` 0.5) : changer le `viewport` impose de relancer les 10 runs de stabilité ;
   - la ligne de log d'export `Export completed successfully.` (`LOG_EXPORT_COMPLETED` du logger) n'est pas traduite.
8. **`dexie-observable` est actif sans être déclaré** : `import 'dexie-observable'` (`src/data/repositories/indexeddb/db.ts`) enregistre l'addon (`Dexie.addons.push`, `node_modules/dexie-observable/dist/dexie-observable.js:1013`) qui s'exécute à chaque construction d'instance Dexie : il ajoute ses stores au schéma, surcharge `db.open` et `db.close`, et démarre son dispositif depuis son handler `on('ready')` — survivant aux réouvertures (`:770`). Il n'y a pas d'appel d'activation à faire : `db.observable` n'est qu'un espace de noms (`:611`). La base porte donc `_changes`, `_syncNodes`, `_intercomm` et `_uncommittedChanges`, une ligne de `_changes` est écrite à chaque mutation d'un store applicatif (mesuré : 3 ajouts → 3 lignes), et le poll de 500 ms (`LOCAL_POLL`, `:581`) tourne. Deux conséquences vérifiées : toute écriture coûte deux écritures IndexedDB (donc ×2 pour une migration qui touche toutes les lignes) ; l'addon engage des transactions que personne n'attend — au `complete` de chaque transaction commise il déclenche un réveil différé de 25 ms (`:78-88`) qui relance `poll`/`cleanup()` (`:905`, `:910`) et écrit dans `_syncNodes`/`_changes`/`_intercomm`, et `db.close()` fait lui-même une écriture non attendue (`:689`, commentée « may be cancelled » par l'auteur) — d'où les `AbortError` orphelins en test (§3). Les migrations d'horodatages excluent ces stores (`timestampedStores`). Ouvverture : [roadmap Q8](./roadmap.md).
9. **Ne jamais lancer deux suites Vitest en parallèle** : elles se marchent dessus (workers, transformations en cache, pagination) et fabriquent de faux échecs — `Test timed out in 5000ms` sur les tests d'UI lents (`CollectionMetadataForm`, ~2,1 s en chaud ; `ModelsManagerPage`, ~0,6 s) et `AbortError` sans ligne d'assertion attribué au hasard. Le budget par défaut (5 s, aucun `testTimeout` dans `vite.config.ts`) est wall-clock et pendu au thread du worker : il expire d'un coup dès que le process est gelé. Toute mesure de stabilité se fait donc suite par suite (`pgrep -fa vitest` avant de lancer) ; sinon elle ne prouve rien. Ce budget n'est pas relevé à ce jour — ouverture [roadmap Q8](./roadmap.md).
