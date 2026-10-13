import {
    Easing,
    type EasingFunction,
    type EasingFunctionFactory,
} from 'react-native-reanimated';

/**
 * Motion tokens.
 *
 * Why a token file instead of inline numbers
 * ------------------------------------------
 * The failure mode for animation is not "the wrong easing", it is *inconsistency*
 * — a button that springs in 180ms next to a sheet that eases in 350ms reads as
 * two different apps. Naming the durations and curves once means every
 * micro-interaction in the product moves on the same clock.
 *
 * Two families are exported because the codebase uses two animation runtimes:
 *
 *  - `duration` is a plain value, safe for React Native's built-in `Animated`
 *    API (used by the existing skeleton shimmer).
 *  - `easing` and `springs` are Reanimated 4 configs, consumed by `withTiming`
 *    and `withSpring` for press feedback and sheet motion.
 *
 * `easing` is built from **Reanimated's** `Easing`, not React Native's. Reanimated
 * 4 runs `withTiming` on the UI thread and asserts that the easing it is handed
 * is a worklet; React Native's `Easing` functions are not, so passing one throws
 * "[Reanimated] The easing function is not a worklet" the moment the animation
 * starts. Reanimated's own `Easing` is workletised, so the curves must come from
 * there.
 *
 * Everything here is scheme-independent and respects reduced-motion: consumers
 * are expected to short-circuit to `duration.instant` when
 * [`useReduceMotion`](src/components/Skeleton/Skeleton.tsx:65) reports the OS
 * preference, so the tokens describe the *full-motion* intent only.
 */

/** Duration scale, in milliseconds. */
export const duration = {
    /** 0 — the reduced-motion escape hatch; an instant state change. */
    none: 0,
    /** 80 — colour/opacity swaps that should feel immediate (press tint). */
    instant: 80,
    /** 140 — small positional nudges, chevron rotation, focus halo. */
    fast: 140,
    /** 220 — the default: press scale, tab indicator slide, fade. */
    normal: 220,
    /** 320 — larger travel: bottom-sheet entrance, skeleton cross-fade. */
    slow: 320,
    /** 480 — full-surface transitions (screen-level reveals). */
    slower: 480,
} as const;

/**
 * Easing curves.
 *
 * `standard` is a gentle ease-in-out that matches the platform feel on both iOS
 * and Android; the material-style curves are provided for directional motion
 * (something entering vs. leaving the viewport).
 */
export const easing: {
    /** `bezier` returns a factory, which `withTiming` also accepts. */
    standard: EasingFunctionFactory;
    decelerate: EasingFunction;
    accelerate: EasingFunction;
    linear: EasingFunction;
} = {
    /** Symmetric ease-in-out. Default for state changes that stay on screen. */
    standard: Easing.bezier(0.2, 0, 0, 1),
    /** Entering the viewport — starts fast, settles. */
    decelerate: Easing.out(Easing.cubic),
    /** Leaving the viewport — starts slow, exits fast. */
    accelerate: Easing.in(Easing.cubic),
    /** Constant-velocity travel for looping shimmer. */
    linear: Easing.linear,
};

/**
 * Spring configurations for Reanimated.
 *
 * `snappy` is tuned for sub-100ms press feedback: high stiffness and near-critical
 * damping so the scale settles without a visible bounce (a bouncing button reads
 * as a toy). `gentle` is for surfaces with real travel, where a little overshoot
 * communicates physicality.
 */
export const springs = {
    /** Press feedback — fast, no perceptible overshoot. */
    snappy: { damping: 20, stiffness: 320, mass: 0.7 },
    /** Sheet/panel travel — a touch of overshoot for weight. */
    gentle: { damping: 22, stiffness: 180, mass: 1 },
    /** Momentum-driven dismissal, where the gesture supplies the velocity. */
    dismiss: { damping: 26, stiffness: 260, mass: 0.9 },
} as const;

/**
 * Scale deltas for press micro-interactions.
 *
 * Kept as tokens so a button, a card and a tab all compress by the same amount —
 * the eye notices mismatched press depths far more than it notices the absolute
 * value.
 */
export const pressScale = {
    /** Cards and large surfaces — a barely-there compression. */
    card: 0.99,
    /** Buttons and tappable rows. */
    button: 0.97,
    /** Icon buttons and small controls, which can afford more travel. */
    icon: 0.92,
} as const;

export const motion = {
    duration,
    easing,
    springs,
    pressScale,
} as const;

export type Motion = typeof motion;
export type DurationToken = keyof typeof duration;
export type EasingToken = keyof typeof easing;
export type SpringToken = keyof typeof springs;
