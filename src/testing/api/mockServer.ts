import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { axiosInstance } from '../../../src/api/client';

/**
 * In-process API mock server for integration tests.
 *
 * ## Why this is an axios adapter rather than MSW
 *
 * The task offered either MSW or an axios mock adapter; this is the adapter, and the
 * choice is deliberate:
 *
 * 1. **MSW intercepts the network *below* axios.** It would need `XMLHttpRequest`/`fetch`
 *    shims that the React Native Jest preset does not provide, so the harness would
 *    mock Node's HTTP stack and then assert on behaviour the app never uses in
 *    production. Here the interception point is the same seam the existing
 *    [`client.test.ts`](../../../src/api/__tests__/client.test.ts:1) and
 *    [`clientErrorHandling.test.ts`](../../../src/api/__tests__/clientErrorHandling.test.ts:1)
 *    already use, so the new suites are consistent with the repo rather than a second
 *    parallel convention.
 * 2. **Adapter mocking keeps the real client in the loop.** `axiosInstance`'s request
 *    interceptor (auth header, correlation id), response interceptor (envelope
 *    validation, error normalisation, 401 single-flight) and retry policy all run
 *    unchanged. That is the behaviour under test — a mock that short-circuits axios
 *    would assert the app's *call* rather than the app's *handling*.
 * 3. **No global setup.** MSW's server is typically started in a global `setupFiles`
 *    hook, which would touch all 48 existing suites. This harness is installed per
 *    suite by an explicit `beforeEach`, so suites that do not use it are unaffected.
 *
 * ## What it models
 *
 * A tiny router: handlers are matched by `METHOD + path` (with `:param` segments), the
 * first match wins, and each handler returns a response — or a transport-failure
 * marker. Every request is recorded in a journal so a test can assert what was
 * actually sent, and helpers cover the Laravel envelope so a test states its *intent*
 * ("a 422 for the email field") rather than hand-building response JSON.
 */

/** The request as the server sees it, after the client's interceptors ran. */
export type MockRequest = {
    method: string;
    /** Path only, e.g. `/auth/login` (no base URL, no query string). */
    path: string;
    /** Absolute URL as dispatched. */
    url: string;
    /** Parsed query string. */
    params: Record<string, string>;
    /** Request body: a parsed object for JSON, a `FormData` for multipart, else raw. */
    body: unknown;
    /** Response-bound headers, including the client's `Authorization` / `X-Request-Id`. */
    headers: Record<string, string>;
};

/** A function that produces a response for a matched request. */
export type MockHandler = (request: MockRequest) => MockResult | Promise<MockResult>;

/** A handler's return value. */
export type MockResult =
    | { kind: 'json'; status: number; body: unknown; headers?: Record<string, string> }
    /** A transport-level failure: no response at all (offline, DNS, reset). */
    | { kind: 'networkError'; code?: string }
    /** A timeout — axios reports these with `ECONNABORTED` and no response. */
    | { kind: 'timeout' };

/** A recorded request, read back by assertions. */
export type JournalEntry = MockRequest & { matchedHandler: boolean };

/** Laravel success envelope. */
export function envelope(data?: unknown, message = 'OK'): Record<string, unknown> {
    return data === undefined ? { success: true, message } : { success: true, message, data };
}

/** Laravel error envelope. */
export function errorEnvelope(
    message: string,
    errors?: Record<string, string[]>,
): Record<string, unknown> {
    return errors === undefined ? { success: false, message } : { success: false, message, errors };
}

/** Shortcut: 200 with a success envelope wrapping `data`. */
export function ok(data?: unknown, message?: string): MockResult {
    return { kind: 'json', status: 200, body: envelope(data, ...(message === undefined ? [] : [message])) };
}

/** Shortcut: 201 with a success envelope wrapping `data`. */
export function created(data?: unknown): MockResult {
    return { kind: 'json', status: 201, body: envelope(data) };
}

/** Shortcut: an error status carrying a Laravel error envelope. */
export function fail(status: number, message: string, errors?: Record<string, string[]>): MockResult {
    return { kind: 'json', status, body: errorEnvelope(message, errors) };
}

/** Shortcut: 422 with per-field validation errors. */
export function validationError(
    errors: Record<string, string[]>,
    message = 'The given data was invalid.',
): MockResult {
    return fail(422, message, errors);
}

/** Shortcut: a response body that is not a Laravel envelope (a bare payload). */
export function raw(status: number, body: unknown, headers?: Record<string, string>): MockResult {
    return { kind: 'json', status, body, headers };
}

/**
 * Shortcut: an HTML body — the shape a gateway/proxy error page arrives as when the
 * response is not JSON. The client rejects these outright.
 */
export function html(status: number, markup = '<html><body>502 Bad Gateway</body></html>'): MockResult {
    return { kind: 'json', status, body: markup, headers: { 'content-type': 'text/html' } };
}

/** Shortcut: no response at all. */
export function networkError(code?: string): MockResult {
    return code === undefined ? { kind: 'networkError' } : { kind: 'networkError', code };
}

/** Shortcut: a request that never completes. */
export function timeout(): MockResult {
    return { kind: 'timeout' };
}

/**
 * Shortcut: a 403 in the shape the `company.access` middleware returns for a locked
 * company. Exists so a test states the *condition* rather than a message string it has
 * to keep in sync with `isCompanyAccessLocked`.
 */
export function companyLocked(reason = 'Your company subscription has expired.'): MockResult {
    return fail(403, reason);
}

/**
 * Shortcut: a 403 with the generic authorisation wording — the case that must **not**
 * be mistaken for a locked company.
 */
export function permissionDenied(message = 'This action is unauthorized.'): MockResult {
    return fail(403, message);
}

type Route = {
    method: string;
    /** Path segments; a `:name` segment matches anything. */
    segments: string[];
    handler: MockHandler;
};

/**
 * The mock server.
 *
 * ```ts
 * const server = createMockServer();
 *
 * beforeEach(() => {
 *     server.reset();
 *     server.install();
 * });
 *
 * afterEach(() => server.restore());
 * ```
 */
export type MockServer = {
    /** Registers a handler. Matching is first-registration-wins. Chainable. */
    use: (method: string, path: string, handler: MockHandler) => MockServer;
    get: (path: string, handler: MockHandler) => MockServer;
    post: (path: string, handler: MockHandler) => MockServer;
    put: (path: string, handler: MockHandler) => MockServer;
    patch: (path: string, handler: MockHandler) => MockServer;
    delete: (path: string, handler: MockHandler) => MockServer;
    /** Installs the adapter onto the shared axios instance. */
    install: () => void;
    /** Restores the previous adapter and detaches. */
    restore: () => void;
    /** Clears all handlers and all recorded requests. */
    reset: () => void;
    /** Every request the server received, in order. */
    journal: () => JournalEntry[];
    /** Requests recorded for a given path, in order. */
    requestsTo: (path: string) => JournalEntry[];
    /** How many times a path was hit — the retry-policy assertion seam. */
    hitCount: (path: string) => number;
};

export function createMockServer(): MockServer {
    const routes: Route[] = [];
    const journal: JournalEntry[] = [];
    let previousAdapter: typeof axiosInstance.defaults.adapter | undefined;
    let installed = false;

    function register(method: string, path: string, handler: MockHandler): void {
        routes.push({
            method: method.toUpperCase(),
            segments: path.split('/').filter(segment => segment.length > 0),
            handler,
        });
    }

    function match(method: string, path: string): MockHandler | null {
        const segments = path.split('/').filter(segment => segment.length > 0);

        for (const route of routes) {
            if (route.method !== method.toUpperCase() || route.segments.length !== segments.length) {
                continue;
            }

            const isMatch = route.segments.every(
                (segment, index) => segment.startsWith(':') || segment === segments[index],
            );

            if (isMatch) {
                return route.handler;
            }
        }

        return null;
    }

    function parseParams(config: InternalAxiosRequestConfig): Record<string, string> {
        const params: Record<string, string> = {};
        const raw = (config.params ?? {}) as Record<string, unknown>;

        for (const [key, value] of Object.entries(raw)) {
            if (value !== undefined && value !== null) {
                params[key] = String(value);
            }
        }

        // Also honour a query string baked into the URL, since some callers inline it.
        const queryIndex = config.url?.indexOf('?') ?? -1;

        if (config.url !== undefined && queryIndex >= 0) {
            const search = new URLSearchParams(config.url.slice(queryIndex + 1));

            search.forEach((value, key) => {
                params[key] = value;
            });
        }

        return params;
    }

    function parseHeaders(config: InternalAxiosRequestConfig): Record<string, string> {
        const headers: Record<string, string> = {};
        const bag = config.headers as unknown as { toJSON?: () => Record<string, unknown> };

        if (typeof bag?.toJSON === 'function') {
            for (const [key, value] of Object.entries(bag.toJSON())) {
                if (value !== undefined && value !== null) {
                    headers[key.toLowerCase()] = String(value);
                }
            }
        }

        return headers;
    }

    /**
     * Decodes a request body. A JSON body arrives as a **string** (axios serialises it
     * in `transformRequest` before the adapter runs), so it is parsed back; a `FormData`
     * is passed through untouched so a test can inspect its parts.
     */
    function parseBody(config: InternalAxiosRequestConfig): unknown {
        const { data } = config;

        if (typeof data === 'string') {
            try {
                return JSON.parse(data) as unknown;
            } catch {
                return data;
            }
        }

        return data;
    }

    const adapter = (async (config: InternalAxiosRequestConfig) => {
        const method = (config.method ?? 'get').toUpperCase();
        const url = config.url ?? '';
        const path = url.split('?')[0] ?? '';
        const request: MockRequest = {
            method,
            path,
            url,
            params: parseParams(config),
            body: parseBody(config),
            headers: parseHeaders(config),
        };

        const handler = match(method, path);

        journal.push({ ...request, matchedHandler: handler !== null });

        if (handler === null) {
            // An unhandled route is a test bug, and a loud 404-shaped failure is far
            // easier to diagnose than a silent timeout.
            throw new AxiosError(
                `Mock server has no handler for ${method} ${path}`,
                'ERR_BAD_REQUEST',
                config,
                null,
                {
                    status: 404,
                    statusText: 'Not Found',
                    data: errorEnvelope(`No mock handler for ${method} ${path}`),
                    headers: {},
                    config,
                } as AxiosResponse,
            );
        }

        const result = await handler(request);

        if (result.kind === 'networkError') {
            throw new AxiosError('Network Error', result.code ?? AxiosError.ERR_NETWORK, config, null);
        }

        if (result.kind === 'timeout') {
            throw new AxiosError('timeout of 15000ms exceeded', AxiosError.ECONNABORTED, config, null);
        }

        const response = {
            data: result.body,
            status: result.status,
            statusText: String(result.status),
            headers: result.headers ?? {},
            config,
        } as AxiosResponse;

        /*
         * `validateStatus` — reject a non-2xx response, exactly as axios's own `xhr` and
         * `http` adapters do.
         *
         * This is the most important behaviour in the harness. An adapter that merely
         * *resolves* a 401 lets the body flow into the response interceptor's **success**
         * path, where `unwrapEnvelope` sees `success: false` and correctly throws a
         * `kind: 'server'` envelope violation — so every security test would observe a
         * generic server error instead of the HTTP status under test. Real adapters
         * reject before that path runs, and the mock must behave identically or it
         * exercises the wrong branch of the client.
         */
        const { validateStatus } = config;

        const isAccepted =
            typeof validateStatus === 'function'
                ? validateStatus(response.status)
                : response.status >= 200 && response.status < 300;

        if (isAccepted) {
            return response;
        }

        throw new AxiosError(
            `Request failed with status code ${response.status}`,
            response.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
            config,
            null,
            response,
        );
    }) as unknown as AxiosAdapter;

    /*
     * The methods below close over `server` and only run after `createMockServer()` has
     * returned, so the self-reference for chaining is safe and needs no forward
     * declaration.
     */
    const server: MockServer = {
        use: (method, path, handler) => {
            register(method, path, handler);

            return server;
        },
        get: (path, handler) => {
            register('GET', path, handler);

            return server;
        },
        post: (path, handler) => {
            register('POST', path, handler);

            return server;
        },
        put: (path, handler) => {
            register('PUT', path, handler);

            return server;
        },
        patch: (path, handler) => {
            register('PATCH', path, handler);

            return server;
        },
        delete: (path, handler) => {
            register('DELETE', path, handler);

            return server;
        },
        install: () => {
            if (!installed) {
                previousAdapter = axiosInstance.defaults.adapter;
                installed = true;
            }

            axiosInstance.defaults.adapter = adapter;
        },
        restore: () => {
            if (installed) {
                axiosInstance.defaults.adapter = previousAdapter;
                installed = false;
            }
        },
        reset: () => {
            routes.length = 0;
            journal.length = 0;
        },
        journal: () => [...journal],
        requestsTo: path => journal.filter(entry => entry.path === path),
        hitCount: path => journal.filter(entry => entry.path === path).length,
    };

    return server;
}
