# Plan: one home for the Worker status law (report candidate 1)

Status: **proposed** · Branch: TBD (suggest `feat/worker-status-law`) · Vocabulary: `CONTEXT.md`.
Fulfils Phase 2 of `docs/plan-table-seam.md` ("design it fresh in that session against the code").
Brief source: `docs/architecture-review-2026-09-29.html`, candidate 1. Related: review candidate 4
(queue engine) is built **on top of** this module — design for it, don't build it here.

## The law as found (2026-09-29 audit against the code)

One enum (`WorkerStatus`, `data/models/worker/worker.ts:5` — includes task-level statuses and a
pseudo-status `ALL`) governing four facts, implemented independently in four places:

| Law clause | Copy 1: repo `updateTaskStatus` (`indexeddb/workers.ts:90–158`) | Copy 2: saga (`sagas/workers.ts`) | Copy 3: `useJobRealtime.tsx` | Copy 4: UI |
|---|---|---|---|---|
| task transitions | guards POSTING⇐INPROGRESS, POSTED⇐POSTING, INPROGRESS⇐WAITING\|POSTED; **all other transitions unguarded** | ERROR write + cancel reverts task→WAITING | private `statusMap` (pending→POSTED, processing→INPROGRESS, failed→ERROR, completed→COMPLETED, fallback ERROR); terminal-skip guard | — |
| queue→worker derivation | allFinished→COMPLETED(_WITH_ERRORS) · anyError→INPROGRESS_WITH_ERRORS · anyPosted→POSTED · else INPROGRESS | re-derived inline at end-of-run (`:324–344`) — *different order*: hasError first, so INPROGRESS_WITH_ERRORS never lands | sweeper (`:160–172`) derives its own, then `patch()`es the worker **directly, bypassing the repo** | — |
| cancel / crash recovery | — | `finally/cancelled`: INPROGRESS(_WITH_ERRORS)→UNFINISHED(_WITH_ERRORS) · `initWorkersStatus:371–406`: non-terminal tasks→WAITING, POSTED survives, else UNFINISHED(_WITH_ERRORS) | — | — |
| capabilities (stop/recover/select/icons) | — | stop listener reads INPROGRESS(_WITH_ERRORS) | — | `WorkerContext.getStatus` + `isWorkerOrTaskRunning`; restart set (`WorkerDetails:28–31`); selector set (`WorkerSelector:15–21`); **two disagreeing icon maps** (`WorkerStatusIcon.tsx` vs `workers/workerUtils.tsx`: WAITING→spinner vs calendar-clock, POSTING→spinner vs pause) |

Known drifts (each is a decision ticket, not a bug report): sweeper forces `COMPLETED` on
never-started tasks when Supabase runs empty; `customWorker.ts:96` patches POSTED straight into
the row; the gallery's per-canvas gate passes `{collectionId}` (`CollectionInspectorGalleryItemContent.tsx:43`)
so a canvas shows "running" because a sibling is queued.

## Decisions this plan honours

- **Result pattern** (doc 13): transition refusal is `FunctionResult.err(StatusChangeError)` — error class keeps its name, relocates next to the law, deprecated alias left at the old import path (same trick as `NotFoundError` in table-seam Phase 0).
- **No IoC container** (doc 12): the law is an imported pure module, not an injected service.
- **Saga retirement** (docs 04/10, report candidate 4): the law must not import Redux, redux-saga, Dexie, React, or Supabase — that is what makes the future queue-engine swap a re-cabling job.
- **Direct-fix proportionality** (table-seam scope decision): no new seams beyond the module itself; call sites are ported, not wrapped.
- **CONTEXT.md**: *Task* and *Worker* already defined; add **Status law** as the single term; no new module word.
- **Testing**: the law is tested as pure functions (zero jsdom, zero fake-indexeddb); fake-indexeddb remains for the repo-level tests that pin *use* of the law.

## The module (interface, designed here)

`src/data/models/worker/workerStatusLaw.ts` — lives with the enum it governs, imports only it.

```ts
// task event algebra — the only way a task moves
taskEvents: START · POST · JOB_ACCEPTED · RESULT_OK · RESULT_ERR · REQUEUE
nextTaskStatus(current: TaskStatus, event): FunctionResult<TaskStatus, StatusChangeError>

// the two derivations, one implementation each
workerStatusOf(queue: Task[]): WorkerStatus | null   // null on empty queue
recoveredOf(worker): { status, queue }               // unifies cancel-path + initWorkersStatus

// capability predicates — UI stops comparing raw statuses
isRunning(w) · canStop(w) · canRecover(w) · isAwaitingRemote(w) · isTerminalTask(t)

// adapters feed the law, the law feeds them nothing back
taskStatusOfJobStatus(supabaseJobStatus: string): TaskStatus   // useJobRealtime's statusMap moves home
```

Design constraints: total function (`Result`, never throw); exhaustive allow-list (see D1);
`ALL` stays a UI filter concept outside the law; plugins emit **events**, never statuses.

## Phases

### Phase 0 — pin the current behaviour first (half a session, test-only commit)
Characterisation tests against the code *as it is*, before moving anything: the repo's three
guards + unguarded default (fake-indexeddb), the saga's end-of-run derivation order, the cancel
mapping, `initWorkersStatus` recovery table, the sweeper's forced-COMPLETED, the terminal-skip
guard. These tests are the diff detector for every port below and get rewritten — deliberately —
in Phase 2 only where a decision ticket changes behaviour.
**Decision tickets, resolved here and recorded below:**
- **D1 — exhaustiveness.** Replace the 3 guarded transitions + unguarded `default:` with a total allow-list over the task lifecycle. *(Recommended: yes — the current `default: break` is how `customWorker` got away with patching POSTED; a law that permits drift isn't one.)*
- **D2 — the empty-queue sweeper.** Current code lies (forces COMPLETED on WAITING tasks). *(Recommended: sweeper becomes `RESULT_ERR`/`REQUEUE` events through the law; a vanished job must not fabricate success.)*
- **D3 — the gallery gate.** *(Recommended: fix scope plumbing in this plan's last phase — it's a law *consumer* bug, visible once capabilities are shared.)*
- **D4 — enum split.** `TaskStatus` vs `WorkerStatus` are one enum today. *(Recommended: **defer** — do it only after the four copies are gone; the law module works on a subset either way.)*
- **D5 — icon/colour maps.** *(Recommended: one `statusPresentation` table in `workers/workerUtils.tsx`, both icon components read it; glyphs remain a UI choice, not a law concern.)*

### Phase 1 — the law module (one session, pure code + pure tests)
Write `workerStatusLaw.ts` + table-driven unit tests (one test file, ~15 cases: every event ×
every current status, derivation on the eight queue shapes, recovery for both crash variants,
capability sets). `StatusChangeError` moves here; deprecated re-export at the old path.
Exit: `tsc --noEmit` green, new suite green, **no production call site touched yet** — the
module and the four copies coexist, deliberately, for one phase.

### Phase 2 — port the call sites (one commit per port; each keeps Phase 0 tests green or cites a D-ticket)
1. **Repo** `updateTaskStatus` → guards+derivation from the law; lands together with the
   single-transaction fix it needs anyway (table-seam Phase 1 item 3 — tick that item here).
2. **Saga** end-of-run, cancel path, `initWorkersStatus` → `workerStatusOf` / `recoveredOf`; the saga stops *containing* the law, it stops *implementing* it.
3. **useJobRealtime** → `taskStatusOfJobStatus`, `isTerminalTask`; sweeper rewritten as law events (D2). The direct `patch()` of `status` disappears — realtime may only move tasks; the queue derivation moves workers. That is the invariant this phase exists to make mechanical.
4. **Plugins** → emit events (`layoutExtraction.ts:73` POSTING via `POST`; `customWorker.ts:96` POSTED via `JOB_ACCEPTED`). Plugin authors get an event vocabulary, not an enum.
5. **UI** → `WorkerContext` predicates, `WorkerDetails`, `WorkerSelector` consume the capability functions; `WorkerStatusIcon` loses its private if-chain to the shared table (D5).
Exit: grep test — outside the law module and its tests, `case WorkerStatus.` / `status === WorkerStatus.` appear in at most the presentation table and the `ALL`-filter helper.

### Phase 3 — the drifts that change behaviour (each its own commit, its own before/after in this file)
1. Sweeper semantics (D2): vanished remote jobs → REQUEUE/ERROR, never fabricated COMPLETED.
2. Gallery gate (D3): canvas scope instead of collection scope.
3. Terminal-frozen tasks (D1): Phase 0 pinned which callers relied on the unguarded `default:`; fix those call sites (expected: none, but the tests decide, not this plan).

### Phase 4 — close-out
Tick Phase 2 in `plan-table-seam.md` and mark candidate 1 done in the archived report's terms
(add a line here, don't edit the HTML); add the **Status law** entry to `CONTEXT.md`; update
`public/doc/optimization/10-Optimizations-Status.md`; note in the file that the queue-engine
extraction (candidate 4) now starts from one law and one repo write path.

## Exit criteria (plan-level acceptance)
- Four copies, zero: one module answers every lifecycle question (`grep` gate above).
- The two disagreeing icon mappings are one table.
- `GETTING A WORKER INTO EACH STATUS IS ONLY POSSIBLE THROUGH` the law — repo guards, saga,
  realtime, and plugins all route through it; a test proves the direct-`patch` POSTED path is gone.
- Pure tests run without jsdom or Dexie; the status law has one home, proven by import graph, not by comment.

## How to resume a future session
1. Read this file, the candidate-1 section of the archived report, and Phase 1 of `plan-table-seam.md` (its item 3 merges into Phase 2.1 here).
2. `npx tsc --noEmit -p tsconfig.app.json && npx vitest run` — the Phase 0 characterisation tests tell you exactly where the frontier is.
3. Resolve D1–D5 by appending dated answers to this file (ADR-by-plan-doc, the established pattern), then start Phase 1.
