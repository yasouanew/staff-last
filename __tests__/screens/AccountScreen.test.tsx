import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import { useSessionStore } from '../../src/features/auth/store/sessionStore';
import { AccountScreen } from '../../src/features/settings/screens/AccountScreen';
import { usePreferencesStore } from '../../src/features/settings/store';
import { authUser } from '../../src/testing/api/fixtures';
import { fail, ok, type MockResult } from '../../src/testing/api/mockServer';
import {
    createMockNavigation,
    createMockRoute,
    setupScreenTest,
} from '../../src/testing/renderWithProviders';
import { queryKeys } from '../../src/utils/queryKeys';

/**
 * Screen integration tests — Account / Settings hub (spec Screen 11).
 *
 * Follows the nine-block template documented in
 * [`__tests__/screens/README.md`](./README.md).
 *
 * ## Screen-specific notes
 *
 * Settings is the least "CRUD" screen in the app, and the template is honest about that
 * rather than fabricating states it does not have:
 *
 * | Block | This screen |
 * |-------|-------------|
 * | 1 Loading | **No skeleton by design.** Identity is painted from the cached session on the first frame, so "loading" means "the cached session is on screen while `GET /auth/me` revalidates". That is what is asserted. |
 * | 3 Empty | **No empty collection.** The closest state is "no cached identity at all", which must still render a usable screen instead of crashing. |
 * | 4 Error | **No error page by design.** A failed revalidation degrades the session to `authenticated-offline` (see `docs/session-state-model.md`); blanking Settings would lock the user out of the one place that can fix their session. |
 * | 6–8 | Real mutations: **sign out**, **sign out everywhere**, **resend verification email**. |
 *
 * The global stores are read and written directly in a few places. That is deliberate:
 * `status` is exactly what the root navigator switches stacks on, so asserting it is
 * asserting the user-visible consequence, not an implementation detail.
 */
type AccountProps = React.ComponentProps<typeof AccountScreen>;

/** Anything the mock server can answer with, including a deliberate non-response. */
type Served = MockResult | (() => MockResult | Promise<MockResult>);

describe('AccountScreen (Settings)', () => {
    const harness = setupScreenTest();
    const mockNavigation = createMockNavigation<AccountProps['navigation']>();
    const mockRoute = createMockRoute('Account');

    beforeEach(async () => {
        await harness.setup();
        jest.clearAllMocks();
        // Preferences are device-local and hydrate from storage; the hydration window is
        // its own state, so it is closed before the tests that are not about it.
        await usePreferencesStore.getState().hydrate();
    });

    afterEach(async () => {
        await harness.teardown();
    });

    const serveAccount = (me: Served = ok(authUser())): void => {
        harness.server.get('/auth/me', typeof me === 'function' ? me : () => me);
    };

    const renderAccount = (options: Parameters<typeof harness.render>[1] = {}) =>
        harness.render(<AccountScreen navigation={mockNavigation} route={mockRoute} />, options);

    describe('1. Loading', () => {
        it('paints the cached identity immediately while /auth/me is in flight', async () => {
            serveAccount(() => new Promise<MockResult>(() => {}));

            await renderAccount();

            // No skeleton and no blank frame: the cached session is the first paint, which
            // is what makes cold-start Settings feel instant.
            expect(screen.getByText('Alex Rivera')).toBeTruthy();
            expect(screen.getByText('alex@example.com')).toBeTruthy();
            expect(screen.getByText('Dark Mode')).toBeTruthy();
            expect(screen.queryByRole('progressbar')).toBeNull();
        });
    });

    describe('2. Success', () => {
        it('revalidates and re-renders the identity from the server', async () => {
            serveAccount(() =>
                ok(
                    authUser({
                        name: 'Jordan Blake',
                        email: 'jordan@example.com',
                        roles: ['employee', 'supervisor'],
                    }),
                ),
            );

            await renderAccount();

            await waitFor(() => expect(screen.getByText('Jordan Blake')).toBeTruthy());

            expect(screen.getByText('jordan@example.com')).toBeTruthy();
            expect(screen.getByTestId('account-roles').props.children).toBe(
                'employee, supervisor',
            );
            expect(screen.getByTestId('account-verified-badge')).toBeTruthy();

            // The three groups the hub promises, so a missing row is a failure here.
            expect(screen.getByText('Personal Details')).toBeTruthy();
            expect(screen.getByText('Preferences')).toBeTruthy();
            expect(screen.getByText('Session')).toBeTruthy();
        });
    });

    describe('3. Empty', () => {
        it('renders a usable screen when there is no cached identity', async () => {
            serveAccount();

            await renderAccount({ user: null });

            // Placeholder identity rather than a crash or an empty shell.
            expect(screen.getByText('Signed in')).toBeTruthy();
            // The monogram never paints an empty circle, but it is deliberately hidden from
            // assistive technology (the name beside it is what should be announced) — hence
            // the explicit opt-in to hidden elements.
            expect(screen.getByText('•', { includeHiddenElements: true })).toBeTruthy();
            // No roles line at all, rather than an empty one.
            expect(screen.queryByTestId('account-roles')).toBeNull();
            // The destructive actions are still reachable — they are the way out of a
            // broken session.
            expect(screen.getByText('Sign out')).toBeTruthy();
            // And a signed-out tree must not fire an authenticated request.
            expect(harness.server.hitCount('/auth/me')).toBe(0);
        });
    });

    describe('4. Error', () => {
        it('keeps the screen usable and degrades the session when revalidation fails', async () => {
            serveAccount(() => fail(500, 'Session service unavailable.'));

            await renderAccount();

            await waitFor(() =>
                expect(useSessionStore.getState().status).toBe('authenticated-offline'),
            );

            // The one place that can repair a broken session must never be replaced by an
            // error page — the cached identity stays, and so does every action.
            expect(screen.getByText('Alex Rivera')).toBeTruthy();
            expect(screen.queryByText('Server error')).toBeNull();
            expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
            expect(screen.getByText('Sign out')).toBeTruthy();
        });
    });

    describe('5. Retry recovery', () => {
        it('picks up a successful revalidation after a failed one', async () => {
            let response: MockResult = fail(500, 'Session service unavailable.');

            serveAccount(() => response);

            const { queryClient } = await renderAccount();

            await waitFor(() =>
                expect(useSessionStore.getState().status).toBe('authenticated-offline'),
            );

            response = ok(authUser({ name: 'Jordan Blake' }));

            // The recovery path a screen offers here is the next revalidation, not a
            // retry button: there is nothing for the user to fix by tapping again.
            await act(async () => {
                await queryClient.invalidateQueries({ queryKey: queryKeys.session.me() });
            });

            await waitFor(() => expect(screen.getByText('Jordan Blake')).toBeTruthy());
            await waitFor(() =>
                expect(useSessionStore.getState().status).toBe('authenticated-online'),
            );
        });
    });

    describe('6. Mutation pending', () => {
        it('reports the in-flight sign-out and does not clear the session early', async () => {
            serveAccount();

            let finishSignOut: (() => void) | null = null;
            harness.server.post(
                '/auth/logout',
                () =>
                    new Promise<MockResult>(resolve => {
                        finishSignOut = () => resolve(ok(undefined, 'Signed out.'));
                    }),
            );

            await renderAccount();

            // The row opens a confirmation sheet; the mutation only starts from the sheet.
            fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

            const confirm = await screen.findByTestId('account-confirm-sign-out');

            fireEvent.press(confirm);

            // The confirm control carries the busy state, so the sheet cannot be
            // double-submitted and the user is told something is happening.
            await waitFor(() =>
                expect(screen.getByTestId('account-confirm-sign-out').props.accessibilityState).toEqual(
                    expect.objectContaining({ busy: true, disabled: true }),
                ),
            );

            // Nothing is torn down until the server answers.
            expect(useSessionStore.getState().status).not.toBe('unauthenticated');
            expect(harness.server.hitCount('/auth/logout')).toBe(1);

            await act(async () => {
                finishSignOut?.();
            });
        });
    });


    describe('7. Mutation success', () => {
        it('clears the local session once the sign-out is accepted', async () => {
            serveAccount();
            harness.server.post('/auth/logout', () => ok(undefined, 'Signed out.'));

            await renderAccount();

            fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
            fireEvent.press(await screen.findByTestId('account-confirm-sign-out'));

            await waitFor(() =>
                expect(useSessionStore.getState().status).toBe('unauthenticated'),
            );
            expect(useSessionStore.getState().user).toBeNull();
            expect(harness.server.hitCount('/auth/logout')).toBe(1);
        });

        it('revokes every device when "Sign out everywhere" is confirmed', async () => {
            serveAccount();
            harness.server.post('/auth/logout-all', () => ok(undefined, 'All sessions revoked.'));

            await renderAccount();

            fireEvent.press(screen.getByRole('button', { name: 'Sign out everywhere' }));
            fireEvent.press(await screen.findByTestId('account-confirm-sign-out-everywhere'));

            await waitFor(() =>
                expect(useSessionStore.getState().status).toBe('unauthenticated'),
            );
            // The specific endpoint matters: a plain `/auth/logout` would leave the other
            // devices signed in, which is the opposite of what the row promises.
            expect(harness.server.hitCount('/auth/logout-all')).toBe(1);
            expect(harness.server.hitCount('/auth/logout')).toBe(0);
        });

        it('sends the verification email and returns the row to its resting state', async () => {
            serveAccount(() => ok(authUser({ email_verified_at: null })));
            harness.server.post('/auth/email/resend', () =>
                ok({ message: 'Verification link sent.' }),
            );

            await renderAccount();

            await waitFor(() => expect(screen.getByTestId('account-unverified')).toBeTruthy());

            within(screen.getByTestId('account-unverified')).getByText('Resend verification email');

            fireEvent.press(screen.getByText('Resend verification email'));

            await waitFor(() => expect(harness.server.hitCount('/auth/email/resend')).toBe(1));

            // The row is interactive again rather than stuck on "Sending…".
            await waitFor(() =>
                expect(
                    screen.getByRole('button', { name: 'Resend verification email' }),
                ).toBeTruthy(),
            );
        });
    });

    describe('8. Mutation failure', () => {
        it('still clears the local session when revoking the token fails', async () => {
            serveAccount();
            // A user must be able to sign out offline; the token is revoked on a
            // best-effort basis and the device is cleared regardless.
            harness.server.post('/auth/logout', () => fail(500, 'Service unavailable.'));

            await renderAccount();

            fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
            fireEvent.press(await screen.findByTestId('account-confirm-sign-out'));

            await waitFor(() =>
                expect(useSessionStore.getState().status).toBe('unauthenticated'),
            );
            expect(harness.server.hitCount('/auth/logout')).toBe(1);
        });

        it('survives a rejected verification resend', async () => {
            serveAccount(() => ok(authUser({ email_verified_at: null })));
            harness.server.post('/auth/email/resend', () => fail(429, 'Too many attempts.'));

            await renderAccount();

            await waitFor(() => expect(screen.getByTestId('account-unverified')).toBeTruthy());

            fireEvent.press(screen.getByText('Resend verification email'));

            await waitFor(() => expect(harness.server.hitCount('/auth/email/resend')).toBe(1));

            // The failure is non-fatal: the banner still explains the situation and the
            // action is available again.
            expect(screen.getByTestId('account-unverified')).toBeTruthy();
            expect(screen.getByText('Your email address is not verified.')).toBeTruthy();
            await waitFor(() =>
                expect(
                    screen.getByRole('button', { name: 'Resend verification email' }),
                ).toBeTruthy(),
            );
        });
    });


    describe('9. Accessibility', () => {
        it('labels every row, switch and destructive action', async () => {
            serveAccount();

            await renderAccount();

            // ---- Group headings are exposed as section labels, not decoration ----
            expect(screen.getByText('Personal Details')).toBeTruthy();

            // ---- Navigation rows: label, and `label, value` when they carry one ----
            expect(screen.getByRole('button', { name: 'Name and email, Personal details' })).toBeTruthy();
            expect(screen.getByRole('button', { name: 'Password, Change password' })).toBeTruthy();
            expect(
                screen.getByRole('button', { name: 'More preferences, Roster view, appearance' }),
            ).toBeTruthy();

            // ---- Switches: the control itself is the labelled target ----
            expect(screen.getByLabelText('Dark Mode')).toBeTruthy();
            expect(screen.getByLabelText('Shift notifications')).toBeTruthy();

            // ---- Session rows are destructive and must not promise a screen they lack ----
            expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
            expect(screen.getByRole('button', { name: 'Sign out everywhere' })).toBeTruthy();
        });

        it('routes to the pushed screens and confirms destruction in a modal sheet', async () => {
            serveAccount();

            await renderAccount();

            fireEvent.press(screen.getByRole('button', { name: 'Name and email, Personal details' }));
            expect(mockNavigation.navigate).toHaveBeenCalledWith('Profile');

            fireEvent.press(screen.getByRole('button', { name: 'Password, Change password' }));
            expect(mockNavigation.navigate).toHaveBeenCalledWith('ChangePassword');

            fireEvent.press(
                screen.getByRole('button', { name: 'More preferences, Roster view, appearance' }),
            );
            expect(mockNavigation.navigate).toHaveBeenCalledWith('Preferences');

            // Destructive actions never fire straight from the row: a sheet states the
            // consequence first, and the sheet is a modal for assistive technology.
            expect(screen.queryByTestId('account-confirmation-sheet')).toBeNull();

            fireEvent.press(screen.getByRole('button', { name: 'Sign out everywhere' }));

            const sheet = await screen.findByTestId('account-confirmation-sheet');
            expect(
                within(sheet).getByText(
                    'This signs you out on every device and revokes all active sessions.',
                ),
            ).toBeTruthy();
            // A confirm and an escape hatch, both reachable by role. (The sheet also traps
            // assistive-technology focus with `accessibilityViewIsModal` and supports the
            // platform dismiss gesture — see `BottomSheet`.)
            expect(
                within(sheet).getByRole('button', { name: 'Sign out everywhere' }),
            ).toBeTruthy();
            expect(within(sheet).getByRole('button', { name: 'Cancel' })).toBeTruthy();
        });

        it('toggles a preference from the keyboard-accessible switch target', async () => {
            serveAccount();

            await renderAccount();

            // The store is the observable: preferences are device-local, so the assertion
            // is that the control wrote the model rather than a network payload.
            const before = usePreferencesStore.getState().pushEnabled;

            fireEvent(screen.getByLabelText('Shift notifications'), 'valueChange', !before);

            await waitFor(() =>
                expect(usePreferencesStore.getState().pushEnabled).toBe(!before),
            );
        });
    });
});

