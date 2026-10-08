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
| **Plugins sagas** (`sagas/plugins/`: importers, workers)                                                         | ~14 sites                                                                                                                | **Fait** (étagère 5) : frontière externe assumée (HTTP, APIs LLM) — l'exception reste l'idiome naturel, capturée une seule fois au boundary. Les ~14 throws sont des sous-classes de `BaseError` avec contexte job/worker (`plugins/errors.ts`) ; la fabrique `manifestHttpError` unique remplace la chaîne de branches 404/403 dupliquée entre les deux importers.   |
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

## Note de décision — comment le contexte d'un plugin atteint le statut persisté

Étagère 5 : une erreur de plugin ne remonte jamais jusqu'à l'appelant — elle meurt dans un boundary qui
la convertit en statut de tâche persisté. Que faut-il alors y écrire ? Trois options étaient sur la table :

1. **Le message porte le contexte, le JSON reste dans les logs** _(choisi)_ : les classes construisent un
   message qui nomme déjà l'URL / le statut HTTP / le plugin fautif (les clés `error_404_manifest`
   interpolent `{{url}}` depuis toujours), et `BaseError.context` garde la même information structurée
   pour `console.error`. Le `statusMessage` lu dans `WorkerDetails` reste une phrase.
2. Message + suffixe JSON compact dans `statusMessage` : diagnostique, illisible en face utilisateur.
3. Champ `statusContext` à côté de `statusMessage` : le plus propre, mais il élargit le schéma `Task`
   (`.strict()`) et demande une migration Dexie — hors d'échelle pour cette étagère. À reprendre si un
   consumer doit un jour brancher sur le contexte.

Corollaire, dans la même logique : un boundary ne doit pas _remplacer_ l'erreur qu'il capture. Deux sites
le faisaient et ont été corrigés — `importers/default.ts` transformait tout en `error_unknown` (désormais :
relance l'erreur typée, sinon `ManifestImportError` qui nomme l'URL et conserve la cause), et
`useJobRealtime` persistait le constat « Result processing failed » à la place du message du plugin.

Répartition des captures (une seule par erreur) : importers → `utils/manifest.fetchManifestFromURL` ;
`run()` des workers → `sagas/workers.startWorker` ; `processResult()` → `hooks/useJobRealtime`.

## Échéancier

1. ✅ `CollectionRepository.delete/deleteById/deleteMultiple` → `FunctionResult<_, DBError>` (commit `35a96de`).
2. ✅ `ProjectRepository.addSource` → `FunctionResult<void, NotFoundError | SourceAlreadyInProjectError>` ; `SourceRepository.deleteById` → `FunctionResult<void, NotFoundError>` ; suppression de `mergeAnnotations` (code mort). Les hooks appelants toaste l'erreur au lieu de perdre le rejet.
3. ✅ Live queries : les throws des `getById` réactifs sont remplacés par une absence explicite (`undefined`) ; les consumers (`CollectionInspectorContext`, `useCollectionContent`) typeaient déjà l'absence. Les `getById` dead code des live repos models/workers sont supprimés.
4. ✅ Command utils : les ~13 throws de `src/data/utils/` sont typer en sous-classes de `BaseError` avec contexte (`errors.ts`) ; messages i18n préservés là où ils étaient user-facing ; `throw collectionResult.error` / `throw modifierResult.error` pour relayer l'erreur typée déjà portée par le Result.
5. ✅ Plugins : les throws des importers et workers deviennent des sous-classes de `BaseError` avec
   contexte job/worker (`sagas/plugins/errors.ts`) ; `manifestHttpError` centralise le mapping
   404/403/autre que les deux importers dupliquaient ; `JobPostError` nomme plugin, worker et tâche au
   point exact du pont D6 (insert `cs_jobs`) ; `LLMRequestError`/`LLMResponseError` subclassent
   désormais `BaseError` (mêmes champs, plus de vocabulaire unique au boundary).
6. ⬜ Nettoyage final : interdiction de `throw new Error` hors whitelists (règle ESLint `no-restricted-syntax` ou `noRestrictedImport` sur un linter helper) — à évaluer une fois les étagères 3-5 terminées.

## Règles d'écriture

- Nouvelle erreur : subclasser `BaseError`, contexte JSON typé (cf. `NotFoundError`, `DBError`).
- Utiliser `NotFoundError` (`src/utils/NotFoundError.ts`) et non l'alias déprécié `EntityNotFoundError`
  pour tout code neuf (cf. `plan-table-seam.md` Phase 0).
- Un appelant qui ne branche pas sur `err` doit justifier dans un commentaire (ex. sweep de nettoyage).
