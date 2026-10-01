import { Linking, Platform } from 'react-native';

import type { AppError } from '../../types/appError';
import type { PushPermissionStatus } from './pushStatusStore';

/**
 * Push status helpers — pure enough to unit-test, with the one native call
 * (`Linking.openSettings`) isolated here.
 */

/**
 * Maps a Firebase `AuthorizationStatus` value to our permission enum.
 *
 * Firebase returns `1` for both `AUTHORIZED` and `PROVISIONAL` (iOS "quiet"
 * notifications), and `-1` for `NOT_DETERMINED` (never asked). The mapping is by value
 * rather than by importing the enum so it is testable without the native module.
 */
export function mapAuthorizationStatus(status: number): PushPermissionStatus {
    if (status === 1 || status === 2) {
        return 'granted';
    }

    if (status === 0) {
        return 'denied';
    }

    if (status === -1) {
        return 'not-determined';
    }

    return 'unknown';
}

/** User-facing explanation for a permission state. `null` when nothing needs saying. */
export function describePermission(permission: PushPermissionStatus): string | null {
    switch (permission) {
        case 'denied':
            return Platform.OS === 'ios'
                ? 'Notifications are turned off for this app in iOS Settings. Turn them on to receive shift and roster updates.'
                : 'Notifications are turned off for this app in Android Settings. Turn them on to receive shift and roster updates.';
        case 'not-determined':
            return 'Notification permission has not been granted yet.';
        case 'unsupported':
            return 'This build of the app is not configured for push notifications.';
        default:
            return null;
    }
}

/**
 * Opens the OS settings screen for this app.
 *
 * This is the **only** remedy when permission is denied — the app cannot grant it, and a
 * button that pretends otherwise is worse than no button.
 */
export async function openSystemSettings(): Promise<void> {
    try {
        await Linking.openSettings();
    } catch {
        // Some platforms/emulators have no settings surface; nothing actionable.
    }
}

/**
 * True when a backend error means the token itself is invalid and must be replaced.
 *
 * A `404`/`410` means the server no longer knows the token (already removed, or the FCM
 * registration was invalidated); a `422` on the token field means the server rejected
 * it. In all three cases the correct response is to **delete the local FCM token** so a
 * fresh one is minted on the next registration attempt — retrying the same token would
 * loop forever.
 */
export function isInvalidTokenError(error: AppError): boolean {
    if (error.status === 404 || error.status === 410) {
        return true;
    }

    if (error.status === 422) {
        const fieldErrors = error.fieldErrors ?? {};

        return Object.keys(fieldErrors).some(field => field === 'token' || field === 'fcm_token');
    }

    return false;
}

/** True when the backend has explicitly told us the token is gone (idempotent removal). */
export function isTokenAlreadyRemoved(error: AppError): boolean {
    return error.status === 404 || error.status === 410;
}
