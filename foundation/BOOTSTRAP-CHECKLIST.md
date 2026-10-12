# BOOTSTRAP-CHECKLIST

Ordered. Run top to bottom; each step is testable by the next. `[choice needed]` marks the steps that first require picking a target stack.

1. [ ] **Decide target stack** — language, UI framework, local store, i18n, E2E tool. _REQUIRED_ (everything below has a target-dependent instantiation)
2. [ ] **Initialise repository** — git, `.gitignore` (incl. `.env.*.local`, tmp tool output, certs), LICENSE/private, branch layout (`main`/`develop`, deploy on integration branch). _REQUIRED_
3. [ ] **Pin the toolchain once** — `packageManager` + Corepack (or target equivalent); README and CI both consume that single truth. _REQUIRED_
4. [ ] **Scaffold the tree** — directories from `STARTER.md`; no empty placeholder folders. _REQUIRED_
5. [ ] **Configure the build** — single build+test config file; base-path as the one deployment knob; provenance script (`build-info`) wired into the build; no side effects in config files. _REQUIRED_
6. [ ] **Configure type checking** — strict profile incl. unused/fallthrough/side-effect-import flags; declaration-only emit into tmp. _REQUIRED_
7. [ ] **Configure linting** — type-aware baseline; every disabled rule carries an in-file rationale. _REQUIRED_
8. [ ] **Configure formatting** — deterministic trio (imports / attributes / class order). _REQUIRED_
9. [ ] **Configure pre-commit hooks** — husky + lint-staged + typecheck on staged sources. _REQUIRED_
10. [ ] **Create the architecture seams** — `config/` validated accessor (fail-fast), `lib/` Result type + BaseError hierarchy (+`unwrap`), logging facade, `data/persistence/` with ONE schema file + repository + factory, plugin registry module (single accessor, no mutable root exports). _REQUIRED_
11. [ ] **Enforce the layering rule mechanically** — boundary lint rule or dependency checker, wired into lint script. _REQUIRED_ — this is the step whose absence produced the source's two worst defects.
12. [ ] **Configure the test harness** — jsdom setup checklist (matchMedia, ResizeObserver, canvas/WebGL, FS handles), jest-dom, auto-cleanup, test-mode alias swap for heavy runtimes. _REQUIRED_
13. [ ] **First seam tests** — repository CRUD + one migration + plugin contract + E2E smoke (create → reload → persisted). _REQUIRED_
14. [ ] **Configure CI** — `ci.yml` (PR-blocking: lint, format-check, typecheck, arch-check, tests, audit) + `deploy.yml` (SHA-pinned, default-deny, least privilege, concurrency cancel). _REQUIRED_
15. [ ] **Configure security baseline** — CSP at the static host; runtime-key tiering (nothing secret in the bundle); registry-provenance dependency policy; CI audit step. _REQUIRED_
16. [ ] **Configure observability** — dev console adapter + prod error-reporting seam behind one interface; supervisor restart logging. _RECOMMENDED_ (no-op stub acceptable at day 0)
17. [ ] **Configure dev ergonomics** — local HTTPS (mkcert-style, gitignored certs), dev-mode service worker, bundle stats emitted to tmp. _RECOMMENDED_
18. [ ] **i18n wiring** — static locale assets, lazy namespaces, detector + localStorage cache, escaping delegated to the view layer. _RECOMMENDED_ (OPTIONAL for single-language products)
19. [ ] **Write `CONTEXT.md`** — glossary with `_Avoid_` lists and _banked-not-shipped_ markers; import ADRs D1–D9 from `DECISIONS.md`. _REQUIRED_
20. [ ] **Docs** — README (run/build/test + one version truth), `CONTRIBUTING.md`, PR template. _REQUIRED_
21. [ ] **PWA shell** — manifest, auto-update registration, offline strategy matching the local-first promise. _OPTIONAL at day 0, before first real users_
22. [ ] **Recurring hygiene** — scheduled dependency audit + periodic dead-dependency prune (the source's −40-deps pass, made routine). _RECOMMENDED_

Definition of "professional grade at init": steps 1–15 green on the first PR.
