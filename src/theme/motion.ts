import { Easing, type EasingFunction } from 'react-native';

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
 *  - `duration` / `easing` / `springs` are plain values, safe for React Native's
 *    built-in `Animated` API (used by the existing skeleton shimmer).
 *  - `springs` are also valid `withSpring` configs for Reanimated 4, which the
 *    upgraded components use for press feedback and sheet dismissal.
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
export const easing = {
    /** Symmetric ease-in-out. Default for state changes that stay on screen. */
    standard: Easing.bezier(0.2, 0, 0, 1) as EasingFunction,
    /** Entering the viewport — starts fast, settles. */
    decelerate: Easing.out(Easing.cubic) as EasingFunction,
    /** Leaving the viewport — starts slow, exits fast. */
    accelerate: Easing.in(Easing.cubic) as EasingFunction,
    /** Constant-velocity travel for looping shimmer. */
    linear: Easing.linear as EasingFunction,
} as const;

/* TEMP DIAGNOSTIC — validates the "easing is not a worklet" hypothesis.
 * Remove once the fix is verified. */
{
    const { Easing: ReanimatedEasing } = require('react-native-reanimated') as {
        Easing: typeof Easing;
    };
    const hasWorklet = (fn: unknown): boolean =>
        Boolean((fn as { __workletHash?: number } | null)?.__workletHash);
    // eslint-disable-next-line no-console
    console.log('[motion][diag] react-native easing worklet markers', {
        standard: hasWorklet(easing.standard),
        decelerate: hasWorklet(easing.decelerate),
        accelerate: hasWorklet(easing.accelerate),
        linear: hasWorklet(easing.linear),
    });
    // eslint-disable-next-line no-console
    console.log('[motion][diag] reanimated easing worklet markers', {
        decelerate: hasWorklet(ReanimatedEasing.out(ReanimatedEasing.cubic)),
        accelerate: hasWorklet(ReanimatedEasing.in(ReanimatedEasing.cubic)),
        linear: hasWorklet(ReanimatedEasing.linear),
    });
}

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
