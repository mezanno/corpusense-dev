# Plan Q9 — E2E Playwright sur les parcours critiques

_Roadmap : [roadmap.md](./roadmap.md) § Q9 · Politique de tests : D-010 ([DECISIONS.md](./DECISIONS.md)) · Branche : `feat_e2e_playwright` · Rédigé le 2026-10-13._

## 1. Objectif et critères de sortie

**Q9** : « Playwright absent ; 2–4 parcours critiques (import manifest → collection → annotation → export), stables, en CI (D-010). »

Critères de sortie :

1. `@playwright/test` installé, config reproductible locale et CI (chromium seul).
2. 3 scénarios + 1 smoke, **sans réseau externe** (fixtures interceptées), verts d'un premier coup sur 10 exécutions consécutives locales.
3. Job E2E bloquant dans la CI des PR (`ci.yml`), hors du chemin critique de `deploy.yml`.
4. Zéro `waitForTimeout` arbitraire ; assertions web-first ; sélecteurs par rôles accessibles/textes i18n (D-010), `data-testid` seulement en dernier recours documenté.
5. Documentation mise à jour : roadmap Q9 → livré, commandes dans `developpement.md`, index `docs/README.md`.

## 2. Périmètre

Scénarios (parcours critique complet + smoke) :

| #   | Scénario                                                              | Vérification clé                                                                  |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| S0  | Smoke : l'app démarre, la navigation est reachable, état vide OK      | pas d'erreur console bloquante, routes accessibles                                |
| S1  | Import d'un manifest IIIF (fixture) → source en bibliothèque          | la source apparaît dans la liste                                                  |
| S2  | Création d'une collection depuis la source → inspecteur de collection | la collection et sa vignette apparaissent                                         |
| S3  | Annotation rectangulaire dans le visualiseur → reload                 | l'annotation est persistée (relue depuis IndexedDB après rechargement de la page) |
| S4  | Export de la collection                                               | événement `download` capturé, ZIP non vide, contient le JSON des annotations (S3) |

S1+S2 et S3+S4 s'enchaînent en séries dépendantes (`test.describe.serial`) pour limiter le nombre de démarrages : au moins un test par scénario, pas un par ligne d'assertion. S0 est indépendant.

**Hors périmètre** (à écrire explicitement dans la config ou le README E2E) : workers OCR/LLM distants (Mistral, OpenAI — exigent des clés API), Supabase/`cs_jobs`, import de fichiers locaux par File System Access API, PDF, chaînes de modificateurs, IIIF sources distantes réelles, multi-onglets/PWA installée.

## 3. Choix techniques

- **Dépendance** : `@playwright/test` en devDependency ; un seul projet **chromium** (l'app ne cible que Chromium en pratique, cf. File System Access API).
- **Configuration** : `playwright.config.ts` à la racine.
  - `testDir: './e2e'` (les tests E2E ne sont pas co-localisés : D-010 réserve `__tests__/` à Vitest ; E2E = dossier dédié, comme `coverage/` ou `archive/`).
  - `webServer`: `{ command: 'npm run dev:e2e', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI }`.
  - `retries: process.env.CI ? 2 : 0`, `reporter: [['list'], ['html', { open: 'never' }]]`, `use: { locale: 'fr' }`.
  - `ignoreSnapshots`, pas de `fullyParallel: false` global : les contexts sont isolés par test (IndexedDB neuf à chaque test, Playwright crée un nouveau context par test — c'est notre isolation, aucun helper de purge nécessaire entre tests).
- **Serveur testé** : `vite --mode e2e` (script `dev:e2e`), jamais le build de prod (trop lent en CI ; le build est déjà couvert par `deploy.yml`).
- **Variables d'environnement** : `.env` n'est plus versionné (Q5) et `src/utils/config.ts:7` appelle `createClient()` au niveau module — **l'app plante sans `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`**. Solution : un fichier **versionné** `.env.e2e` avec des valeurs factices valides (`https://e2e.supabase.co`, clé `e2e-anon-key`). Les fonctions distantes ne sont jamais déclenchées par les scénarios ; toute requête sortante est de toute façon bloquée par l'interception (voir point suivant).
- **Réseau** : aucune sortie externe. Une interception globale par fixture de test : `page.route('**', …)` → autoriser `localhost:5173` et `/@vite/`, servir les fixtures, aborter tout le reste (`route.abort()`). Le websocket Supabase (si `ConnectedUserProvider` se manifeste) est neutralisé par la même règle ; à vérifier à l'étape 2, au pire par un stub de service worker/drapeau.
- **Fixtures** dans `e2e/fixtures/` :
  - `manifest.json` — Presentation 3 minimal, **1 canvas**, 1 image ; URLs d'image pointant vers un faux service IIIF `https://iiif.e2e.test/...`, servi par `page.route` depuis le disque. Les URLs passent le garde-fou `isManifestUrl()` (n'importe quel `http(s)`).
  - `image.jpg` — JPEG unique (couleur/bandes de contrôle, dimensions figées) pour que le dessin de l'annotation soit déterministe.
  - selon le spike S3 : `info.json` d'un Image API 2.0 « single-tile » ou adaptation du visualiseur (voir § 5, étape 4).
- **Sélecteurs** : d'abord rôles accessibles + textes des locales réelles `public/locales/fr` (ex. `btn_open_manifest`, `title_load_manifest_step_1`) ; les clés sont stables, les phrases peuvent bouger → un seul fichier `e2e/fixtures/selectors.ts` qui centralise les libellés FR attendus, pour qu'un changement de traduction ne casse qu'un fichier. Les composants testés n'ont pas de `data-testid` ; si le visualiseur (S3) ne permet pas d'interaction fiable sans eux, on en ajoute au minimum (`data-testid` sur la zone d'annotation OSD), documentés comme exception à D-010.
- **PWA** : `vite-plugin-pwa` doit rester désactivé en mode e2e (à vérifier dans `vite.config.ts` ; sinon `{ devOptions: { enabled: false } }` ou garde par mode) — un service worker actif rendrait les rechargements non déterministes.
- **Qualité** : les nouveaux fichiers passent `tsc -b`, `eslint .`, `lint:ratchet` (aucune erreur nouvelle tolérée) et `prettier --check`. Ajouter `e2e/` et `playwright.config.ts` aux exclusions de `tsconfig.app.json` si le projet TSC les refuse, et au `vitest` `exclude` (éviter que Vitest ramasse les specs).

## 4. Intégration CI

- Second job dans `.github/workflows/ci.yml`, `e2e: Validate (E2E)`, avec `if: github.event_name == 'pull_request'` : il tourne sur les PR mais **pas** dans l'appel réutilisable de `deploy.yml` (le déploiement ne doit pas être ralenti ni bloqué par un E2E éventuellement capricieux ; il le devient dès qu'il passe par une PR).
- Étapes : checkout (même SHA épinglé que `validate`) → setup-node 22 + npm 11.6.4 → cache npm → `npx playwright install --with-deps chromium` avec cache de `~/.cache/ms-playwright` (clé = hash de `package-lock.json`) → `npm ci` → `npx playwright test`.
- Artifacts : `actions/upload-artifact` du `playwright-report/` et `test-results/` **uniquement en cas d'échec** (`if: failure()`), rétention 7 jours.
- Scripts npm : `dev:e2e`, `test:e2e` (`playwright test`), `test:e2e:ui` (`playwright test --ui`).

## 5. Plan d'exécution (commits petits, un par port/famille)

1. **`chore: outillage E2E Playwright (Q9)`** — `@playwright/test` en devDep, `playwright.config.ts`, `.env.e2e`, scripts npm, exclusions TSC/Vitest/Prettier/ESLint au besoin, et **S0 seul**. Preuve : `npx playwright test` vert local + `npx tsc -b`, `npm run lint:ratchet`, `npx prettier . --check` verts.
2. **`test(e2e): fixtures IIIF et harnais d'interception (Q9)`** — `manifest.json` + `image.jpg`, `e2e/helpers/` (route globale, helpers de navigation par rôle, `selectors.ts`), vérification du point Supabase/PWA.
3. **`test(e2e): parcours import manifest → collection (Q9)`** — S1 + S2 en série.
4. **`test(e2e): annotation persistée dans le visualiseur (Q9)`** — S3. **Spike préalable** : vérifier que le viewer (`CanvasViewerOSDContent`) charge un service IIIF single-tile servi en interception et que le drag annotorious est faisable via `page.mouse` ; sinon ajuster le fixture (info.json conforme) ou ajouter le `data-testid` minimal.
5. **`test(e2e): export de collection (Q9)`** — S4 : capture du `download`, ouverture du ZIP en mémoire (jszip est déjà en dep), contrôle d'entrée.
6. **`ci: job E2E bloquant sur les PR (Q9)`** — section § 4 ; vérifié sur la PR de la branche.
7. **`docs: clôture Q9 (roadmap, developpement, README docs)`** — roadmap Q9 → livré avec preuve datée ; commandes + pièges (`.env.e2e`, interception réseau) dans `developpement.md` ; mise à jour D-010 (« E2E … non encore déployés » → déployés) ; index `docs/README.md`.

## 6. Risques et mitigations

| Risque                                                                                       | Mitigation                                                                                                        |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `createClient()` fait échouer le démarrage sans variables Supabase (`src/utils/config.ts:7`) | `.env.e2e` versionné avec valeurs factices valides ; vérifié dès l'étape 1 (S0 échoue bruyamment sinon)           |
| OpenSeadragon/annotorious instable en test (tuiles, zoom, animations)                        | fixture single-tile + attente web-first sur l'overlay annotorious ; spike à l'étape 4 avant d'engager le scénario |
| Service worker PWA qui capture les réponses                                                  | désactivation explicite en mode e2e ; `context.clearCookies()`/nouveau context par test                           |
| Flake en CI (install navigateur, timers)                                                     | chromium seul, `retries: 2` en CI, pas d'attente temporelle, artefacts systématiques au premier échec PR          |
| Chaînes FR modifiées par une future traduction                                               | libellés centralisés dans `e2e/fixtures/selectors.ts` ; un commit de traduction n'a qu'un fichier à retoucher     |
| Le parcours réel d'import utilise File System Access API (inaccessible à Playwright)         | on passe par le champ URL (valide le même `fetchManifest`) ; si l'import fichier est jugé critique, spike séparé  |
| Ratchet ESLint : les specs neuves doivent être propres                                       | lint à chaque commit du plan ; config ESLint dédiée pour globals Playwright si nécessaire                         |

## 7. Vérification finale

```bash
npx tsc -b
npm run lint:ratchet
npx prettier . --check
npx vitest run          # inchangé
npx playwright test     # x10 d'affilée pour la preuve de stabilité
```

Puis mise à jour de la ligne Q9 de `roadmap.md` (livré, date, preuve : nombre de specs, taux de réussite sur 10 runs).
