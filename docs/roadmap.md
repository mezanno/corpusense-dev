# Feuille de route

_Travail ouvert, consolidé à partir des plans exécutés partiellement (`plan-table-seam`, `plan-worker-status-law`), des revues datées (2026-09-29/30, 2026-10-08), du rapport d'architecture archivé et des documents d'optimisation (`optimization/`). Les décisions prises sont dans [DECISIONS.md](./DECISIONS.md). Dernière remise à niveau : 2026-10-12._

## Chantiers structurants

### R1 — Loi de statut du worker ✅ (condition de R2 satisfaite)

**Résultat** : loi pure `workerStatusLaw.ts`, transitions exhaustives, événements câblés au repository, saga, plugins et bridge realtime ; migration IndexedDB v31 → v32 ; tables de présentation UI exhaustives. Le timeout `POSTING` de stratégie 2 est fixé à 60 secondes.
**Critère de sortie satisfait** : hors module et tests, les comparaisons/mappings worker passent par des prédicats ou les tables exhaustives de présentation ; les écritures brutes de statut sont limitées à la création/migration et à la transaction du repository ; le type de `patch()` exclut `status` et `queue`, avec assertion de type dédiée.
**Vérification** : table de transitions autorisées/refusées, repository et migration v31 → v32 couverts par tests ciblés. Les flows et décisions métier sont documentés dans [statuts.md](./statuts.md). La galerie garde le verrou scope collection (D-008/D3) ; chaque enum a sa table UI `Record` exhaustive sans `default` (D-008/D5).

### R2 — Moteur de file headless, puis retraite de Redux-Saga (candidate 4, D-006)

R1 étant terminé, le prérequis est satisfait : extraire de `sagas/workers.ts` un `queueEngine.run(worker, plugin, ports)` (ports : repository, horloge injectée pour l'EMA, notifieur) ; saga, `useJobRealtime` et récupération au démarrage deviennent des adaptateurs fins. Corriger au passage la fuite d'attente du stop-listener (l'attente en cours n'est pas annulée à l'arrêt). La loi de statut centralisée est celle qu'appliquera le moteur.

### R3 — Repositories sur le vrai stack (D-004)

1. ✅ Harnais `createTestDb()` avec `fake-indexeddb` : réinitialise la base Dexie réelle entre les tests ; à généraliser aux autres repositories au fur et à mesure de leur couverture.
2. `deleteByScope` retourne réellement les ids calculés (test d'abord, y compris le chemin `startsWithIgnoreCase` du scope collection).
3. ✅ `updateTaskStatus` applique la transition, la file et le statut dérivé du worker dans une transaction unique (livré avec R1).
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

| ID  | Ouverture                  | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Backlog ESLint mécanique   | 48 erreurs / 2 warnings dans `src` : `strict-boolean-expressions` (12), `no-unsafe-member-access` (11, frontières non typées dont `supabase.ts`), règles react-hooks 19 (6+), `no-unnecessary-type-assertion` (4), etc. 8 suppressions `@ts-expect-error` à verrouiller en non-régression (ratchet).                                                                                                                  |
| Q2  | Tests du cœur non testé    | R1 couvre la loi de statut, la migration v31 → v32 et les transitions du repository Worker sur Dexie + `fake-indexeddb` ; `createTestDb()` existe (R3.1). Au 2026-10-12 : 98 tests réussis / 1 todo, 25 fichiers réussis / 1 ignoré. Restent notamment les autres repositories, la saga workers (~420 lignes), les plugins, `useJobRealtime`, `excel.utils.ts` et `OpenAICompatibleClient` (~500 lignes). |
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
