import { StyleSheet, View } from 'react-native';

import { spacing, useTheme } from '../../theme';
import type { AppError } from '../../types/appError';
import { AppButton } from '../AppButton';
import { AppText } from '../AppText';
import { ScreenContainer } from '../ScreenContainer';

export type SessionErrorViewProps = {
    /** The failure that prevented the session from being established. */
    error: AppError | null;
    /** Re-runs session restoration. */
    onRetry: () => void;
    /** Signs the user out — always available as an escape hatch. */
    onSignOut: () => void;
    /** True while the retry or sign-out is in flight. */
    busy?: boolean;
};

/**
 * Terminal session-establishment failure.
 *
 * Reached when a token exists but the session could neither be restored from cache
 * nor validated with `GET /auth/me` — for example a fresh install whose first launch
 * is offline. The previous behaviour rendered the authenticated shell with a `null`
 * user, which produced screens that silently showed nothing; this replaces that dead
 * end with an explanation and two concrete actions.
 *
 * It is deliberately **not** a sign-out: the token may well be valid, and forcing a
 * re-login over a transient network blip would be hostile. Retry is primary; signing
 * out is available for a user who wants to switch accounts.
 */
export function SessionErrorView({
    error,
    onRetry,
    onSignOut,
    busy = false,
}: SessionErrorViewProps): React.JSX.Element {
    const theme = useTheme();

    const isConnectivity = error === null || error.kind === 'network' || error.kind === 'timeout';

    return (
        <ScreenContainer scrollable contentContainerStyle={styles.content}>
            <View style={[styles.block, { gap: theme.spacing.md }]}>
                <AppText variant="title">Can't reach your account</AppText>

                <AppText variant="body" color="textSecondary">
                    {isConnectivity
                        ? 'You appear to be offline. Connect to the internet and try again — your session has not been lost.'
                        : (error?.message ?? 'We could not load your account right now.')}
                </AppText>

                <AppText variant="caption" color="textMuted">
                    If this keeps happening, sign out and sign in again.
                </AppText>
            </View>

            <View style={[styles.actions, { gap: theme.spacing.sm }]}>
                <AppButton label="Try again" variant="primary" size="lg" fullWidth loading={busy} onPress={onRetry} />
                <AppButton label="Sign out" variant="secondary" size="lg" fullWidth onPress={onSignOut} />
            </View>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        gap: spacing.xl,
    },
    block: {
        alignItems: 'center',
    },
    actions: {
        width: '100%',
    },
});
