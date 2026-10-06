# ARCHITECTURE

## 1. Real architecture of the source (Observed)

The project is a **client-only, offline-first SPA with an event-orchestration layer over a local database**. There is no backend of its own; external services are client-side adapters.

```
                    ┌───────────────────────────────────────────┐
 route (pages) ───▶ │ UI: pages → components → hooks(data)      │  React, live reads
                    └─────────────────┬─────────────────────────┘
                                      │ commands (actions)
                    ┌─────────────────▼─────────────────────────┐
                    │ Orchestration: redux-sagas                │  queues, retries,
                    │  (root saga + self-restarting supervisor, │  external-job bridge
                    │   plugin registry loaded by glob)         │
                    └─────────────────┬─────────────────────────┘
                                      │ function calls returning FunctionResult
                    ┌─────────────────▼─────────────────────────┐
                    │ Data: repositories (one per store),       │
                    │  factory seam (getXRepository()),          │
                    │  Zod models, one Dexie schema file        │
                    └─────────────────┬─────────────────────────┘
                                      ▼
                    IndexedDB (single source of truth)  +  client adapters
                                                         (Supabase, EmailJS,
                                                          IIIF servers, LLM APIs)
```

Three state compartments, by role (Observed):

| Role | Tool | Size | Rule |
|---|---|---|---|
| System UI state (events log, worker statuses) | Redux Toolkit | 2 slices, thunk **disabled** | async side-effects forbidden in reducers/thunks — sagas only |
| Background orchestration state | sagas (in-process) | queues, retries | long-lived, supervised |
| Ephemeral UI state | React state / 1 Zustand store / Contexts | small | never persisted, never authoritative |
| Durable domain data | IndexedDB via live queries | everything that survives reload | the *only* source of truth |

Data flow: **reactive reads, imperative writes.** UI subscribes to the DB directly (`useLiveQuery` over `dexie-observable`); mutations are issued as commands consumed by sagas; sagas call repositories; repositories return `FunctionResult`.

## 2. Dependency rule (the rule the project *meant* to have)

```
pages → components → hooks(data) → sagas → repositories → models
                          ▲                        ▲
             plugin registry (its own module) ─────┘  (plugins depend inward only)
config accessor ← (everyone, via one module only)
```

Observed violations (see `TECHNICAL-DEBT.md`): `data/utils/plugins.ts` and `data/models/worker/worker.utils.ts` import from `@/App` (the React root); `data/utils/canvas.ts` imports a Zustand store. The rule was intended but never mechanically enforced.

**Recommended rule for a new project (universal, language-agnostic):**

```
Interface → Application → Domain ← Infrastructure
```

- The data/domain layer must never import UI, framework entrypoints, or view-state stores.
- One accessor per shared mutable concern (plugin registry, config).
- Enforce mechanically on day one with an architecture lint rule (boundary rules in the linter, or a dependency-graph checker) — linters alone don't protect seams. `[choice: tool depends on target ecosystem]`

## 3. Conceptual architecture (framework-erased)

```
Interface        presentation, routing, i18n, accessibility
   ↓ commands / ↑ reactive reads
Application      use-case orchestration, queues, retries, external-job bridging,
                 plugin dispatch — the only place with side-effect choreography
   ↓ FunctionResult<T, E>
Domain           entities, invariants, status laws, value types
   ↓
Persistence      one embedded local store; schema in ONE declaration; repositories
                 per aggregate/store; factory functions as the substitution seam
External systems adapters (remote queue, HTTP APIs), each behind its own adapter module
```

Responsibilities and forbidden dependencies:

| Component | Responsibility | May import | Forbidden |
|---|---|---|---|
| Interface | render, route, translate | Application | Persistence, external adapters directly |
| Application | orchestrate | Domain, Persistence (via seam), adapters | UI frameworks' internals, view state |
| Domain | invariants | itself | everything upward |
| Persistence | durable IO, transactions | Domain models | Application, Interface |
| Adapters | protocol translation | Domain | everything upward |

## 4. Async model (Observed → abstracted)

- Long-lived background flows are **coroutines supervised by a restart loop** (`launchSaga`: `while(true) try call(saga)`) — one crashed worker cannot silently kill orchestration. Universal principle: every daemon needs a supervisor + a structured log line on restart.
- Unit-of-work dispatch goes through a **plugin seam**: tasks carry a plugin name; the registry maps name → capability; each plugin validates its runtime parameters against a schema (Zod) at the boundary.
- Work handed to a remote service the client can't hold open is tracked with a **persisted intermediate status pair** ("handed off" / "acknowledged") polled back — a *status law* that must be written down exactly once (source repo has its own fix-plan doc precisely because four implementations diverged).

## 5. Module design notes (Observed, praised)

- The plugin loader and the DB factory are **deep modules**: small surface (`loadWorkerPlugins()`, `getXRepository()`), large absorbed behaviour.
- The deferred "table seam" design (`docs/plan-table-seam.md`, glossary marked *"banked, not shipped"*) is the right way to park an idea: as a written plan, **not** as empty directories on disk.
