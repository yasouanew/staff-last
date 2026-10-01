import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';

/**
 * Skeleton primitives and the shimmer engine.
 *
 * ## Why a skeleton instead of a spinner
 *
 * A centred spinner says "unknown duration, unknown shape". A skeleton says
 * "content is coming, and here is where it will be" — which matters for a
 * scheduling app, where the user wants to see that a shift day, a time range and
 * a status pill are loading. It also removes the **spinner → content layout jump**
 * entirely, because the placeholder already occupies the content's final geometry.
 *
 * [`LoadingView`](src/components/LoadingView/LoadingView.tsx:1) (a spinner) stays
 * available for genuinely indeterminate actions such as a submit in flight.
 * Skeletons are for the first paint of a shape that is already known.
 *
 * ## Animation budget
 *
 * The shimmer is an **opacity crossfade** (0.3 → 0.7 → 0.3), not a sweeping
 * gradient: opacity is a composited property on every platform, so the whole loop
 * runs on the UI thread with `useNativeDriver: true` and the JS thread stays free.
 * That is what keeps `onPress`, tab switches and list scrolling responsive while
 * the skeleton animates.
 *
 * Exactly **one** `Animated.Value` drives a whole skeleton group (via
 * [`SkeletonGroup`](#skeletongroup)). Thirty independent loops would be thirty
 * timers.
 */

/** Half-cycle duration. A full breathing cycle is 2 × this. */
const SHIMMER_DURATION = 700;
const DIM_OPACITY = 0.3;
const BRIGHT_OPACITY = 0.7;
/** Static opacity used when Reduce Motion is on (or not yet resolved). */
const STATIC_OPACITY = 0.5;

type ShimmerState = {
    /** Shared progress value: 0 → dim, 1 → bright. */
    progress: Animated.Value;
};

/**
 * Shared shimmer context.
 *
 * Implemented with a module-level React context to avoid adding a dependency, and
 * exposed as a hook so every shape in a group subscribes to one animation.
 */
import { createContext, useContext } from 'react';

const ShimmerContext = createContext<ShimmerState | null>(null);

/**
 * Reads the OS "Reduce Motion" preference and keeps it current.
 *
 * Defaults to `true` (i.e. **do not** animate) until the first read resolves. A
 * static skeleton is always acceptable; a perpetual pulse is not, for a
 * motion-sensitive user.
 */
export function useReduceMotion(): boolean {
    const [reduceMotion, setReduceMotion] = useState(true);

    useEffect(() => {
        let cancelled = false;

        AccessibilityInfo.isReduceMotionEnabled()
            .then(enabled => {
                if (!cancelled) {
                    setReduceMotion(enabled);
                }
            })
            .catch(() => {
                // A failed query leaves the fail-safe (`true`) in place.
            });

        const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

        return () => {
            cancelled = true;
            subscription.remove();
        };
    }, []);

    return reduceMotion;
}

/**
 * Wraps a set of skeleton shapes in one shared shimmer loop.
 *
 * The loop is started on mount and **stopped on unmount** so it cannot outlive
 * its screen. With Reduce Motion enabled no loop is created at all and the value
 * is pinned at `STATIC_OPACITY`.
 */
export function SkeletonGroup({ children }: { children: React.ReactNode }): React.JSX.Element {
    const reduceMotion = useReduceMotion();
    // Pinned at the mid-point when not animating, so the shapes read as neutral
    // placeholders rather than as "off" content.
    const progress = useRef(new Animated.Value(reduceMotion ? STATIC_OPACITY : DIM_OPACITY)).current;

    useEffect(() => {
        if (reduceMotion) {
            progress.setValue(STATIC_OPACITY);
            return;
        }

        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(progress, {
                    toValue: BRIGHT_OPACITY,
                    duration: SHIMMER_DURATION,
                    easing: Easing.inOut(Easing.ease),
                    // Mandatory: keeps the loop off the JS thread entirely.
                    useNativeDriver: true,
                }),
                Animated.timing(progress, {
                    toValue: DIM_OPACITY,
                    duration: SHIMMER_DURATION,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ]),
        );

        loop.start();

        return () => {
            loop.stop();
        };
    }, [progress, reduceMotion]);

    const value = useMemo(() => ({ progress }), [progress]);

    return <ShimmerContext.Provider value={value}>{children}</ShimmerContext.Provider>;
}

/** The animated opacity every shape applies. Falls back to static when ungrouped. */
function useShimmerStyle(): Animated.WithAnimatedValue<ViewStyle> | ViewStyle {
    const shimmer = useContext(ShimmerContext);
    const reduceMotion = useReduceMotion();

    if (shimmer === null) {
        return { opacity: STATIC_OPACITY };
    }

    if (reduceMotion) {
        return { opacity: STATIC_OPACITY };
    }

    return { opacity: shimmer.progress };
}

/* ------------------------------------------------------------------ *
 * Shape vocabulary
 * ------------------------------------------------------------------ */

type SkeletonShapeProps = {
    width?: number | `${number}%`;
    height?: number;
    radius?: number;
    style?: ViewStyle;
};

/**
 * Rectangle — body copy, titles, labels, input fields.
 *
 * Height should be the **real variant's line height**, not its font size: a
 * `body` line is 22pt tall, and using 15pt makes the placeholder shorter than the
 * content it replaces, reintroducing the very jump the skeleton exists to remove.
 */
export function SkeletonRect({ width = '100%', height, radius, style }: SkeletonShapeProps) {
    const theme = useTheme();
    const shimmerStyle = useShimmerStyle();

    return (
        <Animated.View
            // A skeleton is a shape, not content: no text inside it, and nothing
            // for a screen reader to read.
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            // Taps must fall through rather than being swallowed by the overlay.
            pointerEvents="none"
            style={[
                {
                    width,
                    height,
                    borderRadius: radius ?? radiusRoles.micro.xs,
                    backgroundColor: theme.colors.skeleton,
                },
                shimmerStyle,
                style,
            ]}
        />
    );
}

/**
 * Pill — status badges, filter chips, buttons.
 *
 * Defaults to the real [`StatusBadge`](src/components/StatusBadge/StatusBadge.tsx:1)
 * height (`lineHeight.xs + spacing.xxs × 2`), so a placeholder badge and a real
 * badge occupy identical space.
 */
export function SkeletonPill({ width = 72, style }: Pick<SkeletonShapeProps, 'width' | 'style'>) {
    const theme = useTheme();
    const shimmerStyle = useShimmerStyle();

    return (
        <Animated.View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[
                {
                    width,
                    height: theme.typography.lineHeight.xs + spacing.xxs * 2,
                    borderRadius: radiusRoles.pill.full,
                    backgroundColor: theme.colors.skeleton,
                },
                shimmerStyle,
                style,
            ]}
        />
    );
}

/**
 * Circle — avatars, icon slots, tab glyphs.
 *
 * A single `size` drives **both** width and height, so the box is always square
 * and the shape is always round. This is the same squaring rule the icon atom
 * uses, and it is why no corner-offset hack is needed to centre one.
 */
export function SkeletonCircle({ size = 40, style }: { size?: number; style?: ViewStyle }) {
    const theme = useTheme();
    const shimmerStyle = useShimmerStyle();

    return (
        <Animated.View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[
                {
                    width: size,
                    height: size,
                    borderRadius: radiusRoles.pill.full,
                    backgroundColor: theme.colors.skeleton,
                },
                shimmerStyle,
                style,
            ]}
        />
    );
}

/**
 * A block of `lines` text lines at the real line height.
 *
 * The final line is shorter (60%) because uniform full-width bars read as a table
 * rather than as prose.
 */
export function SkeletonText({
    lines = 1,
    lineHeight: lineHeightOverride,
    lastLineWidth = '60%',
    gap = spacing.xxs,
    style,
}: {
    lines?: number;
    /** Defaults to the `body` line height (22pt). */
    lineHeight?: number;
    lastLineWidth?: number | `${number}%`;
    gap?: number;
    style?: ViewStyle;
}) {
    const theme = useTheme();
    const resolvedLineHeight = lineHeightOverride ?? theme.typography.lineHeight.md;

    return (
        <View style={[{ gap }, style]} accessible={false} importantForAccessibility="no-hide-descendants">
            {Array.from({ length: lines }).map((_, index) => (
                <SkeletonRect
                    key={index}
                    width={index === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
                    height={resolvedLineHeight}
                />
            ))}
        </View>
    );
}

export const skeletonStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
});
