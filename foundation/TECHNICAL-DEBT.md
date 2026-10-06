# TECHNICAL-DEBT

Format per item: Problem / Impact / Why it probably exists / Recommendation / Priority.

---

## T1. Two divergent plugin registries — **Priority: HIGH**
- **Problem:** `App.tsx` exports mutable `workerPlugins`/`importerPlugins`; the saga layer calls `loadWorkerPlugins()` separately. UI and orchestrator can read different copies.
- **Impact:** command/execution mismatch class of bugs; the app's core loop is the affected surface.
- **Why:** the registry grew out of the UI before the loader existed; no boundary rule stopped the second copy.
- **Recommendation:** one registry module, one accessor, no mutable exports from the app root (already the pattern the loader provides).

## T2. Layering violations data → React root / UI store — **HIGH**
- `src/data/utils/plugins.ts:1`, `data/models/worker/worker.utils.ts:1` import from `@/App`; `data/utils/canvas.ts:2` reaches into a Zustand store.
- **Impact:** the data layer can't be tested or reused outside the component tree — the promise of the whole architecture leaks exactly here.
- **Why:** nothing mechanically enforced the intended rule.
- **Recommendation:** boundary lint rule on day one of the new project; fix here before any reuse.

## T3. Env vars read ad hoc (~16 call sites) — **HIGH**
- Raw `import.meta.env.VITE_*` with casts; `VITE_BASE_PATH` concatenation repeated by hand.
- **Impact:** no validation, silent `undefined` at runtime, deploy-time misconfiguration fails late.
- **Why:** accessor module was created (for Supabase) but the pattern never spread.
- **Recommendation:** one Zod-validated config module, fail-fast at startup, everything imports it.

## T4. No quality-gate CI despite documented policy — **HIGH**
- Deploy workflow exists; lint/format/typecheck/test never run in CI; the 46-error lint backlog is the direct evidence.
- **Recommendation:** PR-blocking `ci.yml` mirroring the deploy workflow's hygiene (pinned, least privilege, concurrency).

## T5. No pre-commit hooks — **MEDIUM**
- Nothing between a developer and an unformatted/unlinted commit.
- **Recommendation:** husky + lint-staged (Prettier) + targeted `tsc -b` at init time.

## T6. `exhaustive-deps` disabled without rationale — **MEDIUM**
- Stale-closure bugs silently welcomed; the React-hooks backlog persists.
- **Recommendation:** rule on; per-line disables only, each with an in-file comment.

## T7. Package-manager version: three sources of truth — **MEDIUM**
- `packageManager: npm@11.6.4` vs README "npm 10+" vs a CI global-install step.
- **Recommendation:** `packageManager` + Corepack as the single truth; CI calls `corepack enable`.

## T8. Duplicated provenance scripts — **LOW**
- `scripts/generate-env.js` and `scripts/build-info.js` are byte-identical; first edit diverges them.
- **Recommendation:** keep one (`build-info.js`).

## T9. Config-file side effects / stray output — **LOW**
- `console.log` in `vite.config.ts:10,19-20` and `vitest.setup.ts:83`; i18n `debug: true` hardcoded (spams production console); visualizer writes `stats.html` to the repo root on every build.
- **Recommendation:** gate debug output on mode; emit stats under `node_modules/.tmp`; configs side-effect-free.

## T10. Empty scaffold directories — **LOW**
- `src/data/tables/{adapters,contracts}` hold a deferred design as dead structure, misleading newcomers and agents.
- **Recommendation:** deferred designs live as ADRs/plan docs; delete the folders.

## T11. Supply-chain surface — **MEDIUM**
- `xlsx` (public-registry-only distribution oddities, known advisories) + `github:jonathan-epita/cozy-iiif` (no registry provenance).
- **Recommendation:** replace/replace-with-ADR + CI audit step on prod deps.

## T12. Untested seams — **HIGH**
- No repository/migration/E2E tests; the local-first loop itself is unverified (see `TESTING.md`).
- **Recommendation:** seam-tier tests + one Playwright smoke test.

### Categorisation
Coupling: T1, T2 · Duplication: T8 · Missing enforcement: T4, T5, T6, T12 · Accidental complexity: T9, T10 · Config hygiene: T3, T7 · Supply chain: T11.

### Domain residue (not debt, just not transplantable)
IIIF/canvas/collection/annotation model and converters; worker/task/job plugin set (OCR, LLM, importers); tile-viewer stack; Supabase jobs bridge and *its* status law; image-server/email integrations; locales content and branding; the Dexie schema stores themselves (the schema *file* is residue; its *shape* is a foundation).
