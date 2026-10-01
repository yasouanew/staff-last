import { screen, waitFor } from '@testing-library/react-native';

import { hasToken, loadToken } from '../../src/api/tokenStore';
import { useSessionStore } from '../../src/features/auth/store/sessionStore';
import { authUser, companyAccess } from '../../src/testing/api/fixtures';
import { fail, networkError, ok } from '../../src/testing/api/mockServer';
import { createNavigationHarness, TEST_TOKEN } from '../../src/testing/navigation/harness';

/**
 * Suite 1 — Cold start and boot gating.
 *
 * Every assertion here is about the first seconds of a launch: which stack the app
 * *decides* to render from what is on the device, and what it refuses to do. The two
 * failure modes this suite exists to catch are opposites, and both are serious:
 *
 *  - **Painting the shell against an unvalidated token.** A revoked token then renders a
 *    dashboard that is torn down mid-paint, and — while it is up — a cached record can
 *    authorise a write the server will reject.
 *  - **Holding the splash behind a request.** The app must open with cached data and no
 *    connectivity, so an offline launch has to produce a usable shell, not a permanent
 *    branded screen.
 */
const harness = createNavigationHarness();

beforeEach(async () => {
    await harness.setup();
});

afterEach(async () => {
    await harness.teardown();
});

describe('Cold start', () => {
    it('paints the splash, then the login form, and never calls an authenticated endpoint', async () => {
        harness.server.get('/auth/me', () => ok(authUser()));

        await harness.renderApp();

        // The first paint is the branded splash: at this point the app does not know
        // whether it is signed in, and the overlay is what stops it deciding.
        expect(screen.getByLabelText('Starting Staff Scheduler')).toBeTruthy();

        await harness.waitForLogin();

        expect(screen.getByLabelText('Password')).toBeTruthy();
        await waitFor(() => expect(useSessionStore.getState().status).toBe('unauthenticated'));

        // No token means no `/auth/me`. A cold start that has never signed in must not
        // spend a request proving it.
        expect(harness.server.hitCount('/auth/me')).toBe(0);
    });

    it('restores a persisted session and opens the app shell', async () => {
        harness.serveAppShell();
        await harness.persistSession();

        await harness.renderApp();
        await harness.waitForAppShell();

        // The Auth stack is not merely covered: it is never mounted, so a regression
        // that flashes Login before the dashboard fails here.
        expect(screen.queryByLabelText('Sign in')).toBeNull();
        expect(useSessionStore.getState().status).toBe('authenticated-online');

        const [me] = harness.server.requestsTo('/auth/me');

        expect(me?.headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
        // The token survives the launch, so the *next* cold start is still signed in.
        expect((await loadToken())?.token).toBe(TEST_TOKEN);
    });

    it('treats a 401 from /auth/me as a dead session and falls back to the login form', async () => {
        harness.server.get('/auth/me', () => fail(401, 'Unauthenticated.'));

        await harness.persistSession();
        await harness.renderApp();
        await harness.waitForLogin();

        await waitFor(() => expect(hasToken()).toBe(false));

        // A revoked token is signed out, not merely unvalidated: the cached user goes
        // too, so no screen can render against it.
        expect(useSessionStore.getState().status).toBe('unauthenticated');
        expect(useSessionStore.getState().user).toBeNull();
        expect(await loadToken()).toBeNull();
        expect(screen.queryByTestId('session-offline-banner')).toBeNull();
    });

    it('discards an expired token before any request, and never paints the shell', async () => {
        harness.server.get('/auth/me', () => ok(authUser()));

        // Past the advisory expiry: `restoreSession` must short-circuit rather than
        // discover the same fact from a 401.
        await harness.persistSession({ expiresAt: '2020-01-01T00:00:00.000Z' });

        await harness.renderApp();
        await harness.waitForLogin();

        expect(harness.server.hitCount('/auth/me')).toBe(0);
        expect(hasToken()).toBe(false);
        expect(screen.queryByTestId('session-offline-banner')).toBeNull();
    });

    it('keeps a cached user usable offline and says so', async () => {
        harness.server.get('/auth/me', () => networkError());
        // The shell's own landing query fails the same way, so this is a real offline
        // launch rather than a validated session behind one flaky endpoint.
        harness.server.get('/shifts', () => networkError());

        await harness.persistSession();
        await harness.renderApp();
        await harness.waitForAppShell();

        expect(screen.getByTestId('session-offline-banner')).toBeTruthy();
        expect(useSessionStore.getState().status).toBe('authenticated-offline');
        // Offline is not signed out: the cached user is still what the UI renders.
        expect(useSessionStore.getState().user?.email).toBe('alex@example.com');
        expect(hasToken()).toBe(true);
    });

    it('shows the session-error screen when a token cannot be validated and nothing is cached', async () => {
        // No cached user, so there is nothing to fall back to when validation fails.
        harness.server.get('/auth/me', () => fail(500, 'Server Error'));

        await harness.persistSession({ user: null });
        await harness.renderApp();

        await waitFor(() => expect(screen.getByText("Can't reach your account")).toBeTruthy(), {
            timeout: 3000,
        });

        // A token that cannot be confirmed and no cache to fall back to is its own
        // state — not "authenticated with a null user", which used to render an empty
        // shell where every screen silently showed nothing.
        expect(useSessionStore.getState().status).toBe('session-error');
        expect(screen.queryByTestId('home-notifications-bell')).toBeNull();
    });

    it('renders the company paywall instead of the shell when the account is locked', async () => {
        harness.server.get('/auth/me', () =>
            ok(
                authUser({
                    company_access: companyAccess({
                        is_locked: true,
                        reason: 'Your company subscription has expired.',
                    }),
                }),
            ),
        );

        await harness.persistSession();
        await harness.renderApp();

        await waitFor(() => expect(screen.getByText('Account unavailable')).toBeTruthy(), {
            timeout: 3000,
        });

        // One gate above the navigator rather than five identical 403 screens: the tab
        // tree is not mounted at all, so no screen can fail on its own.
        expect(screen.queryByTestId('home-notifications-bell')).toBeNull();
        expect(screen.getByText('Your company subscription has expired.')).toBeTruthy();
    });
});
