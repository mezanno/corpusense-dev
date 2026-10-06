# FOUNDATION — Corpusense (`corpusense-dev` @ `c7ea5ca`)

Extraction produced by the `/foundations` skill, 2026-09-30. Companion documents live in this folder.

Question answered: *which knowledge, decisions, conventions, patterns and practices of this project deserve to be kept as the foundation of a new project, possibly built with a different technology?*

No target stack was provided, so recommendations stay conceptual; every place where a concrete choice is deferred is marked `[choice needed]`.

---

## 1. What the source project is

**Observed.** A private, client-only single-page application (no server code of its own). React 19 + TypeScript 5.9 (strict) SPA built by Vite 7, shipped as static files to GitHub Pages, installable as a PWA. All durable state lives in the browser (IndexedDB via Dexie); third-party SaaS (Supabase for a job queue bridge, EmailJS, external image servers) is reached directly from the client. Background orchestration runs in redux-saga coroutines inside the same process; heavy processing runs in browser Web Workers and in-process "plugins".

**Inferred.** The shape — "offline-first local-first SPA that processes documents with pluggable background workers" — drove nearly every architectural decision: the local database as single source of truth, the plugin registry, the external-job status bridge, the saga supervisor.

**Domain:** a research-corpus manager for IIIF image/document collections with OCR/LLM extraction workers. The domain itself is **not** reusable here; see `TECHNICAL-DEBT.md` for residue.

## 2. What proved itself (reusability levels)

| Level | Meaning |
|---|---|
| UNIVERSAL | transfers to any language/framework |
| ECOSYSTEM | transfers within a language/tooling ecosystem |
| FRAMEWORK | tied to React/Redux/Vite etc.; replace with target equivalent |
| DOMAIN | business-specific; discard |
| PROJECT_SPECIFIC | too particular to extract |

Summaries of the durable items (details in `PATTERNS.md`, `DECISIONS.md`):

- Result-values-over-exceptions at the data boundary — **UNIVERSAL**
- Local database as the single source of truth, UI subscribed to it — **UNIVERSAL** (technology: ECOSYSTEM)
- Repositories per store behind plain factory functions — **UNIVERSAL** (shape), ECOSYSTEM (no DI container)
- Glob-discovered plugin registry behind one accessor — **ECOSYSTEM** (mechanism), UNIVERSAL (principle)
- Self-restarting saga supervisor — **UNIVERSAL** (principle: supervisors), FRAMEWORK (redux-saga)
- SHA-pinned CI actions, default-deny permissions, concurrency cancel — **UNIVERSAL** (GitHub-Actions syntax: ECOSYSTEM)
- Type-aware linting as the baseline, deterministic formatting on commit — **UNIVERSAL** (tools: ECOSYSTEM)
- TS project references + declaration-only emit into `node_modules/.tmp` — **ECOSYSTEM**
- Build-provenance stamping (git hash + date into a gitignored env file) — **UNIVERSAL**
- Test-mode alias swap for heavy side-effecting packages — **ECOSYSTEM**
- jsdom stub checklist (matchMedia, ResizeObserver, FileSystem handles, WebGL) — **FRAMEWORK** (web platform), reusable verbatim in any web target
- Conventional Commits + domain glossary (`CONTEXT.md`) — **UNIVERSAL**
- Redux for ≤2 slices of system-UI state, saga-only orchestration, Zustand for transient UI state — **FRAMEWORK**

## 3. Separation of concerns observed in the source

Concept → pattern → implementation, the discipline this extraction applies to everything:

- *Concept:* reads should react to data changes. *Pattern:* live-query subscriptions at the repository seam. *Implementation:* `dexie-observable` + repository methods returning closures consumed by `useLiveQuery`.
- *Concept:* errors crossing a boundary are data. *Pattern:* Result type. *Implementation:* `FunctionResult<T, BaseError>` + `BaseError` hierarchy.

## 4. Transferability matrix

| Element | Source | Level | Reusable | Adaptation | Target |
|---|---|---|---|---|---|
| Client-only static SPA shape | repo shape | Universal | Yes | Low | any |
| Local-first DB as source of truth | `data/repositories/indexeddb/` | Universal | Yes | Low | any local-store capable target |
| Dependency layer rule (UI→orchestration→data) | implicit + violated | Universal | Yes (as rule) | Medium | any |
| Result type + BaseError | `utils/functionResult.ts`, `utils/BaseError.ts` | Universal (concept) / Ecosystem (TS impl) | Yes | Medium | native error/result idiom of target |
| Repository-per-store + factory seam | `dbFactory.ts` | Universal | Partial | Medium | reassess at 2nd storage adapter |
| Saga orchestration with supervisor | `state/sagas/index.ts` | Framework | Partial | High | target background-task/coroutine facility |
| Redux + Zustand split | `state/store.ts`, `state/zustand/` | Framework | No | High | target state tool, keep the *why* |
| Plugin registry via glob discovery | `state/sagas/plugins/loader.ts` | Ecosystem | Yes | Medium | target build-time glob or explicit manifest |
| Status-law external-job bridge | workers/Supabase `POSTING`/`POSTED` | Universal (pattern) / Domain (instances) | Yes as pattern | High | any remote queue |
| Vite/Vitest/ESLint-9/Prettier trio configs | config files | Ecosystem | Verbatim | Low | if target is JS/TS |
| TS project-references skeleton | `tsconfig*.json` | Ecosystem | Verbatim | Low | if target is TS |
| CI workflow shape (pinned, least-privilege) | `.github/workflows/gh-pages.yml` | Universal | Verbatim (GH Actions) | Low | any CI with equivalents |
| jsdom/browser-API stub checklist | `vitest.setup.ts` | Framework (web) | Verbatim | Low | web targets only |
| i18n wiring (lazy namespaces over HTTP) | `src/i18n.ts` | Framework | Partial | Medium | target i18n library |
| `cn()` + shadcn-style ui folder | `lib/utils.ts`, `components.json` | Framework | Partial | Medium | any component-kit approach |
| Manual vendor chunks for heavy view libs | `vite.config.ts` | Framework | Partial | Medium | only with a heavy separable lib |
| CONTEXT.md glossary format with `_Avoid_` | `CONTEXT.md` | Universal | Verbatim | None | any |
| IIIF/canvas/annotation model, OCR/LLM workers, Supabase bridge | `data/models/**`, sagas | Domain | No | — | — |
| Dexie schema *file* | `db.ts` | Domain (content) / Universal (shape) | Shape only | Medium | new schema, same file discipline |

## 5. Final synthesis

### À conserver (keep)
- Local-first data spine: single DB schema declaration file, Zod-validated models, repository-per-store, factory DI seam, live reactive reads.
- Errors-as-values at the data boundary (`FunctionResult` + `BaseError` with cause/context).
- One plugin registry module, one accessor; plugins as same-shaped modules validated by a runtime typeguard.
- Supervised long-lived background flows (restart-on-crash, never silent death).
- CI hygiene: SHA-pinned actions, `permissions: {}` default-deny, per-job least privilege, concurrency `cancel-in-progress`, `ubuntu-24.04`, pinned Node, `npm ci`.
- Type-aware linting baseline + fully deterministic formatting (organize-imports / organize-attributes / class-sorter).
- TS project references, strict, declaration-only emit into `node_modules/.tmp` (tooling output never pollutes the tree).
- Single config file for build *and* tests; test-mode alias swap for heavy packages.
- Build-provenance stamping consumed by an in-app version display.
- CONTEXT.md glossary + Conventional Commits; every dependency must justify itself (repo pruned 40 dead deps).

### À adapter (adapt)
- Redux/saga/Zustand tripartition → express as *roles* (rare system state / orchestration side-effects / ephemeral view state) and pick target-native tools.
- `import.meta.glob` registry → any build-time discovery mechanism, or an explicit manifest if the target has none.
- Dexie/IndexedDB → any embedded local store keeping the same *seam* (schema file, repositories, live reads).
- Live-query closure pattern → target's reactivity primitive.
- i18next HTTP-backend lazy namespaces → target i18n with lazy loading.

### À abandonner (discard)
- Mutable plugin exports from the app root (two divergent registries in practice).
- Data-layer imports of the React root / UI store (layering violations).
- Ad-hoc `import.meta.env.VITE_*` reads at ~16 call sites (no validation).
- `react-hooks/exhaustive-deps` switched off without rationale.
- Three sources of truth for the package-manager version (`packageManager`, README, CI global install).
- Duplicated byte-identical provenance scripts; config-file `console.log`s; hardcoded `debug: true` i18n; `stats.html` emitted at repo root.
- Empty scaffold directories for deferred designs (defer as docs/ADRs instead).
- The whole IIIF/worker/job domain model and its integrations.

### À ajouter (missing in source, required for the starter)
See `BOOTSTRAP-CHECKLIST.md`. Headline: PR quality-gate workflow, pre-commit hooks, mechanically enforced architecture boundaries, validated env module, pre-registered error-reporting seam, one E2E smoke test, CONTRIBUTING + PR template, dependency audit in CI.
