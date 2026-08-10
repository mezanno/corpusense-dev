# Injection de dépendances avec Awilix — Analyse pour Corpusense

## Contexte

Ce document évalue l'opportunité d'introduire un conteneur IoC (Inversion of Control) via la librairie [**awilix**](https://github.com/jeffijoe/awilix) dans Corpusense. L'analyse s'appuie sur l'architecture actuelle du projet (React 19 + Dexie 4 + Redux Toolkit + Zustand + Supabase).

---

## Architecture actuelle des dépendances

Le câblage des dépendances repose aujourd'hui sur quatre mécanismes :

| Mécanisme           | Exemples                                                 | Portée                     |
| ------------------- | -------------------------------------------------------- | -------------------------- |
| Imports ES directs  | `dbFactory.ts`, `utils/config.ts`                        | Toute l'app                |
| Factory functions   | `getCollectionRepository()`, `getAnnotationRepository()` | Couche données             |
| Context API React   | `CollectionContext`, `ConnectedUserContext`              | État UI page               |
| Hooks personnalisés | `useCollections`, `useAnnotations`                       | Frontière DAL → composants |

Il n'existe **ni conteneur IoC, ni injection par constructeur, ni registre centralisé**. Les interfaces de repository (`CollectionRepository`, `AnnotationRepository`, etc.) sont bien définies dans `src/data/repositories/indexeddb/types.ts` mais ne sont jamais utilisées comme points d'injection.

---

## Ce qu'apporterait Awilix

### Avantages

#### 1. Isolation des tests sans `vi.mock`

Actuellement, chaque test qui touche un repository doit mocker deux couches :

```ts
vi.mock('@/data/repositories/indexeddb/dbFactory');
vi.mock('@/data/repositories/indexeddb/db');
```

Avec un conteneur awilix, il suffirait de construire un conteneur de test avec des fakes :

```ts
const container = createContainer();
container.register({
  collectionRepository: asValue(fakeCollectionRepository),
  annotationRepository: asValue(fakeAnnotationRepository),
});
```

C'est plus explicite, plus maintenable, et ne dépend pas du mécanisme de stubbing de module de Vitest.

#### 2. Résolution du singleton Supabase

Le client Supabase (`utils/config.ts`) est créé au niveau module et importé dans une dizaine de fichiers. Cela oblige à un stub global dans `vitest.setup.ts`. Un conteneur permettrait d'enregistrer une implémentation `supabase` swappable :

```ts
// prod
container.register({ supabase: asValue(createClient(url, key)) });
// test
container.register({ supabase: asValue(mockSupabaseClient) });
```

#### 3. Registre unique pour les plugins Worker

Actuellement `loadWorkerPlugins()` est appelé deux fois de façon indépendante — dans `App.tsx` et dans `workers.ts` saga — créant deux instances de registre. Un conteneur résoudrait ce problème avec un singleton enregistré une seule fois :

```ts
container.register({
  workerPlugins: asValue(await loadWorkerPlugins()),
});
```

#### 4. Découplage i18n dans les hooks et sagas

`i18n.t()` est importé directement dans les hooks métier et les sagas. L'injecter permettrait de tester la logique business sans dépendance à l'initialisation i18next.

#### 5. Respect du principe d'inversion de dépendances

Les interfaces de repository existent déjà. Awilix fournirait enfin l'infrastructure pour les utiliser comme contrats d'injection, rendant le remplacement d'une implémentation (ex : migration de Dexie vers une autre base locale) trivial.

#### 6. Cycle de vie centralisé

Awilix distingue les portées `SINGLETON`, `SCOPED` et `TRANSIENT`. Les repositories IndexedDB, qui ne portent pas d'état, peuvent être `SINGLETON` (une instance partagée) alors qu'aujourd'hui `getXxxRepository()` crée une nouvelle instance à chaque appel.

---

### Inconvénients et risques

#### 1. Friction avec le paradigme React (hooks / Context)

React a ses propres mécanismes d'injection : Context API, hooks, `QueryClientProvider`. Awilix est une solution Node/backend-first. Brancher un conteneur awilix dans React impose de le distribuer via un `Context` ou un `Provider`, ce qui est une couche supplémentaire sur une couche existante.

Le pattern naturel React (`useCollections()` → `getCollectionRepository()`) n'est pas aligné avec le pattern awilix (`container.resolve('collectionRepository')`). Les deux coexisteraient sans standard clair.

#### 2. Complexité disproportionnée pour la nature du projet

Awilix est conçu pour des architectures N-tiers (serveurs Express, NestJS, etc.) où le conteneur gère des services avec des cycles de vie complexes (connexions DB, pools, scoped par requête HTTP). Dans Corpusense :

- Dexie est une base locale embarquée dans le navigateur — pas de pool de connexions à gérer.
- Les repositories ne portent pas d'état, ils délèguent directement à `db`.
- Redux Saga déjà gère l'orchestration asynchrone des effets.

Le problème de "qui crée les dépendances" est localisé à `dbFactory.ts` et `utils/config.ts` — deux fichiers — et non à une architecture distribuée.

#### 3. Rupture avec `useLiveQuery` / réactivité Dexie

Le pattern principal de lecture de données dans Corpusense est :

```ts
const data = useLiveQuery(liveRepository.getAll(), [], []);
```

Les `LiveRepository` retournent des **thunks** (fonctions `() => Promise<T>`) que `useLiveQuery` souscrit via le système d'observateurs de Dexie. Injecter ces repositories via awilix ne changerait rien à la contrainte : le hook doit toujours recevoir une instance de `IndexedDBXxxLiveRepository` (pas d'une interface générique) car `useLiveQuery` dépend du tracking interne de Dexie, qui ne peut pas être abstrait sans casser la réactivité.

#### 4. Sagas Redux et l'intégration awilix

Les sagas accèdent aujourd'hui aux repositories via des imports directs dans des `call()` effects. Injecter via awilix dans une saga nécessiterait soit :

- De passer le conteneur en `context` Redux-Saga (`sagaMiddleware.run(rootSaga, { container })`), ce qui est peu conventionnel.
- Ou de convertir les appels de repository en selectors/channels, ce qui serait un refactoring majeur.

#### 5. Bundle size et overhead runtime

Awilix pèse ~15 KB (minifié+gzippé). Pour une PWA locale-first orientée performance, ce n'est pas rédhibitoire mais mérite d'être mis en balance avec le bénéfice réel.

#### 6. Courbe d'apprentissage

Le modèle mental awilix (registration, resolution, scoping, proxy vs classic mode) est une complexité additionnelle pour l'équipe. Le projet a déjà 4 mécanismes de gestion d'état (Redux, Sagas, Zustand, React Query) — en ajouter un cinquième pour les services accroît la charge cognitive.

---

## Comparaison avec des alternatives plus légères

| Approche                                  | Effort | Bénéfice test | Couplage | Note                                           |
| ----------------------------------------- | ------ | ------------- | -------- | ---------------------------------------------- |
| **Statu quo** (`dbFactory` + `vi.mock`)   | 0      | Actuel        | Élevé    | Fonctionne mais fragile                        |
| **`useRepositories()` hook + Context**    | Faible | Élevé         | Faible   | Pattern React natif, swap en test via Provider |
| **Awilix complet**                        | Élevé  | Élevé         | Faible   | Surpuissant pour le contexte browser           |
| **Injecter via Redux-Saga context**       | Moyen  | Moyen         | Moyen    | Résout la saga, pas les hooks                  |
| **Paramétrer les hooks (props drilling)** | Moyen  | Moyen         | Moyen    | Trop verbeux                                   |

L'alternative **`useRepositories()` hook + Context** est la plus alignée avec React et résoudrait 80 % des problèmes de testabilité sans introduire de dépendance externe :

```tsx
// RepositoryContext.tsx
const RepositoryContext = createContext<Repositories>(defaultRepositories);
export const useRepositories = () => useContext(RepositoryContext);

// Dans les tests
<RepositoryContext.Provider value={fakeRepositories}>
  <ComponentUnderTest />
</RepositoryContext.Provider>
```

---

## Verdict

| Critère                               | Awilix                                     |
| ------------------------------------- | ------------------------------------------ |
| Améliore la testabilité               | ✅ Oui                                     |
| Adapté à l'architecture React/browser | ⚠️ Partiellement                           |
| Compatible avec `useLiveQuery`        | ❌ Non (couche de réactivité incompatible) |
| Compatible avec Redux-Saga            | ⚠️ Avec friction                           |
| Proportionné à la taille du problème  | ❌ Non                                     |
| Nécessite refactoring profond         | ✅ Oui (coût élevé)                        |

**Recommandation : ne pas adopter Awilix.**

Le vrai problème n'est pas l'absence d'un conteneur IoC, mais l'absence d'un **point d'injection stable pour les repositories**. Ce problème peut être résolu par un `RepositoryContext` React (voir ci-dessus) et, pour les sagas, par le `context` Redux-Saga — sans dépendance externe, sans rupture de paradigme, et sans incompatibilité avec la réactivité Dexie.

Awilix serait pertinent si le projet migrait vers une architecture serveur (Express, Fastify) ou si le nombre de services à câbler dépassait la dizaine avec des cycles de vie complexes. Ce n'est pas le cas aujourd'hui.

---

## Actions recommandées à la place

### Action 1 — Créer un `RepositoryContext`

**Problème actuel :** chaque hook de données importe directement depuis `dbFactory.ts` et instancie les repositories inline. Les tests doivent mocker deux couches de modules (`dbFactory` + `db`) pour éviter l'initialisation de Dexie :

```ts
// Dans useCollections.tsx — couplage direct
import { getCollectonLiveRepository, getCollectionRepository } from
  '@/data/repositories/indexeddb/dbFactory';

const collectionLiveRepository = useMemo(() => getCollectonLiveRepository(), []);
const collectionRepository    = useMemo(() => getCollectionRepository(), []);
```

```ts
// Dans chaque test qui touche des collections
vi.mock('@/data/repositories/indexeddb/dbFactory');
vi.mock('@/data/repositories/indexeddb/db');
(getCollectionRepository as Mock).mockReturnValue({ create: vi.fn(), ... });
```

**Solution :** un `RepositoryContext` unique qui instancie tous les repositories une seule fois et les expose via un hook `useRepositories()`.

#### Implémentation

```tsx
// src/data/repositories/RepositoryContext.tsx

import { createContext, useContext, type ReactNode } from 'react';
import {
  IndexedDBAnnotationRepository,     IndexedDBAnnotationLiveRepository,
  IndexedDBAnnotationTempRepository,  IndexedDBAnnotationTempLiveRepository,
  IndexedDBCollectionRepository,      IndexedDBCollectionLiveRepository,
  IndexedDBSourceRepository,          IndexedDBSourceLiveRepository,
  IndexedDBTagRepository,             IndexedDBTagLiveRepository,
  IndexedDBModelRepository,           IndexedDBModelLiveRepository,
  IndexedDBNamedEntityRepository,     IndexedDBNamedEntityLiveRepository,
  IndexedDBResultRepository,          IndexedDBResultLiveRepository,
  IndexedDBWorkerRepository,          IndexedDBWorkerLiveRepository,
  IndexedDBProjectRepository,         IndexedDBProjectLiveRepository,
  IndexedDBFSHandleRepository,
  IndexedDBConvertedFileRepository,
  IndexedDBModifierChainRepository,   IndexedDBModifierChainlLiveRepository,
  IndexedDBItemMetadataRepository,
} from './indexeddb';
import type {
  AnnotationRepository,     CollectionRepository,
  SourceRepository,         TagRepository,
  ModelRepository,          NamedEntityRepository,
  ResultRepository,         WorkerRepository,
  ProjectRepository,        FSHandleRepository,
  ConvertedFileRepository,  ModifierChainRepository,
  ItemMetadataRepository,
} from './indexeddb/types';
import type {
  AnnotationLiveRepository,     AnnotationTempLiveRepository,
  CollectionLiveRepository,     SourceLiveRepository,
  TagLiveRepository,            ModelLiveRepository,
  NamedEntityLiveRepository,    ResultLiveRepository,
  WorkerLiveRepository,         ProjectLiveRepository,
  ModifierChainLiveRepository,
} from './indexeddb/liveQuery/types.live';

export interface Repositories {
  // standard
  annotation:     AnnotationRepository;
  annotationTemp: AnnotationTempRepository;
  collection:     CollectionRepository;
  source:         SourceRepository;
  tag:            TagRepository;
  model:          ModelRepository;
  namedEntity:    NamedEntityRepository;
  result:         ResultRepository;
  worker:         WorkerRepository;
  project:        ProjectRepository;
  fsHandle:       FSHandleRepository;
  convertedFile:  ConvertedFileRepository;
  modifierChain:  ModifierChainRepository;
  itemMetadata:   ItemMetadataRepository;
  // live (reactive, pour useLiveQuery)
  annotationLive:     AnnotationLiveRepository;
  annotationTempLive: AnnotationTempLiveRepository;
  collectionLive:     CollectionLiveRepository;
  sourceLive:         SourceLiveRepository;
  tagLive:            TagLiveRepository;
  modelLive:          ModelLiveRepository;
  namedEntityLive:    NamedEntityLiveRepository;
  resultLive:         ResultLiveRepository;
  workerLive:         WorkerLiveRepository;
  projectLive:        ProjectLiveRepository;
  modifierChainLive:  ModifierChainLiveRepository;
}

// instances partagées — créées une seule fois
const defaultRepositories: Repositories = {
  annotation:     new IndexedDBAnnotationRepository(),
  annotationTemp: new IndexedDBAnnotationTempRepository(),
  collection:     new IndexedDBCollectionRepository(),
  source:         new IndexedDBSourceRepository(),
  tag:            new IndexedDBTagRepository(),
  model:          new IndexedDBModelRepository(),
  namedEntity:    new IndexedDBNamedEntityRepository(),
  result:         new IndexedDBResultRepository(),
  worker:         new IndexedDBWorkerRepository(),
  project:        new IndexedDBProjectRepository(),
  fsHandle:       new IndexedDBFSHandleRepository(),
  convertedFile:  new IndexedDBConvertedFileRepository(),
  modifierChain:  new IndexedDBModifierChainRepository(),
  itemMetadata:   new IndexedDBItemMetadataRepository(),
  annotationLive:     new IndexedDBAnnotationLiveRepository(),
  annotationTempLive: new IndexedDBAnnotationTempLiveRepository(),
  collectionLive:     new IndexedDBCollectionLiveRepository(),
  sourceLive:         new IndexedDBSourceLiveRepository(),
  tagLive:            new IndexedDBTagLiveRepository(),
  modelLive:          new IndexedDBModelLiveRepository(),
  namedEntityLive:    new IndexedDBNamedEntityLiveRepository(),
  resultLive:         new IndexedDBResultLiveRepository(),
  workerLive:         new IndexedDBWorkerLiveRepository(),
  projectLive:        new IndexedDBProjectLiveRepository(),
  modifierChainLive:  new IndexedDBModifierChainlLiveRepository(),
};

const RepositoryContext = createContext<Repositories>(defaultRepositories);

export function RepositoryProvider({
  children,
  value = defaultRepositories,
}: {
  children: ReactNode;
  value?: Repositories;
}) {
  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

export const useRepositories = () => useContext(RepositoryContext);
```

> **Note sur `defaultRepositories` :** affecter les instances à la valeur par défaut du contexte permet à l'app de fonctionner sans `<RepositoryProvider>` explicite (la valeur par défaut est utilisée). Le provider n'est obligatoire qu'en test, pour passer des fakes.

#### Migration des hooks

```tsx
// useCollections.tsx — avant
import { getCollectonLiveRepository, getCollectionRepository } from
  '@/data/repositories/indexeddb/dbFactory';

const collectionLiveRepository = useMemo(() => getCollectonLiveRepository(), []);
const collectionRepository     = useMemo(() => getCollectionRepository(), []);
```

```tsx
// useCollections.tsx — après
import { useRepositories } from '@/data/repositories/RepositoryContext';

const { collectionLive: collectionLiveRepository, collection: collectionRepository }
  = useRepositories();
// useMemo() supprimé — les instances sont déjà stables (créées une seule fois dans defaultRepositories)
```

#### Isolation en test — sans aucun `vi.mock`

```tsx
// useCollections.test.tsx
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';

const fakeCollectionRepository = {
  create: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn(),
  // ... autres méthodes selon l'interface CollectionRepository
};
const fakeCollectionLiveRepository = {
  getAllDetails: () => () => Promise.resolve([mockCollection]),
};

renderWithProviders(
  <RepositoryProvider value={{ ...defaultRepositories,
    collection:     fakeCollectionRepository,
    collectionLive: fakeCollectionLiveRepository,
  }}>
    <ComponentUnderTest />
  </RepositoryProvider>
);
```

Plus de `vi.mock('@/data/repositories/indexeddb/dbFactory')`, plus de `vi.mock('@/data/repositories/indexeddb/db')`.

#### Intégration dans `App.tsx`

Ajouter `<RepositoryProvider>` au niveau racine (aucun `value` prop nécessaire en prod — les instances par défaut sont utilisées) :

```tsx
// App.tsx
import { RepositoryProvider } from './data/repositories/RepositoryContext';

function App() {
  return (
    <BrowserRouter basename={basePath}>
      <RepositoryProvider>          {/* ← ajout */}
        <QueryClientProvider client={queryClient}>
          {/* ... reste inchangé */}
        </QueryClientProvider>
      </RepositoryProvider>
    </BrowserRouter>
  );
}
```

#### Sagas — injection via `context` Redux-Saga

Les sagas importent aussi des repositories depuis `dbFactory.ts`. Le mécanisme natif de Redux-Saga pour l'injection de services est le `context` du middleware :

```ts
// store.ts
import { defaultRepositories } from '@/data/repositories/RepositoryContext';

const sagaMiddleware = createSagaMiddleware({
  context: { repositories: defaultRepositories },
});
```

```ts
// workers.ts saga — avant
import { getCollectionRepository, getResultRepository, getWorkerRepository }
  from '@/data/repositories/indexeddb/dbFactory';

// dans un effect
const collectionRepo = getCollectionRepository();
```

```ts
// workers.ts saga — après
import { getContext } from 'redux-saga/effects';
import type { Repositories } from '@/data/repositories/RepositoryContext';

// dans un effect
const { collection, result, worker } = yield getContext<Repositories>('repositories');
```

---

### Action 2 — Éliminer la double instanciation de `workerPlugins`

**Problème actuel :** `loadWorkerPlugins()` est appelé deux fois, de façon indépendante, créant deux registres séparés :

```ts
// src/state/sagas/workers.ts — ligne 45
// appelé immédiatement à l'import du module (avant l'init i18n)
export const workerPlugins: Record<string, WorkerPlugin> = loadWorkerPlugins();
```

```ts
// src/App.tsx — lignes 36-42
// appelé APRÈS initI18n() — les plugins ont accès aux traductions
export let workerPlugins: Record<string, WorkerPlugin> = {};

initI18n().then(() => {
  workerPlugins = loadWorkerPlugins();   // ← deuxième instance
});
```

Les **composants** (`StartWorkerForm`, `WorkersMenu`, `useDialog`, `utils/workers.ts`, ...) importent depuis `@/App`, tandis que les **sagas** consomment leur propre variable locale (`workers.ts`). En plus de la double instanciation, les plugins de la saga sont initialisés _avant_ i18n — si un plugin utilise des traductions à l'init, il obtient les clés brutes.

**Solution :** faire de `loadWorkerPlugins()` un singleton garanti, initialisé après i18n, et distribué aux sagas via le `context` Redux-Saga.

#### Étape 1 — Supprimer l'instanciation dans `workers.ts`

```ts
// src/state/sagas/workers.ts — avant
export const workerPlugins: Record<string, WorkerPlugin> = loadWorkerPlugins();
```

```ts
// src/state/sagas/workers.ts — après
// workerPlugins reçu par injection de contexte (voir étape 3)
```

Les fonctions du fichier qui lisent `workerPlugins` directement doivent passer par `getContext()` :

```ts
// handleStartWorkerProcess — avant
function* handleStartWorkerProcess(action: PayloadAction<StartWorkerProcessPayload>) {
  if (workerPlugins[workerName] === undefined) { ... }
  // ...
  const saga = workerPlugins[worker.name];
```

```ts
// handleStartWorkerProcess — après
import { getContext } from 'redux-saga/effects';
import type { WorkerPlugin } from './plugins/loader';

function* handleStartWorkerProcess(action: PayloadAction<StartWorkerProcessPayload>) {
  const workerPlugins: Record<string, WorkerPlugin> = yield getContext('workerPlugins');
  if (workerPlugins[workerName] === undefined) { ... }
  // ...
  const saga = workerPlugins[worker.name];
```

#### Étape 2 — Passer les plugins dans le context du middleware

```ts
// src/state/store.ts — avant
const sagaMiddleware = createSagaMiddleware();
sagaMiddleware.run(getRootSaga());
```

```ts
// src/state/store.ts — après
// Le store est créé d'abord sans plugins...
const sagaMiddleware = createSagaMiddleware();

const store = configureStore({ ... });

// ...puis App.tsx injecte les plugins après initI18n()
export function runSagasWithPlugins(workerPlugins: Record<string, WorkerPlugin>) {
  sagaMiddleware.run(getRootSaga(), { workerPlugins });
}
```

```ts
// src/App.tsx — avant
initI18n().then(() => {
  workerPlugins = loadWorkerPlugins();
  importerPlugins = loadImporterPlugins();
});
```

```ts
// src/App.tsx — après
import { runSagasWithPlugins } from './state/store';

initI18n().then(() => {
  const plugins = loadWorkerPlugins();
  workerPlugins = plugins;            // pour les composants qui importent depuis @/App
  importerPlugins = loadImporterPlugins();
  runSagasWithPlugins(plugins);       // les sagas reçoivent la même instance
});
```

#### Étape 3 — `loadWorkerPluginsInfo` dans la saga

La saga `loadWorkerPluginsInfo` lit aussi `workerPlugins` directement. Même correction via `getContext` :

```ts
// workers.ts — avant
function* loadWorkerPluginsInfo() {
  const pluginsInfo = Object.keys(workerPlugins).map((name) => ({ ... }));
```

```ts
// workers.ts — après
function* loadWorkerPluginsInfo() {
  const workerPlugins: Record<string, WorkerPlugin> = yield getContext('workerPlugins');
  const pluginsInfo = Object.keys(workerPlugins).map((name) => ({ ... }));
```

#### Résultat

|                                       | Avant                    | Après                                                |
| ------------------------------------- | ------------------------ | ---------------------------------------------------- |
| Nombre d'instances de `workerPlugins` | 2                        | 1                                                    |
| Init avant i18n (saga)                | ✅ oui                   | ❌ non                                               |
| Source de vérité pour les composants  | `@/App`                  | `@/App` (inchangé)                                   |
| Source de vérité pour les sagas       | `workers.ts` (locale)    | context Redux-Saga                                   |
| Testabilité des sagas                 | Nécessite mock du module | `sagaMiddleware.run(saga, { workerPlugins: fakes })` |

---

### Action 3 — Passer le client Supabase via `ConnectedUserContext`

Le client Supabase (`utils/config.ts`) est un singleton importé directement dans `ConnectedUserContext`, `useJobRealtime` et `useUserManifests`. Le contexte `ConnectedUserContext` existe déjà — il suffit d'y centraliser l'accès au client pour que les composants consommateurs n'aient plus à l'importer directement.

---

Ces trois actions couvrent 90 % du bénéfice qu'apporterait awilix, avec un coût de migration bien inférieur.
