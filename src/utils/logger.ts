import { env } from '../config/env';

/**
 * Debug logger.
 *
 * Wrapped (rather than using `console` directly) so that noisy diagnostics are
 * compiled out of production behaviour by a single switch and so that no call site
 * can accidentally log credentials: values passed here are already redacted by the
 * API layer.
 */
export const logger = {
    debug(...args: unknown[]): void {
        if (env.debug) {
            console.log('[debug]', ...args);
        }
    },

    info(...args: unknown[]): void {
        if (env.debug) {
            console.info('[info]', ...args);
        }
    },

    warn(...args: unknown[]): void {
        if (env.debug) {
            console.warn('[warn]', ...args);
        }
    },

    /**
     * Errors are reported in every environment — a failed API call in production is
     * exactly what a crash/issue report needs to show.
     */
    error(...args: unknown[]): void {
        console.error('[error]', ...args);
    },
};
