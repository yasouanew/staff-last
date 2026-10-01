/**
 * Navigation integration harness.
 *
 * Renders the **real** [`RootNavigator`](src/navigation/RootNavigator.tsx:1) inside the
 * app's provider stack, with the **real** session/preferences stores and the **real**
 * axios client pointed at the shared in-process
 * [mock server](src/testing/api/mockServer.ts:1). That combination is what makes a
 * navigation assertion worth writing: which stack the user sees is a pure function of
 * `useSessionStore`, and this harness only ever moves that store through the paths
 * production uses — a persisted token, `GET /auth/me`, or a 401.
 *
 * ## What the harness owns
 *
 *  - **Global store state.** The session, preferences, notification-inbox, outbox and
 *    push stores are module-level singletons, so they outlive a test. Each is reset to
 *    its `getInitialState()` in `setup()`, for the same reason the API harness resets
 *    the axios adapter: a suite whose result depends on its neighbour's leftovers is
 *    not an integration suite.
 *  - **Device storage.** Secure storage (Keychain/Keystore mock) and AsyncStorage are
 *    cleared, so no test inherits a token or a cached user.
 *  - **Reduce Motion.** Reported as `true` for the duration of a suite. The app's
 *    looping animations ([`Skeleton`](src/components/Skeleton/Skeleton.tsx:99) is the
 *    one that matters — it drives an `Animated.loop` off `requestAnimationFrame`, which
 *    Jest aliases to `setTimeout`) never end on their own, and a still-mounted skeleton
 *    would keep scheduling frames for the whole run. The assertions here are about
 *    *state and routing*, never about animation frames, so taking the Reduce Motion path
 *    costs the suite nothing and buys a deterministic render.
 *  - **Animation frames.** `Animated.timing` is collapsed to its end state. The app's
 *    remaining JS-driven timings (`AppTextInput`'s floating label, `AppBootGate`'s
 *    splash fade) each push a `setState` per frame, and a frame that lands between the
 *    last assertion and the unmount is reported as an update outside `act()`. Collapsing
 *    them keeps the *logic* — the gate still only hides the splash when the animation
 *    reports `finished` — while removing the frame-level noise. Nothing in these suites
 *    asserts on an intermediate animation frame.
 *
 * ## What the harness deliberately does not touch
 *
 * `setUnauthorizedHandler` is left exactly as `sessionStore` registered it at import
 * time (`401 → clearSession`). The API suite resets it because it asserts on the handler
 * itself; this suite asserts on the *consequence* — the app falling back to the Auth
 * stack — so removing that wiring would delete the behaviour under test.
 *
 * ## The splash
 *
 * [`AppBootGate`](src/components/AppBootGate/AppBootGate.tsx:1) paints the branded splash
 * over the tree and cross-fades it out with
 * `Animated.timing(..., { useNativeDriver: true })`. Under Jest the native animated
 * module is a mock that never reports the fade as `finished`, so with the real animation
 * in place the overlay would stay mounted for the life of the test. Collapsing
 * `Animated.timing` (above) lets the fade complete, which is what allows
 * `coldStart.test.tsx` to assert the actual *order* of a launch: the branded splash is
 * painted first, and the stack decision is revealed behind it.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    cleanup,
    render,
    screen,
    waitFor,
    type RenderResult,
} from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Linking } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { __resetUnauthorizedCooldown } from '../../api/client';
import { clearToken, saveToken } from '../../api/tokenStore';
import { queryClientConfig } from '../../config/queryConfig';
import { SECURE_KEYS } from '../../config/storageKeys';
import { useSessionStore } from '../../features/auth/store/sessionStore';
import type { AuthUser } from '../../features/auth/types';
import { useNotificationInboxStore } from '../../features/notifications/store';
import { usePreferencesStore } from '../../features/settings/store/preferencesStore';
import { RootNavigator } from '../../navigation/RootNavigator';
import { installErrorReporter } from '../../services/monitoring';
import { useOutboxStore } from '../../services/outbox/outboxStore';
import { usePushStatusStore } from '../../services/push/pushStatusStore';
import { clearAppStorage } from '../../utils/storage';
import { clearSecureStorage, setSecureItem } from '../../utils/secureStorage';
import { authUser, notificationList, paginated } from '../api/fixtures';
import { createMockServer, ok, type MockServer } from '../api/mockServer';


/**
 * Insets for the provider.
 *
 * Supplied explicitly rather than read from the device: under Jest there is no native
 * safe-area module, so `SafeAreaProvider` would have no insets to publish and every
 * `useSafeAreaInsets()` below it would throw. A concrete frame also keeps layout
 * deterministic — the tab bar and every `ScreenContainer` inset by exactly these values.
 */
export const TEST_SAFE_AREA_METRICS: Metrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** The token `POST /auth/login` hands back, reused as the "already signed in" token. */
export const TEST_TOKEN = '1|sanctum-plain-text-token';

/**
 * Marks the Home screen as mounted.
 *
 * The notification bell is rendered in *every* branch of `HomeScreen` (loading, error,
 * locked, empty, populated), which makes it the one testID that proves "the user is
 * looking at Home" without asserting on data.
 */
export const HOME_SCREEN_TEST_ID = 'home-notifications-bell';

export type PersistSessionOptions = {
    /** Access token to persist. Defaults to [`TEST_TOKEN`](src/testing/navigation/harness.tsx:1). */
    token?: string;
    /**
     * ISO timestamp the token expires at. `null` leaves the expiry to
     * [`saveToken`](src/api/tokenStore.ts:196), i.e. the configured TTL — a *valid*
     * token. Pass a past timestamp to simulate an obviously-dead session.
     */
    expiresAt?: string | null;
    /**
     * Cached user to persist alongside the token, as a previous run would have. `null`
     * simulates a launch with a token but no cache — the state that has nowhere to fall
     * back to when `/auth/me` fails.
     */
    user?: AuthUser | null;
};

/** A rendered app plus the cache behind it, for tests that need to reach into it. */
export type AppRender = RenderResult & { queryClient: QueryClient };


export type NavigationHarness = {
    server: MockServer;
    /** Installs the mock server and resets global state. Call in `beforeEach`. */
    setup: () => Promise<void>;
    /** Detaches the mock server and resets global state again. Call in `afterEach`. */
    teardown: () => Promise<void>;
    /** Mounts the real navigator with a fresh query cache. */
    renderApp: () => Promise<AppRender>;
    /** Persists a token (and optionally a cached user) as a previous run would have. */
    persistSession: (options?: PersistSessionOptions) => Promise<void>;
    /**
     * Registers the handlers a signed-in shell needs. Without them every request 404s,
     * the shell renders error views, and "did we navigate" assertions read like data
     * assertions.
     */
    serveAppShell: () => void;
    /** Flushes pending microtasks and zero-delay timers inside `act`. */
    settle: () => Promise<void>;
    /** Waits until the Auth stack is showing the login form. */
    waitForLogin: () => Promise<void>;
    /** Waits until the App stack is showing Home. */
    waitForAppShell: () => Promise<void>;
};

export function createNavigationHarness(): NavigationHarness {
    const server = createMockServer();
    let activeQueryClient: QueryClient | null = null;

    async function resetGlobalState(): Promise<void> {
        // `getInitialState()` rather than a hand-written reset: the initial state *is*
        // the cold-start state (`status: 'booting'`), and a copy here would silently
        // drift the moment the store gains a field.
        useSessionStore.setState(useSessionStore.getInitialState(), true);
        usePreferencesStore.setState(usePreferencesStore.getInitialState(), true);
        await useNotificationInboxStore.getState().reset();
        await useOutboxStore.getState().clear();
        usePushStatusStore.getState().reset();

        await clearToken();
        await clearSecureStorage();
        await clearAppStorage();

        // 401 single-flight cooldown: without this reset a test could observe a
        // neighbour's cooldown window and see no handler call at all.
        __resetUnauthorizedCooldown();
        // No provider: reports stay local, so a captured report cannot be attributed to
        // a previous suite's spy.
        installErrorReporter(null);

        server.reset();
    }

    async function settle(): Promise<void> {
        await act(async () => {
            await Promise.resolve();
        });
    }

    function resetLinkingMocks(): void {
        if (jest.isMockFunction(Linking.getInitialURL)) {
            (Linking.getInitialURL as jest.Mock).mockReset();
            (Linking.getInitialURL as jest.Mock).mockResolvedValue(null);
        }
    }

    return {
        server,

        setup: async () => {
            resetLinkingMocks();
            jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

            /*
             * `Animated.timing` collapsed to its end state.
             *
             * Keep `start` calling back with `finished: true`: `AppBootGate` only hides
             * the splash from that callback, so honouring it is what makes the gate's own
             * logic — not a shortened duration — the thing under test.
             */
            jest.spyOn(Animated, 'timing').mockImplementation(
                ((value: Animated.Value, config: Animated.TimingAnimationConfig) => ({
                    start: (callback?: (result: { finished: boolean }) => void) => {
                        /*
                         * `toValue` is `number | AnimatedValue | …` in RN's types, but a
                         * `Value` can only `setValue` a plain number. Narrowing here keeps
                         * the stub honest: a non-numeric target would be a test-harness
                         * mistake, and silently writing an animated node into a value
                         * would fail much later with a far less useful message.
                         */
                        if (typeof config.toValue === 'number') {
                            value.setValue(config.toValue);
                        }

                        callback?.({ finished: true });
                    },
                    stop: () => undefined,
                    reset: () => undefined,
                })) as never,
            );

            await resetGlobalState();
            server.install();
        },

        teardown: async () => {
            if (activeQueryClient) {
                activeQueryClient.cancelQueries();
                activeQueryClient.clear();
                activeQueryClient = null;
            }

            /*
             * Unmount inside `act` *before* the stores are reset. Resetting a store while
             * the previous test's tree is still mounted re-renders it one last time
             * outside `act`, which is exactly the warning this line exists to prevent.
             */
            await act(async () => {
                cleanup();
            });

            server.restore();
            await resetGlobalState();
            jest.restoreAllMocks();
            resetLinkingMocks();
        },

        renderApp: async () => {
            const queryClient = new QueryClient({
                defaultOptions: {
                    queries: {
                        retry: false,
                        gcTime: 0,
                    },
                    mutations: {
                        retry: false,
                    },
                },
            });
            activeQueryClient = queryClient;

            const result = render(
                <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
                    <QueryClientProvider client={queryClient}>
                        <RootNavigator />
                    </QueryClientProvider>
                </SafeAreaProvider>,
            );

            /*
             * `NavigationContainer` resolves its linking configuration, and the session
             * restore reads storage, before either renders anything real. Both settle
             * through microtasks, so flushing them inside `act` keeps the first paint
             * from landing outside one.
             */
            await settle();

            return { ...result, queryClient };
        },

        persistSession: async ({ token = TEST_TOKEN, expiresAt = null, user = authUser() } = {}) => {
            await saveToken({ token, tokenType: 'Bearer', expiresAt });

            if (user !== null) {
                // Written to the same encrypted slot `setSession` uses, so the restore
                // path under test is the production one.
                await setSecureItem(SECURE_KEYS.authUser, user);
            }
        },

        serveAppShell: () => {
            server.get('/auth/me', () => ok(authUser()));
            server.get('/shifts', () => ok(paginated([])));
            server.get('/rosters', () => ok(paginated([])));
            server.get('/notifications', () => ok(notificationList([])));
            server.get('/notifications/unread-count', () => ok({ count: 0 }));
            server.post('/auth/logout', () => ok({ message: 'Logged out.' }));
        },

        settle,

        waitForLogin: async () => {
            await waitFor(() => expect(screen.getByLabelText('Sign in')).toBeTruthy(), {
                timeout: 3000,
            });
        },

        waitForAppShell: async () => {
            await waitFor(() => expect(screen.getByTestId(HOME_SCREEN_TEST_ID)).toBeTruthy(), {
                timeout: 3000,
            });
        },
    };
}
