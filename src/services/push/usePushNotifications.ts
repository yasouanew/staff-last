import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { isAuthenticatedStatus, useSessionStore } from '../../features/auth/store/sessionStore';
import { usePreferencesStore } from '../../features/settings/store/preferencesStore';
import { useNotificationInboxStore } from '../../features/notifications/store';
import { queryKeys } from '../../utils/queryKeys';
import {
    initializePushService,
    registerDevice,
    unregisterDevice,
    type PushHandlers,
} from './pushService';

/**
 * Binds the push service to the app lifecycle.
 *
 * Mounted once, in the root component. It reacts to two things:
 *
 * 1. **Session status** — registering only makes sense while authenticated, and
 *    signing out must unregister so the next user of the device is not notified
 *    about the previous user's shifts.
 * 2. **The push preference** — toggling the Settings switch should take effect
 *    immediately rather than at next launch.
 *
 * Incoming messages do two things: they are written to the local inbox (in the
 * service, so it also works headless) and they invalidate the notification and shift
 * queries. Invalidation is the one piece of app knowledge the service layer is not
 * allowed to hold, so it lives here: a shift being published server-side is the main
 * reason this app receives push at all, and refetching is the correct, idempotent
 * response.
 */
export function usePushNotifications(): void {
    const queryClient = useQueryClient();
    const status = useSessionStore(state => state.status);
    const userId = useSessionStore(state => state.user?.id ?? null);
    const pushEnabled = usePreferencesStore(state => state.pushEnabled);
    const hydrateInbox = useNotificationInboxStore(state => state.hydrate);

    // Kept in a ref so the effect below does not need `queryClient` in its dependency
    // array — the query client instance is stable, but the handlers are recreated on
    // every render and re-subscribing would drop messages.
    const handlersRef = useRef<PushHandlers>({});

    handlersRef.current = {
        onForegroundMessage: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        },
        onNotificationOpened: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        },
    };

    useEffect(() => {
        let cleanup: (() => void) | undefined;

        const start = async () => {
            cleanup = await initializePushService(handlersRef.current);
        };

        void start();

        return () => {
            cleanup?.();
        };
    }, []);

    useEffect(() => {
        if (isAuthenticatedStatus(status) && pushEnabled) {
            void registerDevice();
            return;
        }

        if (status === 'unauthenticated') {
            void unregisterDevice();
        }
        // Opting out while signed in is handled by the Settings screen, which calls
        // `unregisterDevice` directly so it can read the stored token before the
        // preference flips. Re-registering on opt-in happens here.
        if (isAuthenticatedStatus(status) && !pushEnabled) {
            return;
        }
    }, [status, pushEnabled]);

    // Hydrate the persisted inbox as soon as a session exists — not from the
    // notifications screen. A notification tapped from the tray deep-links into the
    // app, and the row it refers to must already be in memory by then; waiting for a
    // screen mount would be too late and would also lose rows read purely offline.
    useEffect(() => {
        if (!isAuthenticatedStatus(status)) {
            return;
        }

        void hydrateInbox(userId);
    }, [hydrateInbox, status, userId]);
}
