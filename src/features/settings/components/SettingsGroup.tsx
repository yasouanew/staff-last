import { StyleSheet, View } from 'react-native';

import { AppText } from '../../../components/AppText';
import { useTheme } from '../../../theme/useTheme';

export type SettingsGroupProps = {
    title: string;
    footnote?: string;
    children: React.ReactNode;
    testID?: string;
};

const GUTTER = 20;
const TEXT_GUTTER = 24;

export function SettingsGroup({
    title,
    footnote,
    children,
    testID,
}: SettingsGroupProps): React.JSX.Element {
    const theme = useTheme();

    return (
        <View style={styles.group} testID={testID}>
            <AppText
                variant="micro"
                color="textMuted"
                style={styles.label}>
                {title}
            </AppText>

            <View
                style={[
                    styles.card,
                    {
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.radius.rLg,

                        // Keep the card completely deterministic.
                        borderWidth: theme.sizing.borderWidths.hairline,
                        borderColor: theme.colors.borderHairline,
                    },

                    // Apply elevation only outside the clipped content.
                    theme.shadows.card,
                ]}>
                {children}
            </View>



            {footnote !== undefined ? (
                <AppText
                    variant="caption"
                    color="textMuted"
                    style={styles.footnote}>
                    {footnote}
                </AppText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    group: {
        marginTop: 24,
    },

    label: {
        marginBottom: 8,
        paddingHorizontal: TEXT_GUTTER,
    },

    card: {
        marginHorizontal: GUTTER,

        // IMPORTANT:
        // Do not clip the card. The rows do not require clipping and
        // clipping can interfere with elevation/shadow rendering.
        overflow: 'visible',
    },

    footnote: {
        marginTop: 8,
        paddingHorizontal: TEXT_GUTTER,
    },
});