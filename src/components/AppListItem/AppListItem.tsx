import { Pressable, StyleSheet, View } from 'react-native';

import { useHaptics } from '../../hooks/useHaptics';
import type { Colors } from '../../theme/colors';
import { radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { AppIcon, type IconComponent } from '../AppIcon/AppIcon';
import { ChevronRightGlyph } from '../AppIcon/glyphs';
import { AppText } from '../AppText/AppText';

/**
 * Tappable row used by the Account/Settings screens.
 *
 * A separate component from [`AppCard`](src/components/AppCard/AppCard.tsx:1)
 * because these rows have a fixed anatomy (label, optional value, optional chevron)
 * and are grouped into a single bordered block rather than sitting as individual
 * cards — the platform-conventional shape for a settings list.
 *
 * ## The icon plate
 *
 * A leading icon renders inside a tinted rounded square rather than as a bare
 * glyph. Three things follow from that:
 *
 *  - the plate is a fixed 32pt square, so labels in a group share one left edge
 *    whether or not a neighbouring row has an icon;
 *  - the glyph can be tinted *per row* (brand for navigation, danger for
 *    destructive) without the tint competing with the label's own colour;
 *  - the fill is `surfaceSunken`, one step below the row's `surface`. That
 *    matters because the row tints to `surfaceMuted` while pressed: a
 *    `surfaceMuted` plate would vanish into it at exactly the moment the user is
 *    looking at it.
 */
export type AppListItemProps = {
    label: string;
    /** Current value shown right-aligned in muted text, e.g. "On" or a version. */
    value?: string;
    onPress?: () => void;
    /** Destructive styling for actions like "Sign out everywhere". */
    destructive?: boolean;
    disabled?: boolean;
    /**
     * Leading navigation icon (Phase 6 settings matrix), rendered inside a tinted
     * 32pt plate at 18pt.
     *
     * Additive: rows that pass nothing keep their previous full-width label, so no
     * Phase 3 call site changes.
     */
    icon?: IconComponent;
    /**
     * Tint for [`icon`](src/components/AppListItem/AppListItem.tsx:15).
     *
     * Defaults to `textSecondary`. Destructive rows should pass `danger` so the
     * glyph and the label agree; a grey padlock next to red "Sign out" text reads
     * like two different states.
     */
    iconColor?: keyof Colors;
    /**
     * Custom trailing element (e.g. a Switch) — replaces the default chevron.
     *
     * `undefined` means "not supplied" and keeps the default chevron; `null` means
     * "supply nothing" and removes it. The distinction matters for destructive rows:
     * a "Sign out" row is an action, not a navigation, so a chevron would promise a
     * screen that does not exist. A plain `??` test cannot express that, because
     * `null` is itself nullish and would fall through to the chevron.
     */
    trailing?: React.ReactNode;
    /** Suppresses the separator; use on the final row of a group. */
    isLast?: boolean;
};

export function AppListItem({
    label,
    value,
    onPress,
    destructive = false,
    disabled = false,
    icon,
    iconColor,
    trailing,
    isLast = false,
}: AppListItemProps) {
    const theme = useTheme();
    const triggerHaptic = useHaptics();

    const resolvedIconColor: keyof Colors =
        iconColor ?? (destructive ? 'danger' : disabled ? 'textDisabled' : 'textSecondary');

    // Destructive rows get the soft danger wash so the plate, the glyph and the
    // label all read as one state instead of three.
    const plateFill: keyof Colors = destructive ? 'dangerSoft' : 'surfaceSunken';

    const handlePress = (): void => {
        triggerHaptic(destructive ? 'warning' : 'selection');
        onPress?.();
    };

    const content = (
        <>
            {icon !== undefined ? (
                <View
                    style={[
                        styles.iconPlate,
                        {
                            backgroundColor: theme.colors[plateFill],
                            borderRadius: radiusRoles.micro.md,
                        },
                    ]}>
                    <AppIcon
                        icon={icon}
                        sizePoints={ICON_PLATE_GLYPH}
                        color={resolvedIconColor}
                    /*
                     * Decorative. The row already announces its label, so an
                     * accessible glyph would only make a screen reader say the
                     * row twice.
                     */
                    />
                </View>
            ) : null}

            <View style={styles.textBlock}>
                <AppText
                    variant="body"
                    color={destructive ? 'danger' : disabled ? 'textDisabled' : 'text'}
                    numberOfLines={1}>
                    {label}
                </AppText>
                {value !== undefined ? (
                    // `textSecondary`, not the `text` default: the value is a
                    // companion to the label, and two tiers of equal weight in one
                    // row is what makes a settings list read as noise.
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                        {value}
                    </AppText>
                ) : null}
            </View>

            {trailing !== undefined ? trailing : onPress !== undefined ? (
                // A real glyph rather than the '>' character: the text chevron sat on
                // the baseline and drifted as type scaled.
                <AppIcon
                    icon={ChevronRightGlyph}
                    size="small"
                    color={disabled ? 'textDisabled' : 'textMuted'}
                />
            ) : null}
        </>
    );

    const rowStyle = [
        styles.row,
        {
            minHeight: theme.sizing.minTouchTarget,
            paddingVertical: spacing.sm,
            // `insets.listRow` (16) rather than `spacing.md` — the two agree today,
            // but the row is a *list* inset, and that is the token that owns it.
            paddingHorizontal: theme.insets.listRow,
            backgroundColor: theme.colors.surface,
            borderBottomWidth: isLast ? 0 : theme.sizing.borderWidths.hairline,
            borderBottomColor: theme.colors.divider,
        },
    ];

    if (onPress === undefined || disabled) {
        return <View style={rowStyle}>{content}</View>;
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={value !== undefined ? `${label}, ${value}` : label}
            accessibilityState={{ disabled }}
            onPress={handlePress}
            style={({ pressed }) => [...rowStyle, pressed ? { backgroundColor: theme.colors.surfaceMuted } : null]}>
            {content}
        </Pressable>
    );
}

/** Plate dimension and the glyph it holds. 32/18 keeps a 7pt optical inset. */
const ICON_PLATE_SIZE = 32;
const ICON_PLATE_GLYPH = 18;

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    iconPlate: {
        width: ICON_PLATE_SIZE,
        height: ICON_PLATE_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textBlock: {
        flex: 1,
        // Phase 6 spec §0.3: a long label must truncate rather than push the
        // trailing chevron or Switch off the row.
        minWidth: 0,
    },
});
