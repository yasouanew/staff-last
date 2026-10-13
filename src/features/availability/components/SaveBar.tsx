import { useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../../components/AppText';
import { PrimaryButton } from '../../../components/ui';
import { availabilityCopy } from '../../../constants/copy';
import { useTheme } from '../../../theme/useTheme';

/**
 * Sticky save bar for the availability screen.
 *
 * ## Placement
 *
 * The screen is a tab root, so the custom tab bar is absolutely positioned at the
 * bottom of the display. The bar therefore sits *above* the tab bar — its `bottom`
 * offset is the tab bar's measured height, read from React Navigation's
 * `BottomTabBarHeightContext` (the same source
 * [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:1) uses).
 * Reading the context rather than the `TAB_BAR_HEIGHT` constant also gets the value
 * right for this app's custom bar, whose measured height already includes the
 * safe-area inset.
 *
 * ## Safe area
 *
 * The tab bar owns the bottom inset when it is present, so the bar must not add it
 * a second time — that would leave a phantom gap between the button and the bar.
 * When there is no tab bar (a test, a preview, a future non-tab host) the bar *is*
 * the bottom-most element and adds the inset itself.
 *
 * ## Disabled state
 *
 * The button is disabled until the week is dirty and valid. Its disabled treatment
 * is the spec's: a `primarySoft` fill with `primary` text at 0.5 opacity — clearly
 * a deliberate "not yet" rather than the ambiguous washed-out blue it replaces.
 */
export function SaveBar({
    onSave,
    disabled,
    loading,
}: {
    onSave: () => void;
    disabled: boolean;
    loading: boolean;
}): React.JSX.Element {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

    return (
        <View
            testID="availability-save-bar"
            style={[
                styles.bar,
                {
                    bottom: tabBarHeight,
                    backgroundColor: theme.colors.surface,
                    borderTopColor: theme.tokens.colors.borderHairline,
                    // The tab bar already carries the inset; only add it when this
                    // bar is the bottom-most element.
                    paddingBottom: 16 + (tabBarHeight === 0 ? insets.bottom : 0),
                },
            ]}>
            <PrimaryButton
                label={availabilityCopy.saveWeek}
                onPress={onSave}
                disabled={disabled}
                loading={loading}
                accessibilityLabel="Save weekly availability"
                testID="availability-save"
            />
            <AppText variant="caption" color="textMuted" align="center" style={styles.note}>
                {availabilityCopy.saveNote}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        position: 'absolute',
        left: 0,
        right: 0,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: 16,
        paddingHorizontal: 20,
    },
    note: {
        marginTop: 8,
    },
});
