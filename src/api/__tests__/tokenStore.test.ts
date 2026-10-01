import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

import { env } from '../../config/env';
import { SECURE_KEYS, STORAGE_KEYS } from '../../config/storageKeys';
import { secureServiceName } from '../../utils/secureStorage';
import {
    buildAuthorizationHeader,
    clearToken,
    getToken,
    isTokenExpired,
    loadToken,
    msUntilExpiry,
    rotateToken,
    saveToken,
} from '../tokenStore';

/**
 * The bearer token is the highest-value secret the app holds: it authorises every
 * request until revoked. These tests pin the guarantees that make storing it acceptable:
 *
 * 1. it is written to the Keychain/Keystore, never to AsyncStorage;
 * 2. a pre-existing plaintext token is migrated and the plaintext copy deleted;
 * 3. an advisory expiry is derived when the backend does not return one, and is
 *    enforced before a request is attempted;
 * 4. sign-out clears both storage locations.
 *
 * The real [`tokenStore`](src/api/tokenStore.ts:1) runs against the in-memory keychain
 * mock, so the assertions read the actual persisted payload rather than a spy.
 */

const mockedKeychain = Keychain as unknown as {
    __reset: () => void;
    __get: (service: string) => { username: string; password: string } | undefined;
};

/** Reads the raw JSON the token store persisted to the keychain, if any. */
function persistedTokenPayload(): Record<string, unknown> | null {
    const entry = mockedKeychain.__get(secureServiceName(SECURE_KEYS.authToken));

    return entry === undefined ? null : (JSON.parse(entry.password) as Record<string, unknown>);
}

describe('tokenStore', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        mockedKeychain.__reset();
        await AsyncStorage.clear();

        // Reset the module-level in-memory token between tests.
        await clearToken();
        mockedKeychain.__reset();
    });

    describe('secure persistence', () => {
        it('writes the token to encrypted storage, never to AsyncStorage', async () => {
            await saveToken({ token: '1|abc', tokenType: 'Bearer' });

            const persisted = persistedTokenPayload();

            expect(persisted).not.toBeNull();
            expect(persisted?.token).toBe('1|abc');

            // The whole point of the change: no plaintext token in the unencrypted store.
            await expect(AsyncStorage.getItem(STORAGE_KEYS.authToken)).resolves.toBeNull();
        });

        it('exposes the token synchronously for the request interceptor', async () => {
            await saveToken({ token: '1|abc', tokenType: 'Bearer' });

            expect(getToken()?.token).toBe('1|abc');
            expect(buildAuthorizationHeader()).toBe('Bearer 1|abc');
        });

        it('returns null from the header builder when signed out', async () => {
            expect(buildAuthorizationHeader()).toBeNull();
        });

        it('defaults tokenType to Bearer when the backend omits it', async () => {
            await saveToken({ token: '1|abc' });

            expect(getToken()?.tokenType).toBe('Bearer');
        });
    });

    describe('expiry derivation', () => {
        it('derives an advisory expiry from the configured TTL when none is returned', async () => {
            await saveToken({ token: '1|abc' });

            const expiresAt = getToken()?.expiresAt;

            expect(expiresAt).not.toBeNull();

            const remainingMs = Date.parse(expiresAt as string) - Date.now();
            const expectedMs = env.auth.tokenTtlSeconds * 1000;

            expect(remainingMs).toBeGreaterThan(expectedMs - 5_000);
            expect(remainingMs).toBeLessThanOrEqual(expectedMs);
        });

        it('prefers a server-supplied absolute expiry', async () => {
            const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

            await saveToken({ token: '1|abc', expiresAt });

            expect(getToken()?.expiresAt).toBe(expiresAt);
        });

        it('prefers a server-supplied TTL over the configured default', async () => {
            await saveToken({ token: '1|abc', expiresInSeconds: 120 });

            const remainingMs = msUntilExpiry();

            expect(remainingMs).not.toBeNull();
            expect(remainingMs as number).toBeLessThanOrEqual(120_000);
            expect(remainingMs as number).toBeGreaterThan(110_000);
        });

        it('leaves expiry unknown (null) when derivation is disabled', async () => {
            // `AUTH_TOKEN_TTL_SECONDS=0` disables derivation; the session is then
            // governed solely by server 401s.
            const original = env.auth.tokenTtlSeconds;
            (env.auth as { tokenTtlSeconds: number }).tokenTtlSeconds = 0;

            try {
                await saveToken({ token: '1|abc' });

                expect(getToken()?.expiresAt).toBeNull();
            } finally {
                (env.auth as { tokenTtlSeconds: number }).tokenTtlSeconds = original;
            }
        });
    });

    describe('expiry enforcement', () => {
        it('treats a token past its expiry (beyond skew) as expired', async () => {
            await saveToken({ token: '1|abc', expiresAt: new Date(Date.now() - 600_000).toISOString() });

            expect(isTokenExpired()).toBe(true);
        });

        it('does not treat a token within the skew window as expired', async () => {
            // Expired 10s ago, but the skew allowance (60s) tolerates a fast clock.
            await saveToken({ token: '1|abc', expiresAt: new Date(Date.now() - 10_000).toISOString() });

            expect(isTokenExpired()).toBe(false);
        });

        it('does not treat an unknown expiry as expired', async () => {
            const original = env.auth.tokenTtlSeconds;
            (env.auth as { tokenTtlSeconds: number }).tokenTtlSeconds = 0;

            try {
                await saveToken({ token: '1|abc' });

                expect(isTokenExpired()).toBe(false);
            } finally {
                (env.auth as { tokenTtlSeconds: number }).tokenTtlSeconds = original;
            }
        });

        it('reports null time-to-expiry when there is no bound', async () => {
            const original = env.auth.tokenTtlSeconds;
            (env.auth as { tokenTtlSeconds: number }).tokenTtlSeconds = 0;

            try {
                await saveToken({ token: '1|abc' });

                expect(msUntilExpiry()).toBeNull();
            } finally {
                (env.auth as { tokenTtlSeconds: number }).tokenTtlSeconds = original;
            }
        });
    });

    describe('rotation', () => {
        it('atomically replaces the access token', async () => {
            await saveToken({ token: '1|old' });

            await rotateToken({ token: '2|new', refreshToken: 'refresh-1' });

            expect(getToken()?.token).toBe('2|new');
            expect(getToken()?.refreshToken).toBe('refresh-1');
            expect(persistedTokenPayload()?.token).toBe('2|new');
        });

        it('records an issuedAt timestamp for rotation bookkeeping', async () => {
            await saveToken({ token: '1|abc' });

            const issuedAt = getToken()?.issuedAt;

            expect(typeof issuedAt).toBe('string');
            expect(Number.isFinite(Date.parse(issuedAt as string))).toBe(true);
        });
    });

    describe('cold-start restore', () => {
        it('restores the token from encrypted storage', async () => {
            const stored = {
                token: '1|abc',
                tokenType: 'Bearer',
                expiresAt: null,
                refreshToken: null,
                issuedAt: new Date().toISOString(),
            };

            await Keychain.setGenericPassword('staffsaas', JSON.stringify(stored), {
                service: secureServiceName(SECURE_KEYS.authToken),
            });

            const restored = await loadToken();

            expect(restored?.token).toBe('1|abc');
            expect(getToken()?.token).toBe('1|abc');
        });

        it('reports no session when nothing is stored', async () => {
            await expect(loadToken()).resolves.toBeNull();
            expect(getToken()).toBeNull();
        });

        it('backfills missing optional fields on a legacy-shaped secure record', async () => {
            // An install that stored `{ token, tokenType, expiresAt }` before rotation
            // metadata existed must still restore.
            await Keychain.setGenericPassword(
                'staffsaas',
                JSON.stringify({ token: '1|abc', tokenType: 'Bearer', expiresAt: null }),
                { service: secureServiceName(SECURE_KEYS.authToken) },
            );

            const restored = await loadToken();

            expect(restored?.token).toBe('1|abc');
            expect(restored?.refreshToken).toBeNull();
            expect(typeof restored?.issuedAt).toBe('string');
        });
    });

    describe('legacy plaintext migration', () => {
        it('migrates a plaintext AsyncStorage token and deletes the plaintext copy', async () => {
            await AsyncStorage.setItem(
                STORAGE_KEYS.authToken,
                JSON.stringify({ token: '1|legacy', tokenType: 'Bearer', expiresAt: null }),
            );

            const restored = await loadToken();

            expect(restored?.token).toBe('1|legacy');
            expect(persistedTokenPayload()?.token).toBe('1|legacy');

            // The exposed plaintext copy must not linger.
            await expect(AsyncStorage.getItem(STORAGE_KEYS.authToken)).resolves.toBeNull();
        });

        it('does not migrate when there is no legacy token', async () => {
            await expect(loadToken()).resolves.toBeNull();
            expect(persistedTokenPayload()).toBeNull();
        });
    });

    describe('sign-out', () => {
        it('clears the token from memory and from both storage locations', async () => {
            await saveToken({ token: '1|abc' });
            await AsyncStorage.setItem(
                STORAGE_KEYS.authToken,
                JSON.stringify({ token: '1|legacy', tokenType: 'Bearer', expiresAt: null }),
            );

            await clearToken();

            expect(getToken()).toBeNull();
            expect(persistedTokenPayload()).toBeNull();
            await expect(AsyncStorage.getItem(STORAGE_KEYS.authToken)).resolves.toBeNull();
        });
    });
});
