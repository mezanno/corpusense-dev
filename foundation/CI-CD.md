# CI / CD

## 1. Observed pipeline

One workflow (`gh-pages.yml`), deploy-only, triggered on push to the integration branch:

- `permissions: {}` at top level; each job requests exactly `pages: read`+`contents: read` (build) or `pages: write`+`id-token: write` (deploy) — textbook least privilege.
- All third-party actions **pinned to full commit SHAs with a version comment**.
- `concurrency: group pages, cancel-in-progress: true` — no deployment race conditions.
- Pinned runner `ubuntu-24.04`, Node 22, `npm ci` (not `npm install`), cache npm.
- Jobs split `build → needs → deploy`, artifact upload between them; `environment:` block records the deployment URL.

This workflow is small and exemplary — reuse verbatim (adapting commands to the target).

**Critical gap (Observed as absence):** the documented policy says PRs must pass lint+tests, but no workflow enforces any of it; quality gates run only on developers' machines, and a 46-error lint backlog accrued exactly as predicted. There is also a redundant *fourth* source of truth for npm (a global `npm install -g npm@11.6.4` step contradicting `packageManager` and README).

## 2. Reference pipeline, language-independent (Recommended)

```
Validate   lint --max-warnings 0 · format --check · typecheck/architecture-check
   ↓
Build      deterministic, provenance-stamped (git hash + date injected)
   ↓
Test       unit+seam suites · E2E smoke · (coverage reported; gated on data layers)
   ↓
Package    static artifact / container / binary — one artifact, checksummed
   ↓
Audit      dependency vulnerabilities (prod scope) + lockfile integrity
   ↓
Publish    on main/integration branch only
   ↓
Deploy     separate job, `needs: build`, least privilege, environment with URL
```

Rules that survive any CI product (UNIVERSAL):
- default-deny permissions; per-job grants only;
- third-party actions pinned by digest/SHA;
- concurrency cancellation per deploy group;
- one version manager truth (Corepack or equivalent) consumed by both local and CI;
- Validate runs on every PR and blocks merge (branch protection); Publish/Deploy never on PRs.

## 3. Starter workflows (for a GitHub-hosted target)

- `ci.yml` — PR + push: Validate, Build, Test, Audit (matrix-free, one job; keep it boring).
- `deploy.yml` — source repo's workflow verbatim with commands swapped per target.
- Release: semver tag → CI builds annotated release artifact (the source tags manually; `[RECOMMENDED]` automate after v1).
