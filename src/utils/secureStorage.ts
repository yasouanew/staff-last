import * as Keychain from 'react-native-keychain';

import { SECURE_KEYS } from '../config/storageKeys';
import { logger } from './logger';

/**
 * Encrypted credential storage.
 *
 * Authentication material (the Sanctum bearer token, and the cached user record that
 * contains PII) must **not** live in AsyncStorage: AsyncStorage is an unencrypted
 * key/value file that a rooted/jailbroken device, a device backup, or a debugging
 * bridge can read. This module is the single seam the app uses instead, backed by the
 * maintained [`react-native-keychain`](https://github.com/oblador/react-native-keychain)
 * library, which persists to:
 *
 * - **iOS** — the Keychain (`kSecClassGenericPassword`), encrypted at rest by the OS.
 * - **Android** — the Keystore-backed encrypted store (AES-GCM key held in the
 *   Keystore, separate from the ciphertext).
 *
 * ## Design rules
 *
 * 1. **Never throw.** A corrupt or unavailable store must degrade to "signed out" /
 *    "no cached user", never crash a launch. This mirrors
 *    [`utils/storage`](src/utils/storage.ts:1) so callers do not need two error
 *    disciplines. Writes report success as a boolean so the caller can fall back to a
 *    memory-only session rather than silently believing it persisted.
 * 2. **This-device-only.** iOS items use `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so they are
 *    excluded from iCloud Keychain and device backups — a bearer token must not be
 *    restorable onto a second device.
 * 3. **No user-auth prompt on read.** Android uses `AES_GCM_NO_AUTH` and iOS does not
 *    set an access-control policy, because the token is read on cold start and in
 *    headless push launches where a biometric prompt is impossible. The Keystore still
 *    holds the encryption key; only the per-read user-presence gate is omitted.
 *
 * ## Key format
 *
 * Each logical key maps to a distinct Keychain *service* so entries are independently
 * addressable and independently revocable. Services are derived from
 * [`SECURE_KEYS`](src/config/storageKeys.ts:1) with a reverse-DNS prefix, which is the
 * convention the Keychain expects for a stable identifier.
 */

/** Reverse-DNS prefix for every service this app owns. */
const SERVICE_PREFIX = 'com.staffsaas.secure';

/**
 * Keychain requires a username alongside the secret; it is a fixed label because the
 * real identity (the user id) is part of the serialized payload, not the account.
 */
const KEYCHAIN_ACCOUNT = 'staffsaas';

/**
 * Options applied to every write.
 *
 * - `accessible` (iOS) keeps the item off backups and off other devices.
 * - `securityLevel` (Android) requires the encryption key to live in the Keystore
 *   rather than in software-only storage, so extraction of the ciphertext alone is
 *   useless.
 * - `storage` (Android) selects authenticated AES-GCM without a biometric gate, so a
 *   background/cold-start read can succeed without user interaction.
 */
const HARDENED_WRITE_OPTIONS: Keychain.SetOptions = {
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    securityLevel: Keychain.SECURITY_LEVEL.SECURE_SOFTWARE,
    storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
};

/** Maps a logical key to its Keychain service name. Exported for tests. */
export function secureServiceName(key: string): string {
    return `${SERVICE_PREFIX}.${key}`;
}

/**
 * Persists `value` under `key`, serialized as JSON.
 *
 * @returns `true` when the secret was written, `false` when the platform store was
 *   unavailable or rejected the write. Callers that hold an in-memory copy (the token
 *   store) treat `false` as "not durable", not as "signed out".
 */
export async function setSecureItem(key: string, value: unknown): Promise<boolean> {
    try {
        const payload = JSON.stringify(value);

        const result = await Keychain.setGenericPassword(KEYCHAIN_ACCOUNT, payload, {
            service: secureServiceName(key),
            ...HARDENED_WRITE_OPTIONS,
        });

        return result !== false;
    } catch (error) {
        logger.warn('[secureStorage] Failed to write secure item', key, error);

        return false;
    }
}

/**
 * Reads and parses the value under `key`.
 *
 * Returns `null` when the item is absent, was written by an older build with an
 * incompatible shape, or when the store is unreadable. A parse failure drops the
 * corrupt item so the next write starts clean.
 */
export async function getSecureItem<T>(key: string): Promise<T | null> {
    try {
        const credentials = await Keychain.getGenericPassword({
            service: secureServiceName(key),
        });

        if (credentials === false) {
            return null;
        }

        return JSON.parse(credentials.password) as T;
    } catch (error) {
        logger.warn('[secureStorage] Failed to read secure item', key, error);

        // Corrupt or undecryptable payload — drop it so it cannot wedge every launch.
        await removeSecureItem(key);

        return null;
    }
}

/** Deletes the item under `key`. Safe to call when nothing is stored. */
export async function removeSecureItem(key: string): Promise<void> {
    try {
        await Keychain.resetGenericPassword({ service: secureServiceName(key) });
    } catch (error) {
        logger.warn('[secureStorage] Failed to remove secure item', key, error);
    }
}

/** True when a readable item exists for `key`. */
export async function hasSecureItem(key: string): Promise<boolean> {
    try {
        return await Keychain.hasGenericPassword({ service: secureServiceName(key) });
    } catch {
        return false;
    }
}

/**
 * Removes every credential this app owns.
 *
 * Called on sign-out / `logout-all`. Iterating the known [`SECURE_KEYS`](src/config/storageKeys.ts:1)
 * (rather than `getAllGenericPasswordServices`) keeps the wipe deterministic and avoids
 * touching entries other libraries may have created under the same account.
 */
export async function clearSecureStorage(): Promise<void> {
    await Promise.all(Object.values(SECURE_KEYS).map(key => removeSecureItem(key)));
}

/**
 * Probes whether encrypted persistence is actually functional on this device.
 *
 * A platform with no usable Keychain/Keystore (rare, but possible on a broken or
 * emulated build) would otherwise fail silently on every write. The probe is a
 * set/read/remove round trip so it verifies the real code path, not merely that the
 * native module is linked.
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
    const probeKey = `${SERVICE_PREFIX}.__probe`;

    try {
        const written = await Keychain.setGenericPassword(KEYCHAIN_ACCOUNT, 'ok', {
            service: probeKey,
        });

        if (written === false) {
            return false;
        }

        const read = await Keychain.getGenericPassword({ service: probeKey });

        return read !== false && read.password === 'ok';
    } catch {
        return false;
    } finally {
        try {
            await Keychain.resetGenericPassword({ service: probeKey });
        } catch {
            // Nothing actionable — a leftover probe entry is harmless.
        }
    }
}
