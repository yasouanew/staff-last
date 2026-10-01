import * as Keychain from 'react-native-keychain';

import { SECURE_KEYS } from '../../config/storageKeys';
import {
    clearSecureStorage,
    getSecureItem,
    hasSecureItem,
    isSecureStorageAvailable,
    removeSecureItem,
    secureServiceName,
    setSecureItem,
} from '../secureStorage';

/**
 * These tests exercise the real [`secureStorage`](src/utils/secureStorage.ts:1) module
 * against the in-memory keychain mock configured in
 * [`jest.config.js`](jest.config.js:1), so the set/read/remove round trip is covered
 * rather than assumed. The seam is security-relevant: if it silently failed to write,
 * the app would fall back to a memory-only session and every cold start would bounce
 * the user to login.
 */

const mockedKeychain = Keychain as unknown as {
    setGenericPassword: jest.Mock;
    getGenericPassword: jest.Mock;
    hasGenericPassword: jest.Mock;
    resetGenericPassword: jest.Mock;
    __reset: () => void;
};

describe('secureStorage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedKeychain.__reset();
    });

    it('round-trips a JSON value through the keychain', async () => {
        const value = { token: '1|abc', tokenType: 'Bearer' };

        await expect(setSecureItem(SECURE_KEYS.authToken, value)).resolves.toBe(true);
        await expect(getSecureItem(SECURE_KEYS.authToken)).resolves.toEqual(value);
    });

    it('namespaces each logical key to a distinct keychain service', async () => {
        await setSecureItem(SECURE_KEYS.authToken, { token: 'a' });
        await setSecureItem(SECURE_KEYS.authUser, { id: 1 });

        expect(mockedKeychain.setGenericPassword).toHaveBeenCalledWith(
            'staffsaas',
            JSON.stringify({ token: 'a' }),
            expect.objectContaining({ service: secureServiceName(SECURE_KEYS.authToken) }),
        );
        expect(mockedKeychain.setGenericPassword).toHaveBeenCalledWith(
            'staffsaas',
            JSON.stringify({ id: 1 }),
            expect.objectContaining({ service: secureServiceName(SECURE_KEYS.authUser) }),
        );
    });

    it('hardens writes with this-device-only accessibility and Keystore-backed storage', async () => {
        await setSecureItem(SECURE_KEYS.authToken, { token: 'a' });

        const options = mockedKeychain.setGenericPassword.mock.calls[0][2];

        // iOS: excluded from backups and other devices.
        expect(options.accessible).toBe(Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY);
        // Android: key held in the Keystore, no per-read biometric gate (cold start).
        expect(options.storage).toBe(Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH);
        expect(options.securityLevel).toBe(Keychain.SECURITY_LEVEL.SECURE_SOFTWARE);
    });

    it('returns null when nothing is stored', async () => {
        await expect(getSecureItem(SECURE_KEYS.authToken)).resolves.toBeNull();
    });

    it('reports presence with hasSecureItem', async () => {
        await expect(hasSecureItem(SECURE_KEYS.authToken)).resolves.toBe(false);

        await setSecureItem(SECURE_KEYS.authToken, { token: 'a' });

        await expect(hasSecureItem(SECURE_KEYS.authToken)).resolves.toBe(true);
    });

    it('removes a stored item', async () => {
        await setSecureItem(SECURE_KEYS.authToken, { token: 'a' });

        await removeSecureItem(SECURE_KEYS.authToken);

        await expect(getSecureItem(SECURE_KEYS.authToken)).resolves.toBeNull();
    });

    it('clears every credential key on sign-out', async () => {
        await setSecureItem(SECURE_KEYS.authToken, { token: 'a' });
        await setSecureItem(SECURE_KEYS.authUser, { id: 1 });

        await clearSecureStorage();

        await expect(getSecureItem(SECURE_KEYS.authToken)).resolves.toBeNull();
        await expect(getSecureItem(SECURE_KEYS.authUser)).resolves.toBeNull();
    });

    it('drops a corrupt payload instead of wedging every launch', async () => {
        mockedKeychain.getGenericPassword.mockResolvedValueOnce({
            username: 'staffsaas',
            password: 'not-json{',
            service: secureServiceName(SECURE_KEYS.authToken),
            storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
        });

        await expect(getSecureItem(SECURE_KEYS.authToken)).resolves.toBeNull();

        // The undecryptable entry is reset so the next write starts clean.
        expect(mockedKeychain.resetGenericPassword).toHaveBeenCalledWith({
            service: secureServiceName(SECURE_KEYS.authToken),
        });
    });

    it('reports a failed write rather than throwing, so the caller can degrade', async () => {
        mockedKeychain.setGenericPassword.mockRejectedValueOnce(new Error('keystore unavailable'));

        await expect(setSecureItem(SECURE_KEYS.authToken, { token: 'a' })).resolves.toBe(false);
    });

    it('detects a functional encrypted store via a round-trip probe', async () => {
        await expect(isSecureStorageAvailable()).resolves.toBe(true);
    });

    it('reports the store unavailable when the platform rejects the probe write', async () => {
        mockedKeychain.setGenericPassword.mockResolvedValueOnce(false);

        await expect(isSecureStorageAvailable()).resolves.toBe(false);
    });
});
