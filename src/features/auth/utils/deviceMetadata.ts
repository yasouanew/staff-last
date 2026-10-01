import { Platform } from 'react-native';

import { env } from '../../../config/env';
import type { DevicePlatform } from '../../../types/api';

/**
 * Device metadata sent on `POST /auth/login`.
 *
 * The backend's `ApiLoginRequest` accepts `device_name`, `platform`, `app_version`
 * and `os_version` (spec Screen 1 API 1), and the values land on the Sanctum token
 * row so an administrator can tell which device a session belongs to. Without them
 * every session is an anonymous token, which is what previously made "sign out this
 * device" impossible to reason about from the admin side.
 *
 * Everything here is **best-effort and non-blocking**: a missing value is worse than
 * a wrong one, so fields that cannot be determined are omitted rather than guessed.
 * `device_name` in particular is only a label — the server falls back to
 * `User-Agent` when it is absent (spec Screen 1 API 1).
 *
 * `Platform.Version` is used for `os_version` rather than a native device-info
 * library, because it is already available with no extra dependency: on Android it
 * is the API level, on iOS the OS version string.
 */

/**
 * Maps `Platform.OS` onto the backend's `platform` enum
 * (`web,ios,android` per `ApiLoginRequest`).
 *
 * `macos`/`windows` are real values on the RN type but are not in the backend enum,
 * so they are reported as `web` — the closest honest classification for a desktop
 * React Native surface, and never a value the server will reject.
 */
export function resolvePlatform(): DevicePlatform {
    if (Platform.OS === 'ios') {
        return 'ios';
    }

    if (Platform.OS === 'android') {
        return 'android';
    }

    return 'web';
}

/** `Platform.Version` normalised to a string; `undefined` when unavailable. */
export function resolveOsVersion(): string | undefined {
    const version = Platform.Version;

    if (typeof version === 'number' && Number.isFinite(version)) {
        return String(version);
    }

    if (typeof version === 'string' && version.trim().length > 0) {
        return version.trim();
    }

    return undefined;
}

/**
 * Human-readable device label, e.g. `Staff App (android 14)`.
 *
 * Deliberately not a marketing device name (`Pixel 8`): obtaining that requires a
 * native device-info dependency the app does not ship, and a label that is *wrong*
 * on a shared device is worse than one that is merely generic. Platform + OS version
 * plus the app version is enough for an admin to identify a session.
 */
export function buildDeviceName(): string {
    const platform = resolvePlatform();
    const osVersion = resolveOsVersion();

    return osVersion === undefined ? `Staff App (${platform})` : `Staff App (${platform} ${osVersion})`;
}

/** The subset of `LoginPayload` describing the device. */
export type LoginDeviceMetadata = {
    device_name: string;
    platform: DevicePlatform;
    app_version?: string;
    os_version?: string;
};

/**
 * Builds the device metadata block for a login request.
 *
 * `app_version` comes from `APP_VERSION` in the build-time env; it is omitted when
 * unset so the server stores nothing rather than a placeholder like `"0.0.0"`.
 */
export function buildLoginDeviceMetadata(): LoginDeviceMetadata {
    const osVersion = resolveOsVersion();
    const appVersion = env.appVersion;

    return {
        device_name: buildDeviceName(),
        platform: resolvePlatform(),
        ...(appVersion === undefined ? {} : { app_version: appVersion }),
        ...(osVersion === undefined ? {} : { os_version: osVersion }),
    };
}
