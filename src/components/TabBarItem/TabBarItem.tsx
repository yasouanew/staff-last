import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useHaptics } from '../../hooks/useHaptics';
import { pressScale, springs } from '../../theme/motion';
import { componentRadius, radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { iconSizes, MIN_TOUCH_TARGET } from '../../theme/sizing';
import { lineHeight } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';
import { AppIcon, type IconComponent } from '../AppIcon/AppIcon';
import { useReduceMotion } from '../Skeleton/Skeleton';
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
 * ## Vertical stack
 *
 * A centred 24pt [`AppIcon`](src/components/AppIcon/AppIcon.tsx:1) sits above a
 * micro caption label. The icon lives in a square box, so it centres without any
 * `marginTop` correction.
 *
 * ## Active indicator and badge are both layout-neutral
 *
 *  - The indicator is a soft tinted **pill** behind the icon, absolutely
 *    positioned inside the icon's square box. Because it is out of flow it can
 *    scale up from nothing on selection without nudging the label, so the slot's
 *    geometry is identical in both states.
 *  - The unread badge is likewise `position: 'absolute'` and anchored to the
 *    icon's top-right corner, so it too can be unmounted at zero unread without
 *    moving anything.
 *
 * ## Micro-interaction
 *
 * Selection animates the pill from `0 → 1` on a spring, and the icon carries a
 * small scale lift with it. The slot also dips on press, using the same
 * [`pressScale`](src/theme/motion.ts:1) token as [`AppButton`](src/components/AppButton/AppButton.tsx:1)
 * so a tab feels like every other tappable surface in the app. All three respect
 * Reduce Motion by jumping straight to their end state.
 *
 * ## State is never colour-only
 *
 * The active slot changes tint, **label weight**, the presence of the pill, and
 * `accessibilityState.selected`. A user who cannot perceive the hue difference
 * still sees the weight change and the pill.
 */
export type TabBarItemProps = {
    /** Vector glyph for this tab. */
    icon: IconComponent;
    label: string;
    focused: boolean;
    onPress: () => void;
    /** Unread count; renders the overlay badge when > 0. */
    badgeCount?: number;
    /** Forces `99+` clamping and formatting. */
    testID?: string;
};

/** Badge counts above this render as `99+` so the pill cannot grow unbounded. */
const MAX_BADGE = 99;

function formatBadge(count: number): string {
    return count > MAX_BADGE ? `${MAX_BADGE}+` : String(count);
}

export function TabBarItem({ icon, label, focused, onPress, badgeCount = 0, testID }: TabBarItemProps) {
    const theme = useTheme();
    const reduceMotion = useReduceMotion();
    const triggerHaptic = useHaptics();

    const tint = focused ? theme.colors.primary : theme.colors.textMuted;
    const hasBadge = badgeCount > 0;
    const badgeLabel = hasBadge ? formatBadge(badgeCount) : '';

    /*
     * `selection` is a 0–1 switch rather than a boolean: Reanimated has to
     * interpolate *between* two numbers on the UI thread, and driving the pill,
     * the icon lift and the label colour from one shared value keeps them in
     * lockstep. Two independent values would be two springs that can visibly
     * disagree mid-flight.
     */
    const selection = useSharedValue(focused ? 1 : 0);
    const press = useSharedValue(1);

    /*
     * Driven from an effect rather than assigned during render. A render-time
     * assignment would restart the spring on *every* render — including the ones
     * caused by an unread count arriving — so an idle tab would visibly twitch
     * whenever a notification landed. Keying on `focused` means the pill animates
     * only when the selection actually changes.
     */
    useEffect(() => {
        const to = focused ? 1 : 0;
        selection.value = reduceMotion ? to : withSpring(to, springs.snappy);
    }, [focused, reduceMotion, selection]);

    const settle = (to: number): void => {
        // Reduce Motion: arrive instantly rather than springing.
        press.value = reduceMotion ? to : withSpring(to, springs.snappy);
    };

    const pillStyle = useAnimatedStyle(() => ({
        // Scaling from 0.6 (rather than 0) keeps the pill's rounded ends from
        // pinching as it grows.
        opacity: selection.value,
        transform: [{ scale: interpolate(selection.value, [0, 1], [0.6, 1]) }],
    }));

    const iconStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: interpolate(selection.value, [0, 1], [1, 1.06]) },
            { scale: press.value },
        ],
    }));

    const handlePress = (): void => {
        // A light tick on every tap, including the already-selected tab: the
        // feedback confirms the touch landed, which is exactly what a re-tap on
        // the current tab needs.
        triggerHaptic('selection');
        onPress();
    };

    return (
        <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            // The badge is inside this slot, so its count is folded into the
            // slot's label rather than left for the reader to discover.
            accessibilityLabel={hasBadge ? `${label}, ${badgeCount} unread` : label}
            onPress={handlePress}
            onPressIn={() => settle(pressScale.icon)}
            onPressOut={() => settle(1)}
            testID={testID}
            style={styles.slot}>
            {/* Square icon box — the squaring makes the icon centre symmetrically. */}
            <View style={styles.iconBox}>
                {/* Active pill: absolute, so growing it never moves the label. */}
                <Animated.View
                    pointerEvents="none"
                    testID={testID !== undefined ? `${testID}-indicator` : undefined}
                    style={[
                        styles.indicator,
                        { backgroundColor: theme.colors.primarySoft, borderRadius: componentRadius.chip },
                        pillStyle,
                    ]}
                />

                <Animated.View style={iconStyle}>
                    <AppIcon icon={icon} size="medium" color={focused ? 'primary' : 'textMuted'} />
                </Animated.View>

                {/* Unread badge: absolute overlay, top-right of the icon box. */}
                {hasBadge ? (
                    <View
                        style={[
                            styles.badge,
                            {
                                backgroundColor: theme.colors.danger,
                                borderRadius: radiusRoles.pill.full,
                                minWidth: lineHeight.xs,
                                paddingHorizontal: spacing.xxs,
                            },
                        ]}
                        // The count is already announced by the slot label.
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants">
                        <AppText
                            variant="label"
                            scaling="fixed"
                            numberOfLines={1}
                            style={{ color: theme.colors.onPrimary }}>
                            {badgeLabel}
                        </AppText>
                    </View>
                ) : null}
            </View>

            <AppText
                variant="label"
                // The slot height is fixed `layout.tabBarHeight`, so the caption's
                // scaling is capped rather than allowed to clip inside it.
                scaling="fixed"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                    color: tint,
                    // Weight, not just hue, distinguishes the active tab.
                    fontWeight: focused ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
                }}>
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
        gap: spacing.xxs,
        // Comfortably above the 44pt floor in both axes.
        minHeight: MIN_TOUCH_TARGET,
    },
    iconBox: {
        width: iconSizes.medium,
        height: iconSizes.medium,
        alignItems: 'center',
        justifyContent: 'center',
    },
    indicator: {
        position: 'absolute',
        // Wider than the icon box so the pill reads as a *container* for the
        // glyph rather than a box drawn around it. The negative inset is what
        // buys that, and because the pill is out of flow the slot is unaffected.
        top: -spacing.xs,
        bottom: -spacing.xs,
        left: -spacing.sm,
        right: -spacing.sm,
    },
    badge: {
        position: 'absolute',
        // Anchored to the icon's top-right corner, offset outward so it overlaps
        // the corner instead of sitting inside it.
        top: 0,
        right: 0,
        transform: [{ translateX: '25%' }, { translateY: '-25%' }],
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: lineHeight.xs,
    },
});
