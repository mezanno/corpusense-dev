# Plan — Error boundaries : audit et étagères de mise en conformité

Suite de `docs/inconsistency-scan-2026-09-29.md` (~77 `throw new Error` coexistant avec la discipline
`FunctionResult`/`BaseError`) et de l'amendement de l'ADR D2 (`foundation/DECISIONS.md`, 2026-10-08).

## Règle opérante (rappel)

Un mode d'échec **attendu et traitable à l'appel** traverse la frontière sous forme de
`FunctionResult<T, E>` typé. L'absence pour une requête en collection se représente par l'ensemble
vide. Les incidents IO non récupérables restent des exceptions, capturées **une seule fois** au
boundary (saga supervisor / UI) et rapportées.

## Classification des sites de levée (~60 sites non-test, audit du 2026-10-08)

| Frontière                                                                                                        | Fichiers                                                                                                                 | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Repository IndexedDB**                                                                                         | `projects.ts` (addSource), `sources.ts` (deleteById), `collections.ts` (deleteById), `annotations.ts` (mergeAnnotations) | Échecs attendus → `FunctionResult`. **Fait** (commits 2026-10-08) ; `mergeAnnotations` était du code mort, supprimé.                                                                                                                                                                                                                                                                                                                 |
| **Live queries** (`liveQuery/*.live.ts`)                                                                         | `collections.live.ts`, `models.live.ts`, `workers.live.ts`                                                               | Décision ouverte : dans une souscription réactive, un id absent est un _état transitoire_, pas une erreur. Piste retenue : retourner `undefined`/ensemble vide et laisser le consumer décider (aligné sur la règle amendée), au lieu de thrower dans l'état d'erreur de `useLiveQuery` où l'échec devient un loading éternel silencieux. À faire.                                                                                    |
| **Command utils** (`data/utils/`: `result.ts`, `canvas.ts`, `modifierChain.ts`, `manifest.ts`, `annotations.ts`) | ~13 sites                                                                                                                | Hybridation assumée : ces helpers sont appelés depuis les sagas/workers qui capturent et convertissent en `WorkerResponse`/statut de tâche. À faire : remplacer `throw new Error(...)` par des subclasses de `BaseError` typées (`NotFoundError`, `DBError`, erreurs dédiées) pour que le rapport d'erreur en bout de chaîne soit structuré. Les convertir en `FunctionResult` n'est requis que là où l'appelant branche réellement. |
| **Plugins sagas** (`sagas/plugins/`: importers, workers)                                                         | ~14 sites                                                                                                                | Frontière externe assumée (HTTP, APIs LLM) : l'exception est l'idiome naturel ; déjà capturés par `sagas/workers.ts` (try/catch → WorkerResponse). À faire : typer les erreurs (`BaseError` avec contexte job/worker) pour enrichir le statut persisté (cf. D6).                                                                                                                                                                     |
| **Converters** (`data/models/converters/iiif.ts`)                                                                | 6 sites                                                                                                                  | Fonctions pures de transformation : throw sur entrée invalide est correct (idiome library). Capturées aux frontières d'export/import. Documenter, ne pas convertir.                                                                                                                                                                                                                                                                  |
| **UI / hooks composants** (`components/reducers/*Context`, `components/ui/*`)                                    | ~11 sites                                                                                                                | Idiome React (« hook used outside provider ») et boilerplate shadcn. Garder tel quel.                                                                                                                                                                                                                                                                                                                                                |

## Échéancier

1. ✅ `CollectionRepository.delete/deleteById/deleteMultiple` → `FunctionResult<_, DBError>` (commit `35a96de`).
2. ✅ `ProjectRepository.addSource` → `FunctionResult<void, NotFoundError | SourceAlreadyInProjectError>` ; `SourceRepository.deleteById` → `FunctionResult<void, NotFoundError>` ; suppression de `mergeAnnotations` (code mort). Les hooks appelants toaste l'erreur au lieu de perdre le rejet.
3. ⬜ Live queries : remplacer les throws des `getById` réactifs par une absence explicite (`undefined`) ; auditer les consumers (`CollectionInspectorContext`, `useCollectionContent`) pour le garde de rendu.
4. ⬜ Command utils : typer en `BaseError` les throws qui remontent aux sagas (grep « throw new Error » dans `src/data/utils/`).
5. ⬜ Plugins : erreurs typées avec contexte dans les importers/workers ; cohérence avec la loi de statut D6.
6. ⬜ Nettoyage final : interdiction de `throw new Error` hors whitelists (règle ESLint `no-restricted-syntax` ou `noRestrictedImport` sur un linter helper) — à évaluer une fois les étagères 3-5 terminées.

## Règles d'écriture

- Nouvelle erreur : subclasser `BaseError`, contexte JSON typé (cf. `NotFoundError`, `DBError`).
- Utiliser `NotFoundError` (`src/utils/NotFoundError.ts`) et non l'alias déprécié `EntityNotFoundError`
  pour tout code neuf (cf. `plan-table-seam.md` Phase 0).
- Un appelant qui ne branche pas sur `err` doit justifier dans un commentaire (ex. sweep de nettoyage).
