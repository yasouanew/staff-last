import { StyleSheet, View, type ViewStyle } from 'react-native';

import { statusLabel } from '../../i18n';
import { spacing } from '../../theme/spacing';
import { lineHeight } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';
import { AppText } from '../AppText/AppText';

/**
 * Status pill.
 *
 * Maps the API's enum values directly to a colour + label, so callers pass the raw
 * status string and never invent their own palette:
 *
 * - shift: `scheduled | completed | cancelled | swap_requested`
 * - leave request: `pending | approved | rejected`
 * - roster: `draft | published`
 *
 * Three Phase 2 constraints shape it:
 *
 *  1. **Maximum roundness.** The shape is a stadium (pill), not a rounded
 *     rectangle; the radius is the `pill.full` sentinel so the ends are true
 *     semicircles at every type size.
 *  2. **Locked to one line with explicit bounds.** A status word is a single
 *     atomic fact. It must never wrap (which turns the pill into a lozenge) and
 *     never clip (which shows half a glyph) — so the text is `numberOfLines={1}`
 *     with an ellipsis tail, and the height is derived from tokens rather than
 *     from content.
 *  3. **Never colour-only.** The word itself is always present, so the badge is
 *     still readable in greyscale and by a screen reader.
 *
 * Unknown values fall back to a neutral grey badge rather than rendering nothing —
 * if the backend adds a status, the UI degrades gracefully instead of leaving a
 * blank space.
 */
export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type StatusBadgeProps = {
    status: string;
    /** Overrides the derived label (defaults to the humanised status). */
    label?: string;
    tone?: StatusBadgeTone;
    style?: ViewStyle;
};

const STATUS_TONES: Record<string, StatusBadgeTone> = {
    // shifts
    scheduled: 'info',
    completed: 'success',
    cancelled: 'danger',
    swap_requested: 'warning',
    // leave requests
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    // rosters
    draft: 'neutral',
    published: 'success',
    // users
    active: 'success',
    inactive: 'neutral',
};

/*
 * The label vocabulary lives in the i18n catalogue, not in a private map here. Two
 * reasons: the same words are announced by screen readers and rendered by other
 * components (`AvailabilityScreen`'s summary, the leave session labels), so a local
 * copy is one more place they can drift; and a translated build must be able to
 * change them.
 *
 * `statusLabel` owns the unknown-value fallback — a status the backend adds renders
 * as a readable title-cased word rather than an empty pill.
 */

export function StatusBadge({ status, label, tone, style }: StatusBadgeProps) {
    const theme = useTheme();
    const resolvedTone = tone ?? STATUS_TONES[status] ?? 'neutral';
    const resolvedLabel = label ?? statusLabel(status);

    /**
     * Tone → the Phase 1 soft/strong pair. The `*Soft` fill with the `*Strong`
     * foreground is contrast-tuned in both schemes, so the same mapping is legible
     * on light and dark without a per-scheme branch here.
     */
    const toneColors: Record<StatusBadgeTone, { background: string; text: string }> = {
        neutral: { background: theme.colors.surfaceMuted, text: theme.colors.textSecondary },
        info: { background: theme.colors.infoSoft, text: theme.colors.infoStrong },
        success: { background: theme.colors.successSoft, text: theme.colors.successStrong },
        warning: { background: theme.colors.warningSoft, text: theme.colors.warningStrong },
        danger: { background: theme.colors.dangerSoft, text: theme.colors.dangerStrong },
    };

    const { background, text } = toneColors[resolvedTone];

    return (
        <View
            // A status change is meaningful content, so screen readers announce it.
            accessibilityRole="text"
            accessibilityLabel={resolvedLabel}
            style={[
                styles.badge,
                {
                    backgroundColor: background,
                    borderRadius: theme.radius.full,
                    paddingHorizontal: spacing.xs,
                    paddingVertical: spacing.xxs,
                    // The height floor is tokens-only: one caption line plus the
                    // vertical padding. A pill can therefore never collapse below
                    // its own curve, however short the word is.
                    minHeight: lineHeight.xs + spacing.xxs * 2,
                },
                style,
            ]}>
            <AppText
                variant="label"
                // The pill's height is derived from the caption line plus its
                // padding, so the label must not grow past that.
                scaling="fixed"
                style={{ color: text }}
                numberOfLines={1}
                ellipsizeMode="tail">
                {resolvedLabel}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        // Hugs its content; a stretched badge would look like a banner.
        alignSelf: 'flex-start',
        alignItems: 'center',
        justifyContent: 'center',
        // With `numberOfLines={1}` the label ellipsises at the parent's edge
        // rather than overflowing it.
        maxWidth: '100%',
    },
});
