import { StyleSheet, View } from 'react-native';

import { AppText } from '../../../components/AppText';
import { availabilityCopy } from '../../../constants/copy';
import { useTheme } from '../../../theme/useTheme';

/**
 * Inline "you have unsaved changes" banner.
 *
 * Replaces the previous floating amber caption, which sat in the intro block and
 * read as a stray line of text rather than as a state. This is a proper banner:
 * a `warningSoft` panel with a warning dot, so the state is legible at a glance
 * and is announced to assistive tech as a live region.
 *
 * The banner is rendered only while the week is dirty, so its presence *is* the
 * signal — there is no "clean" variant to get wrong.
 */

/**
 * The spec-pinned ink for the banner text, per scheme.
 *
 * Deliberately literals rather than `warningStrong`: the design spec names these
 * exact values, and the light value is close enough to `warningStrong` that a
 * token swap would be invisible in review but would silently drift from the spec.
 * The dark value is the scheme's `warning` token, which is AA against
 * `warningSoft` on a dark canvas.
 */
const BANNER_INK_LIGHT = '#8A5A13';
const BANNER_INK_DARK = '#E5B45C';

/** The spec's 8pt warning dot. */
const DOT_SIZE = 8;

export function UnsavedBanner(): React.JSX.Element {
    const theme = useTheme();

    return (
        <View
            testID="availability-dirty-hint"
            accessibilityLiveRegion="polite"
            style={[
                styles.banner,
                {
                    backgroundColor: theme.colors.warningSoft,
                    borderRadius: theme.tokens.radius.rMd,
                },
            ]}>
            <View style={[styles.dot, { backgroundColor: theme.colors.warning }]} />
            <AppText
                variant="bodyStrong"
                style={[
                    styles.text,
                    { color: theme.isDark ? BANNER_INK_DARK : BANNER_INK_LIGHT },
                ]}>
                {availabilityCopy.unsaved}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        // The spec's 16/20 outer margin and 12/14 inner padding.
        marginVertical: 16,
        marginHorizontal: 20,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dot: {
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
    },
    text: {
        flex: 1,
    },
});
