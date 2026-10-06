# SECURITY

## Observed practices (client-only threat model)

- **No server, no first-party secrets.** Third-party API keys are typed by the user at runtime in an in-app configuration page and persisted locally — never baked into the bundle. The Supabase pair used is the *anon* key (public by design), typed through a generated `Database` type so query shape is compiler-checked. This tiering (build-time non-secret config / runtime user-provided keys) is the project's best security decision.
- **CI least privilege:** default-deny permissions, per-job grants, SHA-pinned actions, `npm ci` from a committed lockfile, OIDC for deployment identity (no stored long-lived token).
- **XSS posture:** i18n escaping delegated to React's own escaping (`escapeValue: false` is correct *because* React escapes — the reasoning is documented in-file, which is what makes it safe to keep).
- **Local-first data:** durable user data stays in the browser; export is first-class (data ownership without server dependency).
- **Dev HTTPS with local mkcert-style certs** — secure-context APIs (File System Access) exercised under real conditions.

## Gaps (Observed absences — flagged, not assumed useless)

- **Supply-chain surface:** `xlsx` (SheetJS, known advisories, published outside the registry historically) and a `github:` dependency (`cozy-iiif`) bypass registry provenance/2FA. No audit step in CI.
- **No PR quality gate** → any review/enforcement gap above is aspirational.
- Supabase RLS policies live server-side, invisible from this repo — `UNKNOWN`, must be verified before reuse of that pattern.
- No CSP meta/header configuration found — a static SPA loading third-party origins should set one. `[RECOMMENDED]`
- Runtime-entered keys are persisted in browser storage unencrypted at rest — acceptable for the stated personal-tool model, but must be a *written* decision (ADR), not an accident.

## Baseline for the new project (language-independent)

1. Keep the config tiering: build-time = non-secret + schema-validated; runtime = user-held; nothing sensitive ships in the artifact.
2. CI: least-privilege + pinned + audit step (`npm audit --omit=dev` or target equivalent) + lockfile integrity.
3. One CSP, applied at the static host.
4. Dependencies from registry-with-provenance only; `github:`/URL deps require a written ADR and a vendored-commit pin.
5. Input validation at every external boundary (importers, remote responses) via the same schema layer the models use.
