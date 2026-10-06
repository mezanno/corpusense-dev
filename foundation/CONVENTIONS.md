# CONVENTIONS

## Observed (in the source project)

### Code
- TypeScript `strict: true` plus opt-ins: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, bundler resolution, `isolatedModules`.
- Type-aware linting is the baseline (`recommendedTypeChecked`), `no-explicit-any: error`, `strict-boolean-expressions: error`, `no-shadow: error`.
- Path alias `@/* → src/*`, mirrored in both tsconfig and bundler config (single source rule: keep the two in sync).
- `@ts-ignore` forbidden in practice; bleeding-edge DOM types are declared centrally in one `global.d.ts` file.
- Domain entities described as Zod schemas with `.strict()`, types inferred from schemas (`z.infer`) — schema is the source of truth, not the type.
- Errors that cross the repository boundary are `FunctionResult`, never thrown (with `fromPromise` as the exception-capturing adapter).

### Naming
- Repositories: `IndexedDBXRepository` class + `getXRepository()` factory.
- Live variants: `XLiveRepository` in a `liveQuery/` sibling folder, `.live` filename suffix.
- Folders by *responsibility kind* (`pages/ components/ hooks/ state/ data/ utils/ lib/`), feature subfolders inside `components/`, aggregate subfolders inside `data/models/`.
- A domain glossary (`CONTEXT.md`) defines each term with an explicit `_Avoid_: <forbidden synonyms>` list.

### Git
- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`) with emoji markers (`feat: ✨`, `fix: 🐛`, `chore: ✂️`).
- Semver tags (`v1.5.1`).
- Fork → upstream flow; `develop` as long-lived integration branch; deploy triggers on push to integration branch only; `gh-pages` as artifact branch.

### Docs
- README holds onboarding + PR policy prose.
- `docs/` holds dated review/inconsistency-scan reports and plan docs (`plan-*.md`) — decisions-in-progress live as documents, not comments.
- Every heavyweight config file keeps its reference URL as a header comment.

## Recommended (for the new project)

- Keep all of the above — they are UNIVERSAL practices — **except**:
  - **[correction]** Do not put deferred design as empty scaffold directories; park it as an ADR/plan doc (the source violated its own convention).
  - **[correction]** Any lint rule turned off gets an in-file rationale comment. (Source turned off `exhaustive-deps` silently and grew stale-closure bugs.)
  - **[correction]** One source of truth per version number (toolchain version lives in exactly one manifest field consumed by both README and CI).
  - **[correction]** Config files stay side-effect-free: no `console.log` at config load; tool artifacts (bundle stats) are emitted under a gitignored tmp dir.
- Deterministic formatting on every commit via pre-commit hook (add; absent in source).
- Every dependency must survive a periodic dead-dependency prune (source ran one: −40 deps — make it a recurring practice, not a rescue).
