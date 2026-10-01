import { StyleSheet, View } from 'react-native';

import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import type { AppError } from '../../types/appError';
import { getErrorTitle } from '../../types/appError';
import { isRetryable } from '../../utils/errors';
import { AppButton } from '../AppButton/AppButton';
import { AppText } from '../AppText/AppText';

/**
 * Failure state for a screen or section.
 *
 * Renders the message the API supplied verbatim — the backend's copy for 401/403/422
 * is more accurate than anything the client could invent (e.g. "Your account is
 * inactive. Please contact your administrator."). The title comes from the error
 * kind so the user can tell a network failure from a permission problem at a glance.
 *
 * The retry affordance is only offered for failures that a retry could fix
 * (see [`isRetryable`](src/utils/errors.ts:1)); validation and authorization errors
 * are shown without a misleading button.
 */
export type ErrorViewProps = {
    error: AppError;
    onRetry?: () => void;
    /** Renders inline within a card/section rather than filling the screen. */
    compact?: boolean;
};

export function ErrorView({ error, onRetry, compact = false }: ErrorViewProps) {
    const theme = useTheme();
    const showRetry = onRetry !== undefined && isRetryable(error);

    return (
        <View
            accessibilityRole="alert"
            style={[
                styles.container,
                compact ? styles.compact : styles.fullScreen,
                {
                    padding: compact ? spacing.md : spacing.xl,
                    gap: spacing.xs,
                    borderRadius: compact ? theme.radius.md : 0,
                    backgroundColor: compact ? theme.colors.dangerSoft : 'transparent',
                },
            ]}>
            <AppText variant={compact ? 'bodyStrong' : 'subtitle'} color={compact ? 'dangerStrong' : 'text'} align={compact ? 'left' : 'center'}>
                {getErrorTitle(error)}
            </AppText>

            <AppText variant="caption" align={compact ? 'left' : 'center'}>
                {error.message}
            </AppText>

            {showRetry ? (
                <View style={styles.action}>
                    <AppButton label="Try again" variant="secondary" size="sm" fullWidth={false} onPress={onRetry} />
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullScreen: {
        flex: 1,
        alignItems: 'center',
    },
    compact: {
        alignItems: 'flex-start',
    },
    action: {
        marginTop: spacing.xs,
    },
});
