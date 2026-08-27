# Result Pattern — Analyse pour Corpusense

## Contexte

Le **Result pattern** (ou _Either_ dans la tradition fonctionnelle) consiste à représenter le résultat d'une opération faillible comme une valeur discriminée `{ ok: true, value: T } | { ok: false, error: E }` plutôt que de propager les erreurs par exceptions. Ce document évalue son opportunité dans Corpusense à partir d'un audit des patterns de gestion d'erreurs actuels.

Aucune librairie Result (`neverthrow`, `fp-ts`, `oxide.ts`, `ts-results`, etc.) n'est présente dans le projet.

---

## État actuel — Audit des patterns d'erreurs

Le codebase utilise **cinq patterns distincts**, coexistant sans standard unifié.

### Pattern A — `try/catch → pushError` via Redux _(dominant)_

```ts
// useCollections.tsx — répété ~8 fois dans ce seul fichier
const createCollection = async (name: string) => {
  try {
    await collectionRepository.create({ id: uuid(), name, ... });
    appDispatch(pushInfo(i18n.t('toast_collection_created')));
  } catch (e) {
    appDispatch(pushError(getErrorMessage(e)));
  }
};
```

`getErrorMessage` (importé dans **27 fichiers**) est le seul point de normalisation. Il détruit toute information de type : `error instanceof Error ? error.message : String(error)`.

### Pattern B — `console.warn(e)` : absorption silencieuse _(le plus dangereux)_

```ts
// useAnnotationActions.tsx
const updateAnnotation = async (annotation: Annotation) => {
  try {
    await annotationRepository.update(annotation);
    appDispatch(pushInfo(...));
  } catch (e) {
    console.warn(e);  // l'utilisateur ne sait pas que la sauvegarde a échoué
  }
};

const duplicateRegions = async (payload) => {
  try {
    // 40 lignes de logique
  } catch (e) {
    console.warn(e);  // 40 lignes de défaillances potentielles, toutes ignorées
  }
};
```

### Pattern C — `WorkerResponse` : un Result ad hoc _(pattern déjà en place)_

Le système de plugins Worker a indépendamment inventé un type discriminé :

```ts
// src/data/models/Worker.ts
export enum WorkerStatus { COMPLETED, ERROR, INPROGRESS_WITH_ERRORS, ... }
export interface WorkerResponse {
  status: WorkerStatus;
  statusMessage?: string;
  content?: unknown;
}

// Plugin mistral, tesseract, peroocr, etc. — tous suivent ce contrat
export default async function run(task: Task): Promise<WorkerResponse> {
  try {
    // ...
    return { status: WorkerStatus.COMPLETED, content: result };
  } catch (error) {
    return { status: WorkerStatus.ERROR, statusMessage: getErrorMessage(error) };
  }
}
```

L'appelant (`workers.ts` saga) fait un switch sur `taskResult.status`. C'est un Result pattern manuel, non généralisé.

### Pattern D — `throw new Error()` dans les repositories

Les repositories ne retournent jamais `null | undefined` pour une entité absente — ils lèvent :

```ts
// collections.ts, annotations.ts, models.ts, etc.
async getById(id: string): Promise<Collection> {
  const details = await db.collections.get(id);
  if (details === undefined) {
    throw new Error(`Collection with id ${id} not found`);
  }
  return { ...details, content: ... };
}
```

~25 sites de `throw` dans ~10 fichiers de repository. Chaque appelant doit wrapper dans un `try/catch`.

### Pattern E — `addLog(..., 'error')` avec continuation _(import/export)_

```ts
// useCollectionIO.tsx — erreurs non-fatales dans une boucle d'export
try {
  const model = await modelRepository.getById(collection.modelId);
  Object.assign(exportedCollection, { model });
} catch (error) {
  addLog(`Error adding model: ${getErrorMessage(error)}`, 'error');
  // l'exécution continue — le zip est sauvé sans le modèle
}
```

---

## Problèmes identifiés

### 1. Retours mensongers

`createCollectionWithSelection` retourne toujours une valeur, même quand l'écriture en base a échoué :

```ts
const createCollectionWithSelection = async (...): Promise<CollectionDetails> => {
  try {
    await collectionRepository.create({ ... });
    await annotationRepository.addAll(firstAnnotations);
  } catch (e) {
    appDispatch(pushError(getErrorMessage(e)));
    // pas de return ici — continue
  }
  return { ...newCollection, content };  // ← retourné même si le DB write a planté
};
```

Le composant appelant reçoit un objet et pense que tout s'est bien passé.

### 2. Inspection structurelle de l'erreur dans un `catch (e: unknown)`

```ts
// useCollectionImporter.tsx
} catch (e) {
  if (e.name === 'ConstraintError') {
    addLog(t('error_import_collection_already_exists', ...), 'error');
  } else {
    addLog(t('error_import_collection', ...), 'error');
  }
}
```

Pour inspecter le type d'erreur, le code inspecte une propriété de `unknown` sans narrowing TypeScript fiable. C'est le signe le plus clair qu'un type d'erreur structuré est nécessaire.

### 3. Asymétrie dans `useExportActions`

```ts
const exportTextOfCanvas = async (scope: CanvasScope) => {
  const text = await generateTextFromCanvas(...);
  if (text === undefined || text.length === 0) {
    throw new Error(i18n.t('error_export_no_text'));  // propagé sans catch
  }
  try {
    FileSaver.saveAs(...);
  } catch (error) {
    console.error(...);  // absorbé silencieusement
  }
};
```

L'erreur métier (`no text`) provoque une rejection non catchée ; l'erreur IO (`FileSaver`) est silencieuse. Les deux cas nécessitent une réponse utilisateur.

### 4. Inventaire des absorptions silencieuses

| Fonction                        | Erreur absorbée            | Impact                                               |
| ------------------------------- | -------------------------- | ---------------------------------------------------- |
| `updateAnnotation`              | Échec DB update            | **Élevé** — annotation non sauvegardée sans feedback |
| `updateAnnotationOrder`         | Échec DB update            | Moyen                                                |
| `duplicateRegions`              | Échec duplication complète | **Élevé**                                            |
| `duplicateAnnotationsToPages`   | Erreurs dans la boucle     | **Élevé**                                            |
| `exportTextOfCollection`        | Échec export fichier       | Moyen                                                |
| `exportTextOfCanvas` (IO)       | Échec FileSaver            | Moyen                                                |
| `removeWorker` / `removeResult` | Aucun try/catch            | Moyen                                                |

---

## Le Result pattern peut-il améliorer le code ?

**Oui, dans des zones ciblées.** Mais son adoption globale (104 sites estimés) serait disproportionnée. La valeur réelle est concentrée sur les cas où la distinction `ok / err` change le comportement de l'appelant — pas là où le comportement est toujours le même (logger l'erreur et continuer).

---

## Où l'adopter — Par ordre de priorité

### Priorité 1 — Repositories `getById` : `Result<T, NotFoundError>`

**Pourquoi ici ?** Chaque `getById` lève une exception pour un cas _attendu et structurel_ : l'entité demandée n'existe pas. Ce n'est pas une erreur système — c'est un cas métier. Chaque appelant wrappant dans un `try/catch` est du boilerplate inutile.

**Type d'erreur à créer :**

```ts
// src/data/repositories/indexeddb/errors.ts
export type NotFoundError = { kind: 'NotFound'; id: string; entity: string };
export type ConstraintError = { kind: 'ConstraintError'; detail: string };
export type RepositoryError = NotFoundError | ConstraintError;

// Type Result local — zéro dépendance
export type Result<T, E = RepositoryError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

**Avant / après sur `getById` :**

```ts
// Avant — dans collections.ts
async getById(id: string): Promise<Collection> {
  const details = await db.collections.get(id);
  if (details === undefined) throw new Error(`Collection with id ${id} not found`);
  return { ...details, content: ... };
}

// Après
async getById(id: string): Promise<Result<Collection, NotFoundError>> {
  const details = await db.collections.get(id);
  if (details === undefined) return err({ kind: 'NotFound', id, entity: 'Collection' });
  return ok({ ...details, content: ... });
}
```

**Impact dans le hook appelant :**

```ts
// Avant
try {
  const collection = await collectionRepository.getById(id);
  appDispatch(pushInfo(...));
} catch (e) {
  appDispatch(pushError(getErrorMessage(e)));
}

// Après — le compilateur force la gestion des deux cas
const result = await collectionRepository.getById(id);
if (!result.ok) {
  appDispatch(pushError(i18n.t('error_collection_not_found', { id: result.error.id })));
  return;
}
const collection = result.value;
appDispatch(pushInfo(...));
```

**Avantage principal :** les messages d'erreur peuvent être traduits avec contexte (`id`, `entity`) au lieu d'afficher le message brut de l'exception JS.

---

### Priorité 2 — `createCollectionWithSelection` : supprimer le retour mensonger

```ts
// Avant — toujours un objet, même si le DB write a échoué
const createCollectionWithSelection = async (...): Promise<CollectionDetails>

// Après
const createCollectionWithSelection = async (...): Promise<Result<CollectionDetails, string>> => {
  try {
    await collectionRepository.create({ ... });
    await annotationRepository.addAll(firstAnnotations);
    return ok({ ...newCollection, content });
  } catch (e) {
    return err(getErrorMessage(e));
  }
};
```

L'appelant peut alors prendre une décision :

```ts
const result = await createCollectionWithSelection(action);
if (!result.ok) {
  appDispatch(pushError(result.error));
  return;
}
navigate(CorpusenseRoutes.collectionInspector(result.value.id));
```

---

### Priorité 3 — `useCollectionImporter` : typer les erreurs de `ConstraintError`

Remplacer l'inspection `e.name === 'ConstraintError'` par un type d'erreur structuré retourné par le repository :

```ts
// Avant — collectionRepository.create lève, on inspecte e.name
try {
  await collectionRepository.create(collection);
} catch (e) {
  if (e.name === 'ConstraintError') { ... } else { ... }
}

// Après — create retourne Result<void, ConstraintError | RepositoryError>
const result = await collectionRepository.create(collection);
if (!result.ok) {
  if (result.error.kind === 'ConstraintError') {
    addLog(t('error_import_collection_already_exists', ...), 'error');
  } else {
    addLog(t('error_import_collection', ...), 'error');
  }
  return;
}
```

TypeScript garantit l'exhaustivité du switch — si un troisième type d'erreur est ajouté plus tard, le compilateur signale les branches manquantes.

---

### Priorité 4 — Uniformiser avec `WorkerResponse`

Le pattern `WorkerResponse` déjà en place est un Result manuel. Il peut être aligné sur le type `Result<T, E>` partagé sans changer les plugins :

```ts
// Avant — deux discriminants séparés
export interface WorkerResponse {
  status: WorkerStatus;
  statusMessage?: string;
  content?: unknown;
}

// Après — aliasé sur le type commun
export type WorkerResult<T> = Result<T, { message: string; status: WorkerStatus }>;
```

Cela unifie le pattern déjà utilisé dans les 6 plugins avec le reste du code.

---

## Où ne pas l'adopter

| Cas                                                       | Raison                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Hooks avec `try/catch → pushError` uniforme               | Le comportement est identique pour toutes les erreurs — le Result n'apporte rien     |
| `addLog(..., 'error')` + continuation dans les boucles IO | La sémantique de continuation est intentionnelle ; `Result` ne change pas la logique |
| Fonctions utilitaires pures sans side effects             | Pas d'erreur asynchrone, les throws TypeScript suffisent                             |
| Sagas Redux — corps des generators                        | `yield call()` gère déjà la propagation ; les try/catch de sagas sont idiomatiques   |

---

## Librairie externe ou type local ?

### Option A — Type local (zéro dépendance)

```ts
// src/data/repositories/indexeddb/errors.ts — 3 lignes
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const ok  = <T>(value: T): Result<T, never>  => ({ ok: true,  value });
export const err = <E>(error: E): Result<never, E>  => ({ ok: false, error });
```

Suffisant pour les **priorités 1–3** identifiées plus haut. Pas de dépendance externe, compréhensible immédiatement, zéro courbe d'apprentissage.

**Limite :** pas d'utilitaires pour les opérations en chaîne (`.map()`, `.andThen()`) ni pour les `Promise`. Pour les repositories Dexie — qui retournent tous des `Promise` — le check `if (!result.ok)` manuel reste la seule option.

---

### Option B — `neverthrow` (librairie spécialisée)

[neverthrow](https://github.com/supermacro/neverthrow) est la librairie Result la plus répandue pour TypeScript : 7,7k stars, 15K projets utilisateurs, MIT, active (v8.2.0). Elle expose deux types principaux :

- `Result<T, E>` — synchrone
- `ResultAsync<T, E>` — wrap d'un `Promise<Result<T, E>>`, chaînable sans `await`

#### Ce qu'elle apporte au-delà du type local

**`ResultAsync.fromPromise`** — enrober un appel Dexie en une ligne :

```ts
// Avant
async getById(id: string): Promise<Result<Collection, NotFoundError>> {
  const details = await db.collections.get(id);
  if (details === undefined) return err({ kind: 'NotFound', id, entity: 'Collection' });
  return ok({ ...details, content: ... });
}

// Avec neverthrow
import { ResultAsync, errAsync } from 'neverthrow';

getById(id: string): ResultAsync<Collection, NotFoundError> {
  return ResultAsync.fromPromise(
    db.collections.get(id).then(details => {
      if (!details) throw new Error();
      return { ...details, content: ... };
    }),
    () => ({ kind: 'NotFound' as const, id, entity: 'Collection' })
  );
}
```

**`safeTry`** — équivalent de l'opérateur `?` de Rust, élimine les `if (!result.ok) return` répétitifs dans les fonctions multi-étapes :

```ts
// useCollectionImporter — importCollection avec 6 modes d'échec
import { safeTry, ok, err } from 'neverthrow';

const importCollection = (json: unknown) =>
  safeTry(async function* () {
    const parsed   = yield* (await parseImportedCollection(json)).mapErr(toParseError);
    const created  = yield* (await collectionRepository.create(parsed)).mapErr(toCreateError);
    const withModel = yield* (await importModel(parsed)).mapErr(toModelError);
    return ok({ ...created, ...withModel });
  });
```

Chaque `yield*` court-circuite et retourne l'erreur si le résultat est `Err`, sans `if` explicite.

**`Result.combine`** — agréger plusieurs opérations parallèles :

```ts
// Importer tags, sources et modèle en parallèle, collecter toutes les erreurs
const result = Result.combineWithAllErrors([
  await importTags(collection),
  await importSources(collection),
  await importModel(collection),
]);
if (result.isErr()) {
  result.error.forEach(e => addLog(e.message, 'error'));
}
```

**`eslint-plugin-neverthrow`** — force le traitement du résultat (`.match()`, `.unwrapOr()`, ou `._unsafeUnwrap()`). Mécaniquement, cela empêche le pattern B (absorption silencieuse) à la compilation.

#### Inconvénients dans le contexte de Corpusense

**1. Changement de style omniprésent.** Le codebase est écrit en `async/await` impératif. Les chaînes `.andThen().map().mapErr()` de neverthrow introduisent un style fonctionnel qui coexisterait avec le style existant sans cohérence. Les développeurs devraient connaître les deux.

```ts
// Style actuel — lisible, familier
const collection = await collectionRepository.getById(id);
const annotations = await annotationRepository.getByScope(scope);

// Style neverthrow — rupture de paradigme
const result = await collectionRepository.getById(id)
  .andThen(col => annotationRepository.getByScope({ ...scope, collectionId: col.id }))
  .map(annotations => ({ collection: col, annotations }));  // col hors scope ici !
```

**2. Friction avec Redux-Saga.** Les sagas utilisent des `yield call()` effects. `ResultAsync` n'est pas compatible avec le système d'effects de redux-saga — il faudrait `yield call(() => resultAsync)` ce qui perd le bénéfice du chaînage.

**3. Migration partielle = dette double.** Si seuls les repositories migrent vers `ResultAsync` (priorité 1), les hooks appelants restent en `async/await` et font `const result = await repo.getById(id); if (!result.ok) ...`. C'est exactement ce que ferait le type local — sans bénéfice supplémentaire de neverthrow.

**4. Dexie `useLiveQuery` non concerné.** Les `LiveRepository` (50% des accès données) retournent des thunks `() => Promise<T>` consommés par `useLiveQuery`. Ce pattern ne peut pas être wrappé dans `ResultAsync` sans casser la réactivité Dexie.

---

### Option C — `ts-results`

[ts-results](https://github.com/vultix/ts-results) est une implémentation TypeScript des types Rust `Result` et `Option` : 1,4k stars, MIT.

**Problème bloquant : projet inactif.** Le dernier commit significatif date de 4 ans. L'API ne couvre que le cas synchrone — **pas de support async** (`ResultAsync` n'existe pas). Pour un codebase qui est entièrement `async/await` + Dexie + Supabase, c'est rédhibitoire.

**Différence d'API notable :** la valeur s'accède via `result.val` (pas `.value`), et le discriminant est `result.ok` / `result.err` — un choix différent de neverthrow qui peut surprendre.

```ts
// ts-results
const result = getById(id);
if (result.ok) {
  console.log(result.val);  // ← .val, pas .value
}
```

**Verdict : éliminé.** Pas de support async et projet abandonné.

---

### Option D — `true-myth`

[true-myth](https://github.com/true-myth/true-myth) fournit trois types : `Maybe<T>`, `Result<T, E>`, et `Task<T, E>`. 1,4k stars, 22K dépendants, MIT, très actif (v9.4.0, dernière release il y a 3 mois). C'est la librairie la plus proche de neverthrow en termes de proposition de valeur.

**Ce que `Task` apporte en plus de `ResultAsync` :**

`Task<T, E>` est un type dédié aux opérations asynchrones faillibles — conceptuellement équivalent à `ResultAsync` de neverthrow, mais pensé comme un type de première classe plutôt que comme un wrapper de `Promise` :

```ts
import { Task } from 'true-myth/task';
import { Result } from 'true-myth/result';

// Task.tryOrElse wraps a Promise-returning function
const getById = (id: string): Task<Collection, NotFoundError> =>
  Task.tryOrElse(
    () => db.collections.get(id).then(d => {
      if (!d) throw new Error();
      return d;
    }),
    () => ({ kind: 'NotFound' as const, id, entity: 'Collection' })
  );
```

**ESLint plugin natif** (`@true-myth/eslint-plugin`) avec deux règles :

- `must-use` — interdit d'ignorer un `Result` ou un `Task`
- `must-await-task` — interdit de ne pas `await` un `Task`

**Contrainte technique :** true-myth exige `"type": "module"` dans `package.json` et `moduleResolution: "Node16"` ou supérieur dans `tsconfig`. Le projet Corpusense utilise Vite qui gère l'ESM nativement, mais il faudrait vérifier la compatibilité avec les imports CommonJS de Dexie et redux-saga.

**Verdict :** concurrent sérieux de neverthrow, légèrement plus opinioné sur le format des modules. Le `Task` est conceptuellement plus propre que `ResultAsync`. À envisager si neverthrow est retenu mais que son modèle `Promise`-wrapping pose des problèmes pratiques.

---

### Option E — `fp-ts` → Effect

**`fp-ts`** (11,5k stars, 410K dépendants) est historiquement la référence du FP en TypeScript. Il expose un type `Either<E, A>` (gauche = erreur, droite = valeur) avec une API de composition fonctionnelle complète.

**Important : fp-ts est officiellement abandonné.** L'auteur (Giulio Canti) a rejoint l'organisation Effect-TS et a annoncé que `fp-ts v3` n'existera pas — **Effect-TS est le successeur désigné**. Dernière release fp-ts : il y a 2 ans. À ne pas adopter pour un nouveau projet.

---

**`Effect`** (Effect-TS, 15,2k stars, 50K dépendants, MIT, extrêmement actif) est un framework applicatif complet pour TypeScript : gestion d'erreurs typées, injection de dépendances, concurrence structurée, observabilité, HTTP, schema validation, etc.

Son type de base `Effect<A, E, R>` encode trois dimensions : le type de succès `A`, le type d'erreur `E`, et les _requirements_ (dépendances) `R`. C'est à la fois un Result pattern, un système d'effets, et un conteneur IoC en un seul type.

```ts
// Effect — chaque opération est un programme déclaratif
const getCollection = (id: string): Effect.Effect<Collection, NotFoundError, DatabaseService> =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const row = yield* Effect.tryPromise({
      try: () => db.collections.get(id),
      catch: () => ({ kind: 'NotFound' as const, id, entity: 'Collection' }),
    });
    if (!row) return yield* Effect.fail({ kind: 'NotFound' as const, id, entity: 'Collection' });
    return row;
  });
```

**Pertinence pour Corpusense :** Effect résoudrait simultanément le Result pattern _et_ l'injection de dépendances (Action 1 du document 12). Mais c'est une réécriture de l'architecture entière — le modèle impératif `async/await` est fondamentalement incompatible avec le style Effect. C'est un engagement à l'échelle du projet, pas une migration incrémentale.

**Verdict : hors scope.** Effect est pertinent pour les projets construits autour de lui dès le départ. L'adopter dans un codebase existant de cette taille représenterait plusieurs mois de migration.

---

### Comparatif global

| Critère                                      | Type local | neverthrow       | ts-results     | true-myth   | fp-ts           | Effect          |
| -------------------------------------------- | ---------- | ---------------- | -------------- | ----------- | --------------- | --------------- |
| Stars GitHub                                 | —          | 7,7k             | 1,4k           | 1,4k        | 11,5k           | 15,2k           |
| Activité                                     | —          | Active           | **Abandonnée** | Active      | **Abandonnée**  | Active          |
| Bundle (gzip)                                | 0 B        | ~5 KB            | ~3 KB          | ~5 KB       | ~20 KB          | ~200 KB+        |
| Courbe d'apprentissage                       | Nulle      | Faible           | Nulle          | Faible      | **Élevée**      | **Très élevée** |
| Support async natif                          | ❌         | ✅ `ResultAsync` | ❌             | ✅ `Task`   | ⚠️ `TaskEither` | ✅ natif        |
| `fromPromise` / wrap Dexie                   | ❌         | ✅               | ❌             | ✅          | ⚠️              | ✅              |
| Chaînes multi-étapes (`safeTry` / `gen`)     | ❌         | ✅               | ❌             | ❌          | ⚠️ `Do`         | ✅              |
| `combine` résultats parallèles               | ❌         | ✅               | ✅ `all`       | ✅          | ✅              | ✅              |
| ESLint plugin anti-swallow                   | ❌         | ✅ optionnel     | ❌             | ✅ natif    | ❌              | ❌              |
| Compatible sagas Redux                       | ✅         | ⚠️ friction      | ✅             | ⚠️ friction | ⚠️              | ❌              |
| Migration incrémentale                       | ✅         | ✅               | ✅             | ✅          | ⚠️              | ❌              |
| Recommandé pour 3-4 priorités ciblées        | ✅         | ⚠️               | ❌             | ⚠️          | ❌              | ❌              |
| Recommandé pour adoption étendue (>30 sites) | ❌         | ✅               | ❌             | ✅          | ❌              | ❌              |

### Verdict sur le choix de librairie

**Pour une migration ciblée (priorités 1–3)** : le type local est la meilleure option. Il résout les problèmes identifiés sans introduire de rupture de style, sans dépendance, et avec un coût de migration minimal.

**Pour une adoption étendue** — si le projet décide de couvrir les 30+ sites prioritaires et d'ajouter `eslint-plugin-neverthrow` pour interdire les absorptions silencieuses — neverthrow devient clairement pertinent. La killer feature est `ResultAsync.fromPromise` pour wrapper les appels Dexie proprement, et `safeTry` pour les fonctions multi-étapes comme `importCollection`.

La stratégie pragmatique : **commencer avec le type local**, mesurer la valeur sur les priorités 1–3, et migrer vers neverthrow si le pattern se généralise naturellement au-delà.

---

## Résumé des gains attendus

| Problème                                            | Sans Result                                            | Avec Result                                                            |
| --------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Retour mensonger de `createCollectionWithSelection` | Toujours `CollectionDetails`, même après échec         | `Result<CollectionDetails, E>` — compilateur force la vérification     |
| Inspection `e.name === 'ConstraintError'`           | Non typé, fragile                                      | `result.error.kind === 'ConstraintError'` — exhaustivité compilée      |
| Messages d'erreur sans contexte                     | `"Collection with id xxx not found"` (message JS brut) | `i18n.t('error_not_found', { entity, id })` — traduisible avec données |
| Absorptions silencieuses (`console.warn`)           | Erreurs invisibles                                     | Non adressé par le Result seul — nécessite une décision de design      |
| Cohérence avec `WorkerResponse`                     | Pattern ad hoc isolé                                   | Peut être aliasé sur le type commun                                    |

---

## Recommandation

1. **Créer `src/data/repositories/indexeddb/errors.ts`** avec le type `Result<T, E>` local (3 lignes) et les types d'erreur structurés (`NotFoundError`, `ConstraintError`). Zéro dépendance externe.

2. **Migrer les `getById` des repositories** vers `Result<T, NotFoundError>` — c'est le changement le plus rentable (25 sites producteurs, ~20 sites consommateurs).

3. **Corriger `createCollectionWithSelection`** pour retourner un `Result` honnête.

4. **Corriger les absorptions silencieuses** (`console.warn` dans `useAnnotationActions`) indépendamment du Result pattern — c'est un bug UX, pas un problème de typage.

5. **Ne pas migrer** les `try/catch → pushError` uniformes qui ne bénéficient d'aucune discrimination d'erreur.

---

## Implémentation réalisée

La mise en place du Result Pattern a été formalisée et intégrée dans le projet.

### 1. Modules d'infrastructure

#### `src/utils/functionResult.ts` (et `src/utils/result.ts`)

Le type `FunctionResult<T, E>` (ou `Result<T, E>`) et son objet namespace associé regroupent les constructeurs et combinateurs fondamentaux :

```ts
export type FunctionResult<T, E = BaseError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const FunctionResult = {
  // Constructeurs
  ok: <T>(value: T): FunctionResult<T, never> => ({ ok: true, value }),
  err: <E>(error: E): FunctionResult<never, E> => ({ ok: false, error }),

  // Transforme la valeur si OK
  map: <T, U, E>(result: FunctionResult<T, E>, fn: (val: T) => U): FunctionResult<U, E> =>
    result.ok ? FunctionResult.ok(fn(result.value)) : result,

  // Chaîne une autre opération qui renvoie un FunctionResult (flatMap)
  flatMap: <T, U, E>(
    result: FunctionResult<T, E>,
    fn: (val: T) => FunctionResult<U, E>
  ): FunctionResult<U, E> => (result.ok ? fn(result.value) : result),

  // Extrait la valeur ou renvoie une valeur par défaut en cas d'erreur
  unwrapOr: <T, E>(result: FunctionResult<T, E>, fallback: T): T =>
    result.ok ? result.value : fallback,

  // Pattern matching pour exécuter un callback selon le résultat
  match: <T, E, R>(
    result: FunctionResult<T, E>,
    handlers: { ok: (value: T) => R; err: (error: E) => R }
  ): R => (result.ok ? handlers.ok(result.value) : handlers.err(result.error)),

  // Enrobe une Promise/fonction async pour capturer les exceptions inattendues
  fromPromise: async <T, E = BaseError>(
    promise: Promise<T>,
    onError: (error: unknown) => E
  ): Promise<FunctionResult<T, E>> => {
    try {
      const data = await promise;
      return FunctionResult.ok(data);
    } catch (e) {
      return FunctionResult.err(onError(e));
    }
  },
};
```

#### Erreurs Métier (`src/data/repositories/EntityNotFoundError.ts`)

Les erreurs héritent de `BaseError` pour conserver le typage et le contexte :

```ts
export class EntityNotFoundError extends BaseError {
  constructor(context: { entity: string; id: string }) {
    super(`${context.entity} with id ${context.id} not found`);
  }
}
```

---

### 2. Exemples d'utilisation concrets dans ton projet

#### Cas 1 : Gestion différenciée et Pattern Matching (`FunctionResult.match`)

Dans les hooks ou actions déclenchées par l'interface utilisateur, `match` permet de séparer proprement la branche succès (`ok`) de la branche erreur (`err`) sans accumuler de blocs `if (!result.ok)` :

```ts
// src/hooks/data/export/useExportActions.tsx
const exportTextOfCollection = async (collectionId: string) => {
  const textResult = await generateTextForCollection(collectionId);

  FunctionResult.match(textResult, {
    ok: (text) => {
      FileSaver.saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'exported_text.txt');
    },
    err: (error) => {
      console.error('Error generating text:', getErrorMessage(error));
      // Exemple : notification toast via Redux
      // appDispatch(pushError(getErrorMessage(error)));
    },
  });
};
```

#### Cas 2 : Extraction de valeur par défaut avec `FunctionResult.unwrapOr`

Lorsque l'absence de données ne constitue pas un blocage majeur et qu'une valeur de fallback (ex. tableau vide) est adaptée :

```ts
// src/hooks/data/sources/useLiveSources.tsx
const collectionSourceIdsArrays = await Promise.all(
  allCollectionIds.map(async (collectionId) =>
    FunctionResult.unwrapOr(
      await collectionRepository.getSourceIdsByCollectionId(collectionId),
      []
    )
  )
);
```

#### Cas 3 : Transformation directe de données avec `FunctionResult.map`

Pour manipuler la valeur interne contenue dans un `FunctionResult` sans avoir à le déballer manuellement :

```ts
// src/data/utils/scope.ts
const contains = async (scope: Scope, value: string): Promise<boolean> => {
  const collectionResult = await getCollectionRepository().getById(scope.collectionId);

  // Si collectionResult est ok, on vérifie l'inclusion ; sinon on retourne false par défaut
  return FunctionResult.unwrapOr(
    FunctionResult.map(collectionResult, (c) => c.name.toLowerCase().includes(value.toLowerCase())),
    false
  );
};
```

#### Cas 4 : Sécurisation d'appels asynchrones / Dexie avec `FunctionResult.fromPromise`

Pour convertir des requêtes de base de données pouvant throw des exceptions système en `FunctionResult` sans blocs `try/catch` répétitifs :

```ts
// src/data/repositories/indexeddb/collections.ts
async getById(id: string): Promise<FunctionResult<Collection, BaseError>> {
  return FunctionResult.fromPromise(
    (async () => {
      const details = await db.collections.get(id);
      if (!details) {
        throw new EntityNotFoundError({ entity: 'Collection', id });
      }
      const content = await db.collectionContents.get(id);
      return { ...details, content: content?.content || [] };
    })(),
    (err) => (err instanceof BaseError ? err : new BaseError(`Database error: ${err}`))
  );
}
```

---

### 3. Récapitulatif des helpers

| Helper                         | Description                                        | Cas d'usage type                                              |
| :----------------------------- | :------------------------------------------------- | :------------------------------------------------------------ |
| `ok(value)` / `err(error)`     | Constructeurs du résultat                          | Retour de fonction faillible dans repositories ou utilitaires |
| `map(res, fn)`                 | Transforme la valeur interne si `ok`               | Transformer les données sans déplier le Result                |
| `flatMap(res, fn)`             | Chaîne une fonction retournant un `Result`         | Séquencement d'opérations faillibles                          |
| `unwrapOr(res, fallback)`      | Extrait la valeur ou renvoie une valeur par défaut | Valeur de secours si l'opération échoue                       |
| `match(res, { ok, err })`      | Pattern matching synchrone                         | Gestion différenciée dans les composants UI ou les hooks      |
| `fromPromise(promise, mapErr)` | Sécurise les fonctions `async` qui peuvent throw   | Enrobage d'appels IndexedDB / API externes                    |

---

### 4. Périmètre de la refactorisation

Les composants et services suivants ont été migrés pour retourner ou consommer des `FunctionResult` :

1. **Repositories IndexedDB (`IndexedDBCollectionRepository`)** :
   - `getById(id)` → `Promise<FunctionResult<Collection, EntityNotFoundError>>`
   - `getTagsByCollectionId(id)` → `Promise<FunctionResult<Tag[], EntityNotFoundError>>`
   - `getCanvasesByCollectionId(id)` → `Promise<FunctionResult<Canvas[], EntityNotFoundError>>`
   - `getSourceIdsByCollectionId(id)` → `Promise<FunctionResult<string[], EntityNotFoundError>>`
   - `getCanvasByScope(scope)` → `Promise<FunctionResult<CanvasWithSourceId, EntityNotFoundError>>`
   - `deleteElement(collectionId, canvasId)` → `Promise<FunctionResult<Collection, EntityNotFoundError>>`

2. **Utilitaires métier (`src/data/utils/`)** :
   - `export.ts` : `generateManifestFromCollection`, `generateNumberedTextForCollection`, `generateTextForCollection` retournent `Promise<FunctionResult<...>>`.
   - `scope.ts` : `contains` consomme `getById` de façon défensive sans `try/catch`.
   - `modifierChain.ts` : `applyModifiersToScope` vérifie `!canvasesResult.ok`.

3. **Hooks et UI** :
   - `OcrStatus.tsx` : Affiche une boîte de dialogue d'erreur si `!textResult.ok`.
   - `useCollectionIO.tsx` : Contrôle les étapes d'export avec `generateManifestFromCollection`.
   - `useCollections.tsx` : Traitement explicite lors de la suppression et sélection.
   - `useExportActions.tsx` : Gestion des échecs de génération de texte.
   - `useNamedEntities.tsx` & `useLiveSources.tsx` : Remplacement des exceptions par des traitements défensifs explicites.
