import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../../theme/useTheme';
import { AppText } from '../AppText/AppText';

/**
 * Filter chip — a selectable pill for a filter row.
 *
 * The design lineage is deliberate: this is the same stadium shape and the same
 * one-line ellipsis contract as [`StatusBadge`](src/components/StatusBadge/StatusBadge.tsx:1).
 * What changes is the semantic axis. A badge reports a fact the server owns; a
 * chip reports a choice the *user* owns. So the colour pair is driven by
 * `selected`, not by a status enum, and the accessibility role is `button` with an
 * explicit selected state rather than a passive `text` node.
 *
 * ## Geometry (2026 spec)
 *
 * Height 34, horizontal padding 14, radius 999, `caption` at weight 600. The
 * selected chip is a solid brand fill with white text and a `shadowCard` lift, so
 * the active filter reads as a raised object rather than merely a darker one.
 *
 * ## Counts
 *
 * A count renders inline as `Label · 4` in the same text node, not as a nested
 * badge, so the pill never has to grow a second row. The count is part of the
 * label, so it is announced too.
 *
 * ## Selection never changes width
 *
 * The label is identical in both states and is never prefixed with a tick glyph.
 * A chip that grows when picked shoves every chip to its right, which makes a
 * filter row feel broken on a phone.
 */
export type FilterChipProps = {
    label: string;
    selected: boolean;
    /**
     * Optional count rendered after the label as `Label · 4`. Rendered in the same
     * text node, not a nested badge, so the pill never has to grow a second row.
     */
    count?: number;
    /**
     * Called with no arguments — the parent has already bound the filter key into
     * the closure, so forwarding an index here would only create a chance to get it
     * wrong. (Phase 5's rule: forward ids, never row indices.)
     */
    onPress: () => void;
    disabled?: boolean;
    testID?: string;
};

/** The spec's painted height. */
export const FILTER_CHIP_HEIGHT = 34;
/** The spec's horizontal padding. */
const CHIP_PADDING_HORIZONTAL = 14;

export function FilterChip({
    label,
    selected,
    count,
    onPress,
    disabled = false,
    testID,
}: FilterChipProps) {
    const theme = useTheme();

    /**
     * Selected = solid brand fill with the on-primary foreground and a card lift.
     * Inactive = the soft grey track used by every inactive surface in the app.
     */
    const background = selected ? theme.colors.primary : theme.colors.surfaceMuted;
    const foreground = selected ? theme.colors.onPrimary : theme.colors.textSecondary;

    const text = count !== undefined ? `${label} · ${count}` : label;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={text}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={onPress}
            // The pill is 34pt, below the 44pt platform minimum, so the touch area
            // is widened without changing the visual geometry.
            hitSlop={theme.spacing.xs}
            testID={testID}
            style={({ pressed }) => [
                styles.chip,
                selected ? theme.tokens.shadows.shadowCard : null,
                {
                    backgroundColor: background,
                    borderRadius: theme.tokens.radius.rPill,
                    paddingHorizontal: CHIP_PADDING_HORIZONTAL,
                    // Pressed dims but never scales: a scaling chip would drag its
                    // neighbours around for the length of the animation.
                    opacity: pressed && !disabled ? 0.7 : disabled ? 0.5 : 1,
                },
            ]}>
            <AppText
                variant="caption"
                style={[styles.label, { color: foreground }]}
                numberOfLines={1}
                ellipsizeMode="tail">
                {text}
            </AppText>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    chip: {
        // Hugs its content; a stretched chip would look like a banner.
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: FILTER_CHIP_HEIGHT,
        // With `numberOfLines={1}` the label ellipsises at the pill's edge rather
        // than overflowing the horizontal scroller.
        maxWidth: 200,
    },
    label: {
        // The spec's caption tier at weight 600 (one step above `caption`'s 500).
        fontWeight: '600',
    },
});
