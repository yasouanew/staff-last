import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin typed wrapper over AsyncStorage.
 *
 * AsyncStorage is used (rather than an MMKV/SQLite store) because it is the
 * platform-supported key/value store that ships with the React Native ecosystem and
 * the payloads here are tiny: a Sanctum token, a cached user object, and UI
 * preferences. All three must survive app restarts but are not hot-path reads, so
 * the async API costs nothing and avoids an extra native dependency.
 *
 * Failures are swallowed and reported as `null`/no-ops: a corrupt or unavailable
 * store must degrade to "signed out" or "default settings", never crash a launch.
 */

export async function getItem<T>(key: string): Promise<T | null> {
    try {
        const raw = await AsyncStorage.getItem(key);

        if (raw === null) {
            return null;
        }

        return JSON.parse(raw) as T;
    } catch {
        // Corrupt payload — drop it so the next write starts from a clean slate.
        void removeItem(key);

        return null;
    }
}

export async function setItem<T>(key: string, value: T): Promise<void> {
    try {
        await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage full or unavailable: the in-memory session stays authoritative.
    }
}

export async function removeItem(key: string): Promise<void> {
    try {
        await AsyncStorage.removeItem(key);
    } catch {
        // Nothing actionable — the key is either gone or will be overwritten.
    }
}

export async function getString(key: string): Promise<string | null> {
    try {
        return await AsyncStorage.getItem(key);
    } catch {
        return null;
    }
}

export async function setString(key: string, value: string): Promise<void> {
    try {
        await AsyncStorage.setItem(key, value);
    } catch {
        // See `setItem`.
    }
}

/** Namespace every key this app owns. Used to scope the sign-out wipe. */
export const APP_STORAGE_PREFIX = '@staffsaas/';

/**
 * Removes every namespaced key owned by the app.
 *
 * Used on sign-out and on `logout-all`. Only keys prefixed with
 * [`APP_STORAGE_PREFIX`](src/utils/storage.ts:1) are cleared so any third-party
 * library state (Firebase, navigation persistence) is left untouched.
 *
 * ## Why the multi-remove is feature-detected
 *
 * The multi-remove method name is **not stable across AsyncStorage versions**:
 *
 * - `@react-native-async-storage/async-storage` v3 (this project) exposes
 *   `removeMany` and has **no** `multiRemove` in its public interface.
 * - v1/v2 and several community ports expose `multiRemove` instead.
 *
 * Hard-coding either name risks a `TypeError` at exactly the wrong moment — during
 * sign-out — which would leave the previous user's cached data on a shared device.
 * The widest available primitive is used, degrading to per-key `removeItem`, so the
 * wipe cannot silently fail on any version.
 */
export async function clearAppStorage(): Promise<void> {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const appKeys = keys.filter(key => key.startsWith(APP_STORAGE_PREFIX));

        if (appKeys.length === 0) {
            return;
        }

        // The public types only declare the v3 method, so the legacy name is reached
        // through a structural probe rather than a cast to `any`.
        const storage = AsyncStorage as unknown as {
            removeMany?: (keys: string[]) => Promise<void>;
            multiRemove?: (keys: string[]) => Promise<void>;
        };

        if (typeof storage.removeMany === 'function') {
            await storage.removeMany(appKeys);

            return;
        }

        if (typeof storage.multiRemove === 'function') {
            await storage.multiRemove(appKeys);

            return;
        }

        // Last resort: `removeItem` exists on every version of the API.
        await Promise.all(appKeys.map(key => AsyncStorage.removeItem(key)));
    } catch {
        // See `removeItem`.
    }
}
