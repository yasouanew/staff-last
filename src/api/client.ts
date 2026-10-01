import axios, {
    AxiosError,
    type AxiosInstance,
    type AxiosRequestConfig,
    type AxiosResponse,
    type InternalAxiosRequestConfig,
} from 'axios';

import { env } from '../config/env';
import { reportError } from '../services/monitoring/errorReporter';
import type { ApiErrorResponse, ApiSuccess } from '../types/api';
import type { AppError } from '../types/appError';
import { createTransportError, defaultMessageForKind, kindFromStatus } from '../utils/errors';
import { logger } from '../utils/logger';
import { generateRequestId, readResponseRequestId } from './requestId';
import { computeBackoffMs, delay, shouldRetry, type RetryableConfig } from './retryPolicy';
import { buildAuthorizationHeader } from './tokenStore';

/**
 * The single configured axios client.
 *
 * Every HTTP call in the app goes through this instance — screen components never
 * import axios. Request/response behaviour is centralised here:
 *
 * - base URL, timeout and common headers come from [`env`](src/config/env.ts:1)
 * - the Sanctum bearer token is attached per request (read synchronously from
 *   [`tokenStore`](src/api/tokenStore.ts:1), so no async work is needed)
 * - a **correlation id** (`X-Request-Id`) is attached per request and echoed back onto
 *   the resulting [`AppError`](src/types/appError.ts:1)
 * - Laravel's success envelope is unwrapped and **validated** before use
 * - transient failures on **safe/idempotent** requests are retried with jittered
 *   exponential backoff ([`retryPolicy`](src/api/retryPolicy.ts:1))
 * - every failure is normalised into an `AppError`, reported (redacted) to
 *   [`monitoring`](src/services/monitoring/errorReporter.ts:1), and — on 401 — handed to
 *   a **single-flight** unauthorized handler
 *
 * A caller registered via [`setUnauthorizedHandler`](src/api/client.ts:1) is notified on
 * 401 so the session store can clear local state and let the navigation tree fall back
 * to the Auth stack. The API layer itself never navigates.
 */

/** Laravel envelope keys that are stripped before returning data to callers. */
type RawEnvelope = ApiSuccess<unknown> & { data?: unknown };

/** Request-scoped fields the client stashes on the axios config. */
type ClientConfig = RetryableConfig & {
    /** Correlation id generated for this request; echoed onto any resulting error. */
    _requestId?: string;
};

let unauthorizedHandler: (() => void) | null = null;

/**
 * Registers the callback invoked on a 401. Set once by the session store during
 * store creation; kept as a setter rather than an import to keep the dependency
 * direction one-way (`store → api`).
 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
    unauthorizedHandler = handler;
}

/**
 * Cooldown window for the 401 handler.
 *
 * A screen that fires several requests in parallel (the dashboard, the inbox) will get
 * several 401s within milliseconds of each other when a token expires. Clearing the
 * session once per 401 would race N times and, worse, could sign out a session that a
 * concurrent successful login just established. The cooldown collapses the whole burst
 * into one transition. Exported so a test can assert the single-flight behaviour.
 */
export const UNAUTHORIZED_COOLDOWN_MS = 1_000;

let lastUnauthorizedAt = 0;

/**
 * Invokes the unauthorized handler at most once per cooldown window.
 *
 * Also guarded by an in-flight flag so a slow (async) handler cannot be re-entered.
 */
function notifyUnauthorized(): void {
    if (unauthorizedHandler === null) {
        return;
    }

    const now = Date.now();

    if (now - lastUnauthorizedAt < UNAUTHORIZED_COOLDOWN_MS) {
        // Part of the same expiry burst — already handled.
        return;
    }

    lastUnauthorizedAt = now;

    try {
        unauthorizedHandler();
    } catch (error) {
        logger.warn('[api] Unauthorized handler threw', error);
    }
}

/** Test-only: resets the 401 cooldown so a suite can assert each transition. */
export function __resetUnauthorizedCooldown(): void {
    lastUnauthorizedAt = 0;
}

const axiosInstance: AxiosInstance = axios.create({
    baseURL: env.apiBaseUrl,
    timeout: env.apiTimeoutMs,
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // Lets the backend distinguish native traffic (used for `device_name` fallback
        // and platform analytics). The token itself is never used for authorization.
        'X-Requested-With': 'XMLHttpRequest',
    },
});

/**
 * Request interceptor — attaches credentials and a correlation id.
 *
 * The `Authorization` header is omitted entirely when there is no token rather than sent
 * empty, so public endpoints (`auth/login`, `auth/forgot-password`) behave exactly as
 * they do from a browser. The `X-Request-Id` is attached to every request, including
 * public ones, so a failure during login is traceable too.
 */
axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const authorization = buildAuthorizationHeader();

    if (authorization !== null) {
        config.headers.set('Authorization', authorization);
    }

    const requestId = generateRequestId();

    (config as ClientConfig)._requestId = requestId;
    config.headers.set('X-Request-Id', requestId);

    if (env.debug) {
        logger.debug(`→ ${config.method?.toUpperCase() ?? 'GET'} ${config.url ?? ''} [${requestId}]`);
    }

    return config;
});

/**
 * Validates and unwraps a 2xx body.
 *
 * The envelope is no longer trusted blindly: a body that claims to be an envelope must
 * actually have a boolean `success`, and an HTML gateway page (a string starting with
 * `<`) is rejected outright. Anything that is not a recognisable envelope is passed
 * through, because a few endpoints (and several tests) return bare payloads.
 *
 * @returns the unwrapped `data`, or `undefined` when the body is not an envelope.
 * @throws `AppError` of kind `server` when the body is malformed.
 */
function unwrapEnvelope(body: unknown): { isEnvelope: boolean; data?: unknown } {
    if (typeof body === 'string') {
        // A gateway/proxy error page reaches us as text when the response is not JSON.
        if (body.trimStart().startsWith('<')) {
            throw {
                kind: 'server',
                message: defaultMessageForKind('server'),
                cause: new Error('Non-JSON (HTML) response body'),
            } satisfies AppError;
        }

        return { isEnvelope: false };
    }

    if (body === null || typeof body !== 'object' || !('success' in body)) {
        return { isEnvelope: false };
    }

    const envelope = body as { success?: unknown; message?: unknown; data?: unknown };

    if (typeof envelope.success !== 'boolean') {
        throw {
            kind: 'server',
            message: defaultMessageForKind('server'),
            cause: new Error('Malformed API envelope: `success` is not a boolean'),
        } satisfies AppError;
    }

    // A `success: false` envelope on a 2xx status is contradictory.
    if (envelope.success === false) {
        throw {
            kind: 'server',
            status: 200,
            message:
                typeof envelope.message === 'string' && envelope.message.length > 0
                    ? envelope.message
                    : defaultMessageForKind('server'),
            cause: new Error('API returned success:false with a 2xx status'),
        } satisfies AppError;
    }

    return { isEnvelope: true, data: envelope.data };
}

/**
 * Response interceptor.
 *
 * Success: unwrap (and validate) the envelope.
 * Failure: retry safe requests, then normalise, report, and handle 401.
 */
axiosInstance.interceptors.response.use(
    (response: AxiosResponse<RawEnvelope>) => {
        const requestId = readResponseRequestId(response.headers);
        const config = response.config as ClientConfig;

        if (requestId !== undefined) {
            // Prefer the server's id when it echoes one, so client and server logs share it.
            config._requestId = requestId;
        }

        try {
            const { isEnvelope, data } = unwrapEnvelope(response.data);

            if (isEnvelope) {
                response.data = data as RawEnvelope;
            }

            return response;
        } catch (error) {
            // An envelope violation is a server fault: report it, then reject so the
            // caller receives a normalised AppError like any other failure.
            const appError = error as AppError;

            reportError({
                error: appError,
                method: config.method?.toUpperCase(),
                url: config.url,
                requestId: config._requestId,
            });

            return Promise.reject(appError);
        }
    },
    async (error: unknown) => {
        const config = (error as AxiosError)?.config as ClientConfig | undefined;

        if (shouldRetry(error, config)) {
            const retriesPerformed = (config?._retryCount ?? 0) + 1;
            const backoffMs = computeBackoffMs(retriesPerformed - 1);

            logger.debug(`[api] Retrying ${config?.url ?? ''} (attempt ${retriesPerformed}) in ${backoffMs}ms`);

            await delay(backoffMs);

            return axiosInstance.request({
                ...(config as InternalAxiosRequestConfig),
                _retryCount: retriesPerformed,
            } as ClientConfig);
        }

        return Promise.reject(normalizeError(error));
    },
);

/**
 * True when `value` is already a normalised [`AppError`](src/types/appError.ts:1).
 *
 * The response interceptor **rejects with** an `AppError` rather than re-throwing the
 * axios error, so any layer that catches its result and calls
 * [`normalizeError`](src/api/client.ts:264) again would be normalising an
 * already-normalised value. `normalizeError` used to treat that as "not an axios error"
 * and return `kind: 'unknown'`, silently discarding the status and kind the interceptor
 * had derived — an endpoint that normalises defensively (e.g.
 * [`deviceTokenApi`](src/features/notifications/api/deviceTokenApi.ts:1), which wraps its
 * calls because it uses the raw `axiosInstance`) reported every failure as a generic
 * unknown error.
 *
 * The structural check is intentional rather than an `instanceof` against a class: the
 * value is a plain object by contract, and a marker must survive serialisation-free
 * transport between modules.
 */
export function isAppError(value: unknown): value is AppError {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { kind?: unknown }).kind === 'string' &&
        typeof (value as { message?: unknown }).message === 'string'
    );
}

/**
 * Converts anything axios can throw into an `AppError`, reports it, and handles 401.
 * Exported for tests.
 *
 * Idempotent: a value that is already an `AppError` is returned unchanged, so calling
 * this twice — as a defensive call site plus the interceptor does — preserves the
 * original status and kind rather than degrading it to `unknown`.
 */
export function normalizeError(error: unknown): AppError {
    if (isAppError(error)) {
        return error;
    }

    if (axios.isCancel(error)) {
        return createTransportError('cancelled', error);
    }

    if (!axios.isAxiosError(error)) {
        const appError = createTransportError('unknown', error);

        reportError({ error: appError });

        return appError;
    }

    const axiosError = error as AxiosError<ApiErrorResponse>;
    const config = axiosError.config as ClientConfig | undefined;
    const requestId = config?._requestId;
    const method = config?.method?.toUpperCase();
    const url = config?.url;

    // No response at all: the request never completed.
    if (!axiosError.response) {
        const isTimeout = axiosError.code === AxiosError.ECONNABORTED || axiosError.code === AxiosError.ETIMEDOUT;
        const transportError = createTransportError(isTimeout ? 'timeout' : 'network', error);

        const appError: AppError = {
            ...transportError,
            requestId,
            diagnostic: buildDiagnostic(method, url, transportError.kind, undefined, axiosError.code, requestId),
        };

        reportError({ error: appError, method, url, requestId });

        return appError;
    }

    const { status, data } = axiosError.response;
    const kind = kindFromStatus(status);

    // A locked company surfaces as 403 from the `company.access` middleware. The
    // message is preserved verbatim so `isCompanyAccessLocked` can detect it and the
    // UI can render the paywall copy the backend supplied.
    const serverMessage = typeof data?.message === 'string' && data.message.length > 0 ? data.message : undefined;

    const appError: AppError = {
        kind,
        status,
        message: serverMessage ?? defaultMessageForKind(kind),
        ...(data?.errors ? { fieldErrors: data.errors } : {}),
        requestId,
        diagnostic: buildDiagnostic(method, url, kind, status, undefined, requestId),
        cause: error,
    };

    if (env.debug) {
        logger.warn(`← ${status} ${url ?? ''}: ${appError.message} [${requestId ?? 'no-id'}]`);
    }

    reportError({ error: appError, method, url, requestId });

    // Session ended: tell the app to drop local auth state. Single-flight, so a burst of
    // concurrent 401s produces exactly one session-clearing transition.
    if (kind === 'unauthorized') {
        notifyUnauthorized();
    }

    return appError;
}

/** Builds the engineer-facing one-line diagnostic. Never rendered in the UI. */
function buildDiagnostic(
    method: string | undefined,
    url: string | undefined,
    kind: string,
    status: number | undefined,
    code: string | undefined,
    requestId: string | undefined,
): string {
    return [
        `${method ?? 'REQUEST'} ${url ?? ''}`.trim(),
        `kind=${kind}`,
        status !== undefined ? `status=${status}` : null,
        code ? `code=${code}` : null,
        requestId ? `requestId=${requestId}` : null,
    ]
        .filter((part): part is string => part !== null)
        .join(' ');
}

/**
 * Typed request helpers.
 *
 * These are the only functions feature API services use. The `TData` parameter is
 * the **unwrapped** payload — i.e. what the backend puts inside `data`, not the
 * envelope. For a paginated endpoint that means
 * `PaginatedData<Shift>` (`{ data: Shift[], meta }`), and for
 * `GET /auth/me` it means `User`.
 *
 * Each accepts the standard axios config, including the retry overrides documented in
 * [`retryPolicy`](src/api/retryPolicy.ts:1) (`retry: false`, and `_retryCount` is
 * managed internally).
 */
export const api = {
    async get<TData>(url: string, config?: AxiosRequestConfig): Promise<TData> {
        const response = await axiosInstance.get<TData>(url, config);

        return response.data;
    },

    async post<TData, TBody = unknown>(url: string, body?: TBody, config?: AxiosRequestConfig): Promise<TData> {
        const response = await axiosInstance.post<TData>(url, body, config);

        return response.data;
    },

    async put<TData, TBody = unknown>(url: string, body?: TBody, config?: AxiosRequestConfig): Promise<TData> {
        const response = await axiosInstance.put<TData>(url, body, config);

        return response.data;
    },

    async patch<TData, TBody = unknown>(url: string, body?: TBody, config?: AxiosRequestConfig): Promise<TData> {
        const response = await axiosInstance.patch<TData>(url, body, config);

        return response.data;
    },

    async delete<TData>(url: string, config?: AxiosRequestConfig): Promise<TData> {
        const response = await axiosInstance.delete<TData>(url, config);

        return response.data;
    },
};

/**
 * Multipart variant used by leave submission.
 *
 * Content is built as `FormData` by the calling feature to keep this client
 * transport-only.
 *
 * ## Why `Content-Type` is explicitly set to `undefined`
 *
 * A multipart boundary cannot be generated from JavaScript — it must be produced by
 * the platform's networking layer, which appends `; boundary=…` when the request is
 * actually serialized. The header therefore must **not** be hardcoded:
 *
 * - Sending a literal `multipart/form-data` (as this function previously did) omits
 *   the boundary, so PHP/Laravel cannot parse the parts — the exact contradiction
 *   with this function's contract.
 * - Simply *omitting* the key is also wrong: the shared [`axiosInstance`](src/api/client.ts:1)
 *   defaults `Content-Type` to `application/json`, and axios's `transformRequest`
 *   JSON-serializes a `FormData` body when the content type is JSON — turning the
 *   upload into a string and destroying the file parts.
 *
 * Setting the value to `undefined` means "no value": it clears the JSON default so
 * axios leaves the `FormData` intact, and React Native's networking layer then
 * generates `multipart/form-data; boundary=…` itself.
 *
 * Retries do not apply: `POST` is not idempotent, so a replayed upload could create a
 * duplicate leave request.
 */
export async function postMultipart<TData>(
    url: string,
    formData: FormData,
    config?: AxiosRequestConfig,
): Promise<TData> {
    const response = await axiosInstance.post<TData>(url, formData, {
        ...config,
        headers: {
            ...config?.headers,
            // Cleared so the platform generates the boundary — see the note above.
            'Content-Type': undefined,
        },
    });

    return response.data;
}

export { axiosInstance };
