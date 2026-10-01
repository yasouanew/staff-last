import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '../../src/features/auth/store/sessionStore';
import { authUser, companyAccess } from '../../src/testing/api/fixtures';
import { ok } from '../../src/testing/api/mockServer';
import { createNavigationHarness, HOME_SCREEN_TEST_ID } from '../../src/testing/navigation/harness';

/**
 * Suite 4 — Edge Navigation.
 *
 * Covers complex edge-case transitions in the navigation hierarchy:
 *  - Deep sign-out: When a user signs out from a deeply nested screen inside a child stack
 *    (e.g., Account -> Preferences), the entire nested stack must unmount cleanly, the root
 *    navigator must swap to the Auth stack without leftover route state, and subsequent logins
 *    must reset to the root of the App stack (Home) rather than resuming a stale nested screen.
 *  - Company lock state transition: When company access gets revoked/locked while a user is
 *    actively navigating the authenticated shell, the RootNavigator must immediately isolate
 *    the app behind CompanyLockedView, unmounting the tab tree so no company-scoped screens
 *    can be accessed. Signing out from the locked view returns cleanly to Login.
 */
const harness = createNavigationHarness();

beforeEach(async () => {
    await harness.setup();
});

afterEach(async () => {
    await harness.teardown();
});

describe('Edge Navigation', () => {
    describe('Deep sign-out from nested navigation stacks', () => {
        it('cleans up nested stack state when signing out from a deep screen and lands on Login', async () => {
            harness.serveAppShell();
            await harness.persistSession();

            await harness.renderApp();
            await harness.waitForAppShell();

            // 1. Navigate from HomeTab to AccountTab
            const accountTab = screen.getByRole('tab', { name: 'Account' });
            fireEvent.press(accountTab);

            await waitFor(() => expect(screen.getByText('Your profile and settings.')).toBeTruthy(), {
                timeout: 3000,
            });

            // 2. Push deep into the nested Account stack (Account -> Preferences)
            const preferencesRow = screen.getByText('More preferences');
            fireEvent.press(preferencesRow);

            await waitFor(() => expect(screen.getByText('How the app works on this device.')).toBeTruthy(), {
                timeout: 3000,
            });
            expect(screen.getByText('Push notifications')).toBeTruthy();

            // User is now deeply nested in AccountStack -> PreferencesScreen
            expect(screen.queryByTestId(HOME_SCREEN_TEST_ID)).toBeNull();

            // 3. Trigger sign out from deep within the app
            await act(async () => {
                await useSessionStore.getState().signOut();
            });

            // 4. Root navigator collapses the AppTabs & nested stack and presents Login
            await harness.waitForLogin();

            expect(screen.getByLabelText('Password')).toBeTruthy();
            expect(screen.queryByText('How the app works on this device.')).toBeNull();
            expect(screen.queryByText('Your profile and settings.')).toBeNull();
            expect(useSessionStore.getState().status).toBe('unauthenticated');

            // 5. Subsequent authentication opens cleanly at Home, not at the old nested screen
            await act(async () => {
                await useSessionStore.getState().setSession(authUser());
            });

            await harness.waitForAppShell();
            expect(screen.getByTestId(HOME_SCREEN_TEST_ID)).toBeTruthy();
            expect(screen.queryByText('How the app works on this device.')).toBeNull();
        });

        it('supports full in-app sign out confirmation flow from the Account screen', async () => {
            harness.serveAppShell();
            await harness.persistSession();

            await harness.renderApp();
            await harness.waitForAppShell();

            // Navigate to Account screen
            fireEvent.press(screen.getByRole('tab', { name: 'Account' }));
            await waitFor(() => expect(screen.getByText('Your profile and settings.')).toBeTruthy());

            // Tap "Sign out" row to open confirmation bottom sheet
            const signOutRow = screen.getByText('Sign out');
            fireEvent.press(signOutRow);

            // Confirm inside bottom sheet
            await waitFor(() => expect(screen.getByTestId('account-confirm-sign-out')).toBeTruthy());
            fireEvent.press(screen.getByTestId('account-confirm-sign-out'));

            // Cleanly returns to Login screen
            await harness.waitForLogin();
            expect(screen.getByLabelText('Password')).toBeTruthy();
            expect(useSessionStore.getState().status).toBe('unauthenticated');
        });
    });

    describe('Company locked navigation state', () => {
        it('swaps the active app shell for the paywall when company is locked while in-app', async () => {
            harness.serveAppShell();
            await harness.persistSession();

            await harness.renderApp();
            await harness.waitForAppShell();

            expect(screen.getByTestId(HOME_SCREEN_TEST_ID)).toBeTruthy();

            // While navigating, an updated user payload or revalidation marks company access locked
            await act(async () => {
                await useSessionStore.getState().setUser(
                    authUser({
                        company_access: companyAccess({
                            is_locked: true,
                            reason: 'Subscription renewal required.',
                        }),
                    }),
                );
            });

            // The AppTabs tree is unmounted and CompanyLockedView is shown
            await waitFor(() => expect(screen.getByText('Account unavailable')).toBeTruthy(), {
                timeout: 3000,
            });

            expect(screen.getByText('Subscription renewal required.')).toBeTruthy();
            expect(screen.queryByTestId(HOME_SCREEN_TEST_ID)).toBeNull();

            // Signing out from the locked view returns to AuthStack (Login)
            const lockedSignOutButton = screen.getByLabelText('Sign out');
            fireEvent.press(lockedSignOutButton);

            await harness.waitForLogin();
            expect(screen.getByLabelText('Password')).toBeTruthy();
            expect(screen.queryByText('Account unavailable')).toBeNull();
            expect(useSessionStore.getState().status).toBe('unauthenticated');
        });

        it('restores app shell access when company lock is lifted', async () => {
            harness.server.get('/auth/me', () =>
                ok(
                    authUser({
                        company_access: companyAccess({
                            is_locked: true,
                            reason: 'Pending payment.',
                        }),
                    }),
                ),
            );

            await harness.persistSession();
            await harness.renderApp();

            await waitFor(() => expect(screen.getByText('Account unavailable')).toBeTruthy());
            expect(screen.queryByTestId(HOME_SCREEN_TEST_ID)).toBeNull();

            // Admin resolves payment; user state is updated with unlocked access
            await act(async () => {
                await useSessionStore.getState().setUser(
                    authUser({
                        company_access: companyAccess({
                            is_locked: false,
                        }),
                    }),
                );
            });

            // App tabs mount and user is on Home screen
            await harness.waitForAppShell();
            expect(screen.getByTestId(HOME_SCREEN_TEST_ID)).toBeTruthy();
            expect(screen.queryByText('Account unavailable')).toBeNull();
        });
    });
});
