import { AxiosError, type AxiosResponse } from 'axios';

import { env } from '../../config/env';
import { computeBackoffMs, isIdempotentMethod, shouldRetry } from '../retryPolicy';

/**
 * The retry policy exists to recover from transient failures **without ever replaying a
 * mutating write**. These tests pin both halves: safe methods retry, everything else
 * does not.
 */

function axiosErrorWithStatus(status: number): AxiosError {
    const error = new AxiosError('boom');

    error.response = { status } as AxiosResponse;

    return error;
}

function config(overrides: Record<string, unknown> = {}) {
    return { method: 'get', ...overrides } as never;
}

describe('isIdempotentMethod', () => {
    it('treats GET/HEAD/OPTIONS as safe to replay', () => {
        expect(isIdempotentMethod('get')).toBe(true);
        expect(isIdempotentMethod('GET')).toBe(true);
        expect(isIdempotentMethod('head')).toBe(true);
        expect(isIdempotentMethod('options')).toBe(true);
    });

    it('treats mutating methods as unsafe', () => {
        expect(isIdempotentMethod('post')).toBe(false);
        expect(isIdempotentMethod('put')).toBe(false);
        expect(isIdempotentMethod('patch')).toBe(false);
        expect(isIdempotentMethod('delete')).toBe(false);
    });

    it('defaults a missing method to GET (safe)', () => {
        expect(isIdempotentMethod(undefined)).toBe(true);
    });
});

describe('shouldRetry', () => {
    it('retries a safe request on a retryable status', () => {
        expect(shouldRetry(axiosErrorWithStatus(503), config())).toBe(true);
        expect(shouldRetry(axiosErrorWithStatus(429), config())).toBe(true);
        expect(shouldRetry(axiosErrorWithStatus(408), config())).toBe(true);
    });

    it('never retries a mutating method, even on a retryable status', () => {
        expect(shouldRetry(axiosErrorWithStatus(503), config({ method: 'post' }))).toBe(false);
        expect(shouldRetry(axiosErrorWithStatus(503), config({ method: 'put' }))).toBe(false);
        expect(shouldRetry(axiosErrorWithStatus(503), config({ method: 'delete' }))).toBe(false);
    });

    it('does not retry a deterministic 4xx', () => {
        expect(shouldRetry(axiosErrorWithStatus(422), config())).toBe(false);
        expect(shouldRetry(axiosErrorWithStatus(403), config())).toBe(false);
        expect(shouldRetry(axiosErrorWithStatus(404), config())).toBe(false);
    });

    it('honours an explicit opt-out', () => {
        expect(shouldRetry(axiosErrorWithStatus(503), config({ retry: false }))).toBe(false);
    });

    it('stops after the configured maximum attempts', () => {
        // maxAttempts = 3 ⇒ retries performed 0 and 1 are allowed, 2 is not.
        expect(shouldRetry(axiosErrorWithStatus(503), config({ _retryCount: 0 }))).toBe(true);
        expect(shouldRetry(axiosErrorWithStatus(503), config({ _retryCount: 1 }))).toBe(true);
        expect(shouldRetry(axiosErrorWithStatus(503), config({ _retryCount: 2 }))).toBe(false);
    });

    it('retries a transport failure with no response', () => {
        const networkError = new AxiosError('network');
        networkError.code = AxiosError.ERR_NETWORK;

        expect(shouldRetry(networkError, config())).toBe(true);
    });

    it('does not retry a non-axios error', () => {
        expect(shouldRetry(new Error('boom'), config())).toBe(false);
    });
});

describe('computeBackoffMs', () => {
    it('grows with the attempt number and stays within the cap', () => {
        // Deterministic assertion on bounds, since jitter randomises the exact value.
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const delay = computeBackoffMs(attempt);

            expect(delay).toBeGreaterThanOrEqual(0);
            expect(delay).toBeLessThanOrEqual(env.apiRetry.maxDelayMs);
        }
    });

    it('applies jitter (full jitter, at least half the exponential)', () => {
        const attempt = 2;
        const exponential = Math.min(env.apiRetry.maxDelayMs, env.apiRetry.baseDelayMs * 2 ** attempt);

        const delay = computeBackoffMs(attempt);

        expect(delay).toBeGreaterThanOrEqual(Math.floor(exponential * 0.5) - 1);
        expect(delay).toBeLessThanOrEqual(exponential);
    });
});
