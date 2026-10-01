import type { ApiValidationErrors } from './api';

/**
 * Normalised application error.
 *
 * Every failure that reaches UI code is one of these — axios errors, network
 * failures and API error envelopes are all converted by the response interceptor in
 * [`src/api/client.ts`](src/api/client.ts:1). Screens therefore never inspect
 * `error.response` or `error.code` directly.
 *
 * `kind` is the discriminator the UI switches on; `status` carries the HTTP status
 * when there was a response.
 */
export type AppErrorKind =
    /** Request never reached the server (airplane mode, DNS, connection refused). */
    | 'network'
    /** Connection established but no response within `API_TIMEOUT_MS`. */
    | 'timeout'
    /** Request cancelled (screen unmounted, newer request superseded). */
    | 'cancelled'
    /** 401 — token missing, expired or revoked. */
    | 'unauthorized'
    /** 403 — authenticated but not permitted (missing permission or locked company). */
    | 'forbidden'
    /** 404 — resource not found or outside the caller's company. */
    | 'not_found'
    /** 422 — server-side validation failure; `fieldErrors` is populated. */
    | 'validation'
    /** 429 — throttled (login/forgot-password are limited to 6 per minute). */
    | 'throttled'
    /** 5xx or an unparseable body — the server failed, not the request. */
    | 'server'
    /** Anything that does not fit the cases above. */
    | 'unknown';

export type AppError = {
    kind: AppErrorKind;
    /** HTTP status when the server responded; `undefined` for transport failures. */
    status?: number;
    /**
     * Human-readable message safe to show to the user.
     *
     * This is the **user-facing** half of the error. It never contains a stack, a URL,
     * a status code or any diagnostic detail — see `diagnostic` for that.
     */
    message: string;
    /** Server-side field errors for `kind === 'validation'`, keyed by request field. */
    fieldErrors?: ApiValidationErrors;
    /**
     * Correlation id sent with the request (`X-Request-Id`).
     *
     * Echoed here so a user-reported problem can be matched to a specific request in the
     * backend logs. Safe to display in a support context; never auto-shown in the UI.
     */
    requestId?: string;
    /**
     * Engineer-facing one-line summary: `METHOD url kind=… status=… requestId=…`.
     *
     * Deliberately separate from `message` so screens can render friendly copy while a
     * reporter/log carries the diagnostic detail. Never rendered in the UI.
     */
    diagnostic?: string;
    /** Original error, retained for logging/debugging only. Redacted before reporting. */
    cause?: unknown;
};

/** Type guard usable in `catch` blocks and query `onError` callbacks. */
export function isAppError(value: unknown): value is AppError {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as AppError).kind === 'string' &&
        typeof (value as AppError).message === 'string'
    );
}

/**
 * Maps a normalised error to a fallback description used when the API sends no
 * usable `message`. Kept separate from the interceptor so the copy lives with the
 * rest of the user-facing strings.
 */
export function getErrorTitle(error: AppError): string {
    switch (error.kind) {
        case 'network':
            return 'No connection';
        case 'timeout':
            return 'Request timed out';
        case 'unauthorized':
            return 'Session expired';
        case 'forbidden':
            return 'Not permitted';
        case 'not_found':
            return 'Not found';
        case 'validation':
            return 'Check your details';
        case 'throttled':
            return 'Too many attempts';
        case 'server':
            return 'Server error';
        default:
            return 'Something went wrong';
    }
}
