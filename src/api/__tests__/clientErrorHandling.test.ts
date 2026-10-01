import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { installErrorReporter } from '../../services/monitoring';
import {
    __resetUnauthorizedCooldown,
    api,
    axiosInstance,
    setUnauthorizedHandler,
} from '../client';

/**
 * Operational behaviour of the shared client, exercised against a stub adapter so the
 * real interceptors run:
 *
 * - **correlation ids** are attached to every request and surfaced on errors;
 * - **transient failures retry** with backoff, but only for safe/idempotent methods;
 * - a **burst of 401s triggers the session handler exactly once** (single-flight);
 * - the **envelope is validated** rather than trusted;
 * - failures are **reported** (redacted) for actionable kinds.
 */

let originalAdapter: typeof axiosInstance.defaults.adapter;

/** Builds an axios error carrying an HTTP response. */
function httpError(status: number, config?: InternalAxiosRequestConfig): AxiosError {
    return new AxiosError(
        `Request failed with status ${status}`,
        'ERR_BAD_RESPONSE',
        config,
        null,
        { status, statusText: 'err', data: { message: `status ${status}` }, headers: {}, config } as AxiosResponse,
    );
}

/** A 2xx envelope response. */
function envelope(data: unknown, config: InternalAxiosRequestConfig, status = 200): AxiosResponse {
    return {
        data: { success: true, message: 'ok', data },
        status,
        statusText: 'OK',
        headers: {},
        config,
    } as AxiosResponse;
}

beforeEach(() => {
    originalAdapter = axiosInstance.defaults.adapter;
    __resetUnauthorizedCooldown();
    setUnauthorizedHandler(null);
    installErrorReporter(null);
});

afterEach(() => {
    axiosInstance.defaults.adapter = originalAdapter;
    setUnauthorizedHandler(null);
    installErrorReporter(null);
});

describe('correlation ids', () => {
    it('attaches an X-Request-Id to every request', async () => {
        let seen: string | undefined;

        axiosInstance.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
            seen = config.headers.get('X-Request-Id') as string | undefined;

            return envelope({ ok: true }, config);
        }) as unknown as AxiosAdapter;

        await api.get('/shifts');

        expect(typeof seen).toBe('string');
        expect((seen as string).length).toBeGreaterThan(0);
    });

    it('surfaces the correlation id on the normalised error', async () => {
        axiosInstance.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
            throw httpError(500, config);
        }) as unknown as AxiosAdapter;

        await expect(api.get('/shifts')).rejects.toMatchObject({
            kind: 'server',
            requestId: expect.any(String),
            diagnostic: expect.stringContaining('GET /shifts'),
        });
    });
});

describe('retry', () => {
    it('retries a safe request and succeeds', async () => {
        let attempts = 0;

        axiosInstance.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
            attempts += 1;

            if (attempts < 3) {
                throw httpError(503, config);
            }

            return envelope({ id: 1 }, config);
        }) as unknown as AxiosAdapter;

        await expect(api.get('/shifts')).resolves.toEqual({ id: 1 });
        expect(attempts).toBe(3);
    });

    it('does not retry a mutating request', async () => {
        let attempts = 0;

        axiosInstance.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
            attempts += 1;
            throw httpError(503, config);
        }) as unknown as AxiosAdapter;

        await expect(api.post('/leave-requests', {})).rejects.toMatchObject({ kind: 'server' });
        // Exactly one attempt: a POST is never replayed automatically.
        expect(attempts).toBe(1);
    });

    it('does not retry a deterministic 4xx', async () => {
        let attempts = 0;

        axiosInstance.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
            attempts += 1;
            throw httpError(422, config);
        }) as unknown as AxiosAdapter;

        await expect(api.get('/shifts')).rejects.toMatchObject({ kind: 'validation' });
        expect(attempts).toBe(1);
    });
});

describe('single-flight 401 handling', () => {
    it('invokes the unauthorized handler once for a burst of concurrent 401s', async () => {
        const handler = jest.fn();

        setUnauthorizedHandler(handler);

        axiosInstance.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
            throw httpError(401, config);
        }) as unknown as AxiosAdapter;

        const results = await Promise.allSettled([
            api.get('/shifts'),
            api.get('/rosters'),
            api.get('/notifications'),
        ]);

        expect(results.every(r => r.status === 'rejected')).toBe(true);
        // The whole expiry burst collapses into one session-clearing transition.
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

describe('envelope validation', () => {
    it('unwraps a valid envelope to its data', async () => {
        axiosInstance.defaults.adapter = (async (config: InternalAxiosRequestConfig) =>
            envelope({ id: 7 }, config)) as unknown as AxiosAdapter;

        await expect(api.get('/shifts/7')).resolves.toEqual({ id: 7 });
    });

    it('rejects a non-JSON (HTML) body as a server error', async () => {
        axiosInstance.defaults.adapter = (async (config: InternalAxiosRequestConfig) => ({
            data: '<!DOCTYPE html><html>Bad Gateway</html>',
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
        })) as unknown as AxiosAdapter;

        await expect(api.get('/shifts')).rejects.toMatchObject({ kind: 'server' });
    });

    it('rejects an envelope whose success flag is not a boolean', async () => {
        axiosInstance.defaults.adapter = (async (config: InternalAxiosRequestConfig) => ({
            data: { success: 'yes', message: 'ok' },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
        })) as unknown as AxiosAdapter;

        await expect(api.get('/shifts')).rejects.toMatchObject({ kind: 'server' });
    });
});

describe('error reporting', () => {
    it('reports an actionable (5xx) failure to the installed provider', async () => {
        const captureError = jest.fn();

        installErrorReporter({ name: 'test', captureError });

        axiosInstance.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
            throw httpError(500, config);
        }) as unknown as AxiosAdapter;

        await expect(api.get('/shifts')).rejects.toMatchObject({ kind: 'server' });

        expect(captureError).toHaveBeenCalledTimes(1);
        expect(captureError.mock.calls[0][0]).toMatchObject({ kind: 'server', url: '/shifts' });
    });

    it('does not report an expected 4xx', async () => {
        const captureError = jest.fn();

        installErrorReporter({ name: 'test', captureError });

        axiosInstance.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
            throw httpError(403, config);
        }) as unknown as AxiosAdapter;

        await expect(api.get('/shifts')).rejects.toMatchObject({ kind: 'forbidden' });

        expect(captureError).not.toHaveBeenCalled();
    });
});
