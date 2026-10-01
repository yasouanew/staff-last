import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../../theme';

/**
 * Loading skeleton for the Home dashboard (spec Screen 4 §4).
 *
 * Rendered on first load instead of a spinner so the layout does not jump when
 * the shift cards arrive. Shapes mimic the real cards (time block + text lines)
 * using the theme's skeleton fill — no shimmer animation, which would be motion
 * for its own sake on an enterprise screen.
 */
export function HomeSkeleton(): React.JSX.Element {
    const theme = useTheme();

    return (
        <View
            accessibilityRole="progressbar"
            accessibilityLabel="Loading your shifts"
            style={[styles.root, { gap: theme.spacing.md }]}>
            <View
                style={[
                    styles.line,
                    {
                        backgroundColor: theme.colors.skeleton,
                        borderRadius: theme.radius.sm,
                        width: '45%',
                        height: 20,
                    },
                ]}
            />
            {[0, 1].map(index => (
                <View
                    key={index}
                    style={[
                        styles.card,
                        {
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radius.lg,
                            padding: theme.spacing.md,
                            gap: theme.spacing.sm,
                        },
                    ]}>
                    <View style={[styles.row, { gap: theme.spacing.md }]}>
                        <View
                            style={[
                                styles.block,
                                {
                                    backgroundColor: theme.colors.skeleton,
                                    borderRadius: theme.radius.sm,
                                    width: 56,
                                    height: 32,
                                },
                            ]}
                        />
                        <View style={[styles.texts, { gap: theme.spacing.xs }]}>
                            <View
                                style={[
                                    styles.line,
                                    {
                                        backgroundColor: theme.colors.skeleton,
                                        borderRadius: theme.radius.sm,
                                        width: '70%',
                                        height: 14,
                                    },
                                ]}
                            />
                            <View
                                style={[
                                    styles.line,
                                    {
                                        backgroundColor: theme.colors.skeleton,
                                        borderRadius: theme.radius.sm,
                                        width: '50%',
                                        height: 12,
                                    },
                                ]}
                            />
                        </View>
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        width: '100%',
    },
    card: {
        borderWidth: 1,
        width: '100%',
    },
    row: {
        alignItems: 'center',
        flexDirection: 'row',
    },
    texts: {
        flex: 1,
    },
    line: {},
    block: {},
});
