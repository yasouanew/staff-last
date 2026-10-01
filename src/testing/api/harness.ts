import { clearToken, saveToken } from '../../../src/api/tokenStore';
import {
    __resetUnauthorizedCooldown,
    setUnauthorizedHandler,
} from '../../../src/api/client';
import { installErrorReporter } from '../../../src/services/monitoring';
import { createMockServer, type MockServer } from './mockServer';

/**
 * Per-suite harness for API integration tests.
 *
 * Wires the [mock server](__tests__/api/support/mockServer.ts:1) to the **real** axios
 * client and resets every piece of cross-test state the client touches:
 *
 *  - the adapter (installed/restored per test),
 *  - the in-memory bearer token, so a suite never inherits a token a previous test
 *    saved,
 *  - the 401 single-flight cooldown, so each test observes its own transition,
 *  - the unauthorized handler, so a test can assert on it,
 *  - the error reporter, so a failure is not forwarded to a provider.
 *
 * Everything explicit rather than implicit: a suite that forgets one of these would
 * otherwise pass or fail depending on its neighbours, which is the failure mode that
 * makes integration suites untrustworthy.
 */

export type ApiHarness = {
    server: MockServer;
    /** Registers and installs the server. Call at the top of the suite body. */
    setup: () => void;
    /** Detaches everything. Call in `afterEach`. */
    teardown: () => void;
    /** Signs in for the duration of a test by seeding the real token store. */
    signIn: (token?: string) => Promise<void>;
    /** Clears the token. */
    signOut: () => Promise<void>;
};

export function createApiHarness(): ApiHarness {
    const server = createMockServer();

    async function resetClientState(): Promise<void> {
        await clearToken();
        __resetUnauthorizedCooldown();
        setUnauthorizedHandler(null);
        // No provider: reports are logged locally only, so a test cannot accidentally
        // attribute a captured report to a previous suite's spy.
        installErrorReporter(null);
        server.reset();
    }

    return {
        server,
        setup: () => {
            /*
             * `beforeEach` bodies in this repo are synchronous by convention, so the
             * async reset is kicked off here and awaited by `signIn`/the first request.
             * The token store's `clearToken` clears memory synchronously before its
             * first `await`, which is what makes that safe.
             */
            void resetClientState();
            server.install();
        },
        teardown: () => {
            // `restore()` puts back whatever adapter was installed before this suite —
            // normally `undefined`, which is how axios falls back to its own.
            server.restore();
            void resetClientState();
        },
        signIn: async (token = '1|sanctum-plain-text-token') => {
            await saveToken({ token, tokenType: 'Bearer' });
        },
        signOut: async () => {
            await clearToken();
        },
    };
}

/**
 * Waits for a promise and returns the rejection value, asserting one occurred.
 *
 * A thin wrapper so a test reads `await rejectionOf(api.get(...))` rather than a
 * five-line try/catch — and, more importantly, so a call that *resolves* fails the
 * test with a clear message instead of silently asserting on `undefined`.
 */
export async function rejectionOf<T>(promise: Promise<T>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    throw new Error('Expected the promise to reject, but it resolved.');
}
