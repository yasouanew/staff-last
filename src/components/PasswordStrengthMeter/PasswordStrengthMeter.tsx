import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import type { Colors } from '../../theme/colors';
import { radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { borderWidths } from '../../theme/sizing';
import { useTheme } from '../../theme/useTheme';
import { AppIcon, type IconComponent } from '../AppIcon/AppIcon';
import { ShieldAlertGlyph, ShieldCheckGlyph, ShieldHalfGlyph } from '../AppIcon/glyphs';
import { AppText } from '../AppText/AppText';
import { useReduceMotion } from '../Skeleton/Skeleton';

/**
 * Inline password-strength indicator.
 *
 * ## Why this is shaped like a badge
 *
 * It borrows the geometry of [`StatusBadge`](src/components/StatusBadge/StatusBadge.tsx:1) —
 * a single rounded-pill row containing a **micro icon** and a label — because the
 * meter sits directly beneath a text field and must read as a *caption on that
 * field*, not as another form control. A full-width bar reads as a second input; a
 * badge-shaped unit reads as an annotation, which is what it is.
 *
 * The "progress pill" is therefore a **fixed-width** track inside the badge, not a
 * percentage of the screen. A full-bleed bar would also make the three states
 * nearly indistinguishable at a glance on a wide phone, because a third of a very
 * wide bar is still a very wide bar.
 *
 * ## Three states
 *
 * The evaluator returns four levels (`weak | fair | good | strong`); this component
 * collapses them to the three the design specifies:
 *
 * | State | Evaluator levels | Colour | Fill | Icon |
 * |---|---|---|---|---|
 * | Weak | `weak`, `fair` | Danger red | 1/3 | shield + slash |
 * | Medium | `good` | Warning amber | 2/3 | shield + divider |
 * | Strong | `strong` | Success green | 3/3 | shield + check |
 *
 * Amber rather than red for Medium is deliberate: `good` is a password that passes
 * the policy but could be stronger, and painting a passing value red trains users
 * to distrust a value the server accepts.
 *
 * ## Non-colour signals
 *
 * Colour is never the only carrier (see the contrast requirements in the theme):
 * the state name is rendered as text, the icon changes shape, and the fill length
 * differs. A colour-blind user gets the same information from three other channels.
 *
 * Empty input renders nothing, but the parent is expected to reserve the slot — see
 * `STRENGTH_SLOT_HEIGHT` — so typing the first character cannot push the form down.
 */

export type PasswordStrengthState = 'weak' | 'medium' | 'strong';

export type PasswordStrengthMeterProps = {
    /** `0`–`4`, as returned by `evaluatePasswordStrength`. `0` renders nothing. */
    score: number;
    /**
     * The evaluator's human label (`"Weak" | "Fair" | "Good" | "Strong"`).
     *
     * Accepted for backwards compatibility but **not rendered**: the pill displays
     * the collapsed three-state name (`Weak` / `Medium` / `Strong`) so the copy
     * cannot disagree with the tone and fill, which are also derived from the
     * collapsed state. Passing the raw evaluator label is harmless.
     */
    label?: string;
    /** Advisory copy; rendered on the line *below* the pill when non-empty. */
    suggestions?: string[];
    /** Suppresses the text label inside the pill (the icon + fill still convey state). */
    showLabel?: boolean;
};

/**
 * Reserved height for the pill, in points.
 *
 * Exported so screens can hold the slot open whether or not the meter is rendering:
 *
 * ```tsx
 * <View style={{ height: STRENGTH_SLOT_HEIGHT, justifyContent: 'center' }}>
 *     <PasswordStrengthMeter score={score} label={label} />
 * </View>
 * ```
 *
 * `lineHeight.md (22)` + two `xxs` paddings (8) would be 30; 28 is the measured
 * height of the pill itself, so the slot neither clips nor floats.
 */
export const STRENGTH_SLOT_HEIGHT = 28;

/** Width of the progress track. Fixed by design — see the note above. */
const TRACK_WIDTH = 56;
const TRACK_HEIGHT = 6;

const FILL_RATIO: Record<PasswordStrengthState, number> = {
    weak: 1 / 3,
    medium: 2 / 3,
    strong: 1,
};

type Tone = {
    soft: keyof Colors;
    strong: keyof Colors;
    border: keyof Colors;
};

const TONE_BY_STATE: Record<PasswordStrengthState, Tone> = {
    weak: { soft: 'dangerSoft', strong: 'dangerStrong', border: 'danger' },
    medium: { soft: 'warningSoft', strong: 'warningStrong', border: 'warning' },
    strong: { soft: 'successSoft', strong: 'successStrong', border: 'success' },
};

const ICON_BY_STATE: Record<PasswordStrengthState, IconComponent> = {
    weak: ShieldAlertGlyph,
    medium: ShieldHalfGlyph,
    strong: ShieldCheckGlyph,
};

const LABEL_BY_STATE: Record<PasswordStrengthState, string> = {
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong',
};

/**
 * Collapses the evaluator's four levels onto the design's three states.
 *
 * `fair` is folded into `weak` rather than promoted to `medium` because the
 * evaluator only reaches `fair` (score 2) when either length or variety is
 * lacking — i.e. there is a concrete deficiency the user should still act on.
 */
export function toStrengthState(score: number): PasswordStrengthState {
    if (score >= 4) {
        return 'strong';
    }

    if (score === 3) {
        return 'medium';
    }

    return 'weak';
}

export function PasswordStrengthMeter({
    score,
    suggestions = [],
    showLabel = true,
}: PasswordStrengthMeterProps) {
    const theme = useTheme();
    const reduceMotion = useReduceMotion();

    const state = toStrengthState(score);
    const tone = TONE_BY_STATE[state];

    // `fill` is driven as an interpolation source so the change from 1/3 → 2/3 → 3/3
    // animates rather than snapping. Starts at 0 so the first appearance grows in.
    const fillRatio = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (score <= 0) {
            fillRatio.setValue(0);
            return;
        }

        const target = FILL_RATIO[state];

        if (reduceMotion) {
            // Set, not animated: the whole point of the setting is to avoid motion.
            fillRatio.setValue(target);
            return;
        }

        Animated.timing(fillRatio, {
            toValue: target,
            duration: 220,
            // `scaleX` is composited, so this stays on the UI thread. Animating
            // `width` would re-run layout every frame.
            useNativeDriver: true,
        }).start();
    }, [fillRatio, reduceMotion, score, state]);

    /**
     * Growing a centre-anchored `scaleX` from the left edge requires cancelling the
     * symmetric growth: the left edge moves right by `(1 - scale) * width / 2` as
     * the scale shrinks, so it is translated back by that amount.
     */
    const fillStyle = {
        transform: [
            {
                translateX: fillRatio.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-TRACK_WIDTH / 2, 0],
                }),
            },
            {
                scaleX: fillRatio.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                }),
            },
        ],
    };

    // Score 0 means "nothing typed". The parent holds the slot open.
    if (score <= 0) {
        return null;
    }

    const strongColor = theme.colors[tone.strong];

    return (
        <View style={styles.container}>
            <View
                accessibilityRole="progressbar"
                accessibilityLabel={`Password strength: ${LABEL_BY_STATE[state]}`}
                accessibilityValue={{ min: 1, max: 3, now: score >= 4 ? 3 : score === 3 ? 2 : 1 }}
                style={[
                    styles.pill,
                    {
                        backgroundColor: theme.colors[tone.soft],
                        borderColor: theme.colors[tone.border],
                        borderWidth: borderWidths.hairline,
                    },
                ]}>
                {/* Micro icon (12pt) — decorative; the pill carries the label. */}
                <AppIcon icon={ICON_BY_STATE[state]} size="micro" strokeWidth={2} />

                {/* The dynamic progress pill. */}
                <View
                    style={[
                        styles.track,
                        { backgroundColor: theme.colors.surfaceSunken },
                    ]}>
                    <Animated.View
                        style={[
                            styles.fill,
                            { backgroundColor: strongColor },
                            fillStyle,
                        ]}
                    />
                </View>

                {showLabel ? (
                    <AppText variant="label" numberOfLines={1} style={{ color: strongColor }}>
                        {LABEL_BY_STATE[state]}
                    </AppText>
                ) : null}
            </View>

            {suggestions.length > 0 ? (
                <AppText variant="label" color="textMuted" numberOfLines={1}>
                    {suggestions[0]}
                </AppText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: spacing.xxs,
        // A badge is only as wide as its content — it must not stretch to the
        // gutter, which would make it read as a section rule rather than a tag.
        alignItems: 'flex-start',
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        alignSelf: 'flex-start',
        paddingVertical: spacing.xxs,
        paddingHorizontal: spacing.xs,
        borderRadius: radiusRoles.pill.full,
        overflow: 'hidden',
    },
    // The unfilled rail.
    track: {
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: radiusRoles.pill.full,
        overflow: 'hidden',
        justifyContent: 'center',
    },
    fill: {
        width: '100%',
        height: '100%',
        borderRadius: radiusRoles.pill.full,
    },
});
