import Config from 'react-native-config';

/**
 * Typed access layer for environment configuration.
 *
 * Values come from the `.env*` files at the project root, injected at build time by
 * `react-native-config` (see [`babel.config.js`](babel.config.js:1) and
 * [`android/app/build.gradle`](android/app/build.gradle:1)).
 *
 * Nothing in this file may contain a hardcoded environment host or secret — the only
 * literal values here are safe fallbacks used when a key is missing at build time so
 * that a misconfigured build fails loudly at runtime with a readable message instead
 * of shipping a silent `undefined` into the API client.
 */

export type AppEnvironment = 'development' | 'staging' | 'production';

const FALLBACK_API_BASE_URL = 'http://10.0.2.2:8000/api/v1';
const FALLBACK_TIMEOUT_MS = 15_000;

function readString(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : undefined;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
    const normalized = readString(value)?.toLowerCase();

    if (normalized === 'true' || normalized === '1') {
        return true;
    }

    if (normalized === 'false' || normalized === '0') {
        return false;
    }

    return fallback;
}

function readInt(value: string | undefined, fallback: number): number {
    const normalized = readString(value);
    const parsed = normalized === undefined ? Number.NaN : Number.parseInt(normalized, 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readEnvironment(value: string | undefined): AppEnvironment {
    const normalized = readString(value)?.toLowerCase();

    if (normalized === 'production' || normalized === 'staging') {
        return normalized;
    }

    return 'development';
}

const appEnvironment = readEnvironment(Config.APP_ENV);

/**
 * Normalises the configured base URL:
 * - strips trailing slashes so path joining stays predictable
 * - tolerates a value supplied without the `/api/v1` suffix
 */
function normalizeApiBaseUrl(raw: string | undefined): string {
    const base = (readString(raw) ?? FALLBACK_API_BASE_URL).replace(/\/+$/, '');

    return base.endsWith('/api') ? `${base}/v1` : base;
}

export const env = {
    /** `development` | `staging` | `production`, derived from `APP_ENV`. */
    appEnv: appEnvironment,
    isDevelopment: appEnvironment === 'development',
    isProduction: appEnvironment === 'production',

    /** Base URL including the `/api/v1` prefix. */
    apiBaseUrl: normalizeApiBaseUrl(Config.API_BASE_URL),
    apiTimeoutMs: readInt(Config.API_TIMEOUT_MS, FALLBACK_TIMEOUT_MS),

    /**
     * Automatic retry policy for **safe/idempotent** requests only.
     *
     * Non-idempotent methods are never retried here (see
     * [`retryPolicy`](src/api/retryPolicy.ts:1)); a mutating write is handled explicitly
     * by the [outbox](src/services/outbox/outboxStore.ts:1) so it can be deduplicated.
     */
    apiRetry: {
        /** Total attempts including the first. `1` disables retries. */
        maxAttempts: readInt(Config.API_RETRY_MAX_ATTEMPTS, 3),
        /** First backoff delay; doubled per attempt and capped. */
        baseDelayMs: readInt(Config.API_RETRY_BASE_DELAY_MS, 300),
        /** Upper bound on any single backoff delay. */
        maxDelayMs: readInt(Config.API_RETRY_MAX_DELAY_MS, 5_000),
    },

    /**
     * Error/crash reporting.
     *
     * `dsn` is consumed by whichever provider the build installs at startup (see
     * [`errorReporter`](src/services/monitoring/errorReporter.ts:1)). Absent DSN ⇒ no
     * provider is installed and reports are only logged locally.
     */
    monitoring: {
        enabled: readBool(Config.MONITORING_ENABLED, false),
        /** Provider name, e.g. `sentry` | `bugsnag` | `crashlytics`. */
        provider: readString(Config.MONITORING_PROVIDER),
        dsn: readString(Config.MONITORING_DSN),
    },

    /** Laravel app root (no `/api/v1`), used to resolve public storage URLs. */
    appPublicUrl: (readString(Config.APP_PUBLIC_URL) ?? '').replace(/\/+$/, ''),

    /**
     * App version reported to `POST /auth/login` as `app_version` (spec Screen 1 API 1,
     * nullable). Omitted when `APP_VERSION` is not set at build time, so the server
     * records nothing rather than a misleading placeholder — `package.json`'s
     * `0.0.1` is the scaffold's version, not a release.
     */
    appVersion: readString(Config.APP_VERSION),

    /** Verbose logging switch — always off in production. */
    debug: appEnvironment === 'production' ? false : readBool(Config.APP_DEBUG, true),

    deepLinkScheme: readString(Config.APP_DEEP_LINK_SCHEME) ?? 'staffapp',

    /**
     * Authentication token policy.
     *
     * Sanctum computes expiry server-side (`config('sanctum.expiration')`) and the
     * login response does **not** include it, so the client cannot know the true
     * expiry. These values provide a conservative, client-side bound that enables
     * proactive re-authentication and refresh instead of relying solely on a 401.
     */
    auth: {
        /**
         * Advisory access-token lifetime, in seconds, used to *derive* an expiry when
         * the backend does not return one. The default mirrors Sanctum's shipped
         * `1440` minutes. `0` disables derivation, leaving expiry "unknown" and the
         * session governed by server 401s alone.
         */
        tokenTtlSeconds: readInt(Config.AUTH_TOKEN_TTL_SECONDS, 24 * 60 * 60),

        /**
         * Clock-skew allowance in seconds. A token is not treated as expired until
         * this long *after* its computed expiry, so a device clock running slightly
         * ahead cannot discard a token the server still accepts.
         */
        tokenExpirySkewSeconds: readInt(Config.AUTH_TOKEN_EXPIRY_SKEW_SECONDS, 60),
    },

    fcm: {
        enabled: readBool(Config.FCM_ENABLED, false),
        androidChannelId: readString(Config.FCM_ANDROID_CHANNEL_ID) ?? 'staffsaas_default',
    },
} as const;

export type Env = typeof env;
