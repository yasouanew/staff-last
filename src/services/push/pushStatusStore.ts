import { create } from 'zustand';

/**
 * Push notification status.
 *
 * Push failures are deliberately non-fatal — a broken push pipeline must never block
 * login. The cost of that tolerance is that the user has no idea notifications are not
 * working. This store makes the two independent facts visible so Settings can explain
 * what is wrong and offer the right fix:
 *
 * 1. **OS permission** — controlled by the device, not the app. If denied, no amount of
 *    in-app toggling helps; the only remedy is the system settings screen.
 * 2. **Backend registration** — whether this device's token is known to the server. This
 *    can fail on its own (offline, 5xx) even when permission is granted.
 *
 * They are separate because they fail separately and have different remedies.
 */

/**
 * OS-level notification permission.
 *
 * `unsupported` means push is not configured in this build (`FCM_ENABLED=false` or no
 * Firebase config), so the question is moot rather than denied.
 */
export type PushPermissionStatus = 'unknown' | 'granted' | 'denied' | 'not-determined' | 'unsupported';

/**
 * Backend registration state for this device's token.
 *
 * - `registered` — the server has the token; push should arrive.
 * - `pending` — the registration is queued for retry (offline); it will be sent later.
 * - `failed` — a non-retryable error; the user may need to act.
 * - `unregistered` — intentionally not registered (opted out, signed out, or denied).
 */
export type PushRegistrationStatus = 'unknown' | 'registered' | 'pending' | 'failed' | 'unregistered';

type PushStatusState = {
    permission: PushPermissionStatus;
    registration: PushRegistrationStatus;
    /** User-facing reason when registration is `failed`, or permission is `denied`. */
    message: string | null;
    /** ISO timestamp of the last status refresh. */
    lastCheckedAt: string | null;

    setPermission: (permission: PushPermissionStatus, message?: string | null) => void;
    setRegistration: (registration: PushRegistrationStatus, message?: string | null) => void;
    /** Resets to the cold-start state (sign-out). */
    reset: () => void;
};

export const usePushStatusStore = create<PushStatusState>((set) => ({
    permission: 'unknown',
    registration: 'unknown',
    message: null,
    lastCheckedAt: null,

    setPermission: (permission, message = null) =>
        set({ permission, message, lastCheckedAt: new Date().toISOString() }),

    setRegistration: (registration, message = null) =>
        set({ registration, message, lastCheckedAt: new Date().toISOString() }),

    reset: () => set({ permission: 'unknown', registration: 'unknown', message: null, lastCheckedAt: null }),
}));

/** True when the user can expect notifications to arrive right now. */
export function isPushHealthy(state: Pick<PushStatusState, 'permission' | 'registration'>): boolean {
    return state.permission === 'granted' && state.registration === 'registered';
}
