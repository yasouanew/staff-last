import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme/useTheme';
import { AppIcon, type IconComponent } from '../AppIcon/AppIcon';
import { AppText } from '../AppText/AppText';

/**
 * One slot of the bottom tab bar.
 *
 * ## Equal-width matrix
 *
 * The slot is `flexBasis: 0, flexGrow: 1, flexShrink: 1`, so five slots divide the
 * screen width exactly. Labels of different lengths must never produce different
 * slot widths, which is why the label is truncated *inside* a fixed-width slot
 * rather than being allowed to size it.
 *
 * ## Active state is a soft pill, not a colour swap
 *
 * The active slot paints a `primarySoft` stadium (48×28, radius 999) behind the
 * icon and tints both the icon and the label `primary`. The pill is absolutely
 * positioned inside the icon box, so it is layout-neutral: mounting it never
 * nudges the label, and the slot's geometry is identical in both states.
 *
 * ## State is never colour-only
 *
 * The active slot changes tint, **label weight**, the presence of the pill, and
 * `accessibilityState.selected`. A user who cannot perceive the hue difference
 * still sees the weight change and the pill.
 *
 * ## The badge is layout-neutral too
 *
 * The unread badge is `position: 'absolute'` and anchored to the icon's top-right
 * corner, so it can be unmounted at zero unread without moving anything. Its count
 * is folded into the slot's `accessibilityLabel`, so the marker is never
 * colour-only.
 */
export type TabBarItemProps = {
    /** Vector glyph for this tab. */
    icon: IconComponent;
    label: string;
    focused: boolean;
    onPress: () => void;
    /** Unread count; renders the overlay badge when > 0. */
    badgeCount?: number;
    testID?: string;
};

/** Badge counts above this render as `99+` so the pill cannot grow unbounded. */
const MAX_BADGE = 99;

/** Diameter of the unread badge, in points. */
const BADGE_SIZE = 16;

function formatBadge(count: number): string {
    return count > MAX_BADGE ? `${MAX_BADGE}+` : String(count);
}

export function TabBarItem({
    icon,
    label,
    focused,
    onPress,
    badgeCount = 0,
    testID,
}: TabBarItemProps): React.JSX.Element {
    const theme = useTheme();
    const { colors, radius } = theme.tokens;

    const tint = focused ? colors.primary : colors.inkTertiary;
    const hasBadge = badgeCount > 0;
    const badgeLabel = hasBadge ? formatBadge(badgeCount) : '';

    return (
        <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            // The badge is inside this slot, so its count is folded into the
            // slot's label rather than left for the reader to discover.
            accessibilityLabel={hasBadge ? `${label}, ${badgeCount} unread` : label}
            onPress={onPress}
            testID={testID}
            style={({ pressed }) => [styles.slot, { opacity: pressed ? 0.7 : 1 }]}>
            {/* Icon box — the pill is sized to it, so the two cannot drift. */}
            <View style={styles.iconBox}>
                {focused ? (
                    <View
                        pointerEvents="none"
                        testID={testID !== undefined ? `${testID}-indicator` : undefined}
                        style={[
                            styles.indicator,
                            { backgroundColor: colors.primarySoft, borderRadius: radius.rPill },
                        ]}
                    />
                ) : null}

                <AppIcon icon={icon} size="medium" color={focused ? 'primary' : 'textMuted'} />

                {/* Unread badge: absolute overlay, top-right of the icon. */}
                {hasBadge ? (
                    <View
                        style={[
                            styles.badge,
                            {
                                backgroundColor: colors.danger,
                                borderRadius: radius.rPill,
                                // A white ring lifts the badge off the icon so the
                                // two never read as a single shape.
                                borderColor: colors.surface,
                            },
                        ]}
                        // The count is already announced by the slot label.
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants">
                        <AppText
                            scaling="fixed"
                            numberOfLines={1}
                            style={[styles.badgeText, { color: theme.colors.onPrimary }]}>
                            {badgeLabel}
                        </AppText>
                    </View>
                ) : null}
            </View>

            <AppText
                variant="label"
                // The slot height is fixed, so the caption's scaling is capped
                // rather than allowed to clip inside it.
                scaling="fixed"
                numberOfLines={1}
                ellipsizeMode="tail"
                // Weight, not just hue, distinguishes the active tab.
                style={[focused ? styles.labelActive : styles.labelInactive, { color: tint }]}>
                {label}
            </AppText>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    slot: {
        // Exactly 1/5 of the width, regardless of label length.
        flexBasis: 0,
        flexGrow: 1,
        flexShrink: 1,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        minHeight: 44,
    },
    iconBox: {
        // Sized to the active pill (48×28) so the pill needs no negative inset.
        width: 48,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    indicator: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
    },
    badge: {
        position: 'absolute',
        // Anchored to the icon's top-right corner, offset outward so it overlaps
        // the corner instead of sitting inside it.
        top: -2,
        right: 6,
        width: BADGE_SIZE,
        height: BADGE_SIZE,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeText: {
        fontSize: 10,
        lineHeight: 12,
        fontWeight: '700',
    },
    labelActive: {
        fontWeight: '600',
    },
    labelInactive: {
        fontWeight: '500',
    },
});
