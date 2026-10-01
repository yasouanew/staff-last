/**
 * In-memory `@react-native-async-storage/async-storage` stand-in.
 *
 * The real package resolves to its native implementation under the React Native Jest
 * preset, and that implementation throws `Native module is null, cannot access legacy
 * storage` because there is no TurboModule in a Node process. The official
 * `async-storage/jest/async-storage-mock` is not reachable from this project's module
 * resolution, so a minimal, dependency-free equivalent is provided here.
 *
 * It is deliberately a real store rather than a set of stubs: the persistence layer is
 * exactly what the offline inbox tests need to exercise, and stubbing the methods would
 * leave the round-trip untested.
 */

const store = new Map();

const AsyncStorage = {
    getItem: jest.fn(async key => (store.has(key) ? store.get(key) : null)),

    setItem: jest.fn(async (key, value) => {
        store.set(key, String(value));
    }),

    removeItem: jest.fn(async key => {
        store.delete(key);
    }),

    /**
     * `removeMany` is not part of the upstream API but is used by
     * [`clearAppStorage`](src/utils/storage.ts:72); it is implemented here so the
     * helper keeps working if a test ever drives a sign-out.
     */
    removeMany: jest.fn(async keys => {
        keys.forEach(key => store.delete(key));
    }),

    getAllKeys: jest.fn(async () => Array.from(store.keys())),

    clear: jest.fn(async () => {
        store.clear();
    }),

    multiGet: jest.fn(async keys => keys.map(key => [key, store.has(key) ? store.get(key) : null])),

    multiSet: jest.fn(async pairs => {
        pairs.forEach(([key, value]) => store.set(key, String(value)));
    }),

    multiRemove: jest.fn(async keys => {
        keys.forEach(key => store.delete(key));
    }),

    /** Test-only escape hatch for asserting on raw persisted payloads. */
    __reset: () => {
        store.clear();
    },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
