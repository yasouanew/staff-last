import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/**
 * Global navigation handle.
 *
 * Push notification taps arrive **outside** the React tree — from a Notifee
 * foreground event, an FCM `onNotificationOpenedApp` callback, or a cold-start
 * `getInitialNotification` — so there is no `navigation` prop to call. React
 * Navigation's documented remedy is a container ref, which is what this is.
 *
 * It lives in its own module (rather than in `RootNavigator`) so that the push
 * layer can import the ref without importing the navigator. That keeps the
 * dependency direction one-way: `pushService` → `navigationRef`, never
 * `pushService` → `RootNavigator`. Importing the navigator from the service would
 * pull the whole screen tree into the headless background bundle and invert the
 * layering the service is deliberately built to avoid.
 *
 * `isReady()` must be checked before navigating: a cold-start tap is captured
 * while the container is still mounting, and `navigate` on an unready ref throws.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** A resolved destination inside the authenticated tab hierarchy. */
export type AppRoute = {
    /** Tab route name, e.g. `HomeTab`. */
    tab: string;
    /** Screen within that tab's stack, e.g. `ShiftDetail`. */
    screen: string;
    /** Screen params, e.g. `{ shiftId: 42 }`. */
    params?: Record<string, unknown>;
};

/**
 * Navigates to a nested screen once the container is ready.
 *
 * Returns `false` when the container has not mounted yet, so the caller can defer
 * (the push service holds the tap and retries on session hydration) rather than
 * dropping it. The `navigate` call is cast because React Navigation's nested
 * navigation typing cannot express a dynamic `[tab, screen, params]` tuple; the
 * caller is responsible for passing a valid route (see
 * [`routeForNotification`](src/features/notifications/utils/notificationRouting.ts:1)).
 */
export function navigateWhenReady(route: AppRoute): boolean {
    if (!navigationRef.isReady()) {
        return false;
    }

    // `navigate` is typed against the root param list; a nested tab route is a
    // valid runtime target but not expressible in the static type, hence the cast.
    (navigationRef.navigate as (name: string, params?: unknown) => void)('App', {
        screen: route.tab,
        params: { screen: route.screen, params: route.params },
    });

    return true;
}
