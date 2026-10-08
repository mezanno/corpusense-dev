# Feuille de route

_Travail ouvert, consolidé à partir des plans exécutés partiellement (`plan-table-seam`, `plan-worker-status-law`), des revues datées (2026-09-29/30, 2026-10-08), du rapport d'architecture archivé et des documents d'optimisation (`optimization/`). Les décisions prises sont dans [DECISIONS.md](./DECISIONS.md). Dernière remise à niveau : 2026-10-09._

## Chantiers structurants

### R1 — Loi de statut du worker (candidate 1, condition de R2)

**Problème** : une loi, quatre copies (repo `updateTaskStatus`, saga, `useJobRealtime`, UI — deux mappings d'icônes divergents) ; dérives connues : sweeper forçant `COMPLETED` sur des tâches jamais démarrées, `customWorker` écrivant `POSTED` en direct, verrou de la galerie qui reflète le statut de la collection entière (`CollectionInspectorGalleryItemContent.tsx:43`).
**Cible** : module pur `workerStatusLaw.ts` près de l'enum (`src/data/models/worker/`) — événements `START · POST · JOB_ACCEPTED · RESULT_OK · RESULT_ERR · REQUEUE`, `workerStatusOf(queue)`, `recoveredOf(worker)`, prédicats de capacité, `taskStatusOfJobStatus` ; refus de transition en `FunctionResult.err(StatusChangeError)` ; zéro import Redux/Dexie/React/Supabase (D-008).
**Ordre** : ① tests de caractérisation des copies actuelles (fake-indexeddb) → ② module + tests exhaustifs de la table de transitions → ③ ports un commit par copie (repo + transaction unique de `updateTaskStatus`, saga, realtime, plugins par événements, UI par prédicats + table unique de présentation) → ④ comportements-correctifs (sweeper via `RESULT_ERR`/`REQUEUE`, verrou de la galerie par canvas).
**Critère de sortie** : en dehors du module et de ses tests, `case WorkerStatus.` / `status === WorkerStatus.` n'apparaissent que dans la table de présentation et le filtre `ALL` ; un test prouve la disparition du `patch()` direct de `status`.
**Décisions à trancher** : D1 liste blanche exhaustive (recommandé : oui), D2 sémantique sweeper (recommandé : ne jamais fabriquer de succès), D3 verrou de la galerie (recommandé : scope canvas), D5 table unique icônes/couleurs. D4 (split `TaskStatus`/`WorkerStatus`) : différé jusqu'à la disparition des quatre copies.

### R2 — Moteur de file headless, puis retraite de Redux-Saga (candidate 4, D-006)

Extraire de `sagas/workers.ts` un `queueEngine.run(worker, plugin, ports)` (ports : repository, horloge injectée pour l'EMA, notifieur) ; saga, `useJobRealtime` et récupération au démarrage deviennent des adaptateurs fins. Corrige au passage la fuite d'attente du stop-listener (l'attente en cours n'est pas annulée à l'arrêt). Ne démarrer qu'une fois R1 terminé — la loi est ce que le moteur applique.

### R3 — Repositories sur le vrai stack (D-004)

1. Harnais `createTestDb()` (~45 lignes, `fake-indexeddb`, DB fraîche par fichier) — le fichier absent au plus fort rendement du dépôt.
2. `deleteByScope` retourne réellement les ids calculés (test d'abord, y compris le chemin `startsWithIgnoreCase` du scope collection).
3. `updateTaskStatus` en transaction unique (fusionné avec R1.③-repo).
4. Aligner la signature `WorkerRepository.add` (`WorkerCreateDTO → Promise<Worker>`).
5. `deleteByScopeAndType` : décider d'implémenter ou supprimer le paramètre fantôme `isTemp` (grep des call sites d'abord).
6. Les 2 imports `@/App` depuis `src/data/**` supprimés (violations de couches réelles, cf. Q4).

### R4 — Worker LLM unifié derrière une interface de découplage `LLMClient` (candidate 3)

`mistral.ts` et `openai.ts` sont quasi identiques hors construction du client (~200 lignes dupliquées ; la copie OpenAI écrit même des fichiers `mistral_export_*`) ; Mistral contourne l'interface de découplage existante avec son SDK. Cible : un worker d'extraction paramétré par adaptateur (adaptateur Mistral, adaptateur compatible OpenAI), flux d'export JSON/CSV/XLSX écrit une seule fois (la triplication de `mistralOcr.ts` converge aussi).

### R5 — Module `Attachments` (candidate 5)

Donner un foyer au concept « blob + sa forme base64 » (~40 lignes dupliquées dans ~15 fichiers, cinq types d'adaptateurs sans module pour les encapsuler, deux mécanismes de miniature différents portant le même nom). Interface cible : `put / get / remove / asBase64 / fromBase64` derrière l'agrégat Sources ; import/export sérialisent les attachments comme une unité.

### R6 — `useDialog` : une interface de découplage `openForm` (candidate 6)

`hooks/ui/useDialog.tsx` : 447 lignes, 23 méthodes wrapper, ~43 sites d'import, point chaud du dépôt. Cible : un registre de formulaires + `result = await openForm(name, props)` qui absorbe allocation de ref, `requestSubmit`, close-on-action, titres i18n.

### R7 — Restructuration feature-first (D-009)

`components/{ui,common,layout,features/<domaine>}`. En attendant : les composants neufs naissent directement dans `features/`.

## Qualité & outillage

| ID  | Ouverture                  | Preuve (2026-10-08)                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Backlog ESLint mécanique   | 48 erreurs / 2 warnings dans `src` : `strict-boolean-expressions` (12), `no-unsafe-member-access` (11, frontières non typées dont `supabase.ts`), règles react-hooks 19 (6+), `no-unnecessary-type-assertion` (4), etc. 8 suppressions `@ts-expect-error` à verrouiller en non-régression (ratchet).                                                                                                                  |
| Q2  | Tests du cœur non testé    | Repositories (jamais exécutés, seulement mockés → R3.1), loi de statut (→ R1.①), saga workers (~420 lignes, testable en pilotant les effects), plugins, `useJobRealtime`, `excel.utils.ts`, `OpenAICompatibleClient` (~500 lignes). Ratio global : 82 tests / ~230 fichiers.                                                                                                                                          |
| Q3  | Pas de CI de qualité       | Seul `gh-pages.yml` (déploiement) existe. Créer un job PR : `tsc -b`, `eslint .`, `prettier --check`, `vitest run` (+ `npm audit`), et le conditionner le déploiement.                                                                                                                                                                                                                                                |
| Q4  | Pas de test d'architecture | Deux violations de couches réelles (R3.6). Options : `eslint-plugin-boundaries` (même process que le lint) ou test Vitest + madge + le contrôle par grep du critère de sortie de R1. Semgrep non installé (règles `p/typescript`, `p/react`, règles maison anti-`@/App`).                                                                                                                                             |
| Q5  | Balayage de nettoyage      | `workers/old/` (6 fichiers + `tesseract.js` en dépendance runtime + `suryaConverter`/`suryaSchema` orphelins) ; `git rm --cached .env tsconfig.tsbuildinfo` ; retirer `@types/jest` ; supprimer `CanvasCard.test.tsx` (coquille vide, le composant n'existe plus) ; retirer `VITE_CANTALOUPE_URL` de `.env` (jamais lue) ; alias `locales/fr-FR` → `fr` (copies divergentes).                                         |
| Q6  | Deux registries de plugins | `App.tsx` exporte un `workerPlugins` mutable pendant que `sagas/workers.ts` recharge indépendamment — unifier vers le loader (D-007).                                                                                                                                                                                                                                                                                 |
| Q7  | Hygiène de nommage         | `getCollectonLiveRepository` **corrigé** ✅ ; reste : `hooks/data/convertedFiles/useRepository.tsx` est un import GitHub (Octokit), pas un repository — renommer ; dédupliquer `utils/manifest.ts` vs `data/utils/manifest.ts` ; les trois niveaux « utils » (`lib/`, `utils/`, `data/utils/`) ; remplacer les imports de l'alias déprécié `EntityNotFoundError` (11 fichiers) ; `src/state/states.md` est à jour ✅. |
| Q8  | Divers                     | Manifeste factice `https://1.rp.mezanno.xyz/toto.json` dans `data/utils/export.ts:38` ; erreurs de démarrage de worker non remontées à l'IHM (`sagas/workers.ts:53`) ; `stats.html` (1,9 Mo) à sortir du versionnement ; commentaires FR/EN à homogénéiser au fil de l'eau.                                                                                                                                           |
| Q9  | E2E                        | Playwright absent ; 2–4 parcours critiques (import manifest → collection → annotation → export), stables, en CI (D-010).                                                                                                                                                                                                                                                                                              |

## Sécurité

Voir le registre [securite.md](./securite.md) (S-02 clos dans l'arbre de travail au 2026-10-09 ; en tête : S-03 CSP et en-têtes).

## Comment reprendre un chantier

1. Lire ce fichier, l'ADR citée par le chantier, et `CONTEXT.md` (vocabulaire).
2. Commandes de vérification : `npx tsc --noEmit -p tsconfig.app.json && npx vitest run && npx eslint src && npx prettier . --check`.
3. Respecter la proportionnalité (D-004) : pas de nouvelle abstraction sans besoin au call site ; les commits sont petits, un commit par port/famille.
