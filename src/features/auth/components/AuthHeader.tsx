import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../../../components/AppIcon';
import { ArrowLeftGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { useTheme } from '../../../theme/useTheme';

/**
 * The 2026 auth header.
 *
 * A local header rather than
 * [`AppHeader`](src/components/AppHeader/AppHeader.tsx:1): the spec's geometry —
 * a 40pt circular back plate on `surfaceMuted`, a 20pt `inkPrimary` arrow, a
 * `heading` title — differs from the shared header's, and changing the shared
 * component would move every other screen. It is shared between the Forgot and
 * Reset screens so the two cannot drift apart.
 *
 * The header owns the top safe-area inset and sits *above* the scroller, so the
 * body below it can carry its own 24pt gutter without the two paddings
 * compounding.
 */

export type AuthHeaderProps = {
    title: string;
    /** Optional supporting line under the title, e.g. "Submit a request for approval." */
    subtitle?: string;
    onBack: () => void;
};

/** Header row height — the spec's 56. */
const HEADER_ROW_HEIGHT = 56;
/** Header horizontal gutter — the spec's 16. */
const HEADER_PADDING = 16;
/** Back affordance diameter — the spec's 40. */
const BACK_BUTTON_SIZE = 40;
/** Back glyph size — the spec's 20. */
const BACK_ICON_SIZE = 20;
/**
 * Optical offset for the centred title. The back button's visual mass sits on
 * the left, so the title is nudged a hair left of the geometric centre to
 * *look* centred.
 */
const TITLE_OPTICAL_OFFSET = 4;

export function AuthHeader({ title, subtitle, onBack }: AuthHeaderProps): React.JSX.Element {
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <View
            accessibilityRole="header"
            style={{ paddingTop: insets.top, backgroundColor: theme.colors.surface }}>
            <View style={styles.row}>
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

                {/* Symmetric spacer: exactly the back button's width, so the
                    title stays centred on the screen. */}
                <View style={styles.spacer} accessible={false} />
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
    },
    spacer: {
        width: BACK_BUTTON_SIZE,
        height: BACK_BUTTON_SIZE,
    },
});
