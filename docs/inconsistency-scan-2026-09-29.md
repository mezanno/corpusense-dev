# Inconsistency scan — 2026-09-29

Read-only scan of the repo before the testing/refactoring/optimization phase.
Findings are tagged: 🆕 = not yet tracked, 📋 = already covered by an existing plan (`plan-table-seam.md`, `plan-worker-status-law.md`).

## 1. Quality-gate status (baseline)

| Gate | Status |
|---|---|
| `tsc -b` | ✅ green |
| `eslint .` | ❌ 258 errors / 22 warnings — but **only 46 errors / 2 warnings are in `src/`** |
| `prettier src --check` | ❌ 35 unformatted files (mostly `src/components/ui/*`) |
| `vitest run` | ❌ 8 of 22 test files fail to **load** (0 test failures — every collected test passes) |

## 2. 🆕 Broken test harness (highest impact)

All 8 failing test files die on `ReferenceError: ResizeObserver is not defined` when the import chain reaches `@dnd-kit/dom`. The mock exists in `vitest.setup.ts` but is **commented out** (legacy tslint comment above it). Restoring a `ResizeObserver` stub likely turns the suite green again.

Also inconsistent in `vitest.setup.ts`:
- `matchMedia` stub defines legacy `addListener`/`removeListener` (deprecated aliases).
- A second commented-out WebGL/`getContext` mock block (already handled by `vitest-webgl-canvas-mock`).

Test-to-source ratio is thin: 22 test files for 372 source files; `hooks/`, `state/`, `pages/` (partially), and all worker plugins are untested.

## 3. 🆕 ESLint config lints build artifacts

`eslint.config.js` ignores `dist` but **not `dev-dist/` or `scripts/`**. Consequence: 186 of the 280 reported problems (166 `no-undef` from service-worker globals in `dev-dist/`, 20 "react-compiler" unused-disable noise in workbox bundles) are linting generated files. Adding `'dev-dist'`, `'scripts'` to `ignores` collapses the report from 280 → ~48 real issues.

Real `src/` lint backlog (46 errors, by rule):
- 12 × `strict-boolean-expressions`, 11 × `no-unsafe-member-access` (mostly untyped boundaries, e.g. `supabase.ts`)
- 6 × `react-hooks/set-state-in-effect` (+2 purity, 2 immutability, 2 incompatible-library, 1 refs) — React 19 hooks rules
- 2 × `no-shadow`, 4 × `no-unnecessary-type-assertion`, 2 × `no-redundant-type-constituents` (`supabase.ts:327,344` — a `never` unioned into a live union)
- Plus 8 `@ts-expect-error` suppressions (`ban-ts-comment`), 8 empty blocks, 8 unused expressions elsewhere when including warnings files.

## 4. 🆕 Two manifest utility modules, both tested

- `src/utils/manifest.ts` (fetch/parse + `ManifestFetchError`) with `src/utils/__tests__/manifest.test.ts`
- `src/data/utils/manifest.ts` (extract details via Cozy) with `src/data/utils/__tests__/manifest.test.ts`

Same name, split purpose, mirrored test names — easy to import the wrong one. Same smell: `src/lib/utils.ts` (`cn`) vs `src/utils/utils.ts` (misc), three "utils" tiers.

## 5. 📋→🆕 Naming vs CONTEXT.md domain model

- `CONTEXT.md` reserves **Repository** for the four aggregates, yet `dbFactory.ts` exports 24 `getX*Repository` factories; 11 single-store CRUD modules are named `*Repository` (models, tags, projects, results, …). Covered by the banked Table-seam policy — but the *small-repo collapse* rule ("when touched, collapse in that commit") is only honoured opportunistically.
- 🆕 Typo: `getCollectonLiveRepository` (9 call sites) — already Phase 1 item 6 of `plan-table-seam.md`.
- 🆕 `CONTEXT.md` describes the **task status law** on **Task**, but the enum carrying task statuses is `WorkerStatus` and it mixes worker- and task-level states plus the pseudo-status `ALL`. The worker-status-law plan addresses the behaviour; consider whether the *name* should split into `TaskStatus`/`WorkerStatus` in the same stroke.
- 🆕 `ConvertedFile` (model, repo, hooks dir `hooks/data/convertedFiles/`) — a "File" concept the glossary doesn't define, while the glossary explicitly avoids "file" for Source. Either add it to the glossary or rename (e.g. `DerivedArtifact`).

## 6. 🆕 Three state mechanisms with unclear boundaries

Redux (2 reducers + sagas), zustand (1 store, imported from a *data util* `src/data/utils/canvas.ts`), React Query (4 files), plus direct Dexie live-query hooks. No doc states which owns what — a refactoring risk. Related: 77 raw `throw new Error` coexist with the `FunctionResult`/`BaseError` discipline; sagas still own worker lifecycle (`plan-table-seam` wants them retired).

## 7. 🆕 Dead / stray artifacts

- `src/state/sagas/plugins/workers/old/` — 6 legacy worker files (surya\*, tesseract, edwin). The plugin loader globs `./workers/*.ts` only, so these are **loaded by nothing**.
- `src/data/tables/adapters/` and `src/data/tables/contracts/` — empty dirs (Table-seam scaffold abandoned per the reduced-scope plan; delete or note in the plan).
- `src/__tests__/react-i18next.ts` — a test *helper* in a `__tests__` dir named like a test.
- Git-tracked despite `.gitignore`: `.env` and `tsconfig.tsbuildinfo`. `.env` only holds public `VITE_*` keys (Supabase anon key is public by design), but a tracked `.env` invites real secrets later — suggest `git rm --cached .env`.
- Root `stats.html` (1.9 MB rollup visualizer output) — ignored by git but sitting in the working tree.

## 8. 🆕 Style & language drift

- File naming: PascalCase components dominate, but kebab-case survives outside `components/ui` (`hooks/use-mobile.ts`, `components/textviewer/use-forwarded-ref.tsx`). shadcn/ui files are regenerated — convention conflict is *why* it drifts; document "ui/ is kebab, everything else PascalCase".
- Test files are consistently in `__tests__/` ✅, but casing drifts: `Annotation.test.ts` tests `annotation.ts`.
- Comments mix French and English (~20+ files, incl. `vitest.setup.ts` and `eslint.config.js`); the ESLint config itself carries French comments and a truncated word ("typescript rul").
- UI strings mostly i18n'd, but plugin display names hardcode French (`customWorker.ts: 'Traitement custom'`).
- 39 `TODO/FIXME/HACK` markers in `src`.
- `@/` alias used 846× vs 7 deep `../../../` imports — near-consistent; sweep the 7.

## 9. 🆕 i18n locale drift

`public/locales/fr/` and `public/locales/fr-FR/` are two hand-maintained copies that **already diverge** (e.g. `btn_import_collection`, line ~320). Decide: symlink/alias `fr-FR` → `fr`, or stop shipping one.

## Suggested order of attack

1. Restore the `ResizeObserver` stub → suite green → honest testing baseline (§2).
2. Ignore `dev-dist`/`scripts` in ESLint → real backlog visible (§3).
3. `prettier --write` + fix the 46 src lint errors (small, mechanical).
4. Delete `old/` workers, empty `tables/` dirs, tracked `.env`/tsbuildinfo (§7).
5. De-duplicate manifest utils and locale dirs (§4, §9).
6. Execute `plan-worker-status-law.md` — it also absorbs the naming items in §5.
