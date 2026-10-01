import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { getErrorReporter } from './errorReporter';

/**
 * Monitoring bootstrap.
 *
 * Called once, at module scope (see [`index.js`](index.js:1)), before any request can
 * fail. The actual SDK is intentionally **not** imported here: Sentry, Bugsnag and
 * Crashlytics are native modules and a build must be able to ship without one. Choose a
 * provider by installing its SDK and replacing the `installErrorReporter({...})` call
 * below — the rest of the app only ever talks to the
 * [`MonitoringProvider`](src/services/monitoring/types.ts:1) interface.
 *
 * Example wiring (Sentry):
 *
 * ```ts
 * import * as Sentry from '@sentry/react-native';
 *
 * installErrorReporter({
 *     name: 'sentry',
 *     captureError: report =>
 *         Sentry.captureException(new Error(report.diagnostic), {
 *             tags: { kind: report.kind, env: report.appEnv },
 *             extra: { requestId: report.requestId, cause: report.cause, context: report.context },
 *         }),
 * });
 * ```
 *
 * With no provider wired, reports are still produced and redacted into the structured
 * log line — only off-device aggregation is missing. If monitoring is enabled in the
 * environment but no provider is installed, that is surfaced loudly, because it means a
 * production build is silently collecting nothing.
 */
export function bootstrapMonitoring(): void {
    if (!env.monitoring.enabled) {
        return;
    }

    if (getErrorReporter() !== null) {
        logger.info(`[monitoring] Error reporter active (${getErrorReporter()?.name}).`);

        return;
    }

    // Enabled but nothing installed — a production build would collect nothing.
    logger.warn(
        `[monitoring] Enabled (provider=${env.monitoring.provider ?? 'unset'}) but no reporter is installed. ` +
        'Install a provider at startup — see docs/error-handling.md.',
    );
}
