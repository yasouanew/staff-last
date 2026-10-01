import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSessionValidity } from '../../features/auth/hooks/useSessionValidity';
import { useTheme } from '../../theme';
import { AlertTriangleGlyph, AppIcon } from '../AppIcon';
import { AppText } from '../AppText';

/**
 * Offline session banner.
 *
 * Shown across the app shell whenever the session is authenticated but **not**
 * server-validated (`authenticated-validating` or `authenticated-offline`). It makes
 * the offline mode explicit: without it, a user looking at a cached roster cannot
 * tell a synchronised session from a stale one, and would reasonably expect a
 * submitted leave request to have been saved.
 *
 * The banner is informational, not an error: it carries no retry button, because
 * revalidation is owned by [`useSession`](src/features/auth/hooks/useSession.ts:1) and
 * happens automatically on focus and reconnect. It states the consequence — changes
 * are blocked until reconnection — rather than a bare "no connection".
 *
 * Renders `null` when the session is validated or unauthenticated, so it can be
 * mounted unconditionally at the root.
 */
export function SessionOfflineBanner(): React.JSX.Element | null {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { isOffline } = useSessionValidity();

    if (!isOffline) {
        return null;
    }

    return (
        <View
            testID="session-offline-banner"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[
                styles.root,
                {
                    paddingTop: insets.top + theme.spacing.xs,
                    paddingHorizontal: theme.screenGutter,
                    paddingBottom: theme.spacing.xs,
                    backgroundColor: theme.colors.warningSoft,
                    borderBottomColor: theme.colors.warning,
                },
            ]}>
            <AppIcon icon={AlertTriangleGlyph} size="small" color="warningStrong" />

            <AppText variant="label" style={[styles.label, { color: theme.colors.warningStrong }]}>
                Offline — showing saved data. Reconnect to make changes.
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    label: {
        // The text wraps; the icon never squashes.
        flexShrink: 1,
    },
    root: {
        // Overlays the app shell rather than displacing it, so the navigator tree and
        // its measured layout are unaffected by the banner appearing.
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderBottomWidth: 1,
    },
});
