# Error handling

## Overview

[`src/api/client.ts`](../src/api/client.ts:1) is the single place errors are produced.
This document covers the operational layer around it: retries, correlation ids,
redaction, session-expiration handling, and reporting.

## 1. Retry with backoff (safe requests only)

[`retryPolicy.ts`](../src/api/retryPolicy.ts:1) retries transient failures with jittered
exponential backoff.

| Aspect | Rule |
|---|---|
| Methods | `GET`/`HEAD`/`OPTIONS` only |
| Failures | No response (network/timeout), or status `408`/`425`/`429`/`500`/`502`/`503`/`504` |
| Attempts | `API_RETRY_MAX_ATTEMPTS` total (default 3) |
| Backoff | `min(max, base × 2^attempt) × jitter(0.5–1)`, `API_RETRY_BASE_DELAY_MS` (300) → `API_RETRY_MAX_DELAY_MS` (5000) |
| Opt-out | `retry: false` on the request config |

**Mutating methods are never retried automatically.** A request that timed out may have
been applied, and replaying it could submit a leave request twice. Those are handled by
the [durable outbox](../src/services/outbox/outboxStore.ts:1), which dedupes. See
[`docs/mutation-policy.md`](mutation-policy.md).

Jitter matters: without it, devices that lost connectivity together retry in lockstep
and re-DDoS the backend the moment it recovers.

## 2. Request correlation ids

Every request carries `X-Request-Id` ([`requestId.ts`](../src/api/requestId.ts:1)), from
`crypto.randomUUID` where available. It is attached by the request interceptor, replaced
by the server's id when echoed, written onto
[`AppError.requestId`](../src/types/appError.ts:1), and included in the log line and the
[`ErrorReport`](../src/services/monitoring/types.ts:1). That turns "it failed at 3pm"
into one traceable request.

## 3. Redaction

[`redact.ts`](../src/services/monitoring/redact.ts:1) is a security boundary. Error
causes routinely carry request configs and response bodies, so before anything is
reported or logged: sensitive keys (`authorization`, `token`, `password`, `secret`,
`cookie`, `fcm`, `refresh`, `credential`, `email`, `phone`, …) become `[redacted]`;
strings are truncated; depth and array length are capped; `Error`s are reduced to
`{ name, message, stack }`.

## 4. Single-flight session expiration

A screen firing several requests in parallel gets several 401s within milliseconds.
Clearing the session N times would race and could sign out a session a concurrent login
just established. `notifyUnauthorized` ([`client.ts`](../src/api/client.ts:1)) collapses
the burst into one transition (`UNAUTHORIZED_COOLDOWN_MS`, 1000ms). The handler is
registered by the session store
([`sessionStore.ts`](../src/features/auth/store/sessionStore.ts:1)) and only calls
`clearSession()`; the navigator falls back to the Auth stack. The API layer never
navigates.

This also fixes a latent gap: the handler setter existed but was never called, so a 401
previously did **not** proactively clear the session.

## 5. Envelope validation

The success envelope is validated, not cast (`unwrapEnvelope` in
[`client.ts`](../src/api/client.ts:1)): an HTML/gateway body (`<`) is rejected as a
`server` error; an object claiming to be an envelope must have a boolean `success`; a
`success: false` body on a 2xx status is contradictory and rejected. A non-envelope body
is passed through. Field-level validation of the unwrapped payload then happens
per-endpoint — see [`docs/api-response-validation.md`](api-response-validation.md).

## 6. Reporting (Sentry / Bugsnag / Crashlytics)

[`src/services/monitoring/`](../src/services/monitoring/errorReporter.ts:1) defines a
provider-agnostic seam: a [`MonitoringProvider`](../src/services/monitoring/types.ts:1)
is `{ name, captureError }`, installed once at startup via
[`bootstrapMonitoring`](../src/services/monitoring/bootstrap.ts:1) from
[`index.js`](../index.js:1).

- **Reported:** `network`, `timeout`, `server`, `unknown`.
- **Not reported:** `validation`, `forbidden`, `not_found`, `unauthorized`, `cancelled`
  — normal control flow, and reporting it buries the real errors.

Wiring a provider is a one-line change; the SDK is never imported by the app core. Import
the SDK, then call `installErrorReporter` with an object whose `captureError` forwards
`report.diagnostic`, `report.requestId`, `report.cause` and `report.context` to the
provider. [`bootstrap.ts`](../src/services/monitoring/bootstrap.ts:1) contains a worked
Sentry example.

With no provider wired, reports are still produced, redacted, and logged locally. If
`MONITORING_ENABLED=true` but nothing is installed, startup logs a loud warning so a
production build cannot silently collect nothing.

## 7. User-facing message vs diagnostic detail

[`AppError`](../src/types/appError.ts:1) keeps these separate:

| Field | Audience | Contains |
|---|---|---|
| `message` | User | Friendly copy only — no stack, URL, or status |
| `fieldErrors` | User (form) | Per-field validation strings |
| `diagnostic` | Engineer | `METHOD url kind=… status=… requestId=…` |
| `requestId` | Support/engineer | The correlation id |
| `cause` | Engineer | Original error (redacted before reporting) |

Screens render `message`; reporters and logs carry `diagnostic`/`cause`. The two never
cross.

## 8. Cancellation

`cancelled` is a first-class kind, distinct from a failure: an unmounted screen or a
superseded request is not an error to show or report. `normalizeError`
([`client.ts`](../src/api/client.ts:1)) maps axios cancellations to it, and it is
excluded from reporting.

## Testing

- [`api/__tests__/clientErrorHandling.test.ts`](../src/api/__tests__/clientErrorHandling.test.ts:1)
  — correlation ids, retry vs no-retry, single-flight 401, envelope validation, reporting.
- [`api/__tests__/retryPolicy.test.ts`](../src/api/__tests__/retryPolicy.test.ts:1) —
  idempotency, retryable statuses, attempt cap, backoff bounds.
- [`services/monitoring/__tests__/redact.test.ts`](../src/services/monitoring/__tests__/redact.test.ts:1)
  and [`errorReporter.test.ts`](../src/services/monitoring/__tests__/errorReporter.test.ts:1)
  — redaction and the report/no-report split.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `API_RETRY_MAX_ATTEMPTS` | `3` | Total attempts (including the first) for safe requests. |
| `API_RETRY_BASE_DELAY_MS` | `300` | First backoff delay. |
| `API_RETRY_MAX_DELAY_MS` | `5000` | Backoff cap. |
| `MONITORING_ENABLED` | `false` | Whether a reporter is expected. |
| `MONITORING_PROVIDER` | — | Provider label (`sentry`/`bugsnag`/`crashlytics`). |
| `MONITORING_DSN` | — | Provider DSN, consumed by the wired provider. |

## Related

- [`docs/api-response-validation.md`](api-response-validation.md) — field-level validation.
- [`docs/mutation-policy.md`](mutation-policy.md) — how mutating writes are made durable.
- [`docs/session-state-model.md`](session-state-model.md) — the session trust model.
