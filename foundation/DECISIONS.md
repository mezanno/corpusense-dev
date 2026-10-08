# DECISIONS (candidate ADRs)

Format: Decision / Context / Problem / Options / Chosen / Rationale / Consequences / Tech dependency / Transferability.

---

## D1 — Local database as the single source of truth

- **Context:** personal research tool handling user-owned corpora, used offline, no budget for a server.
- **Problem:** where durable state lives, and what happens when the network doesn't.
- **Options:** server DB; server cache + local mirror; local DB authoritative + SaaS bridges.
- **Chosen:** IndexedDB via Dexie authoritative; Supabase only as a job bridge; bulk data exportable.
- **Rationale:** data ownership, offline-first, zero server ops; the app's whole reason to exist.
- **Consequences:** browser-storage ceilings, blob/metadata split needed, no multi-device sync (accepted), every view must subscribe to the DB.
- **Tech dependency:** none in principle; Dexie/IndexedDB is one implementation.
- **Transferability:** UNIVERSAL.

## D2 — Errors crossing the data boundary are values

- **Problem:** silent `undefined`, swallowed throws, untyped failure paths.
- **Options:** exceptions; result types; sentinel values.
- **Chosen:** `FunctionResult<T, BaseError>` returned by every repository method; typed `BaseError` hierarchy with JSON context.
- **Rationale:** failure is expected at IO boundaries; ~200 call sites proved it survives contact with a real app.
- **Consequences:** combinator discipline (`map/flatMap/match`); a throwing `unwrap()` must be added for catch-style sites; slightly noisier happy path.
- **Transferability:** UNIVERSAL (native idiom per target: `Result` in Rust, wrapper in Go/Java…).
- **Amended (2026-10-08):** "every repository method" overstates the rule actually followed (and followed _well_) in the code. The operative rule is semantic: **every failure mode that is expected _and_ handleable at the call site crosses the boundary as a typed `FunctionResult`; everything else throws.** Concretely: identity lookups whose entity may legitimately be missing return `FunctionResult<T, EntityNotFoundError>`; collection queries represent absence as the empty set (`[]`), not as an error; commands whose only failure mode is an unrecoverable IO incident return plain promises and let the exception reach the saga supervisor / UI boundary, where it is reported once. Uniform `FunctionResult` everywhere would fabricate unreachable `err` branches, push `unwrapOr`-style swallowing into call sites, and erase the type-level signal that marks _designed_ failure modes.

## D3 — Side-effect orchestration exclusively in saga coroutines

- **Context:** long-lived queues (workers), retries, external-job bridging, inside a SPA.
- **Options:** thunks; async handlers in components; service-worker tasks; saga coroutines.
- **Chosen:** redux-saga, thunk **disabled** in the store, sagas supervised by a restart loop, UI dispatches commands only.
- **Rationale:** testable deterministic coroutines; crashed worker can't kill orchestration; one place to read all choreography.
- **Consequences:** two read/write mental models; Redux kept tiny (2 slices); framework lock-in.
- **Transferability:** the _role_ is UNIVERSAL, the tool is FRAMEWORK — replace with the target's supervisor/actor/task-queue facility.

## D4 — DI by plain factory functions, no container

- **Options:** container; manual singletons; factories-per-store.
- **Chosen:** `getXRepository()` factories as the substitution seam.
- **Rationale:** container evaluated and rejected — no second adapter to justify it; explicit, greppable, zero magic.
- **Consequences:** one factory per store (naming drift observed); reactivation trigger: second storage adapter → introduce table/interface pair (`docs/plan-table-seam.md` is banked for exactly this).
- **Transferability:** UNIVERSAL (YAGNI applied to architecture).

## D5 — Plugins as glob-discovered, typeguard-validated modules

- **Chosen:** `import.meta.glob('./workers/*.ts', { eager: true })` + runtime contract check + Zod schema per plugin's runtime params + experimental-flag gating.
- **Rationale:** zero central registration; adding a worker = adding a file.
- **Consequences:** eager bundling (no lazy plugins); registry must be _the only_ holder (source violated this — see D-linked critique); the loader duplicated discovery per plugin kind.
- **Transferability:** principle UNIVERSAL; mechanism ECOSYSTEM.

## D6 — External jobs bridged by a persisted status law

- **Chosen:** `POSTING`/`POSTED` intermediate statuses persisted with the task; one written-down state law (`docs/plan-worker-status-law.md`).
- **Rationale:** the client can't hold a remote call open; crash-safe handoff needs durable intermediate states.
- **Consequences:** state-machine drift is the main hazard — four divergent implementations already observed; the law document is the cure and the reusable artifact.
- **Transferability:** UNIVERSAL pattern; the specific law is DOMAIN.

## D7 — Toolchain minimalism & config consolidation

- **Chosen:** one config file for build+test; deterministic formatting via a 3-plugin Prettier pipeline; type-aware lint as baseline; declaration-only TS emit into `node_modules/.tmp`; periodic dependency pruning (−40 deps in one pass).
- **Rationale:** fewer files that can disagree; formatting arguments settled forever; typecheck never dirties the tree.
- **Consequences:** the single config file grew console noise (see debt); pruning must be recurring, not heroic.
- **Transferability:** ECOSYSTEM (verbatim if the target is the JS/TS world).

## D8 — Static hosting on GitHub Pages, PWA auto-update

- **Chosen:** SPA behind Pages, `VITE_BASE_PATH` as the single deployment knob, workbox `autoUpdate`, dev-mode SW testable.
- **Consequences:** updates are push-automatically (no staged rollout); base-path must thread through router/assets/manifest/i18n — worth centralising in the validated config (see debt).
- **Transferability:** ECOSYSTEM. `[choice: any static host]`

## D9 — Explicit vocabulary governance

- **Chosen:** `CONTEXT.md` glossary with `_Avoid_` forbidden-synonym lists and a _"banked, not shipped"_ marker for deferred designs.
- **Rationale:** one vocabulary for humans and agents; deferred designs stay visible without becoming dead code.
- **Transferability:** UNIVERSAL. Reuse the format verbatim.
