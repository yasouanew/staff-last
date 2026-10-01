import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { AppButton } from '../AppButton';
import { ScreenContainer } from '../ScreenContainer';

import { spacing, useTheme } from '../../theme';

export type CompanyLockedViewProps = {
    /** Reason string from `company_access.reason`, when the API supplied one. */
    reason?: string | null;
    /** Signs the user out — the only action that makes sense while locked. */
    onSignOut: () => void;
    /** True while the sign-out mutation is in flight. */
    signingOut?: boolean;
};

/**
 * Paywall interstitial for a locked company (expired trial / inactive subscription).
 *
 * The backend's `company.access` middleware answers 403 for essentially every
 * company-scoped endpoint while the account is locked, so a signed-in user would
 * otherwise land in a shell where every tab shows the same "forbidden" error. This
 * view replaces that dead end with an explanation and a single exit.
 *
 * It deliberately offers **no** "try again" or upgrade CTA: paying is an admin task
 * performed on the web, and this app has no billing surface. Promising an action the
 * app cannot perform would be worse than saying nothing.
 *
 * `reason` comes from the API when present and is shown verbatim — it is already
 * operator-facing copy, and paraphrasing it risks contradicting the message the
 * company's admin sees elsewhere.
 */
export function CompanyLockedView({
    reason,
    onSignOut,
    signingOut = false,
}: CompanyLockedViewProps): React.JSX.Element {
    const theme = useTheme();

    return (
        <ScreenContainer scrollable contentContainerStyle={styles.content}>
            <View style={[styles.block, { gap: theme.spacing.md }]}>
                <AppText variant="title">Account unavailable</AppText>

                <AppText variant="body" color="textSecondary">
                    {reason ??
                        "Your company's subscription is not active, so the staff app is unavailable right now."}
                </AppText>

                <AppText variant="caption" color="textMuted">
                    Ask your company administrator to restore the subscription, then sign in
                    again.
                </AppText>
            </View>

            <AppButton
                label="Sign out"
                onPress={onSignOut}
                loading={signingOut}
                variant="secondary"
                fullWidth
                size="lg"
            />
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    content: {
        flexGrow: 1,
        justifyContent: 'center',
    },
    block: {
        marginBottom: spacing.xl,
    },
});
