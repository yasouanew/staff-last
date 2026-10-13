import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme/useTheme';
import { AppIcon } from '../AppIcon';
import { ArrowLeftGlyph } from '../AppIcon/glyphs';
import { AppText } from '../AppText';

/**
 * The shared screen header with a circular back affordance.
 *
 * ## Why this exists
 *
 * The app previously had two header shapes: [`AppHeader`](src/components/AppHeader/AppHeader.tsx:1)
 * (a square back plate, used by the tab stacks) and the auth flow's local
 * `AuthHeader` (a 40pt circular plate). A screen that used the wrong one looked
 * like it belonged to a different app. This is the single circular-back header the
 * 2026 spec calls for, with a right-hand action slot for a screen-level action such
 * as "Mark all read".
 *
 * ## Geometry
 *
 *     inset.top
 *     [◀ 40pt circle]   Title (heading)          [action slot]
 *                       Subtitle (caption)
 *
 * The header owns the top safe-area inset and sits *above* the scroller, so the
 * body below it can carry its own gutter without the two paddings compounding.
 *
 * ## The action slot
 *
 * `action` is rendered right-aligned in a fixed-width slot so the title stays
 * optically centred whether or not an action is present. When there is no action a
 * symmetric spacer stands in, exactly as the back button's width does on the left.
 */
export type ScreenHeaderProps = {
    title: string;
    /** Optional supporting line under the title. */
    subtitle?: string;
    /** Renders the circular back affordance when supplied. */
    onBack?: () => void;
    /** Trailing action rendered on the right, e.g. a "Mark all read" button. */
    action?: React.ReactNode;
    testID?: string;
};

/** Header row height — the spec's 56. */
const HEADER_ROW_HEIGHT = 56;
/** Header horizontal gutter — the spec's 16. */
const HEADER_PADDING = 16;
/** Back affordance diameter — the spec's 40. */
const BACK_BUTTON_SIZE = 40;
/** Back glyph size — the spec's 20. */
const BACK_ICON_SIZE = 20;
/** Optical offset for the centred title. */
const TITLE_OPTICAL_OFFSET = 4;

export function ScreenHeader({
    title,
    subtitle,
    onBack,
    action,
    testID,
}: ScreenHeaderProps): React.JSX.Element {
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <View
            accessibilityRole="header"
            testID={testID}
            style={{ paddingTop: insets.top, backgroundColor: theme.colors.surface }}>
            <View style={styles.row}>
                {onBack !== undefined ? (
                    <Pressable
                        accessibilityRole="button"
                        // The Pressable owns the label, so the glyph beneath it is
                        // decorative — labelling both would announce "Go back" twice.
                        accessibilityLabel="Go back"
                        onPress={onBack}
                        hitSlop={12}
                        style={({ pressed }) => [
                            styles.backButton,
                            {
                                backgroundColor: pressed
                                    ? theme.colors.surfaceSunken
                                    : theme.colors.surfaceMuted,
                            },
                        ]}>
                        <AppIcon
                            icon={ArrowLeftGlyph}
                            sizePoints={BACK_ICON_SIZE}
                            color="text"
                            accessibilityLabel={undefined}
                        />
                    </Pressable>
                ) : (
                    <View style={styles.spacer} accessible={false} />
                )}

                <View style={styles.titleSlot}>
                    <AppText variant="heading" color="text" numberOfLines={1}>
                        {title}
                    </AppText>
                    {subtitle !== undefined ? (
                        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                            {subtitle}
                        </AppText>
                    ) : null}
                </View>

                {action !== undefined ? (
                    <View style={styles.actionSlot}>{action}</View>
                ) : (
                    <View style={styles.spacer} accessible={false} />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        height: HEADER_ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: HEADER_PADDING,
        gap: 8,
    },
    backButton: {
        width: BACK_BUTTON_SIZE,
        height: BACK_BUTTON_SIZE,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleSlot: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        // Optical offset — see `TITLE_OPTICAL_OFFSET`.
        paddingRight: TITLE_OPTICAL_OFFSET,
        minWidth: 0,
    },
    actionSlot: {
        minWidth: BACK_BUTTON_SIZE,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    spacer: {
        width: BACK_BUTTON_SIZE,
        height: BACK_BUTTON_SIZE,
    },
});
