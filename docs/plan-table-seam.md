# Plan: data-access — quick fixes, real tests, banked Table seam

Status: **reduced scope** (was: full Table/Provider refactor; see Contingency appendix).
Branch: `develop` (plan landed 2026-09-29; former `feat/table-seam-plan` branch retired). Vocabulary: `CONTEXT.md` + `/codebase-design` glossary.

## Scope decision (settled 2026-10-01)

The full Table-seam design (below, appendix) survives design-it-twice scrutiny but is **overkill at this project's size**: the in-memory adapter is a hand-rolled IndexedDB emulation maintained by ~one person, and Phase 3 rewrites the four most logic-dense repos during a period when workers keep changing. Diagnosis stands; treatment cut:

- **Fix the known interface lies directly** — no new abstraction needed to fix two bugs.
- **Test production code, not a fake** — `fake-indexeddb` (already installed) runs the *real* Dexie stack in vitest; that tests the adapter that actually ships.
- **Defer the Table seam** until a reactivation trigger fires. The design is banked, not discarded.
- **Next deepening, if any:** candidate 1 from the architecture report — the `workerStatus` law module (pure functions, zero infrastructure, unblocks the Saga retirement the docs prioritize). Report archived at `docs/architecture-review-2026-09-29.html`.

## Phases

### Phase 0 — groundwork ✅ (committed)
Branch created; `fake-indexeddb` dev dep; `src/utils/NotFoundError.ts` with `EntityNotFoundError` as deprecated alias (tsc green, 14 importers untouched); `CONTEXT.md` seeded.

### Phase 1 — fixes + tests on the real stack ← current
1. **Test harness** (~45 lines): `src/data/repositories/indexeddb/__tests__/harness.ts` — `createTestDb()` opening Dexie over `fake-indexeddb` (fresh DB per file), plus seed helpers. Verify Node's `structuredClone` is reachable under the vitest jsdom env (it is on Node ≥17; if not, polyfill in `vitest.setup.ts` — record outcome here).
2. **`deleteByScope` returns the ids it computed** (`indexeddb/workers.ts:167-182`) — test first: seed workers+results across scopes (collection scope needs the `startsWithIgnoreCase` path), call, assert returned ids == remaining-absent, results cascade gone.
3. **`updateTaskStatus` single-transaction** (`indexeddb/workers.ts:77-158`): read-modify-write of `worker.queue` + status derivation in one `db.transaction('rw', db.workers, …)`; test: two sequential updates keep queue and derived status consistent; status-law cases (illegal transition rejected with `StatusChangeError`) covered.
4. **`WorkerRepository.add` signature**: align `types.ts:210` to the implementation (`WorkerCreateDTO → Promise<Worker>`); let the interface stop lying.
5. **`deleteByScopeAndType` `isTemp`** (`types.ts:46`, impl `annotations.ts:354` ignores it): decide implement-vs-delete at this point (grep call sites first); do not keep a phantom param.
6. **Factory typo**: `getCollectonLiveRepository` → `getCollectionLiveRepository` (4 call sites).
Exit: every fix has a failing-first test on the real Dexie stack; full vitest suite green; `tsc --noEmit` green.

### Policy — what happens to the rest of the old plan
- **Small-repo collapse** (tags, itemMetadata, fsHandle, namedEntities, projects, models, modifierChain, convertedFile, annotationsTemp): not a phase. When any of the nine is next touched for a real reason, reduce it to delegations *in that commit* — no big-bang migration.
- **Aggregate re-implementations over a Table seam**: dormant; see Contingency.
- **`types.ts` split / hook-import inversion** (`CanvasWithSourceId` defined by a React hook): fix opportunistically when the touched file needs it; move the type to `data/models/` in that commit.
- Keep `fake-indexeddb` permanently: it is now the sanctioned way to test anything touching a repository.

### Phase 2 (likely next session) — `workerStatus` deep module (report candidate 1)
One home for the status law currently implemented 4× (`indexeddb/workers.ts:94-142`, `sagas/workers.ts:324-339/345-349/377-406`, `useJobRealtime.tsx:64-79/162-172`, UI capability sets incl. two disagreeing icon mappings). Pure module: `nextQueueStatus`, `workerStatusOf`, capability predicates; no adapters, no IndexedDB. Design it fresh in that session against the code; brief is in the archived report.

## Reactivation triggers for the Table seam (any one suffices)
- A second datastore or a server-tier DAL becomes real (beyond Supabase-as-job-queue).
- Three or more repositories need faking in tests *as collaborators* (not under test).
- A third interface lie surfaces that the direct-fix approach would re-tolerate.
- The small-repo count crosses ~12 and the pass-through tax slows agent work measurably.

## How to resume a future session
1. `git checkout develop`; read `CONTEXT.md`, this file, `docs/architecture-review-2026-09-29.html`.
2. `npx tsc --noEmit -p tsconfig.app.json && npx vitest run` to locate the frontier.
3. Resume at the first unchecked item in Phase 1, or start Phase 2 if Phase 1 is done.
4. Honour the scope decision above: don't re-inflate this plan without a reactivation trigger.

## Contingency appendix — the banked Table seam

Full design (design-it-twice: A minimal / B extensible / C ergonomics; A and B converged independently on descriptor+spec+contract-suite). Chosen hybrid: **B's backbone** (structured `IndexDescriptor`s, discriminated matcher union `eq|in|startsWith`, `SpecError` on unknown index, spec-keyed mutations incl. `deleteWhere→keys`), **A's error discipline** (absence is a value at the seam; single rejection mode `DBError`; `NotFoundError` composed from descriptor), **C's ergonomics** (`getOrNotFound` on `Table`; provider `attempt()`). `Provider = table | transaction('rw', descriptors, fn→value passthrough) | attempt`; module-scope `setProvider`/`resetProvider`, no DI container (Awilix rejection stands); registry is schema truth, current Dexie store-map generated, version history literal.

Ten invariants (each contract-pinned): absence-is-value · single rejection mode · sync programmer errors (`SpecError`) · materialized ordering parity · read-your-writes + abort-on-throw + value passthrough · reentrancy banned · shallow-merge patch incl. explicit `undefined` · empty-inputs no-op · ASCII-folded prefix parity (set-equality pin) · clone-on-read no aliasing.

Rejected with reasons: mode arg (always `'rw'` in inventory); 15-member Table + TxTable split; join-if-superset reentrancy; conformance manifest (no third adapter — YAGNI); Dexie-string descriptors; `select/between/offset/reverse` (zero call sites; rule: **no interface member without a call site**).

**Cost note that drove the demotion:** hand-rolled in-memory IndexedDB emulation (key ordering spec, multiEntry, compound tuples, snapshot rollback) + four aggregate rewrites ≈ 1–2 weeks of infrastructure for a solo-scale app whose open issues are two bugs and zero coverage. The direct path above buys ~80% of the value for ~20% of the cost; this appendix is the escalation path, complete enough to build from without re-running the design exercise.
