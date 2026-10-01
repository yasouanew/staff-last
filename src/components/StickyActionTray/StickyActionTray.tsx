import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { AppText } from '../AppText/AppText';

export type StickyActionTrayProps = {
    /**
     * One or more actions. Rendered in a single row; supply a single child when
     * the screen has exactly one action so the button is not stretched to a
     * third of the width.
     */
    children: React.ReactNode;
    /** Optional caption line above the buttons (e.g. a policy note). */
    note?: string;
    testID?: string;
    style?: ViewStyle;
};

/**
 * Sticky bottom action tray.
 *
 * ## Why this is a sibling, not an overlay inside the scroller
 *
 * An absolutely-positioned bar placed *inside* a `FlatList`'s content would
 * scroll away with the content and, worse, would be re-created per row. The
 * contract (V8) is that the tray lives beside the list in the screen's own
 * layout tree and the list reserves the tray's height as bottom padding. This
 * component therefore owns only its own chrome and its safe-area inset, and
 * reports its measured height through `onLayout` so the *screen* can pass that
 * number to the list's `contentContainerStyle`.
 *
 * ## Why the bottom inset is added, not subtracted
 *
 * On a gesture-navigation Android device the inset is ~0; on an iPhone with a
 * home indicator it is 34pt. The bar must sit *above* that inset, so its own
 * padding grows by `insets.bottom` and the hairline rule stays at the top edge
 * of the bar. Devices without an inset get no phantom gap.
 *
 * ## Why the top hairline is a border, not a shadow
 *
 * A lift shadow under a bar that is permanently on screen reads as a floating
 * element that never lands. A hairline rule states "content continues beneath
 * this" more honestly, and costs nothing on the render thread.
 */
export function StickyActionTray({
    children,
    note,
    testID,
    style,
}: StickyActionTrayProps): React.JSX.Element {
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <View
            testID={testID}
            style={{
                ...styles.tray,
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
                paddingBottom: insets.bottom + spacing.md,
                paddingHorizontal: theme.screenGutter,
                ...style,
            }}>
            <View style={{ gap: spacing.sm }}>
                {note !== undefined ? (
                    <AppText variant="caption" color="textMuted">
                        {note}
                    </AppText>
                ) : null}
                <View style={[styles.actions, { gap: spacing.sm }]}>{children}</View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    tray: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: spacing.md,
        width: '100%',
    },
    actions: {
        flexDirection: 'row',
    },
});
