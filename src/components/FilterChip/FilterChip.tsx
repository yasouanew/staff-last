import { Pressable, StyleSheet } from 'react-native';

import { borderWidths } from '../../theme/sizing';
import { spacing } from '../../theme/spacing';
import { lineHeight } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';
import { AppText } from '../AppText/AppText';

/**
 * Filter chip — the Status Pill Badge's anatomy, re-pointed at *selection*.
 *
 * The design lineage is deliberate: this is the same stadium shape, the same
 * token-derived height floor, and the same one-line ellipsis contract as
 * [`StatusBadge`](src/components/StatusBadge/StatusBadge.tsx:74). What changes is
 * the semantic axis. A badge reports a fact the server owns; a chip reports a
 * choice the *user* owns. So the colour pair is driven by `selected`, not by a
 * status enum, and the accessibility role is `button` with an explicit selected
 * state rather than a passive `text` node.
 *
 * Two constraints worth stating, because they are what keep the row from
 * twitching:
 *
 *  1. **Selection never changes width.** The label is identical in both states and
 *     is never prefixed with a tick glyph. A chip that grows when picked shoves
 *     every chip to its right, which makes a filter row feel broken on a phone.
 *  2. **The visual pill stays slim; the touch box does not.** A 44pt-tall pill
 *     beside a 44pt card reads as clumsy, so the pill keeps its badge height and a
 *     `hitSlop` of `spacing.xs` lifts the *effective* target to 44pt. Geometry is
 *     left to the eye; accessibility is left to the numbers.
 *
 * Deliberately takes no `tone` prop. Selection is binary, and offering a colour
 * per chip would invite a row of six hues that means nothing.
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
     * Selected = solid Deep Ocean Blue with the on-primary foreground.
     * Inactive = the soft grey track used by every inactive surface in the app,
     * with a hairline so a chip beside a similarly-grey card still has an edge.
     */
    const background = selected ? theme.colors.primary : theme.colors.surfaceMuted;
    const foreground = selected ? theme.colors.onPrimary : theme.colors.textSecondary;
    const border = selected ? theme.colors.primary : theme.colors.border;

    const text = count !== undefined ? `${label} · ${count}` : label;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={text}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={onPress}
            // See the docblock: the pill is intentionally shorter than 44pt, and
            // hitSlop is what makes it conform.
            hitSlop={spacing.xs}
            testID={testID}
            style={({ pressed }) => [
                styles.chip,
                {
                    backgroundColor: background,
                    borderColor: border,
                    borderRadius: theme.radius.full,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                    minHeight: lineHeight.xs + spacing.xxs * 2,
                    // Pressed dims but never scales: a scaling chip would drag its
                    // neighbours around for the length of the animation.
                    opacity: pressed && !disabled ? 0.7 : disabled ? 0.5 : 1,
                },
            ]}>
            <AppText
                variant="label"
                style={{ color: foreground }}
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
        borderWidth: borderWidths.hairline,
        // With `numberOfLines={1}` the label ellipsises at the pill's edge rather
        // than overflowing the horizontal scroller.
        maxWidth: 200,
    },
});

/**
 * The chip's painted height, for a caller that needs to reserve the filter lane
 * before the chips are measured (a skeleton, or a `getItemLayout`).
 */
export const FILTER_CHIP_HEIGHT =
    lineHeight.xs + spacing.xxs * 2 + borderWidths.hairline * 2;
