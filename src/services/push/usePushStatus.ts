import { AppState } from 'react-native';
import { useEffect, useRef } from 'react';

import { isSessionValidated, useSessionStore } from '../../features/auth/store/sessionStore';
import { usePreferencesStore } from '../../features/settings/store/preferencesStore';
import { refreshPermissionStatus, registerDevice } from './pushService';
import { isPushHealthy, usePushStatusStore, type PushPermissionStatus, type PushRegistrationStatus } from './pushStatusStore';

export type PushStatus = {
    permission: PushPermissionStatus;
    registration: PushRegistrationStatus;
    /** User-facing reason when something needs the user's attention; `null` otherwise. */
    message: string | null;
    /** True when notifications can be expected to arrive right now. */
    isHealthy: boolean;
    /** True when the OS has denied permission — the only fix is system settings. */
    isPermissionDenied: boolean;
    /** Re-checks permission and retries registration. Safe to call from a button. */
    retry: () => Promise<void>;
};

/**
 * Reads push status and keeps it fresh.
 *
 * Mounted once, at the root. It:
 *
 * 1. **Refreshes OS permission** on mount and whenever the app returns to the
 *    foreground. Permission can be revoked in the OS at any time, so a value read once
 *    at launch goes stale.
 * 2. **Retries registration** on foreground when the session is validated. This is the
 *    "retry on app foreground and connectivity restore" requirement: returning to the
 *    app is the most common moment connectivity has come back, and it is cheap because
 *    `registerDevice` short-circuits when there is nothing to do.
 *
 * The store itself is the source of truth for the UI, so this hook has no state of its
 * own beyond the AppState subscription.
 */
export function usePushStatus(): PushStatus {
    const permission = usePushStatusStore(state => state.permission);
    const registration = usePushStatusStore(state => state.registration);
    const message = usePushStatusStore(state => state.message);

    const status = useSessionStore(state => state.status);
    const pushEnabled = usePreferencesStore(state => state.pushEnabled);

    // Guards the foreground handler against overlapping retries.
    const retrying = useRef(false);

    const retry = async (): Promise<void> => {
        if (retrying.current) {
            return;
        }

        retrying.current = true;

        try {
            await refreshPermissionStatus();

            // Registration requires a validated session and the app-level opt-in.
            if (isSessionValidated(useSessionStore.getState().status) && usePreferencesStore.getState().pushEnabled) {
                await registerDevice();
            }
        } finally {
            retrying.current = false;
        }
    };

    useEffect(() => {
        void refreshPermissionStatus();
    }, []);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextState => {
            if (nextState === 'active') {
                void retry();
            }
        });

        return () => {
            subscription.remove();
        };
        // Intentionally no dependency array: the handler reads the latest state through
        // the stores at call time, so re-subscribing on every state change would only
        // churn the listener.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // A validated session with push enabled is the trigger to (re)register; this covers
    // the transition that does not involve a foreground event (e.g. login).
    useEffect(() => {
        if (status === 'authenticated-online' && pushEnabled) {
            void retry();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, pushEnabled]);

    return {
        permission,
        registration,
        message,
        isHealthy: isPushHealthy({ permission, registration }),
        isPermissionDenied: permission === 'denied',
        retry,
    };
}
