import { StyleSheet, View } from 'react-native';

import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { AppButton } from '../AppButton/AppButton';
import { AppText } from '../AppText/AppText';

/**
 * Zero-data state.
 *
 * Rendered **only** once a request has succeeded with an empty collection — never
 * while loading, and never instead of an error. Callers must therefore branch on
 * the query state before mounting this component (see
 * [`useQueryState`](src/hooks/useQueryState.ts:1), which encodes that rule).
 *
 * Empty states are written to answer "what now?" rather than stating the obvious:
 * the `description` should tell the employee what the absence means.
 */
export type EmptyStateProps = {
    title: string;
    description?: string;
    /** Optional call to action, e.g. "Request leave". */
    actionLabel?: string;
    onAction?: () => void;
};

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
    const theme = useTheme();

    return (
        <View style={[styles.container, { padding: spacing.xl, gap: spacing.xs }]}>
            <AppText variant="subtitle" align="center">
                {title}
            </AppText>

            {description !== undefined ? (
                <AppText variant="caption" align="center">
                    {description}
                </AppText>
            ) : null}

            {actionLabel !== undefined && onAction !== undefined ? (
                <View style={[styles.action, { marginTop: spacing.sm }]}>
                    <AppButton label={actionLabel} onPress={onAction} size="sm" fullWidth={false} />
                </View>
            ) : (
                // Keeps vertical rhythm identical with and without a CTA.
                <View style={{ height: theme.spacing.none }} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    action: {
        alignItems: 'center',
    },
});
