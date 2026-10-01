import { Linking } from 'react-native';
import { act, screen, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '../../src/features/auth/store/sessionStore';
import { createNavigationHarness } from '../../src/testing/navigation/harness';

/**
 * Suite 3 — Deep linking.
 *
 * The password reset link is the one route the app cannot reach on its own: it arrives
 * from an email, on a device that may be cold or warm, signed in or signed out. What is
 * under test is therefore not "does the parser work" but *where the user lands* in each
 * of those states — and that a link the app does not recognise cannot move them at all.
 *
 * `Linking` is already mocked by the React Native Jest preset, so URLs are injected
 * through the two seams production uses:
 *
 *  - `getInitialURL()` — the cold-start link the OS hands the app at launch.
 *  - the `url` listener React Navigation registers — the warm link for an app that is
 *    already running.
 */
const harness = createNavigationHarness();

/** Captured from React Navigation's `addEventListener('url', …)` subscription. */
let urlListener: ((event: { url: string }) => void) | null = null;

function deliverUrl(url: string): void {
    if (urlListener === null) {
        throw new Error('React Navigation has not subscribed to url events.');
    }

    urlListener({ url });
}

const RESET_LINK = 'staffapp://reset-password?token=tok-123&email=alex%40example.com';

beforeEach(async () => {
    urlListener = null;

    // The preset's mock records no listeners, so one is captured here. Registered before
    // `renderApp()` because the container subscribes while mounting.
    jest.spyOn(Linking, 'addEventListener').mockImplementation(
        ((_type: string, handler: (event: { url: string }) => void) => {
            urlListener = handler;

            return { remove: jest.fn() };
        }) as never,
    );

    await harness.setup();
});

afterEach(async () => {
    await harness.teardown();
});

describe('Deep linking', () => {
    it('opens the reset screen from a cold-start link, pre-filled from the query', async () => {
        jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(RESET_LINK);

        await harness.renderApp();

        // Reachable while signed out — the whole reason this is the only linked route.
        await waitFor(() => expect(screen.getByText('Set a new password')).toBeTruthy(), {
            timeout: 3000,
        });

        // When token is provided in the link, the token field is hidden and email is prefilled
        expect(screen.getByDisplayValue('alex@example.com')).toBeTruthy();
        expect(screen.getByText('Choose a new password for your account.')).toBeTruthy();
        expect(screen.getByLabelText('New password')).toBeTruthy();

        // There was no token to restore, so nothing authenticated was attempted.
        expect(harness.server.hitCount('/auth/me')).toBe(0);
    });

    it('opens the reset screen for a warm link delivered while signed out', async () => {
        await harness.renderApp();
        await harness.waitForLogin();

        await act(async () => {
            deliverUrl('staffapp://reset-password?token=tok-456&email=alex%40example.com');
        });

        await waitFor(() => expect(screen.getByText('Set a new password')).toBeTruthy(), {
            timeout: 3000,
        });
        expect(screen.getByDisplayValue('alex@example.com')).toBeTruthy();
        // The login form is replaced rather than stacked behind: the user is mid-flow.
        expect(screen.queryByLabelText('Sign in')).toBeNull();
    });

    it('renders the reset screen with empty fields when the link carries no parameters', async () => {
        // A truncated query is the realistic malformed case — some mail clients strip `?`
        // and everything after it. The screen must still render so the user can type the
        // code, rather than landing on a blank navigator.
        jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('staffapp://reset-password');

        await harness.renderApp();

        await waitFor(() => expect(screen.getByLabelText('Reset code')).toBeTruthy(), {
            timeout: 3000,
        });

        expect(screen.getByLabelText('Reset code').props.value).toBe('');
        expect(screen.getByLabelText('Email').props.value).toBe('');
    });

    it('ignores a link from an unrecognised scheme', async () => {
        // The prefix list is `staffapp://` plus the configured public URL. A foreign host
        // that claims the same path must not be able to steer the app.
        jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(
            'https://evil.example.com/reset-password?token=tok-789&email=alex%40example.com',
        );

        await harness.renderApp();
        await harness.waitForLogin();

        expect(screen.queryByText('Set a new password')).toBeNull();
        expect(screen.getByLabelText('Password')).toBeTruthy();
    });

    it('gracefully handles a malformed or unrecognized warm deep link without crashing', async () => {
        await harness.renderApp();
        await harness.waitForLogin();

        await act(async () => {
            deliverUrl('staffapp://non-existent-route?foo=bar');
        });

        // App remains stable on Login screen without throwing
        expect(screen.getByLabelText('Password')).toBeTruthy();
        expect(screen.queryByText('Set a new password')).toBeNull();
    });

    it('leaves a signed-in user on the app shell, because the reset route lives in the Auth stack', async () => {
        jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(RESET_LINK);

        harness.serveAppShell();
        await harness.persistSession();

        await harness.renderApp();
        await harness.waitForAppShell();

        /*
         * CHARACTERISED, NOT ENDORSED.
         *
         * The `Auth → ResetPassword` path cannot be resolved while the App stack is the
         * only branch mounted, so the link is silently dropped. That is the safe outcome
         * — a signed-in user is never bounced into a password form carrying a stale
         * token — but it also means a user who taps a reset link while signed in sees
         * nothing happen. Pinned so a change to that behaviour has to be deliberate.
         */
        expect(screen.queryByText('Set a new password')).toBeNull();
        expect(screen.getByTestId('home-notifications-bell')).toBeTruthy();
        expect(useSessionStore.getState().status).toBe('authenticated-online');
    });
});
