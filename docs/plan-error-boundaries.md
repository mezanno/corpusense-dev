# Plan — Error boundaries : audit et étagères de mise en conformité

Suite de `docs/inconsistency-scan-2026-09-29.md` (~77 `throw new Error` coexistant avec la discipline
`FunctionResult`/`BaseError`) et de l'amendement de l'ADR D2 (`foundation/DECISIONS.md`, 2026-10-08).

## Règle opérante (rappel)

Un mode d'échec **attendu et traitable à l'appel** traverse la frontière sous forme de
`FunctionResult<T, E>` typé. L'absence pour une requête en collection se représente par l'ensemble
vide. Les incidents IO non récupérables restent des exceptions, capturées **une seule fois** au
boundary (saga supervisor / UI) et rapportées.

## Classification des sites de levée (~60 sites non-test, audit du 2026-10-08)

| Frontière                                                                                                        | Fichiers                                                                                                                 | Verdict                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repository IndexedDB**                                                                                         | `projects.ts` (addSource), `sources.ts` (deleteById), `collections.ts` (deleteById), `annotations.ts` (mergeAnnotations) | Échecs attendus → `FunctionResult`. **Fait** (commits 2026-10-08) ; `mergeAnnotations` était du code mort, supprimé.                                                                                                                                                                                                                                                  |
| **Live queries** (`liveQuery/*.live.ts`)                                                                         | `collections.live.ts`, `models.live.ts`, `workers.live.ts`                                                               | **Fait** (étagère 3) : en réactif, un id absent est un _état transitoire_, pas une erreur — voir la note de décision ci-dessous.                                                                                                                                                                                                                                      |
| **Command utils** (`data/utils/`: `result.ts`, `canvas.ts`, `modifierChain.ts`, `manifest.ts`, `annotations.ts`) | ~13 sites                                                                                                                | **Fait** (étagère 4) : hybridation assumée — ces helpers restent _throwing_ (contrat établi, sagas/boundaries capturent), mais chaque throw est désormais une sous-classe de `BaseError` avec contexte JSON (`errors.ts`). Les sites qui tiennent déjà un `FunctionResult` en main relèvent l'erreur existante (`throw result.error`) au lieu d'en fabrier une neuve. |
| **Plugins sagas** (`sagas/plugins/`: importers, workers)                                                         | ~14 sites                                                                                                                | Frontière externe assumée (HTTP, APIs LLM) : l'exception est l'idiome naturel ; déjà capturés par `sagas/workers.ts` (try/catch → WorkerResponse). À faire : typer les erreurs (`BaseError` avec contexte job/worker) pour enrichir le statut persisté (cf. D6).                                                                                                      |
| **Converters** (`data/models/converters/iiif.ts`)                                                                | 6 sites                                                                                                                  | Fonctions pures de transformation : throw sur entrée invalide est correct (idiome library). Capturées aux frontières d'export/import. Documenter, ne pas convertir.                                                                                                                                                                                                   |
| **UI / hooks composants** (`components/reducers/*Context`, `components/ui/*`)                                    | ~11 sites                                                                                                                | Idiome React (« hook used outside provider ») et boilerplate shadcn. Garder tel quel.                                                                                                                                                                                                                                                                                 |

## Note de décision — les live queries ne retournent pas de `FunctionResult`

Question posée avant l'étagère 4 : la cohérence n'exige-t-elle pas que les live repos retournent
eux aussi des `FunctionResult`, comme les repos de commande ? Non, pour trois raisons :

1. **Les live repos sont la face lecture, pas la face commande.** Le seul contenu possible d'un
   `err` y serait : entité absente (l'équivalent sync est `[]`/`undefined` — règle de l'absence) ou
   incident IO (non traitable par un abonnement de rendu, même traitement que `getAll()` côté
   sync). Aucun mode d'échec ne satisfait la règle opérante ; les repos sync ne mettent d'ailleurs
   pas de Result sur leurs lectures de collection. Cohérence de règle, pas de signature.
2. **`FunctionResult` ne sait pas exprimer le troisième état du réactif.** Une query live a trois
   états — `loading`, `found`, `missing` — et le Result n'en a que deux : il faudrait coder
   `loading` dans `err`, ce qui ferait mentir le type. Si un consumer doit un jour distinguer
   « supprimée » de « chargement », le bon modèle sera une union discriminée
   (`{ state: 'loading' | 'missing' | 'found' }`) pour cette query précise.
3. **Coût sans bénéfice** : chaque consumer re-déplierait `match(result, { ok: identity, err: () => undefined })`
   dans son chemin de rendu — l'exact pattern `unwrapOr`-qui-avale que l'amendement D2 visait à prévenir.

## Échéancier

1. ✅ `CollectionRepository.delete/deleteById/deleteMultiple` → `FunctionResult<_, DBError>` (commit `35a96de`).
2. ✅ `ProjectRepository.addSource` → `FunctionResult<void, NotFoundError | SourceAlreadyInProjectError>` ; `SourceRepository.deleteById` → `FunctionResult<void, NotFoundError>` ; suppression de `mergeAnnotations` (code mort). Les hooks appelants toaste l'erreur au lieu de perdre le rejet.
3. ✅ Live queries : les throws des `getById` réactifs sont remplacés par une absence explicite (`undefined`) ; les consumers (`CollectionInspectorContext`, `useCollectionContent`) typeaient déjà l'absence. Les `getById` dead code des live repos models/workers sont supprimés.
4. ✅ Command utils : les ~13 throws de `src/data/utils/` sont typer en sous-classes de `BaseError` avec contexte (`errors.ts`) ; messages i18n préservés là où ils étaient user-facing ; `throw collectionResult.error` / `throw modifierResult.error` pour relayer l'erreur typée déjà portée par le Result.
5. ⬜ Plugins : erreurs typées avec contexte dans les importers/workers ; cohérence avec la loi de statut D6.
6. ⬜ Nettoyage final : interdiction de `throw new Error` hors whitelists (règle ESLint `no-restricted-syntax` ou `noRestrictedImport` sur un linter helper) — à évaluer une fois les étagères 3-5 terminées.

## Règles d'écriture

- Nouvelle erreur : subclasser `BaseError`, contexte JSON typé (cf. `NotFoundError`, `DBError`).
- Utiliser `NotFoundError` (`src/utils/NotFoundError.ts`) et non l'alias déprécié `EntityNotFoundError`
  pour tout code neuf (cf. `plan-table-seam.md` Phase 0).
- Un appelant qui ne branche pas sur `err` doit justifier dans un commentaire (ex. sweep de nettoyage).
