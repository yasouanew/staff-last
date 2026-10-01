import type { AppErrorKind } from '../../types/appError';

/**
 * A structured, redacted error report.
 *
 * ## User-facing message vs diagnostic detail
 *
 * The distinction the brief calls out is made explicit here:
 *
 * - `userMessage` is the safe, already-user-facing copy ([`AppError.message`](src/types/appError.ts:1)).
 * - `diagnostic` is the machine-readable summary an engineer needs (method, URL, status,
 *   transport code). It is **never** rendered in the UI.
 * - `cause` is the original error, passed through [`redact`](src/services/monitoring/redact.ts:1)
 *   before it ever leaves this module.
 */
export type ErrorReport = {
    kind: AppErrorKind;
    /** HTTP status when there was a response. */
    status?: number;
    /** Correlation id shared with the server logs for this request. */
    requestId?: string;
    /** `GET`, `POST`, … when known. */
    method?: string;
    /** Path (not the full URL — the base URL is noise and can carry a host). */
    url?: string;
    /** Safe, user-facing copy. */
    userMessage: string;
    /** Engineer-facing summary. Not for display. */
    diagnostic: string;
    /** Redacted original cause. */
    cause?: unknown;
    /** Free-form, redacted, per-call-site context (e.g. `{ screen: 'Home' }`). */
    context?: Record<string, unknown>;
    /** ISO timestamp the report was created. */
    timestamp: string;
    /** `development` | `staging` | `production`. */
    appEnv: string;
    /** App version, when the build supplied one. */
    appVersion?: string;
};

/**
 * A crash/error reporting backend.
 *
 * Implemented once per provider — Sentry, Bugsnag, Firebase Crashlytics — and installed
 * via [`installErrorReporter`](src/services/monitoring/errorReporter.ts:1). The app never
 * imports a provider SDK directly, so swapping one is a single wiring change and the
 * reporter is absent (not a crash) in a build that ships without it.
 */
export type MonitoringProvider = {
    /** Human-readable provider name, used in the fallback log line. */
    name: string;
    /** Receives an already-redacted report. Must never throw. */
    captureError: (report: ErrorReport) => void;
};
