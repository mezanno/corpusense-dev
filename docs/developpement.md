# Guide développeur

_Dernière vérification contre le code : 2026-10-08. Architecture : [architecture.md](./architecture.md)._

## 1. Démarrage

Prérequis : **Node.js ≥ 22**, **npm ≥ 10**.

```bash
git clone https://github.com/mezanno/corpusense-dev.git
cd corpusense-dev && npm install
npm run dev        # Vite, http://localhost:5173
```

Un `.env` de développement est présent à la racine ; surchargez localement via `.env.local`. Variables : voir [architecture.md §9](./architecture.md).

### Commandes de vérification (le contrôle qualité du dépôt)

```bash
npx tsc --noEmit -p tsconfig.app.json   # types
npx vitest run                          # tests
npx eslint src                          # lint
npx prettier . --check                  # format
```

Autres scripts utiles : `npm run build` (generate-env → tsc -b → vite build), `npm run preview`, `npm run test:coverage`, `npm run lint-fix`, `npm run format-fix`.

## 2. Conventions

- **Alias `@/`** obligatoire pour les imports internes (`@/data/models/…`).
- **Erreurs** : subclasser `BaseError` avec contexte JSON ; jamais `new Error` hors liste blanche ESLint (règle `no-restricted-syntax`, voir D-002). `NotFoundError`, pas l'alias déprécié `EntityNotFoundError`.
- **Résultats attendus** : `FunctionResult<T, E>` aux frontières de commande ; l'absence est une valeur (`undefined`, `[]`), pas une erreur (D-002).
- **Repository ≠ DAO** : le vocabulaire exact est dans `CONTEXT.md` ; tout accès passe par `dbFactory.ts`.
- **Tests co-localisés** dans `__tests__/` à côté de la source ; composants testés via les rôles accessibles et `user-event` (D-010). Ce qui touche un repository se teste avec `fake-indexeddb` sur le vrai stack Dexie (D-004 ; dépendance et harnais à venir — roadmap R3.1).
- **Nommage de fichiers** : PascalCase pour les composants, kebab-case autorisé uniquement dans `components/ui/` (fichiers shadcn régénérés).
- **Zod** : toute entité persistée complexe a son schéma (`.strict()` là où c'est déjà le cas).
- **i18n** : les chaînes UI passent par les clés ; le mock de test renvoie les clés à l'identique, donc les tests vérifient les clés.
- **Sous-répertoire** : ne jamais hardcoder d'URL absolue — utiliser `VITE_BASE_PATH` et les helpers de `useAppNavigation`.

## 3. Harnais de test (à connaître avant de toucher les tests)

- `vitest.setup.ts` : stub `ResizeObserver` (**requis** par `@dnd-kit/dom` — sans lui, 8 fichiers ne se chargent plus), stub `matchMedia`, mock WebGL via `vitest-webgl-canvas-mock`.
- Mock i18n : `src/__tests__/react-i18next.ts` (alias du paquet réel via vite.config) exporte `useTranslation` **et** `Trans`.
- Baseline mesurée 2026-10-08 : tsc vert ; 24 fichiers / 82 tests verts (1 fichier ignoré : `ManifestDetails.test.tsx`, un seul `it.todo`) ; ESLint `src` : 48 erreurs / 2 warnings (backlog roadmap Q1).

## 4. Guides

### Ajouter une route

1. Clé dans `CorpusenseRoutes` (`src/hooks/useAppNavigation.tsx`) + helper `goTo…()`.
2. Page dans `src/pages/`.
3. `<Route …>` dans `App.tsx` sous `<Route element={<Layout />}>`.

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

| Je veux…                               | Regarder                                                      |
| -------------------------------------- | ------------------------------------------------------------- |
| Ajouter/modifier une page ou route     | `src/pages/`, `src/App.tsx`, `src/hooks/useAppNavigation.tsx` |
| Modifier le visualiseur / l'annotation | `src/components/canvasViewer/CanvasViewerOSD*.tsx`            |
| Modifier le schéma de base             | `src/data/repositories/indexeddb/db.ts`                       |
| Ajouter un accesseur de données        | `src/data/repositories/indexeddb/` + `dbFactory.ts`           |
| Ajouter un worker / importer           | `src/state/sagas/plugins/`                                    |
| Modifier les types métier              | `src/data/models/`                                            |
| Suivi jobs distribués                  | `src/hooks/useJobRealtime.tsx`, `src/utils/supabase.ts`       |
| Configuration / clés API               | `src/utils/config.ts`, `src/components/configuration/`        |
| Build, PWA, chunks                     | `vite.config.ts`                                              |
| Déploiement                            | `.github/workflows/gh-pages.yml`                              |

## 5. Pièges connus

1. **Migrations Dexie** : `.upgrade()` ne fait que le structurel ; la migration `storedManifests/convertedFiles → sources` est déclenchée manuellement depuis l'UI (`migrateAllSources()`). Toujours figer l'ordre des tableaux avant de supprimer un champ de tri (cf. v31).
2. **Mock i18n** : ajouter une fonction i18n utilisée par un composant testé ⇒ l'ajouter au mock, sinon l'import explose.
3. **Plugins expérimentaux** : invisibles tant que le drapeau `experimental_features` (localStorage) est désactivé.
4. **Deux registries de plugins** : `App.tsx` (UI) et `sagas/workers.ts` (exécution) chargent chacun leur copie — dette roadmap Q6.
5. **Imports transverses interdits** (future règle de lint d'architecture, roadmap Q4) : `src/data/**` ne doit rien importer de `@/App` ni des stores UI ; deux violations existent (`data/utils/plugins.ts`, `data/models/worker/worker.utils.ts`).
6. **Documentation de l'app** : `DocumentationPage` sert les Markdown de `public/doc/` listés dans `index.json` — la doc technique n'y a pas sa place (voir [README.md](./README.md)).
