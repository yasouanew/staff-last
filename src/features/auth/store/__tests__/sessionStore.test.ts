import AsyncStorage from '@react-native-async-storage/async-storage';

import { SECURE_KEYS, STORAGE_KEYS } from '../../../../config/storageKeys';
import { getSecureItem, setSecureItem } from '../../../../utils/secureStorage';
import { useNotificationInboxStore } from '../../../notifications/store';
import { authApi } from '../../api';
import { requireValidatedSession, useSessionStore } from '../sessionStore';

/**
 * Sign-out must clear **all** locally stored user data, not just the session flags.
 * This is the guarantee that matters on a shared device: a nurse's phone handed to the
 * next shift must not restore the previous user's token, profile, notification inbox,
 * preferences or push registration.
 *
 * These tests drive the real [`sessionStore`](src/features/auth/store/sessionStore.ts:1)
 * against the in-memory keychain and AsyncStorage mocks, seeding every store the app
 * owns and asserting each is emptied. Only the API is mocked, because sign-out must
 * clear locally even when the network call fails.
 */

jest.mock('../../api', () => ({
    authApi: {
        logout: jest.fn(),
        logoutAll: jest.fn(),
        me: jest.fn(),
    },
}));

const mockedLogout = authApi.logout as jest.MockedFunction<typeof authApi.logout>;
const mockedLogoutAll = authApi.logoutAll as jest.MockedFunction<typeof authApi.logoutAll>;
const mockedMe = authApi.me as jest.MockedFunction<typeof authApi.me>;

const NETWORK_ERROR = { kind: 'network' as const, message: 'offline' };
const UNAUTHORIZED_ERROR = { kind: 'unauthorized' as const, status: 401, message: 'Session expired' };

const USER = { id: 42, name: 'Jane', email: 'jane@example.com' };
const FOREIGN_KEY = '@thirdparty/navigation-state';

/** Seeds every location the app persists user data to. */
async function seedSignedInState(): Promise<void> {
    // Encrypted credentials.
    await setSecureItem(SECURE_KEYS.authToken, { token: '1|abc', tokenType: 'Bearer' });
    await setSecureItem(SECURE_KEYS.authUser, USER);

    // Legacy plaintext entries that must also be removed on sign-out.
    await AsyncStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify(USER));

    // Non-sensitive AsyncStorage state.
    await AsyncStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ pushEnabled: true }));
    await AsyncStorage.setItem(STORAGE_KEYS.fcmToken, 'fcm:device-token');
    await AsyncStorage.setItem(STORAGE_KEYS.notificationInbox, JSON.stringify({ userId: 42, items: [] }));

    // A key owned by a third-party library — must survive the wipe.
    await AsyncStorage.setItem(FOREIGN_KEY, 'keep-me');

    useSessionStore.setState({ status: 'authenticated-online', user: USER as never, restoreError: null });
    useNotificationInboxStore.setState({ items: [{ id: 'n1' } as never], userId: 42 });
}

describe('sessionStore sign-out', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        await AsyncStorage.clear();
        mockedLogout.mockResolvedValue(undefined);
        mockedLogoutAll.mockResolvedValue(undefined);

        // Reset both stores to a clean slate.
        useSessionStore.setState({ status: 'unauthenticated', user: null, restoreError: null });
        useNotificationInboxStore.setState({ items: [], userId: null, hydrated: false, synced: false });

        // Ensure nothing lingers in the keychain between tests.
        await useSessionStore.getState().clearSession();
    });

    it('clears the token, cached user, inbox, preferences and FCM token on clearSession', async () => {
        await seedSignedInState();

        await useSessionStore.getState().clearSession();

        // Session flags.
        expect(useSessionStore.getState().status).toBe('unauthenticated');
        expect(useSessionStore.getState().user).toBeNull();

        // Encrypted credentials.
        await expect(getSecureItem(SECURE_KEYS.authToken)).resolves.toBeNull();
        await expect(getSecureItem(SECURE_KEYS.authUser)).resolves.toBeNull();

        // Legacy plaintext user cache.
        await expect(AsyncStorage.getItem(STORAGE_KEYS.authUser)).resolves.toBeNull();

        // Non-sensitive app state.
        await expect(AsyncStorage.getItem(STORAGE_KEYS.preferences)).resolves.toBeNull();
        await expect(AsyncStorage.getItem(STORAGE_KEYS.fcmToken)).resolves.toBeNull();
        await expect(AsyncStorage.getItem(STORAGE_KEYS.notificationInbox)).resolves.toBeNull();

        // The in-memory notification inbox is dropped too, so a shared device cannot
        // read the previous user's shift changes before the process is killed.
        expect(useNotificationInboxStore.getState().items).toEqual([]);

        // Third-party state is untouched.
        await expect(AsyncStorage.getItem(FOREIGN_KEY)).resolves.toBe('keep-me');
    });

    it('clears local state on signOut even when the revoke call fails', async () => {
        await seedSignedInState();
        mockedLogout.mockRejectedValueOnce(new Error('offline'));

        await useSessionStore.getState().signOut();

        // The server call was attempted, but a failure must not block local cleanup.
        expect(mockedLogout).toHaveBeenCalled();
        expect(useSessionStore.getState().status).toBe('unauthenticated');
        await expect(getSecureItem(SECURE_KEYS.authToken)).resolves.toBeNull();
        await expect(getSecureItem(SECURE_KEYS.authUser)).resolves.toBeNull();
        await expect(AsyncStorage.getItem(STORAGE_KEYS.fcmToken)).resolves.toBeNull();
    });

    it('clears local state on signOutEverywhere', async () => {
        await seedSignedInState();

        await useSessionStore.getState().signOutEverywhere();

        expect(mockedLogoutAll).toHaveBeenCalled();
        expect(useSessionStore.getState().status).toBe('unauthenticated');
        await expect(getSecureItem(SECURE_KEYS.authToken)).resolves.toBeNull();
        await expect(getSecureItem(SECURE_KEYS.authUser)).resolves.toBeNull();
    });
});

/**
 * The explicit session state machine.
 *
 * These tests pin the trust boundary the model exists to create: a cached user is
 * never enough to authorise a write, and "offline" is a distinct, observable state
 * rather than being indistinguishable from a synchronised session.
 */
describe('sessionStore status model', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        await AsyncStorage.clear();
        await useSessionStore.getState().clearSession();
        useSessionStore.setState({ status: 'booting', user: null, restoreError: null, lastValidatedAt: null });
    });

    /** Seeds a persisted token (and optionally a cached user) for a cold start. */
    async function seedColdStart(withCachedUser: boolean): Promise<void> {
        await setSecureItem(SECURE_KEYS.authToken, {
            token: '1|abc',
            tokenType: 'Bearer',
            expiresAt: null,
            refreshToken: null,
            issuedAt: new Date().toISOString(),
        });

        if (withCachedUser) {
            await setSecureItem(SECURE_KEYS.authUser, USER);
        }
    }

    it('reports unauthenticated when no token is persisted', async () => {
        await useSessionStore.getState().restoreSession();

        expect(useSessionStore.getState().status).toBe('unauthenticated');
    });

    it('becomes authenticated-online when /auth/me succeeds', async () => {
        await seedColdStart(true);
        mockedMe.mockResolvedValueOnce(USER as never);

        await useSessionStore.getState().restoreSession();

        expect(useSessionStore.getState().status).toBe('authenticated-online');
        expect(useSessionStore.getState().lastValidatedAt).not.toBeNull();
    });

    it('becomes authenticated-offline (not online) when /auth/me fails but a cache exists', async () => {
        await seedColdStart(true);
        mockedMe.mockRejectedValueOnce(NETWORK_ERROR);

        await useSessionStore.getState().restoreSession();

        // The cached user is retained so the app is usable, but the session is
        // explicitly unvalidated.
        expect(useSessionStore.getState().status).toBe('authenticated-offline');
        expect(useSessionStore.getState().user).toEqual(USER);
        expect(useSessionStore.getState().lastValidatedAt).toBeNull();
    });

    it('signs out when /auth/me answers 401, even with a cached user', async () => {
        await seedColdStart(true);
        mockedMe.mockRejectedValueOnce(UNAUTHORIZED_ERROR);

        await useSessionStore.getState().restoreSession();

        expect(useSessionStore.getState().status).toBe('unauthenticated');
        await expect(getSecureItem(SECURE_KEYS.authToken)).resolves.toBeNull();
    });

    it('reaches session-error when a token exists but there is no cache and validation fails', async () => {
        await seedColdStart(false);
        mockedMe.mockRejectedValueOnce(NETWORK_ERROR);

        await useSessionStore.getState().restoreSession();

        // A distinct state, not "authenticated with a null user".
        expect(useSessionStore.getState().status).toBe('session-error');
        expect(useSessionStore.getState().user).toBeNull();
    });

    it('downgrades an online session to offline when a revalidation fails', () => {
        useSessionStore.setState({ status: 'authenticated-online', user: USER as never });

        useSessionStore.getState().markOffline(NETWORK_ERROR);

        expect(useSessionStore.getState().status).toBe('authenticated-offline');
    });

    it('does not downgrade a session that is not currently online', () => {
        useSessionStore.setState({ status: 'authenticated-validating', user: USER as never });

        useSessionStore.getState().markOffline(NETWORK_ERROR);

        expect(useSessionStore.getState().status).toBe('authenticated-validating');
    });

    describe('requireValidatedSession (sensitive-operation gate)', () => {
        it('permits an operation when the session is online', () => {
            useSessionStore.setState({ status: 'authenticated-online', user: USER as never });

            expect(() => requireValidatedSession()).not.toThrow();
        });

        it('blocks an operation while validating (cached user, unconfirmed)', () => {
            useSessionStore.setState({ status: 'authenticated-validating', user: USER as never });

            expect(() => requireValidatedSession()).toThrow();
        });

        it('blocks an operation while offline', () => {
            useSessionStore.setState({ status: 'authenticated-offline', user: USER as never });

            // A stale cached user must not authorise a write.
            expect(() => requireValidatedSession()).toThrow();
        });

        it('blocks an operation when signed out', () => {
            useSessionStore.setState({ status: 'unauthenticated', user: null });

            expect(() => requireValidatedSession()).toThrow();
        });

        it('throws a retryable network-kind error so existing surfaces treat it as connectivity', () => {
            useSessionStore.setState({ status: 'authenticated-offline', user: USER as never });

            try {
                requireValidatedSession();
                throw new Error('expected requireValidatedSession to throw');
            } catch (error) {
                expect((error as { kind?: string }).kind).toBe('network');
            }
        });
    });
});
