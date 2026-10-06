# STARTER — specification for the new project

No target stack was given, so concrete technologies are marked `[choice needed]`; everything else is stack-independent and can be executed today.

## Architecture (conceptual tree)

```
.
├── .github/workflows/ci.yml            # PR quality gate            [REQUIRED]
├── .github/workflows/deploy.yml        # build+publish, least priv. [REQUIRED]
├── public/                             # static assets, locales/
├── scripts/build-info.(js|py|sh)       # ONE provenance script      [REQUIRED]
├── src/
│   ├── main                            # mount: providers only
│   ├── app/                            # router + provider stack; exports NOTHING
│   ├── pages/                          # route-level components
│   ├── components/                     # ui/ (kit) + feature folders
│   ├── hooks/                          # ui/ + data/ (one folder per aggregate)
│   ├── orchestration/                  # supervisors, queues, plugin loader  (was: sagas)
│   ├── data/
│   │   ├── models/                     # schema-validated entities, one dir per aggregate
│   │   ├── persistence/                # ONE schema file, repositories, factories, live reads
│   │   └── adapters/                   # external services, one module each
│   ├── config/                         # Zod-validated env accessor — the ONLY env reader
│   ├── lib/                            # result type, error hierarchy, cn(), logging facade
│   └── __tests__/                      # harness shims (i18n no-op etc.)
├── e2e/                                # one smoke test              [REQUIRED]
├── CONTEXT.md                          # glossary with _Avoid_ lists [REQUIRED]
└── CONTRIBUTING.md                     # + PR template               [RECOMMENDED]
```

Shape: private, client-only SPA (no server code); durable state in an embedded local store; any backend is third-party SaaS reached through an adapter; ships as static files; PWA `[assumed from source — confirm before scaffolding]`.

## Stack

| Concern | Recommendation | Transferability basis |
|---|---|---|
| Language | TypeScript strict (project refs, decl-only emit to tmp) — or target's strict static language | `tsconfig*.json` verbatim if TS |
| Build/test | One config file: Vite 7 + Vitest 4 (alias-swap technique, jsdom setup checklist) | ECOSYSTEM — verbatim for web targets |
| UI | `[choice needed]` (source: React 19 + Radix primitives + shadcn-style `ui/` + Tailwind 4) | FRAMEWORK |
| State | Role split, not tool worship: rare system state / orchestration / ephemeral view state. `[choice needed]` if not Redux+saga+Zustand | see DECISIONS D3 |
| Persistence | Embedded local store `[choice needed: IndexedDB/Dexie keeps source verbatim; SQLite-WASM equivalent]`, repositories + factory seam | UNIVERSAL shape |
| Errors | Result type + BaseError hierarchy + `unwrap()` addition | UNIVERSAL |
| Validation | Schema library at model layer (source: Zod `.strict()`) | ECOSYSTEM |
| i18n | Lazy-namespace HTTP backend | FRAMEWORK |
| Lint/format | type-aware lint baseline + deterministic formatter trio | ECOSYSTEM |
| Hooks | husky + lint-staged + tsc | ECOSYSTEM |
| CI | GitHub Actions, SHA-pinned, default-deny — `CI-CD.md` verbatim | UNIVERSAL shape |
| E2E | Playwright `[recommended]` | ECOSYSTEM |

## Configuration files to generate
`package.json` (with `packageManager`, one version truth) · tsconfig solution+app+node · bundler/test single config · eslint flat (type-checked) · prettier (trio plugins) · `global.d.ts` · `.env` templates + `.gitignore` entries for `.env.*.local` and tmp tool output · CI workflows ×2 · PR template.

## Conventions
See `CONVENTIONS.md`. Non-negotiables: Conventional Commits (+emoji), glossary governance, per-line lint-disables with rationale, deps from registry-with-provenance only, one accessor per shared mutable concern (config, plugins).

## Tests
Seam tier first: repositories against in-memory substitute, plugin contract tests, one test per DB migration, one E2E smoke (create → reload → persisted). Component tests thin. See `TESTING.md`.

## Observability / Security / Error handling
Logging facade + error-reporting seam registered at bootstrap (no-op prod adapter initially). CSP + config tiering + CI audit step. Repository methods return `Result`, never throw across the seam. See `OBSERVABILITY.md`, `SECURITY.md`.
