/**
 * Application root.
 *
 * Deliberately thin: it composes the three providers the app needs and mounts the
 * root navigator. Anything with behaviour of its own (auth gating, theme derivation,
 * session restore) lives in [`RootNavigator`](src/navigation/RootNavigator.tsx:1) or
 * the feature that owns it, so this file stays readable at a glance.
 *
 * Provider order matters:
 * 1. `GestureHandlerRootView` — outermost. The design system now ships gesture-driven
 *    surfaces (swipe-to-dismiss bottom sheets) built on react-native-gesture-handler,
 *    which only functions when a root view is present.
 * 2. `SafeAreaProvider` — everything below reads insets, including the navigator's
 *    tab bar and every `ScreenContainer`.
 * 3. `QueryClientProvider` — server-state cache. Created once via module-level
 *    `useState` initialiser rather than inline, so a re-render can never discard the
 *    cache (the classic `new QueryClient()`-in-render bug).
 * 4. `NavigationContainer` — mounted *inside* `RootNavigator`, because the navigator
 *    needs the query client and session store in scope before it renders.
 *
 * @format
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClientConfig } from './src/config/queryConfig';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useTheme } from './src/theme';
import { useOutboxSync } from './src/services/outbox/useOutboxSync';
import { usePushNotifications, usePushStatus } from './src/services/push';

/**
 * Bridges push notifications into the query cache.
 *
 * Rendered as a component rather than called as a hook in `App` so it sits *inside*
 * `QueryClientProvider` — `usePushNotifications` invalidates notification queries, and
 * a hook called above the provider would throw.
 */
function PushNotificationsBridge(): null {
  usePushNotifications();
  // Reads OS permission and retries registration on foreground, so a device that was
  // offline at login recovers without the user visiting Settings.
  usePushStatus();

  return null;
}

/**
 * Drives the durable outbox: hydrates the persisted queue and flushes it whenever the
 * session becomes server-validated.
 *
 * Like the push bridge, it must sit *inside* `QueryClientProvider` because a successful
 * flush invalidates the availability/notification queries.
 */
function OutboxBridge(): null {
  useOutboxSync();

  return null;
}

/**
 * Status bar, bound to the *resolved* app theme rather than a hardcoded style.
 *
 * The theme has a full dark variant ([`darkColors`](src/theme/colors.ts:358)) and
 * [`useTheme`](src/theme/useTheme.ts:36) resolves it from the OS scheme or the user's
 * explicit preference. On Android 0.87 the bar is edge-to-edge and transparent, so a
 * pinned `dark-content` bar in dark mode paints dark glyphs on a dark canvas —
 * invisible. Deriving `barStyle` from `theme.isDark` keeps the glyphs legible in both
 * schemes, and because the preference store the hook subscribes to is reactive,
 * flipping Dark Mode updates the bar without a remount.
 *
 * `backgroundColor` is deliberately still unset: edge-to-edge draws the app's own
 * background behind the transparent bar.
 */
function ThemedStatusBar(): React.JSX.Element {
  const theme = useTheme();

  return <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />;
}

function App(): React.JSX.Element {
  const [queryClient] = useState(() => new QueryClient(queryClientConfig));

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemedStatusBar />

        <QueryClientProvider client={queryClient}>
          <PushNotificationsBridge />
          <OutboxBridge />
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;
