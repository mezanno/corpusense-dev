# PATTERNS

Each pattern: problem → principle → **abstract version** (framework-free) → source implementation (one particularisation).

---

## P1. Result-values at the boundary
- **Category:** error handling · **Level:** UNIVERSAL (impl ECOSYSTEM)
- **Problem:** thrown errors across the data boundary are invisible to the type system, caught too late or not at all; `undefined` leaks as failure signalling.
- **Principle:** at seams where failure is *expected*, return a discriminated result value instead of throwing; keep throwing for programmer errors only.
- **Abstract:** a sum type `Result<T, E>` with constructors and combinators (`map`, `flatMap`, `unwrapOr`, `match`, `fromPromise`), plus an `unwrap()` that throws for the few call sites that genuinely want exceptions.
- **Source:** `FunctionResult<T, E = BaseError>` (~200 call sites — proven in production). Gap: no `unwrap()`; `AsyncFunctionResult = Promise<FunctionResult>` appears by convention.

## P2. Typed error hierarchy with structured context
- **UNIVERSAL.** One `BaseError extends Error` carrying `cause` and a JSON-serialisable `context` payload; `name` derived from the constructor; domain subclasses (`NotFoundError`, DB error, status errors). Structured context makes errors loggable/exportable without string parsing.

## P3. Repository-per-store behind a factory seam (DI without a container)
- **UNIVERSAL / right-sized.** One class per entity store, factories (`getXRepository()`) as the only injection seam; no DI container (evaluated and rejected). Reassess when a *second storage adapter* appears — that's the trigger for an interface + adapter pair, not earlier.
- Test substitution today happens by mocking at module level; the seam stays honest as long as no consumer imports the class directly.

## P4. Reactive reads beside command writes (local-first spine)
- **UNIVERSAL (pattern) / FRAMEWORK (impl).** The database is authoritative; every view subscribes to it directly; only orchestration writes, imperatively. Cost observed: two mental models (reactive read vs. command write) and constant temptation to route reads through the store. Mitigation: a *live-read* repository variant returning thunks/closures so the subscription mechanism is swappable.
- **Abstract:** "query + change-feed" read model; the UI layer never owns a copy of durable data.

## P5. Glob-discovered plugin registry behind a single accessor
- **Level:** ECOSYSTEM (mechanism), UNIVERSAL (principle).
- **Principle:** for a stable set of same-shaped extension modules, discovery replaces registration: the build system enumerates the folder, each module is validated at load by a runtime typeguard, parameter schemas are validated at the boundary.
- **Abstract:** one registry module, one `getPlugins()` accessor; **no mutable plugin export from the app root** (the source had two divergent registries — UI vs orchestrator — the top architectural flaw found in the review).
- Costs: eager bundling, no lazy loading. Don't use if plugins must be fetched at runtime.

## P6. Supervised long-lived flows
- **UNIVERSAL principle, FRAMEWORK mechanism.** Root "daemons" run under a supervisor loop (`while(true) try call(saga)`), detached from component lifetimes, with a structured log line on each restart. Any target with coroutines/actors/threads can express it; silent death of background orchestration is the failure it prevents.

## P7. Status-law bridging of external jobs
- **UNIVERSAL pattern, DOMAIN instances.** When work is handed to a remote queue the client cannot hold open, persist an intermediate status *pair* ("posted", "acknowledged") as the single written-down law of that lifecycle; poll/webhook back into the local state machine. The reusable part is the **fix-plan format** (`docs/plan-worker-status-law.md`): one canonical state diagram + a migration table, enforced by code review. Four divergent implementations of the same law is the documented failure mode.

## P8. Test-mode alias swap
- **ECOSYSTEM.** Heavy/global side-effecting packages (i18n runtime) are aliased to local no-op shims in test mode, so tests neither pay their cost nor need their setup. Generic across bundlers; keep shims beside tests so they can't leak into production builds.

## P9. jsdom capability checklist (what a DOM emulator never gives you)
- **FRAMEWORK (web targets).** The setup file's stubs are the checklist: `matchMedia`, `ResizeObserver`, WebGL/canvas context, File System Access handles, plus jest-dom matchers and auto-cleanup. Reuse the file, not the comments around it.

## P10. Build-provenance stamping
- **UNIVERSAL.** 12 lines of pre-build code: git hash + ISO date → gitignored env file → build-time constants → an in-app version display. One script only (the source had two byte-identical copies — drift guaranteed).

## P11. Validated-config-by-accessor
- **UNIVERSAL (principle), currently RECOMMENDED (source failed at it).** Every build-time setting is read **once**, validated (schema parse of the env object), and exported from a single accessor module. Components import the accessor, never raw env. Fail fast at startup on invalid config. The source read `import.meta.env.VITE_*` ad hoc at ~16 call sites with `as string` casts — silent `undefined` at runtime is the failure mode.

## P12. Manual chunk extraction for heavy view libraries
- **FRAMEWORK.** Three lines of build config keep the app shell interactive when the app embeds one very heavy, separable viewer library. Only worth it under that condition.

## P13. `cn()` classname composition
- **FRAMEWORK.** A single helper composing conditional classnames and resolving conflicts (clsx + tailwind-merge); the companion seam of a copy-in component kit (`components.json` keeps the kit CLI working out of the box). In other ecosystems: the equivalent of "one styling composition helper, everywhere".

## P14. i18n over HTTP with lazy namespaces
- **FRAMEWORK.** Translation files shipped as static assets, namespaces fetched on first use, language detected + cached in localStorage, escaping delegated to the view layer (React already escapes). Reusable structure; library is swappable. `[choice: i18n facility of the target]`

## Anti-patterns observed (do not transplant)
- Mutable module-level registries exported from the UI root (P5 correction).
- Lint rules disabled repo-wide instead of per-line with rationale.
- Empty directories as design placeholders.
- Side effects (console output, file writes) inside build-tool config modules.
