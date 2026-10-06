# OBSERVABILITY

## Observed

- The only instrumentation is the browser console (`console.info/warn/error`) used deliberately at lifecycle points: plugin load, i18n init, saga restart. No structured logging, no metrics, no traces.
- The OTel **API** package is a declared dependency with no usage found — an intention, not an implementation.
- User-facing failure surfacing exists via toast notifications and an events Redux slice (in-app event log) — the closest thing to an operational surface.
- Error objects were designed for observability (`BaseError` carries JSON-serialisable `context`, `cause` chains) but nothing consumes them structurally.
- Debug noise is a known debt: config files log at load, i18n `debug: true` hardcoded — the anti-lesson.

## Principle / implementation / technology separation

```
Principle:      failures crossing boundaries must be structured and exportable
Implementation: error context payloads + one logging facade
Technology:     console adapter (dev) · remote telemetry adapter (prod)
```

## Recommended for the new project

1. **One logging facade module**, never raw console. Two adapters: pretty console in dev, structured JSON in prod. Gated by validated config, never hardcoded flags.
2. **Error-reporting seam wired on day one** even if the remote adapter is a no-op stub: `reportError(BaseError)` → serialise `context` → adapter. `[choice needed: remote sink]` The source proves the value is in the *seam* — the OTel API was added but never used because wiring wasn't part of the bootstrap.
3. **Correlation:** carry a task/job id in every error context and log line where a unit of work is involved (the status-law records already provide the ids).
4. **Daemon heartbeat:** the supervisor logs each restart with the crashed saga's identity — structured, not `console.log(e)`.
5. Keep an in-app diagnostics surface (the events slice idea): a client-only app can only diagnose what the user can paste back to you.
