import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { AppText } from '../AppText/AppText';

/**
 * Initial-load indicator.
 *
 * Used only for a screen's **first** load, when there is nothing to show yet. Once
 * data exists, a refresh must use the list's pull-to-refresh control or a button's
 * `loading` state so the user never loses sight of content they already have.
 */
export type LoadingViewProps = {
    /** Shown under the spinner. Keep it factual ("Loading your shifts..."). */
    message?: string;
    /** Fills the parent. Set false to embed inside a section. */
    fullScreen?: boolean;
};

export function LoadingView({ message, fullScreen = true }: LoadingViewProps) {
    const theme = useTheme();

    return (
        <View
            accessibilityRole="progressbar"
            accessibilityLabel={message ?? 'Loading'}
            style={[styles.container, fullScreen ? styles.fullScreen : null, { padding: spacing.xl }]}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            {message !== undefined ? (
                <AppText variant="caption" align="center">
                    {message}
                </AppText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
    },
    fullScreen: {
        flex: 1,
    },
});
