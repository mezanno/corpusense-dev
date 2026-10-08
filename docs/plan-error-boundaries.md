# Plan — Error boundaries : audit et étagères de mise en conformité

Suite de `docs/inconsistency-scan-2026-09-29.md` (~77 `throw new Error` coexistant avec la discipline
`FunctionResult`/`BaseError`) et de l'amendement de l'ADR D2 (`foundation/DECISIONS.md`, 2026-10-08).

## Règle opérante (rappel)

Un mode d'échec **attendu et traitable à l'appel** traverse la frontière sous forme de
`FunctionResult<T, E>` typé. L'absence pour une requête en collection se représente par l'ensemble
vide. Les incidents IO non récupérables restent des exceptions, capturées **une seule fois** au
boundary (saga supervisor / UI) et rapportées.

## Classification des sites de levée (~60 sites non-test, audit du 2026-10-08)

| Frontière                                                                                                                | Fichiers                                                                                                                 | Verdict                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repository IndexedDB**                                                                                                 | `projects.ts` (addSource), `sources.ts` (deleteById), `collections.ts` (deleteById), `annotations.ts` (mergeAnnotations) | Échecs attendus → `FunctionResult`. **Fait** (commits 2026-10-08) ; `mergeAnnotations` était du code mort, supprimé.                                                                                                                                                                                                                                                  |
| **Live queries** (`liveQuery/*.live.ts`)                                                                                 | `collections.live.ts`, `models.live.ts`, `workers.live.ts`                                                               | **Fait** (étagère 3) : en réactif, un id absent est un _état transitoire_, pas une erreur — voir la note de décision ci-dessous.                                                                                                                                                                                                                                      |
| **Command utils** (`data/utils/`: `result.ts`, `canvas.ts`, `modifierChain.ts`, `manifest.ts`, `annotations.ts`)         | ~13 sites                                                                                                                | **Fait** (étagère 4) : hybridation assumée — ces helpers restent _throwing_ (contrat établi, sagas/boundaries capturent), mais chaque throw est désormais une sous-classe de `BaseError` avec contexte JSON (`errors.ts`). Les sites qui tiennent déjà un `FunctionResult` en main relèvent l'erreur existante (`throw result.error`) au lieu d'en fabrier une neuve. |
| **Plugins sagas** (`sagas/plugins/`: importers, workers)                                                                 | ~14 sites                                                                                                                | **Fait** (étagère 5) : frontière externe assumée (HTTP, APIs LLM) — l'exception reste l'idiome naturel, capturée une seule fois au boundary. Les ~14 throws sont des sous-classes de `BaseError` avec contexte job/worker (`plugins/errors.ts`) ; la fabrique `manifestHttpError` unique remplace la chaîne de branches 404/403 dupliquée entre les deux importers.   |
| **Converters** (`data/models/converters/iiif.ts`)                                                                        | 6 sites                                                                                                                  | Fonctions pures de transformation : throw sur entrée invalide est correct (idiome library). Capturées aux frontières d'export/import. Documenter, ne pas convertir. → whitelist étagère 6a.                                                                                                                                                                           |
| **Garde-fous de provider React** (`components/reducers/*Context`, `components/ui/{form,sidebar}.tsx`, `useExperimental`) | 11 sites                                                                                                                 | Idiome React (« hook used outside provider ») et boilerplate shadcn. Garder tel quel. → whitelist étagère 6a.                                                                                                                                                                                                                                                         |
| **Hooks de données** (`hooks/data/**`, `usePdfConverter`)                                                                | 16 sites — **jamais classés par l'audit du 2026-10-08, qui ne comptait que les garde-fous ci-dessus**                    | Ce n'est **pas** l'idiome React : c'est du contrôle de flux vers un boundary UI. 7 relèvent une erreur déjà typée ou réutilisent une classe existante → étagère 6b ; 9 messages i18n dont seule `.message` est lue → whitelist 6a, au verdict désormais écrit.                                                                                                        |
| **Utils images/manifest** (`utils/images.ts`, `utils/manifest.ts`)                                                       | 7 sites — jamais classés                                                                                                 | `manifest.ts` : helpers purs i18n, même verdict que les converters. `images.ts` : incidents DOM/canvas assumés, **sauf** `:100` qui met un `new Error` **dans** un `FunctionResult.err()` → étagère 6b.                                                                                                                                                               |
| **Test de `getErrorMessage`** (`utils/__tests__/utils.test.ts`)                                                          | 1 site                                                                                                                   | Construit un `Error` nu volontairement pour épingler la fonction qui les consomme. Whitelist nommée (pas `**/__tests__/**` : les fixtures ne doivent pas devenir un angle mort).                                                                                                                                                                                      |

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

## Note de décision — étagère 6 : le garde-fou est une règle ESLint, pas une revue

Évaluée le 2026-10-08, étagères 3-5 finies, par sonde interposée (config temporaire à la racine,
`npx eslint -c <sonde> src`, fichier supprimé après mesure — ne pas committer la sonde).

- **Mécanisme retenu :** la règle cœur `no-restricted-syntax`, sélecteur esquery
  `NewExpression[callee.name="Error"]`. Aucun plugin ajouté (D7 : pas une dépendance pour un garde-fou).
  La whitelist est un bloc `files:`/`rules: { 'no-restricted-syntax': 'off' }` postérieur dans
  `eslint.config.js` — donc visible, grepable, et opposable en revue.
- **Sélecteur `ThrowStatement > NewExpression[callee.name="Error"]` rejeté,** alors même qu'il colle mieux
  au libellé « interdiction de `throw new Error` » : il rate 4 constructions non levées, dont la pire du
  lot — `utils/images.ts:100` fabrique un `err` typé par le type et pas par le code. Interdire la
  construction coûte le même sélecteur et couvre strictement plus.
- **Deux sélecteurs additionnels, à activer dans le même bloc :** `ClassDeclaration[superClass.name="Error"]`
  et `ClassExpression[superClass.name="Error"]`. Depuis l'alignement des erreurs LLM (étagère 5) ils n'ont
  qu'une cible légitime — `utils/BaseError.ts` — que la whitelist doit nommer. Sans eux, une nouvelle
  hiérarchie parallèle à `BaseError` peut repousser sans que personne ne le voie.
- **Message de la règle :** `Using 'NewExpression[callee.name="Error"]' is not allowed.` — obscur de fabrique ;
  c'est le garde-fou de ce plan qui l'a introduite, ne pas le « corriger » en écrivant un plugin local.
- **Comptage mesuré** (à refaire avant d'écrire la whitelist, ces chiffres bougent) : **41** sites pour le
  sélecteur de construction, dont **37** levées et 4 non levées (`images.ts:24,60,100`,
  `utils/__tests__/utils.test.ts:6`) ; **+1** pour le sélecteur de classe (`BaseError.ts`).
  Répartition : 11 garde-fous React, 6 converters, 16 hooks de données, 5 `images.ts`, 2 `manifest.ts`,
  1 test, 1 `BaseError`.

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
6. ✅ Garde-fou ESLint + résidu (2026-10-08) : **6b** — 8 sites convertis (4 `throw result.error` : `useSource` ×2,
   `useAnnotationActions`, `useCollectionImporter` ; 3 classes existantes : `NotFoundError` ×2,
   `FilePermissionDeniedError` ; 1 classe écrite : `InvalidBase64Error` à `images.ts:100`). **6a** — règle
   `no-restricted-syntax` + whitelist de 14 lignes collées dans `eslint.config.js` ; `npx eslint src` sort
   zéro erreur `no-restricted-syntax` (sonde recalibrée le 2026-10-08 : les 5 sites attendus, puis zéro
   après 6b). L'option `useModelIO.tsx:47` n'est pas prise. Dette lint préexistante (48 erreurs d'autres
   règles) inchangée, hors périmètre.

## Étagère 6 — plan d'exécution

### 6b — réduire le résidu avant d'écrire la whitelist (1 commit par famille)

Huit sites où la classe existe déjà ou l'erreur est déjà portée : les convertir, ce n'est pas de la
décoration, c'est le motif de l'étagère 4 appliqué où l'audit ne l'avait pas regardé. Cinq des huit sont
nommés par la sonde (cf. « Critère de sortie ») — la sortie du linter sert de case à cocher ; les trois
autres logent dans des fichiers whitelisted et ne se trouvent qu'au grep.

- [x] `hooks/data/sources/useSource.tsx:18` → `throw sourceResult.error` ; `:22` → `throw contentResult.error`.
      (C'est mot pour mot l'anti-pattern corrigé dans `data/utils/result.ts` : `new Error(x.error.message)`
      jette la classe et le contexte à la poubelle. Un `useQuery<_, Error>` accepte toute sous-classe
      d'`Error`, donc `BaseError` convient au contrat react-query.)
- [x] `hooks/data/annotations/useAnnotationActions.tsx:206` → `throw canvasesResult.error`
      (`NotFoundError({ entity: 'Collection', id: collectionId })` si l'on préfère nommer l'entité).
- [x] `hooks/data/collections/useCollectionImporter.tsx:55` → `throw loadedManifestResult.error`
      (le `addLog` qui précède garde le message à l'écran).
- [x] `hooks/data/models/useModels.tsx:48` → `new NotFoundError({ entity: 'Model', id: fromModelId })`.
- [x] `hooks/data/modifiers/useModifierChainLive.tsx:32` →
      `new NotFoundError({ entity: 'Modifier chain', id: chainId })` — message identique à l'actuel.
- [x] `hooks/data/convertedFiles/useRepository.tsx:110` → `FilePermissionDeniedError` (`data/utils/errors.ts`),
      qui dit déjà mot pour mot la même phrase.
- [x] `utils/images.ts:100` → `FunctionResult.err(new InvalidBase64Error())`, classe à écrire dans
      `data/utils/errors.ts`. **Le seul site du dépôt où un `Error` générique se fait passer pour un `err`
      typé** : le garde-fou de construction, lui, le verrait.

Vérifications : `npx tsc --noEmit -p tsconfig.app.json && npx vitest run` — aucun test n'asserte ces
messages (seuls les converters et les clés i18n de `data/utils` sont épinglés par un `toThrow`).

Option si le temps reste : `hooks/data/models/useModelIO.tsx:47` (« Invalid model structure ») mérite une
classe comme `RemoteManifestInvalidError` ; ce n'est que la neuvième ligne du même motif.

### 6a — la règle (1 commit)

Dans `eslint.config.js`, après les blocs existants, avant celui des `**/*.js` :

```js
{
  files: ['src/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      'NewExpression[callee.name="Error"]',
      'ClassDeclaration[superClass.name="Error"]',
      'ClassExpression[superClass.name="Error"]',
    ],
  },
},
{
  // Whitelists de docs/plan-error-boundaries.md — chaque ligne est un verdict de l'audit,
  // pas une exception de confort. Retirer une ligne sans retirer le verdict associé.
  rules: { 'no-restricted-syntax': 'off' },
  files: [
    'src/utils/BaseError.ts', // la racine de la hiérarchie : elle a le droit d'étendre Error
    'src/data/models/converters/**', // idiome library : throw sur entrée invalide
    'src/utils/manifest.ts', // helpers purs i18n, même verdict que les converters
    'src/components/reducers/**', // « hook used outside provider »
    'src/components/ui/form.tsx',
    'src/components/ui/sidebar.tsx',
    'src/hooks/useExperimental.tsx',
    'src/utils/images.ts', // incidents DOM/canvas non récupérables (contexte 2d, toBlob, onload)
    'src/hooks/data/collections/useCollectionImporter.tsx', // throw-to-boundary : seule `.message` est lue
    'src/hooks/data/convertedFiles/useRepository.tsx', // idem (+2 préconditions de configuration)
    'src/hooks/data/sources/useThumbnail.tsx', // idem (error_no_thumbnail)
    'src/hooks/data/models/useModelIO.tsx', // idem (Invalid model structure)
    'src/hooks/usePdfConverter.ts', // idem (error_no_file_selected)
    'src/utils/__tests__/utils.test.ts', // épingle getErrorMessage : fabrique un Error nu volontairement
  ],
},
```

**Whitelist au fichier, jamais au sous-arbre.** `src/hooks/data/**` serait tentant et serait un angle mort :
la règle ne mordrait plus sur aucun code nouveau des ~30 fichiers de ce répertoire. Cinq lignes de plus dans
le bloc, et le verdict reste attaché au fichier qui le mérite. (`components/reducers/**` reste un glob : ses
8 sites y sont tous le même garde-fou de provider, et un quatrième context y dirait la même chose.)

### Critère de sortie, et ce que la sonde a mesuré

Sonde du 2026-10-08 — règle et whitelist telles qu'écrites ci-dessus, sur l'état courant du dépôt :
**5 sites restants**, et ce sont exactement la tranche visible de 6b :

```
hooks/data/annotations/useAnnotationActions.tsx:206
hooks/data/models/useModels.tsx:48
hooks/data/modifiers/useModifierChainLive.tsx:32
hooks/data/sources/useSource.tsx:18
hooks/data/sources/useSource.tsx:22
```

Autrement dit : la sortie du linter **est** la case à cocher. Trois sites de 6b sont pourtant réels mais
invisibles ici, parce qu'ils logent dans un fichier whitelisted — `useCollectionImporter.tsx:55`,
`useRepository.tsx:110`, `utils/images.ts:100`. Pour les retrouver, et pour garder la main sur ce que la
whitelist masque : `grep -rn "throw new Error\|FunctionResult.err(new Error" src/hooks src/utils`.

Une fois 6b passé : `npx eslint src` doit sortir **zéro** erreur `no-restricted-syntax`. C'est le critère de
sortie, et il est mécanique. Les ~50 erreurs _des autres règles_ qui préexistent dans `src` ne sont pas du
ressort de ce plan : les mentionner dans le message de commit, comme à l'étagère 4.

Contrôle arithmétique : 41 sites de construction mesurés, 8 convertis par 6b, 33 couverts par les 14 lignes
de whitelist, plus `BaseError.ts` pour le sélecteur de classe.

### Ce que le garde-fou ne couvre pas (à ne pas vendre comme couvert)

- `const e = new Error(); throw e` — hors de portée d'un sélecteur syntaxique ; le sélecteur de
  _construction_ le rattrape quand même, ce qui est la raison de l'avoir choisi.
- `new TypeError` / `new DOMException` — volontairement hors du verdict : ces deux-là sont l'idiome
  natif de leurs frontières (abort, DOM).
- Le contenu des messages, donc pas de contrôle que le message nomme bien le job fautif : c'est la
  règle d'écriture ci-dessous, pas un linter.

## Comment reprendre une session future

1. Lire ce fichier : l'Échéancier dit où on en est ; la note « étagère 6 » dit le mécanisme tranché ;
   la section « Étagère 6 — plan d'exécution » contient les cases à cocher et le bloc de config à coller.
2. Reprendre la mesure (les chiffres de la note datent du 2026-10-08) : copier les deux blocs du paragraphe
   6a dans une config sonde à la racine (`eslint.shelf6-probe.config.js`), calquée sur `eslint.config.js`
   — mêmes `ignores`, mêmes `languageOptions.parserOptions` avec `projectService`, sinon les règles
   type-checked ne se résolvent pas — puis `npx eslint -c eslint.shelf6-probe.config.js src -f json`. La
   sortie attendue est la liste de la section « Critère de sortie ». **Supprimer la sonde** après mesure :
   elle n'a rien à faire dans l'histoire de ce dépôt.
3. `npx tsc --noEmit -p tsconfig.app.json && npx vitest run && npx eslint src && npx prettier . --check`
   avant de toucher à quoi que ce soit : c'est la ligne de contrôle de ce dépôt.
4. Faire 6b (les 5 sites que la sonde nomme, puis les 3 qu'elle ne voit pas), puis 6a : coller les deux
   blocs dans `eslint.config.js`, vérifier `npx eslint src` sans erreur `no-restricted-syntax`, puis la
   ligne de contrôle complète. Un commit par famille de sites, message dans le style des étagères 3-5
   (`refactor: …`) ; ne pas committer sans validation de l'utilisateur.
5. À la fin : cocher l'item 6 de l'Échéancier, et reporter dans `docs/inconsistency-scan-2026-09-29.md`
   (ou son successeur) que la dette « ~77 `throw new Error` » est close par règle et non par revue.

## Règles d'écriture

- Nouvelle erreur : subclasser `BaseError`, contexte JSON typé (cf. `NotFoundError`, `DBError`).
- Utiliser `NotFoundError` (`src/utils/NotFoundError.ts`) et non l'alias déprécié `EntityNotFoundError`
  pour tout code neuf (cf. `plan-table-seam.md` Phase 0).
- Un appelant qui ne branche pas sur `err` doit justifier dans un commentaire (ex. sweep de nettoyage).
- Un boundary qui capture une erreur la relaie (`throw error`) ou l'enrobe en conservant la cause :
  jamais il ne la remplace par une erreur générique (`error_unknown`, « Result processing failed »).
- Erreur de plugin : le message nomme le job fautif (plugin, tâche, URL), `context` le porte en JSON (cf.
  `sagas/plugins/errors.ts`).
