/**
 * In-memory `react-native-keychain` stand-in.
 *
 * The real package is a native module: under the React Native Jest preset it resolves
 * to a TurboModule that does not exist in a Node process, so importing it anywhere in
 * the app graph (which now happens via [`secureStorage`](src/utils/secureStorage.ts:1))
 * would throw before a test body ran.
 *
 * This is a real store rather than a set of stubs, for the same reason the AsyncStorage
 * mock is: the encrypted-persistence seam is exactly what the token-store tests need
 * to exercise, and stubbing the methods would leave the round trip untested. It keeps
 * one entry per service, mirroring the keychain's `kSecClassGenericPassword`
 * semantics, and reproduces the `false`-on-missing return shape the library uses.
 *
 * The enum members are reproduced because [`secureStorage`](src/utils/secureStorage.ts:1)
 * passes them as write options; a missing member would be `undefined` at runtime and
 * silently drop the hardening options under test.
 */

const store = new Map();

const Keychain = {
    ACCESSIBLE: {
        WHEN_UNLOCKED: 'AccessibleWhenUnlocked',
        AFTER_FIRST_UNLOCK: 'AccessibleAfterFirstUnlock',
        ALWAYS: 'AccessibleAlways',
        WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'AccessibleWhenPasscodeSetThisDeviceOnly',
        WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
        AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AccessibleAfterFirstUnlockThisDeviceOnly',
    },

    SECURITY_LEVEL: {
        SECURE_SOFTWARE: 1,
        SECURE_HARDWARE: 2,
        ANY: 3,
    },

    STORAGE_TYPE: {
        AES_CBC: 'KeystoreAESCBC',
        AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth',
        AES_GCM: 'KeystoreAESGCM',
        RSA: 'KeystoreRSAECB',
    },

    setGenericPassword: jest.fn(async (username, password, options = {}) => {
        const service = options.service ?? 'default';

        store.set(service, { username, password });

        return { service, storage: options.storage ?? Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH };
    }),

    getGenericPassword: jest.fn(async (options = {}) => {
        const service = options.service ?? 'default';
        const entry = store.get(service);

        if (entry === undefined) {
            return false;
        }

        return {
            service,
            username: entry.username,
            password: entry.password,
            storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
        };
    }),

    hasGenericPassword: jest.fn(async (options = {}) => store.has(options.service ?? 'default')),

    resetGenericPassword: jest.fn(async (options = {}) => {
        const service = options.service ?? 'default';
        const existed = store.has(service);

        store.delete(service);

        return existed;
    }),

    /** Test-only escape hatch for asserting on raw persisted payloads. */
    __reset: () => {
        store.clear();
    },

    /** Test-only accessor for asserting on a stored payload by service. */
    __get: service => store.get(service),
};

module.exports = Keychain;
module.exports.default = Keychain;
