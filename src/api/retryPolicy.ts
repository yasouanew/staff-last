import { AxiosError, type AxiosRequestConfig } from 'axios';

import { env } from '../config/env';
import type { AppError } from '../types/appError';

/**
 * Retry policy.
 *
 * Transient failures (a dropped connection, a gateway 502) are retried automatically;
 * everything else is not. The two rules that matter:
 *
 * 1. **Only safe/idempotent requests are retried.** `GET`/`HEAD`/`OPTIONS` never change
 *    server state, so replaying them is always safe. `POST`/`PUT`/`PATCH`/`DELETE` are
 *    **never** retried automatically: a request that timed out may have been applied,
 *    and silently replaying it could submit a leave request twice. Those are handled
 *    explicitly by the [outbox](src/services/outbox/outboxStore.ts:1), which knows the
 *    operation's identity and can dedupe.
 * 2. **Retry is opt-outable per request.** A caller that must not be retried (a
 *    cancellation-sensitive poll) sets `retry: false` on the config.
 *
 * Backoff is exponential with full jitter, capped, and bounded by a maximum attempt
 * count — so a burst of failures cannot turn into a burst of retries.
 */

/** Marks a config as opted out of retries. */
export type RetryableConfig = AxiosRequestConfig & {
    /** `false` disables retries for this request. Defaults to enabled for safe methods. */
    retry?: boolean;
    /** Internal: the attempt number, tracked across retries. */
    _retryCount?: number;
};

/** Methods that are safe to replay without an idempotency key. */
const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options']);

/** Transport codes that indicate a retryable condition. */
const RETRYABLE_CODES = new Set([
    AxiosError.ECONNABORTED,
    AxiosError.ETIMEDOUT,
    AxiosError.ERR_NETWORK,
    'ERR_NETWORK',
]);

/** HTTP statuses worth retrying (transient server/gateway problems). */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** True when the method may be replayed without side effects. */
export function isIdempotentMethod(method: string | undefined): boolean {
    return IDEMPOTENT_METHODS.has((method ?? 'get').toLowerCase());
}

/**
 * Decides whether a failed request should be retried.
 *
 * `_retryCount` counts retries already performed (0 on the first failure), so the guard
 * is `_retryCount >= maxAttempts - 1`: with `maxAttempts = 3` there are at most two
 * retries — three total attempts.
 *
 * @param error the failure, as thrown by axios.
 * @param config the request config (carrying `retry` and `_retryCount`).
 */
export function shouldRetry(error: unknown, config: RetryableConfig | undefined): boolean {
    if (config?.retry === false) {
        return false;
    }

    if (!isIdempotentMethod(config?.method)) {
        return false;
    }

    const retriesPerformed = config?._retryCount ?? 0;

    if (retriesPerformed >= env.apiRetry.maxAttempts - 1) {
        return false;
    }

    if (!(error instanceof AxiosError)) {
        return false;
    }

    // No response: a transport failure (connection dropped, DNS, timeout).
    if (!error.response) {
        return error.code === undefined || RETRYABLE_CODES.has(error.code);
    }

    return RETRYABLE_STATUSES.has(error.response.status);
}

/**
 * Exponential backoff with full jitter.
 *
 * `min(cap, base * 2^attempt)` scaled by a random factor in `[0.5, 1)`. Jitter matters:
 * without it, a fleet of devices that lost connectivity together would retry in lockstep
 * and re-DDoS the backend the moment it recovers.
 */
export function computeBackoffMs(attempt: number): number {
    const { baseDelayMs, maxDelayMs } = env.apiRetry;
    const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt));
    const jitter = 0.5 + Math.random() * 0.5;

    return Math.round(exponential * jitter);
}

/** Promise-based delay, used between attempts. */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

/** True when a normalised error is worth an automatic retry (mirrors `shouldRetry`). */
export function isRetryableAppError(error: AppError): boolean {
    return (
        error.kind === 'network' ||
        error.kind === 'timeout' ||
        error.kind === 'server' ||
        error.kind === 'unknown'
    );
}
