import { StyleSheet, View, type ViewStyle } from 'react-native';

import { statusLabel } from '../../i18n';
import {
    getStatusPill,
    statusPillSpec,
    useThemeTokens,
    type StatusPillColors,
} from '../../theme/tokens';
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

/*
 * The status→tone table now lives in [`getStatusPill`](src/theme/tokens.ts:1), so
 * there is exactly one place a status is mapped to a colour family. This component
 * only keeps the `tone` prop override, which lets a caller force a family when the
 * status string alone is ambiguous.
 *
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
    const tokens = useThemeTokens();
    const resolvedLabel = label ?? statusLabel(status);

    /**
     * Tone → the soft/solid pair. The `*Soft` fill with the solid foreground is
     * contrast-tuned in both schemes, so the same mapping is legible on light and
     * dark without a per-scheme branch here.
     *
     * The default path delegates to [`getStatusPill`](src/theme/tokens.ts:1), which
     * owns the status→tone table; the explicit `tone` prop is the only reason a
     * local map still exists, and it reads the same tokens.
     */
    const toneColors: Record<StatusBadgeTone, StatusPillColors> = {
        neutral: { bg: tokens.colors.surfaceMuted, fg: tokens.colors.inkSecondary },
        info: { bg: tokens.colors.infoSoft, fg: tokens.colors.info },
        success: { bg: tokens.colors.successSoft, fg: tokens.colors.success },
        warning: { bg: tokens.colors.warningSoft, fg: tokens.colors.warning },
        danger: { bg: tokens.colors.dangerSoft, fg: tokens.colors.danger },
    };

    const { bg, fg } =
        tone !== undefined ? toneColors[tone] : getStatusPill(status, tokens.colors);

    return (
        <View
            // A status change is meaningful content, so screen readers announce it.
            accessibilityRole="text"
            accessibilityLabel={resolvedLabel}
            style={[
                styles.badge,
                {
                    backgroundColor: bg,
                    // Geometry comes from the shared status-pill spec: height 28,
                    // horizontal padding 12, radius 999.
                    height: statusPillSpec.height,
                    borderRadius: statusPillSpec.radius,
                    paddingHorizontal: statusPillSpec.paddingHorizontal,
                },
                style,
            ]}>
            <AppText
                variant="micro"
                // The pill's height is pinned to the spec, so the label must not
                // grow past it.
                scaling="fixed"
                style={{ color: fg }}
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
