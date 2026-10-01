import type { AppError, AppErrorKind } from '../types/appError';

/**
 * Error helpers shared by the API layer and the UI.
 *
 * The conversion from axios/unknown failures into [`AppError`](src/types/appError.ts:1)
 * happens in the response interceptor in [`src/api/client.ts`](src/api/client.ts:1);
 * this module only classifies and describes the already-normalised result.
 */

/** HTTP status → error kind, used by the interceptor. */
export function kindFromStatus(status: number): AppErrorKind {
    if (status === 401) {
        return 'unauthorized';
    }

    if (status === 403) {
        return 'forbidden';
    }

    if (status === 404) {
        return 'not_found';
    }

    if (status === 422) {
        return 'validation';
    }

    if (status === 429) {
        return 'throttled';
    }

    if (status >= 500) {
        return 'server';
    }

    return 'unknown';
}

/** Fallback copy per error kind, used when the API sends no `message`. */
export function defaultMessageForKind(kind: AppErrorKind): string {
    switch (kind) {
        case 'network':
            return 'No internet connection. Check your network and try again.';
        case 'timeout':
            return 'The server took too long to respond. Please try again.';
        case 'cancelled':
            return 'The request was cancelled.';
        case 'unauthorized':
            return 'Your session has expired. Please sign in again.';
        case 'forbidden':
            return 'You do not have permission to perform this action.';
        case 'not_found':
            return 'We could not find what you were looking for.';
        case 'validation':
            return 'Please correct the highlighted fields and try again.';
        case 'throttled':
            return 'Too many attempts. Please wait a moment and try again.';
        case 'server':
            return 'Something went wrong on our end. Please try again shortly.';
        default:
            return 'Something went wrong. Please try again.';
    }
}

/** Builds an `AppError` without an HTTP response (transport-level failure). */
export function createTransportError(kind: 'network' | 'timeout' | 'cancelled' | 'unknown', cause?: unknown): AppError {
    return {
        kind,
        message: defaultMessageForKind(kind),
        cause,
    };
}

/**
 * True when the error kind is worth offering a retry for. Validation and
 * authorization failures will never succeed on a blind retry.
 */
export function isRetryable(error: AppError): boolean {
    return (
        error.kind === 'network' ||
        error.kind === 'timeout' ||
        error.kind === 'server' ||
        error.kind === 'unknown'
    );
}

/** True when the error means the user must return to the authentication flow. */
export function requiresReauthentication(error: AppError): boolean {
    return error.kind === 'unauthorized';
}

/**
 * True when the API rejected the request because the company's trial/subscription
 * is not valid (`company.access` middleware → 403). Spec Screen 4/13 renders a
 * paywall interstitial for this rather than a generic permission error.
 *
 * The middleware returns a plain 403, so this is a best-effort message match and is
 * intentionally conservative: it only classifies a 403 as a lock when the message
 * mentions a subscription or trial.
 */
export function isCompanyAccessLocked(error: AppError): boolean {
    if (error.kind !== 'forbidden') {
        return false;
    }

    const message = error.message.toLowerCase();

    return message.includes('subscription') || message.includes('trial');
}

/**
 * Flattens server field errors into `{ field: firstMessage }`, which is the shape
 * React Hook Form's `setError` expects. Only the first message per field is used —
 * mobile inputs have no room for a list.
 */
export function toFieldErrorMap(error: AppError): Record<string, string> {
    const entries = Object.entries(error.fieldErrors ?? {});

    return entries.reduce<Record<string, string>>((accumulator, [field, messages]) => {
        const first = messages[0];

        if (typeof first === 'string' && first.length > 0) {
            accumulator[field] = first;
        }

        return accumulator;
    }, {});
}
