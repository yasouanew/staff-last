import AsyncStorage from '@react-native-async-storage/async-storage';

import { APP_STORAGE_PREFIX, clearAppStorage, setItem } from '../storage';

/**
 * `clearAppStorage` is the sign-out wipe. If it silently no-ops, a shared device keeps
 * the previous user's cached data — so its behaviour is pinned, including the
 * multi-remove method name, which differs between AsyncStorage major versions
 * (`removeMany` in v3, `multiRemove` in v1/v2 and community ports).
 *
 * The real module runs against the in-memory AsyncStorage mock, and the version
 * difference is simulated by swapping the method on that mock.
 */

const mockedAsyncStorage = AsyncStorage as unknown as {
    removeMany?: (keys: string[]) => Promise<void>;
    multiRemove?: (keys: string[]) => Promise<void>;
    removeItem: jest.Mock;
};

const KEY_A = `${APP_STORAGE_PREFIX}preferences.v1`;
const KEY_B = `${APP_STORAGE_PREFIX}fcm.token.v1`;
const FOREIGN_KEY = '@thirdparty/navigation-state';

describe('clearAppStorage', () => {
    let originalRemoveMany: typeof mockedAsyncStorage.removeMany;
    let originalMultiRemove: typeof mockedAsyncStorage.multiRemove;

    beforeEach(async () => {
        await AsyncStorage.clear();
        jest.clearAllMocks();

        originalRemoveMany = mockedAsyncStorage.removeMany;
        originalMultiRemove = mockedAsyncStorage.multiRemove;
    });

    afterEach(() => {
        mockedAsyncStorage.removeMany = originalRemoveMany;
        mockedAsyncStorage.multiRemove = originalMultiRemove;
    });

    it('removes only namespaced app keys, leaving third-party state intact', async () => {
        await setItem(KEY_A, { pushEnabled: true });
        await setItem(KEY_B, 'fcm:abc');
        await AsyncStorage.setItem(FOREIGN_KEY, 'keep-me');

        await clearAppStorage();

        await expect(AsyncStorage.getItem(KEY_A)).resolves.toBeNull();
        await expect(AsyncStorage.getItem(KEY_B)).resolves.toBeNull();
        await expect(AsyncStorage.getItem(FOREIGN_KEY)).resolves.toBe('keep-me');
    });

    it('uses removeMany when the installed version exposes it (v3)', async () => {
        await setItem(KEY_A, { a: 1 });

        await clearAppStorage();

        // The v3 mock implements removeMany; assert it did the work.
        expect(mockedAsyncStorage.removeMany).toHaveBeenCalledWith([KEY_A]);
        await expect(AsyncStorage.getItem(KEY_A)).resolves.toBeNull();
    });

    it('falls back to multiRemove when removeMany is absent (v1/v2)', async () => {
        await setItem(KEY_A, { a: 1 });

        mockedAsyncStorage.removeMany = undefined;
        mockedAsyncStorage.multiRemove = jest.fn(async (keys: string[]) => {
            await Promise.all(keys.map(key => AsyncStorage.removeItem(key)));
        });

        await clearAppStorage();

        expect(mockedAsyncStorage.multiRemove).toHaveBeenCalledWith([KEY_A]);
        await expect(AsyncStorage.getItem(KEY_A)).resolves.toBeNull();
    });

    it('degrades to per-key removeItem when neither multi-remove method exists', async () => {
        await setItem(KEY_A, { a: 1 });
        await setItem(KEY_B, 'fcm:abc');

        mockedAsyncStorage.removeMany = undefined;
        mockedAsyncStorage.multiRemove = undefined;

        await clearAppStorage();

        expect(mockedAsyncStorage.removeItem).toHaveBeenCalledWith(KEY_A);
        expect(mockedAsyncStorage.removeItem).toHaveBeenCalledWith(KEY_B);
        await expect(AsyncStorage.getItem(KEY_A)).resolves.toBeNull();
        await expect(AsyncStorage.getItem(KEY_B)).resolves.toBeNull();
    });

    it('does nothing when there are no app keys', async () => {
        await AsyncStorage.setItem(FOREIGN_KEY, 'keep-me');

        await expect(clearAppStorage()).resolves.toBeUndefined();

        await expect(AsyncStorage.getItem(FOREIGN_KEY)).resolves.toBe('keep-me');
    });
});
