import { screen, waitFor } from '@testing-library/react-native';
import { act } from '@testing-library/react-native';

import { api } from '../../src/api';
import { hasToken, loadToken } from '../../src/api/tokenStore';
import { useSessionStore } from '../../src/features/auth/store/sessionStore';
import { authUser, notificationList, paginated } from '../../src/testing/api/fixtures';
import { fail, ok, type MockResult } from '../../src/testing/api/mockServer';
import { createNavigationHarness, HOME_SCREEN_TEST_ID } from '../../src/testing/navigation/harness';

/**
 * Suite 2 — Session & Auth Expiry.
 *
 * When an active user's credentials expire or are revoked while they are actively
 * navigating the application, the app must not hang or strand them in a partially broken
 * authenticated shell. Instead, the authoritative 401 response from the API interceptor
 * triggers the single-flight unauthorized handler, clears credentials from secure
 * storage, and automatically redirects the navigation hierarchy back to the Auth stack (Login).
 */
const harness = createNavigationHarness();

beforeEach(async () => {
    await harness.setup();
});

afterEach(async () => {
    await harness.teardown();
});

describe('Session & Auth Expiry', () => {
    it('automatically redirects to Login when an authenticated request returns 401 while navigating', async () => {
        let shiftsResponse: MockResult = ok(paginated([]));

        harness.server.get('/auth/me', () => ok(authUser()));
        harness.server.get('/shifts', () => shiftsResponse);
        harness.server.get('/rosters', () => ok(paginated([])));
        harness.server.get('/notifications', () => ok(notificationList([])));
        harness.server.get('/notifications/unread-count', () => ok({ count: 0 }));

        await harness.persistSession();
        await harness.renderApp();
        await harness.waitForAppShell();

        expect(screen.getByTestId(HOME_SCREEN_TEST_ID)).toBeTruthy();
        expect(useSessionStore.getState().status).toBe('authenticated-online');

        // Subsequent API request while navigating encounters an expired/revoked token (401)
        shiftsResponse = fail(401, 'Unauthenticated.');

        // Trigger request through the active API client (as a tab switch or refetch does)
        await act(async () => {
            try {
                await api.get('/shifts');
            } catch {
                // Interceptor handles the 401 AppError and routes to unauthorized handler
            }
        });

        // Auto-redirects to LoginScreen in AuthStack
        await harness.waitForLogin();

        expect(screen.getByLabelText('Password')).toBeTruthy();
        expect(screen.queryByTestId(HOME_SCREEN_TEST_ID)).toBeNull();

        // Local credentials and state are wiped
        await waitFor(() => expect(hasToken()).toBe(false));
        expect(await loadToken()).toBeNull();
        expect(useSessionStore.getState().status).toBe('unauthenticated');
        expect(useSessionStore.getState().user).toBeNull();
    });

    it('collapses concurrent 401s into a single clean transition to Login without unhandled rejections', async () => {
        let shiftsResponse: MockResult = ok(paginated([]));
        let rostersResponse: MockResult = ok(paginated([]));
        let notificationsResponse: MockResult = ok(notificationList([]));

        harness.server.get('/auth/me', () => ok(authUser()));
        harness.server.get('/shifts', () => shiftsResponse);
        harness.server.get('/rosters', () => rostersResponse);
        harness.server.get('/notifications', () => notificationsResponse);
        harness.server.get('/notifications/unread-count', () => ok({ count: 0 }));

        await harness.persistSession();
        await harness.renderApp();
        await harness.waitForAppShell();

        // All three endpoints start failing with 401 simultaneously
        shiftsResponse = fail(401, 'Token expired');
        rostersResponse = fail(401, 'Token expired');
        notificationsResponse = fail(401, 'Token expired');

        await act(async () => {
            const results = await Promise.allSettled([
                api.get('/shifts'),
                api.get('/rosters'),
                api.get('/notifications'),
            ]);

            // All three reject with 401 AppError
            expect(results.every(r => r.status === 'rejected')).toBe(true);
        });

        await harness.waitForLogin();

        expect(screen.getByLabelText('Sign in')).toBeTruthy();
        expect(useSessionStore.getState().status).toBe('unauthenticated');
    });

    it('immediately redirects to Login when session is cleared while on an app screen', async () => {
        harness.serveAppShell();
        await harness.persistSession();

        await harness.renderApp();
        await harness.waitForAppShell();

        expect(screen.getByTestId(HOME_SCREEN_TEST_ID)).toBeTruthy();

        // Clearing session (e.g. token expired check or manual session invalidation)
        await act(async () => {
            await useSessionStore.getState().clearSession();
        });

        await harness.waitForLogin();

        expect(screen.getByLabelText('Password')).toBeTruthy();
        expect(screen.queryByTestId(HOME_SCREEN_TEST_ID)).toBeNull();
        expect(useSessionStore.getState().status).toBe('unauthenticated');
    });
});
