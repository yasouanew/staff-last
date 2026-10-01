import { useEffect, useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    View,
    useWindowDimensions,
    type LayoutChangeEvent,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HapticSemantic } from '../../theme/haptics';
import { duration, easing, springs } from '../../theme/motion';
import { componentRadius, radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import type { Colors } from '../../theme/colors';
import { AppButton, type AppButtonVariant } from '../AppButton/AppButton';
import { AppIcon, type IconComponent } from '../AppIcon/AppIcon';
import { AppText } from '../AppText/AppText';
import { useReduceMotion } from '../Skeleton/Skeleton';

/**
 * Fluid bottom sheet.
 *
 * Replaces the platform alert for anything that needs more than a sentence and
 * two buttons. It is a *container*, not a dialog: the caller composes the body
 * and the actions, and the sheet owns the motion, the scrim and the dismissal
 * affordances.
 *
 * ## Why this is not a `Modal` with a fade
 *
 * A sheet that only fades reads as a page; a sheet that *travels* reads as a
 * physical object the user pulled up and can push back down. Three things make
 * that legible:
 *
 *  1. **The sheet is draggable.** A `Gesture.Pan` drives a single shared
 *     `translateY`, so the finger and the surface are locked together — the sheet
 *     tracks the touch 1:1 rather than easing behind it. That 1:1 tracking is the
 *     whole illusion; anything else feels laggy.
 *  2. **Dismissal is judged on intent, not distance.** Releasing past 35% of the
 *     sheet's height *or* with a downward flick faster than the velocity
 *     threshold closes it. A short fast flick from halfway down is unambiguous
 *     intent, and requiring the full distance would ignore it.
 *  3. **The scrim is blurred, not just darkened.** [`BlurView`](https://github.com/Kureev/react-native-blur)
 *     behind the scrim is what separates the sheet from the page underneath
 *     without hiding it — the context stays visible, so the user never loses
 *     their place. The scrim itself fades with the sheet's progress, so the two
 *     move as one object.
 *
 * ## Exit animation without a mount leak
 *
 * `Modal` cannot animate its own removal, so the component keeps a local
 * `isMounted` flag that outlives `visible` by exactly one exit animation. The
 * sheet is unmounted from a Reanimated completion callback (`runOnJS`), never
 * from a timer, so a slow device cannot clip the animation.
 *
 * ## Accessibility
 *
 * `accessibilityViewIsModal` traps VoiceOver focus inside the sheet, and
 * `onAccessibilityEscape` (the two-finger Z scrub) routes to the same dismissal
 * path as the backdrop, so the sheet is dismissible without a swipe gesture.
 * When Reduce Motion is on, every entrance and exit *jumps* to its end state —
 * the sheet still appears and disappears, it just stops travelling.
 */

/** A single action rendered at the foot of the sheet. */
export type BottomSheetAction = {
    label: string;
    onPress: () => void;
    /** Defaults to `primary` for the first action and `secondary` for the rest. */
    variant?: AppButtonVariant;
    loading?: boolean;
    disabled?: boolean;
    /** Haptic pulse; defaults to the semantic implied by `variant`. */
    haptic?: HapticSemantic | false;
    testID?: string;
};

/** Tint applied to the optional leading glyph's disc. */
export type BottomSheetTone = 'primary' | 'danger' | 'success' | 'warning' | 'info';

export type BottomSheetProps = {
    visible: boolean;
    /** Called for every dismissal path: backdrop, swipe, back button, a11y escape. */
    onClose: () => void;
    title?: string;
    description?: string;
    /** Optional leading glyph, rendered in a soft tinted disc above the title. */
    icon?: IconComponent;
    tone?: BottomSheetTone;
    /** Arbitrary body content, rendered between the header and the actions. */
    children?: React.ReactNode;
    /** Buttons pinned to the foot of the sheet, in order. */
    actions?: BottomSheetAction[];
    /**
     * Whether the user may dismiss by tapping the backdrop or swiping down.
     * Set `false` for a sheet that must be resolved by one of its actions.
     */
    dismissible?: boolean;
    testID?: string;
};

/**
 * Fraction of the sheet's height a drag must exceed to dismiss on release.
 * A third is far enough that the user has visibly committed, and short enough
 * that a deliberate drag never snaps back.
 */
const DISMISS_DISTANCE_RATIO = 0.35;

/** Downward release velocity (pt/s) that dismisses regardless of distance. */
const DISMISS_VELOCITY = 900;

/**
 * The dismissal decision, extracted as a pure function.
 *
 * Kept out of the gesture callback so it can be unit-tested: this rule is the
 * part most likely to be "tuned" later, and a regression in it is invisible
 * until a user finds they cannot close a sheet. Reanimated's Babel plugin
 * workletises module-scope functions referenced from a worklet, so this can be
 * called directly from the pan handler.
 */
export function shouldDismissSheet(params: {
    /** How far the sheet has been dragged down at the moment of release. */
    travelled: number;
    /** The sheet's measured height — the yardstick for the distance rule. */
    sheetHeight: number;
    /** Release velocity in pt/s; positive is downward. */
    velocityY: number;
    /** A non-dismissible sheet ignores both rules. */
    dismissible: boolean;
}): boolean {
    if (!params.dismissible) {
        return false;
    }

    const pastDistance = params.travelled > params.sheetHeight * DISMISS_DISTANCE_RATIO;
    const isFlick = params.velocityY > DISMISS_VELOCITY;

    return pastDistance || isFlick;
}

/** Vertical travel (pt) before the pan claims the gesture, so taps still land. */
const PAN_ACTIVATION_OFFSET = 10;

const TONE_TOKENS: Record<BottomSheetTone, { fill: keyof Colors; ink: keyof Colors }> = {
    primary: { fill: 'primarySoft', ink: 'primary' },
    danger: { fill: 'dangerSoft', ink: 'danger' },
    success: { fill: 'successSoft', ink: 'success' },
    warning: { fill: 'warningSoft', ink: 'warning' },
    info: { fill: 'infoSoft', ink: 'info' },
};

const ICON_DISC_SIZE = 44;
const GRABBER_WIDTH = 36;
const GRABBER_HEIGHT = 4;

export function BottomSheet({
    visible,
    onClose,
    title,
    description,
    icon,
    tone = 'primary',
    children,
    actions,
    dismissible = true,
    testID,
}: BottomSheetProps): React.JSX.Element | null {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const reduceMotion = useReduceMotion();

    /**
     * Outlives `visible` by one exit animation. `Modal` has no removal
     * transition, so without this the sheet would vanish instead of leaving.
     */
    const [isMounted, setIsMounted] = useState(visible);
    /** Measured height of the sheet's own surface — the drag/dismiss yardstick. */
    const [sheetHeight, setSheetHeight] = useState(0);

    /**
     * Seeded off-screen rather than at 0 so the very first frame of the entrance
     * is already below the fold: the sheet can never flash in place before the
     * spring starts.
     */
    const translateY = useSharedValue(windowHeight);
    /** 0 → fully transparent scrim, 1 → fully painted. */
    const scrim = useSharedValue(0);
    /** `translateY` captured at gesture start, so the drag is relative. */
    const dragStart = useSharedValue(0);

    useEffect(() => {
        if (visible) {
            setIsMounted(true);
            return;
        }

        if (!isMounted) {
            return;
        }

        const unmount = (): void => setIsMounted(false);
        const exitDistance = sheetHeight > 0 ? sheetHeight : windowHeight;

        translateY.value = reduceMotion
            ? exitDistance
            : withTiming(exitDistance, { duration: duration.fast, easing: easing.accelerate }, finished => {
                if (finished) {
                    runOnJS(unmount)();
                }
            });
        scrim.value = reduceMotion ? 0 : withTiming(0, { duration: duration.fast });
        // `isMounted` is deliberately excluded: this effect is keyed on the
        // `visible` edge, and reading the flag (rather than depending on it)
        // avoids re-running the exit animation when the unmount lands.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    useEffect(() => {
        if (!isMounted || !visible) {
            return;
        }

        // TEMP DIAGNOSTIC — confirms the exact easing object handed to Reanimated.
        // eslint-disable-next-line no-console
        console.log('[BottomSheet][diag] entrance easing.decelerate', {
            isWorklet: Boolean((easing.decelerate as { __workletHash?: number }).__workletHash),
            keys: Object.keys(easing.decelerate ?? {}),
        });

        translateY.value = reduceMotion ? 0 : withSpring(0, springs.gentle);
        scrim.value = reduceMotion
            ? 1
            : withTiming(1, { duration: duration.normal, easing: easing.decelerate });
        // Re-runs when the sheet is measured so the entrance always starts from a
        // known off-screen origin, even on the first paint.
    }, [isMounted, visible, sheetHeight, reduceMotion, scrim, translateY]);

    const handleLayout = (event: LayoutChangeEvent): void => {
        setSheetHeight(event.nativeEvent.layout.height);
    };

    const panGesture = useMemo(
        () =>
            Gesture.Pan()
                // Only claim the gesture once the finger has actually travelled, so
                // a tap on an action is never swallowed by the sheet's drag.
                .activeOffsetY(PAN_ACTIVATION_OFFSET)
                .onStart(() => {
                    dragStart.value = translateY.value;
                })
                .onUpdate(event => {
                    const next = dragStart.value + event.translationY;
                    // Clamped at 0: the sheet may be pushed down but never dragged
                    // above its resting position.
                    translateY.value = next > 0 ? next : 0;
                })
                .onEnd(event => {
                    const shouldDismiss = shouldDismissSheet({
                        travelled: translateY.value,
                        sheetHeight,
                        velocityY: event.velocityY,
                        dismissible,
                    });

                    if (shouldDismiss) {
                        const leave = (): void => onClose();
                        translateY.value = reduceMotion
                            ? sheetHeight
                            : withSpring(sheetHeight, springs.dismiss, finished => {
                                if (finished) {
                                    runOnJS(leave)();
                                }
                            });
                        scrim.value = reduceMotion ? 0 : withTiming(0, { duration: duration.fast });
                        return;
                    }

                    // Snap back — the release did not carry enough intent.
                    translateY.value = reduceMotion ? 0 : withSpring(0, springs.gentle);
                }),
        [dismissible, onClose, reduceMotion, sheetHeight, dragStart, scrim, translateY],
    );

    const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

    const surfaceStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    if (!isMounted) {
        return null;
    }

    const toneTokens = TONE_TOKENS[tone];
    const hasActions = actions !== undefined && actions.length > 0;

    return (
        <Modal
            visible={isMounted}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={() => {
                if (dismissible) {
                    onClose();
                }
            }}>
            {/**
             * A `Modal` is its own native root, so the gesture handler runtime
             * must be re-established inside it — the app-level
             * `GestureHandlerRootView` does not reach across the modal boundary.
             */}
            <GestureHandlerRootView style={styles.root}>
                <View style={styles.root} testID={testID}>
                    {/**
                     * Blurred scrim. The blur is static (it cannot animate) and the
                     * fade is carried by the translucent layer above it, which is
                     * what keeps the two in sync with the sheet's motion.
                     */}
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        <BlurView
                            style={StyleSheet.absoluteFill}
                            blurType={theme.isDark ? 'dark' : 'light'}
                            blurAmount={16}
                            reducedTransparencyFallbackColor={theme.colors.overlay}
                        />
                        <Animated.View
                            style={[
                                StyleSheet.absoluteFill,
                                { backgroundColor: theme.colors.overlay },
                                scrimStyle,
                            ]}
                        />
                    </View>

                    <Pressable
                        style={styles.backdrop}
                        accessible={false}
                        onPress={dismissible ? onClose : undefined}
                        accessibilityLabel={dismissible ? 'Dismiss' : undefined}
                    />

                    <Animated.View
                        accessibilityViewIsModal
                        onAccessibilityEscape={dismissible ? onClose : undefined}
                        onLayout={handleLayout}
                        style={[
                            styles.surface,
                            {
                                backgroundColor: theme.colors.surface,
                                borderTopLeftRadius: componentRadius.bottomSheet,
                                borderTopRightRadius: componentRadius.bottomSheet,
                                paddingBottom: Math.max(insets.bottom, spacing.md),
                                maxWidth: theme.sizing.layout.maxContentWidth,
                                // A hairline top edge stops a light sheet from melting
                                // into a light page once the scrim has faded out.
                                borderTopWidth: StyleSheet.hairlineWidth,
                                borderColor: theme.isDark
                                    ? theme.darkElevation.ring
                                    : theme.colors.hairline,
                            },
                            theme.shadows.high,
                            surfaceStyle,
                        ]}>
                        <GestureDetector gesture={panGesture}>
                            <View>
                                {/* Drag affordance — signals "this moves" without a label. */}
                                <View style={styles.grabberBand}>
                                    <View
                                        style={[
                                            styles.grabber,
                                            { backgroundColor: theme.colors.borderStrong },
                                        ]}
                                    />
                                </View>

                                {icon !== undefined ? (
                                    <View
                                        style={[
                                            styles.iconDisc,
                                            { backgroundColor: theme.colors[toneTokens.fill] },
                                        ]}>
                                        <AppIcon
                                            icon={icon}
                                            size="medium"
                                            color={toneTokens.ink}
                                            strokeWidth={2}
                                        />
                                    </View>
                                ) : null}

                                {title !== undefined ? (
                                    <AppText
                                        variant="subtitle"
                                        color="text"
                                        style={styles.title}
                                        accessibilityRole="header">
                                        {title}
                                    </AppText>
                                ) : null}

                                {description !== undefined ? (
                                    <AppText
                                        variant="body"
                                        color="textSecondary"
                                        style={styles.description}>
                                        {description}
                                    </AppText>
                                ) : null}
                            </View>
                        </GestureDetector>

                        {children !== undefined ? <View style={styles.body}>{children}</View> : null}

                        {hasActions ? (
                            <View style={styles.actions}>
                                {actions.map((action, index) => (
                                    <AppButton
                                        key={action.label}
                                        label={action.label}
                                        onPress={action.onPress}
                                        // The first action is the sheet's primary
                                        // intent; the rest default to secondary so
                                        // the hierarchy is never flat.
                                        variant={
                                            action.variant ?? (index === 0 ? 'primary' : 'secondary')
                                        }
                                        loading={action.loading}
                                        disabled={action.disabled}
                                        haptic={action.haptic}
                                        testID={action.testID}
                                    />
                                ))}
                            </View>
                        ) : null}
                    </Animated.View>
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    surface: {
        marginTop: 'auto',
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: spacing.lg,
    },
    grabberBand: {
        alignItems: 'center',
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
    },
    grabber: {
        width: GRABBER_WIDTH,
        height: GRABBER_HEIGHT,
        borderRadius: componentRadius.sheetHandle,
    },
    iconDisc: {
        width: ICON_DISC_SIZE,
        height: ICON_DISC_SIZE,
        borderRadius: radiusRoles.pill.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.md,
    },
    title: {
        textAlign: 'center',
    },
    description: {
        textAlign: 'center',
        marginTop: spacing.xxs,
    },
    body: {
        marginTop: spacing.md,
    },
    actions: {
        marginTop: spacing.xl,
        gap: spacing.sm,
    },
});
