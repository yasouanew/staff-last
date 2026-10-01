import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider, type QueryClientConfig } from '@tanstack/react-query';
import {
    act,
    cleanup,
    render,
    type RenderOptions,
    type RenderResult,
} from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Animated, Linking } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { __resetUnauthorizedCooldown } from '../api/client';
import { clearToken, saveToken } from '../api/tokenStore';
import { SECURE_KEYS } from '../config/storageKeys';
import { useSessionStore, type SessionStatus } from '../features/auth/store/sessionStore';
import type { AuthUser } from '../features/auth/types';
import { useNotificationInboxStore } from '../features/notifications/store';
import { usePreferencesStore } from '../features/settings/store/preferencesStore';
import { installErrorReporter } from '../services/monitoring';
import { useOutboxStore } from '../services/outbox/outboxStore';
import { usePushStatusStore } from '../services/push/pushStatusStore';
import { clearAppStorage } from '../utils/storage';
import { clearSecureStorage, setSecureItem } from '../utils/secureStorage';
import { authUser } from './api/fixtures';
import { createMockServer, type MockServer } from './api/mockServer';

export const TEST_SAFE_AREA_METRICS: Metrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export const TEST_TOKEN = '1|sanctum-plain-text-token';

export type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
    /** Initial user in session store. Defaults to standard authUser(). Pass null for unauthenticated. */
    user?: AuthUser | null;
    /** Session status. Defaults to 'authenticated-online'. */
    sessionStatus?: SessionStatus;
    /** Custom query client or options. */
    queryClient?: QueryClient;
    /** Custom query client configuration. */
    queryClientConfig?: QueryClientConfig;
    /** Whether to wrap in NavigationContainer. Defaults to true. */
    wrapWithNavigation?: boolean;
    /** Pre-installed MockServer instance. If omitted, a server is initialized. */
    server?: MockServer;
};

export type RenderWithProvidersResult = RenderResult & {
    queryClient: QueryClient;
    server: MockServer;
    settle: () => Promise<void>;
};

/**
 * Creates a standard mock navigation object for screen testing.
 */
export function createMockNavigation<T = unknown>(overrides: Record<string, unknown> = {}) {
    const listeners: Record<string, ((event: unknown) => void)[]> = {};

    return {
        navigate: jest.fn(),
        goBack: jest.fn(),
        push: jest.fn(),
        pop: jest.fn(),
        popToTop: jest.fn(),
        replace: jest.fn(),
        reset: jest.fn(),
        setParams: jest.fn(),
        setOptions: jest.fn(),
        dispatch: jest.fn(),
        isFocused: jest.fn(() => true),
        canGoBack: jest.fn(() => true),
        getParent: jest.fn(() => ({
            navigate: jest.fn(),
            dispatch: jest.fn(),
        })),
        addListener: jest.fn((type: string, handler: (event: unknown) => void) => {
            const bucket = listeners[type] ?? [];

            bucket.push(handler);
            listeners[type] = bucket;

            return () => {
                listeners[type] = bucket.filter(registered => registered !== handler);
            };
        }),
        removeListener: jest.fn(),
        emit: jest.fn((event: { type: string; canPreventDefault?: boolean }) => ({
            defaultPrevented: false,
            ...event,
        })),
        getState: jest.fn(() => ({ routes: [], index: 0 })),
        ...overrides,
    } as unknown as T;
}

/**
 * Creates a standard mock route object for screen testing.
 *
 * Two overloads: a screen with no route params gets `{ key, name }` — which is exactly the
 * shape `RouteProp` declares for a paramless entry — while a screen that reads params
 * passes them and gets them typed back. The name is inferred as a **literal** (`'Home'`,
 * not `string`) so the object is assignable to the navigator's `RouteProp` without a cast.
 */
export function createMockRoute<TName extends string>(
    name: TName,
    params?: undefined,
    key?: string,
): { key: string; name: TName };
export function createMockRoute<TName extends string, TParams>(
    name: TName,
    params: TParams,
    key?: string,
): { key: string; name: TName; params: TParams };
export function createMockRoute<TName extends string, TParams = Record<string, unknown>>(
    name: TName,
    params?: TParams,
    key = `${name}-key`,
): { key: string; name: TName; params?: TParams } {
    return params === undefined ? { key, name } : { key, name, params };
}

/**
 * Global state reset for hermetic screen testing.
 */
export async function resetScreenTestState(server?: MockServer): Promise<void> {
    useSessionStore.setState(useSessionStore.getInitialState(), true);
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true);
    await useNotificationInboxStore.getState().reset();
    await useOutboxStore.getState().clear();
    usePushStatusStore.getState().reset();

    await clearToken();
    await clearSecureStorage();
    await clearAppStorage();

    __resetUnauthorizedCooldown();
    installErrorReporter(null);

    server?.reset();

    if (jest.isMockFunction(Linking.getInitialURL)) {
        (Linking.getInitialURL as jest.Mock).mockReset();
        (Linking.getInitialURL as jest.Mock).mockResolvedValue(null);
    }
}

/**
 * Standard setup helper for screen test suites.
 */
export function setupScreenTest() {
    const server = createMockServer();
    let activeClient: QueryClient | null = null;

    return {
        server,
        setup: async () => {
            jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

            jest.spyOn(Animated, 'timing').mockImplementation(
                ((value: Animated.Value, config: Animated.TimingAnimationConfig) => ({
                    start: (callback?: (result: { finished: boolean }) => void) => {
                        if (typeof config.toValue === 'number') {
                            value.setValue(config.toValue);
                        }
                        callback?.({ finished: true });
                    },
                    stop: () => undefined,
                    reset: () => undefined,
                })) as never,
            );

            await resetScreenTestState(server);
            server.install();
        },
        teardown: async () => {
            if (activeClient) {
                activeClient.cancelQueries();
                activeClient.clear();
                activeClient = null;
            }
            await act(async () => {
                cleanup();
            });
            server.restore();
            await resetScreenTestState(server);
            jest.restoreAllMocks();
        },
        render: async (ui: React.ReactElement, options: RenderWithProvidersOptions = {}) => {
            const result = await renderWithProviders(ui, { ...options, server });
            activeClient = result.queryClient;

            return result;
        },
    };
}

/**
 * Standardized render utility wrapped in required Providers (SafeArea, Query, Navigation, Auth).
 */
export async function renderWithProviders(
    ui: React.ReactElement,
    options: RenderWithProvidersOptions = {},
): Promise<RenderWithProvidersResult> {
    const {
        user = authUser(),
        sessionStatus = 'authenticated-online',
        wrapWithNavigation = true,
        server = createMockServer(),
        queryClientConfig,
        ...renderOptions
    } = options;

    // 1. Configure session state
    if (user !== null) {
        useSessionStore.setState({
            status: sessionStatus,
            user,
            restoreError: null,
            lastValidatedAt: new Date().toISOString(),
        });
        await saveToken({ token: TEST_TOKEN, tokenType: 'Bearer', expiresAt: null });
        await setSecureItem(SECURE_KEYS.authUser, user);
    } else {
        useSessionStore.setState({
            status: 'unauthenticated',
            user: null,
            restoreError: null,
            lastValidatedAt: null,
        });
    }

    // 2. Configure QueryClient with zero retries & immediate gc for deterministic testing
    const queryClient =
        options.queryClient ??
        new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                    gcTime: 0,
                    staleTime: 0,
                },
                mutations: {
                    retry: false,
                    /*
                     * Mutations default to a GC window (5 minutes, or `Infinity` in a
                     * non-DOM environment such as Jest) and schedule a timer to remove
                     * themselves from the cache once it elapses. That timer outlives the
                     * test run and is what makes Jest print "did not exit one second after
                     * the test run has completed" — the suite passes, but the worker never
                     * terminates. A deterministic test client holds nothing after the test,
                     * so the window is zero.
                     */
                    gcTime: 0,
                },
            },
            ...queryClientConfig,
        });

    async function settle(): Promise<void> {
        await act(async () => {
            await Promise.resolve();
        });
    }

    // 3. Provider wrapper
    function AllProviders({ children }: { children: React.ReactNode }) {
        let content = (
            <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
                <QueryClientProvider client={queryClient}>
                    {children}
                </QueryClientProvider>
            </SafeAreaProvider>
        );

        if (wrapWithNavigation) {
            content = <NavigationContainer>{content}</NavigationContainer>;
        }

        return content;
    }

    const renderResult = render(ui, { wrapper: AllProviders, ...renderOptions });
    await settle();

    return {
        ...renderResult,
        queryClient,
        server,
        settle,
    };
}
