import type { AppError } from '../../../types/appError';
import {
    buildErrorReport,
    installErrorReporter,
    reportError,
    shouldReport,
    type MonitoringProvider,
} from '../index';

/**
 * The reporter is the seam a crash-reporting SDK plugs into. These tests pin the two
 * contracts that matter: only actionable failures are reported, and a report is
 * redacted before it reaches a provider.
 */
describe('errorReporter', () => {
    afterEach(() => {
        installErrorReporter(null);
        jest.restoreAllMocks();
    });

    describe('shouldReport', () => {
        it('reports transport and server failures', () => {
            expect(shouldReport('network')).toBe(true);
            expect(shouldReport('timeout')).toBe(true);
            expect(shouldReport('server')).toBe(true);
            expect(shouldReport('unknown')).toBe(true);
        });

        it('does not report expected 4xx control flow', () => {
            expect(shouldReport('validation')).toBe(false);
            expect(shouldReport('forbidden')).toBe(false);
            expect(shouldReport('not_found')).toBe(false);
            expect(shouldReport('unauthorized')).toBe(false);
            expect(shouldReport('cancelled')).toBe(false);
        });
    });

    describe('buildErrorReport', () => {
        it('separates the user-facing message from the diagnostic', () => {
            const error: AppError = {
                kind: 'server',
                status: 500,
                message: 'Something went wrong on our end.',
                requestId: 'req-123',
            };

            const report = buildErrorReport({ error, method: 'GET', url: '/shifts' });

            expect(report.userMessage).toBe('Something went wrong on our end.');
            expect(report.diagnostic).toContain('GET /shifts');
            expect(report.diagnostic).toContain('status=500');
            expect(report.diagnostic).toContain('requestId=req-123');
        });

        it('redacts the cause before it leaves the module', () => {
            const error: AppError = {
                kind: 'network',
                message: 'No connection.',
                cause: { config: { headers: { Authorization: 'Bearer 1|secret' } } },
            };

            const report = buildErrorReport({ error });

            expect(JSON.stringify(report.cause)).not.toContain('1|secret');
            expect(JSON.stringify(report.cause)).toContain('[redacted]');
        });
    });

    describe('reportError', () => {
        it('forwards a redacted report to the installed provider', () => {
            const captureError = jest.fn();
            const provider: MonitoringProvider = { name: 'test', captureError };

            installErrorReporter(provider);

            reportError({
                error: { kind: 'server', status: 500, message: 'Boom' },
                method: 'GET',
                url: '/x',
                requestId: 'req-1',
            });

            expect(captureError).toHaveBeenCalledTimes(1);
            expect(captureError.mock.calls[0][0]).toMatchObject({ kind: 'server', requestId: 'req-1' });
        });

        it('does not forward an unactionable error', () => {
            const captureError = jest.fn();

            installErrorReporter({ name: 'test', captureError });

            reportError({ error: { kind: 'validation', message: 'Check your details' } });

            expect(captureError).not.toHaveBeenCalled();
        });

        it('never throws when the provider throws', () => {
            installErrorReporter({
                name: 'broken',
                captureError: () => {
                    throw new Error('reporter down');
                },
            });

            expect(() =>
                reportError({ error: { kind: 'server', message: 'Boom' } }),
            ).not.toThrow();
        });

        it('works with no provider installed', () => {
            installErrorReporter(null);

            expect(() =>
                reportError({ error: { kind: 'network', message: 'Offline' } }),
            ).not.toThrow();
        });
    });
});
