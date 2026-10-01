import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import type { Theme as NavigationTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppBootGate } from '../components/AppBootGate';
import { CompanyLockedView } from '../components/CompanyLockedView';
import { SessionErrorView } from '../components/SessionErrorView';
import { SessionOfflineBanner } from '../components/SessionOfflineBanner';
import { OutboxStatusBanner } from '../services/outbox/OutboxStatusBanner';
import { env } from '../config/env';
import { useSignOut } from '../features/auth/hooks/useSignOut';
import { useCompanyAccess } from '../features/auth/hooks/usePermissions';
import { isAuthenticatedStatus, useSessionStore } from '../features/auth/store/sessionStore';
import { usePreferencesStore } from '../features/settings/store/preferencesStore';
import { useTheme } from '../theme';
import { AppTabs } from './stacks/AppTabs';
import { AuthStack } from './stacks/AuthStack';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Deep links.
 *
 * Only the password reset flow is linked, because it is the one path the app cannot
 * initiate itself — the user arrives from an email. `env.deepLinkScheme` is
 * configurable so staging and production builds (which use distinct schemes) do not
 * fight over the same link.
 *
 * The reset link is expected as `staffapp://reset-password?token=…&email=…`.
 */
const linking: LinkingOptions<RootStackParamList> = {
    prefixes: [`${env.deepLinkScheme}://`, env.appPublicUrl],
    config: {
        screens: {
            Auth: {
                screens: {
                    ResetPassword: 'reset-password',
                },
            },
        },
    },
};

/**
 * Root navigator.
 *
 * The single place that decides whether the user sees the auth flow or the app, based
 * on [`useSessionStore`](src/features/auth/store/sessionStore.ts:1). Screens never
 * navigate to Login on their own; they clear the session and this switch reacts. That
 * keeps route protection in one place and makes the "authenticated" condition
 * impossible to forget in a screen.
 *
 * `status === 'unknown'` used to short-circuit to a bare spinner. It no longer does:
 * the whole tree is now wrapped in [`AppBootGate`](src/components/AppBootGate/AppBootGate.tsx:1),
 * which paints the branded app-level splash **over** the hierarchy and cross-fades it
 * out once [`useAppReadiness`](src/features/app/hooks/useAppReadiness.ts:1) reports the
 * session, the initial roster fetch and the first layout pass have all settled. That
 * removes the bare-spinner frame entirely and, because the tree mounts underneath the
 * splash, also removes the flash of Login that a conditional render would cause.
 *
 * Deciding the splash at this level — rather than per-screen — is what makes it
 * genuinely global: it is the one node every launch passes through, before the
 * auth/app branches diverge.
 */
export function RootNavigator(): React.JSX.Element {
    const theme = useTheme();
    const status = useSessionStore(state => state.status);
    const restoreSession = useSessionStore(state => state.restoreSession);
    const restoreError = useSessionStore(state => state.restoreError);
    const hydratePreferences = usePreferencesStore(state => state.hydrate);
    const { isLocked, reason } = useCompanyAccess();
    const signOut = useSignOut();

    const isAuthenticated = isAuthenticatedStatus(status);

    useEffect(() => {
        // Fire-and-forget: the store flips `status` when it finishes, which is what
        // drives the render below.
        void restoreSession();
        void hydratePreferences();
    }, [restoreSession, hydratePreferences]);

    /**
     * Locked company (`company.access` → 403).
     *
     * Checked here, above the navigator, rather than inside each screen: every tab is
     * company-scoped, so a locked account would render a shell where each screen
     * independently fails with the same 403. One gate replaces N error states and
     * cannot be forgotten when a new screen is added.
     *
     * Only applies while authenticated — the session store clears `user` on sign-out,
     * so `isLocked` cannot strand a signed-out user on this screen.
     */
    if (isAuthenticated && isLocked) {
        return (
            <AppBootGate
                // No asset pipeline dependency for the mark: the default
                // `logoGlyph` is the same brand shield the Login hero renders, so
                // the splash and the first authenticated paint cannot disagree
                // about the brand.
                splash={{ accessibilityLabel: 'Starting Staff Scheduler' }}>
                <CompanyLockedView
                    reason={reason}
                    onSignOut={() => signOut.mutate(undefined)}
                    signingOut={signOut.isPending}
                />
            </AppBootGate>
        );
    }

    // React Navigation's own theme drives system chrome (the container background and
    // the default header/font colours). It is derived from the app theme so the two
    // cannot drift; `fonts` is required by the type and has no equivalent in our
    // typography scale, so it is a no-op object.
    const navigationTheme: NavigationTheme = {
        // Drives React Navigation's own chrome defaults. Bound to the active
        // scheme (rather than hardcoded `false`) so the container background and
        // default header tint change with the app theme instead of drifting.
        dark: theme.isDark,
        colors: {
            primary: theme.colors.primary,
            background: theme.colors.background,
            card: theme.colors.surface,
            text: theme.colors.text,
            border: theme.colors.border,
            notification: theme.colors.danger,
        },
        fonts: {
            regular: { fontFamily: 'System', fontWeight: '400' },
            medium: { fontFamily: 'System', fontWeight: '500' },
            bold: { fontFamily: 'System', fontWeight: '700' },
            heavy: { fontFamily: 'System', fontWeight: '800' },
        },
    };

    return (
        <AppBootGate splash={{ accessibilityLabel: 'Starting Staff Scheduler' }}>
            <View style={styles.root}>
                {/**
                 * A token exists but the session could neither be restored from cache
                 * nor validated. This is its own state, not "authenticated with no
                 * user" — the previous behaviour rendered the shell against a `null`
                 * user and left every screen silently empty.
                 */}
                {status === 'session-error' ? (
                    <SessionErrorView
                        error={restoreError}
                        onRetry={() => void restoreSession()}
                        onSignOut={() => signOut.mutate(undefined)}
                        busy={signOut.isPending}
                    />
                ) : (
                    <NavigationContainer linking={linking} theme={navigationTheme}>
                        <Stack.Navigator screenOptions={{ headerShown: false }}>
                            {isAuthenticated ? (
                                <Stack.Screen name="App" component={AppTabs} />
                            ) : (
                                <Stack.Screen name="Auth" component={AuthStack} />
                            )}
                        </Stack.Navigator>
                    </NavigationContainer>
                )}

                {/**
                 * Deferred-write visibility. Rendered as a strip directly under the
                 * session banner so a queued or failed write is never silently implied
                 * to have succeeded. Self-hides when the outbox is empty.
                 */}
                <View style={styles.outboxStrip} pointerEvents="box-none">
                    <OutboxStatusBanner />
                </View>

                {/**
                 * Explicit offline indicator. Rendered above the navigator (absolute)
                 * so a stale, unvalidated session is never indistinguishable from a
                 * fully synchronised one. Self-hides when validated or signed out.
                 */}
                <SessionOfflineBanner />
            </View>
        </AppBootGate>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    outboxStrip: {
        // Sits below the session banner's absolute overlay; the banner itself owns
        // the top safe-area inset, so this strip only needs to clear it when present.
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9,
    },
});
