import { env } from '../../config/env';
import type { AppError } from '../../types/appError';
import { logger } from '../../utils/logger';
import { redact } from './redact';
import type { ErrorReport, MonitoringProvider } from './types';

/**
 * Error reporting.
 *
 * ## Why a seam, and not a direct SDK import
 *
 * The brief asks for "Sentry, Bugsnag, Firebase Crashlytics, or equivalent". Which one
 * is a deployment decision, and every one of them is a native module that must not be
 * a hard dependency of the API layer. So the app defines a
 * [`MonitoringProvider`](src/services/monitoring/types.ts:1) interface and installs an
 * implementation at startup:
 *
 * ```ts
 * // index.js / App bootstrap, before the first request
 * installErrorReporter({
 *     name: 'sentry',
 *     captureError: report => Sentry.captureException(new Error(report.diagnostic), { extra: report }),
 * });
 * ```
 *
 * With no provider installed, reports are still produced (redacted and logged), so a
 * build without a reporter loses nothing except off-device aggregation.
 *
 * ## What is reported
 *
 * Only failures an engineer can act on: transport failures, 5xx, and contract
 * violations. Expected 4xx (validation, authorization, not-found) are deliberately not
 * reported — they are normal control flow, and reporting them buries the real errors.
 */

let provider: MonitoringProvider | null = null;

/** Installs (or clears, with `null`) the crash/error reporting backend. */
export function installErrorReporter(next: MonitoringProvider | null): void {
    provider = next;
}

/** The installed provider, if any. */
export function getErrorReporter(): MonitoringProvider | null {
    return provider;
}

/** True for the kinds worth sending to a reporter. */
export function shouldReport(kind: AppError['kind']): boolean {
    return kind === 'network' || kind === 'timeout' || kind === 'server' || kind === 'unknown';
}

export type ReportInput = {
    error: AppError;
    method?: string;
    url?: string;
    requestId?: string;
    context?: Record<string, unknown>;
};

/** Builds a redacted, structured report from an `AppError`. Pure. */
export function buildErrorReport(input: ReportInput): ErrorReport {
    const { error, method, url, context } = input;

    // Prefer an explicitly-supplied id, but fall back to the one already carried on the
    // error so a caller cannot accidentally drop the correlation.
    const requestId = input.requestId ?? error.requestId;

    const transportCode =
        typeof (error.cause as { code?: unknown } | undefined)?.code === 'string'
            ? (error.cause as { code: string }).code
            : undefined;

    const diagnosticParts = [
        `${method ?? 'REQUEST'} ${url ?? ''}`.trim(),
        `kind=${error.kind}`,
        error.status !== undefined ? `status=${error.status}` : null,
        transportCode ? `code=${transportCode}` : null,
        requestId ? `requestId=${requestId}` : null,
    ].filter((part): part is string => part !== null);

    return {
        kind: error.kind,
        status: error.status,
        requestId,
        method,
        url,
        userMessage: error.message,
        diagnostic: diagnosticParts.join(' '),
        cause: error.cause === undefined ? undefined : redact(error.cause),
        context: context === undefined ? undefined : (redact(context) as Record<string, unknown>),
        timestamp: new Date().toISOString(),
        appEnv: env.appEnv,
        appVersion: env.appVersion,
    };
}

/**
 * Reports an error if it is worth reporting.
 *
 * Never throws — a reporter must not be able to break the request path it is observing.
 */
export function reportError(input: ReportInput): void {
    if (!shouldReport(input.error.kind)) {
        return;
    }

    const report = buildErrorReport(input);

    // The structured line is always emitted so a local/dev session sees it; the provider
    // (when installed) is the durable, off-device destination.
    logger.error('[monitoring]', report.diagnostic, {
        requestId: report.requestId,
        userMessage: report.userMessage,
        cause: report.cause,
    });

    try {
        provider?.captureError(report);
    } catch (error) {
        // A broken reporter is not allowed to escalate.
        logger.warn('[monitoring] Error reporter threw while capturing a report', error);
    }
}
