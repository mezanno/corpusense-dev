# TESTING

## 1. What the source has (Observed)

- **23 test files / 372 source files.** Vitest 4, `jsdom`, `globals: true`, one setup file, coverage via v8. Test config lives inside the single `vite.config.ts` (build and test share one config — no drift).
- **Unit tests** around pure logic: converters, model utils, export utils (`src/data/**/__tests__`). High value, framework-free.
- **Component tests** with React Testing Library + jest-dom + user-event, colocated in `__tests__` folders beside the code they test.
- **Harness engineering** is where the real investment sits (`vitest.setup.ts`): auto-cleanup, WebGL/canvas mock, `matchMedia`, `ResizeObserver`, File System Access handles, module mocks for the Supabase config and Clover renderers, and a bundler **alias swap** replacing i18next/react-i18next with local no-op shims under `NODE_ENV === 'test'`.
- **No integration tests of the DB spine, no E2E, no contract tests.** The local-first loop (write → reload → still there) — the app's core promise — is untested.

```
What          Level       Tools                     Framework coupling   Value / Limits
pure models   unit        vitest                    none                 high / misses IO
repositories  (none)      —                         —                    GAP
components    component   RTL + user-event          React                medium / brittle if over-used
i18n heavy    shimmed     alias swap                Vite                 cost-free tests
```

## 2. Generic strategy for the new project (Recommended)

Pyramid sized for a local-first app:

1. **Unit (many):** domain rules, status-law transitions, converters, Result combinators. Zero framework imports — this is what the layering rule buys you.
2. **Seam tests (the missing tier):** test repositories against an in-memory substitute of the same interface; test plugin modules against their typeguard/contract; test each DB version migration. `OBLIGATORY` — these are the tests the boundary seams make cheap.
3. **Component (few):** behaviour of interactive surfaces, not snapshot churn.
4. **One E2E smoke (`OBLIGATORY`):** load app → create an entity → reload → assert persistence. The one flow unit tests structurally cannot cover; Playwright/Cypress `[choice needed]`.
5. **Visual/perf/property:** skip until a measured need — the source survived well without them; do not import complexity.

## 3. Habits to copy

- Tests colocated (`__tests__/` beside subject); one naming convention everywhere.
- The setup file doubles as the documented checklist of "browser APIs the test environment lacks" — keep the comments, they're load-bearing.
- Alias-swap heavy global-runtime packages out of tests rather than mocking them per-file.
- Coverage is reported, not gated, until the seam tier exists; then gate on the *data/orchestration* directories specifically (coverage on UI components is noise).
