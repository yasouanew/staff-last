import { StyleSheet, View, type ViewStyle } from 'react-native';

import { radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { AppText } from '../AppText/AppText';

/**
 * Semantic tint container.
 *
 * One component owns the "tint a surface by state" decision so that a locked
 * account banner, a shift's status hero and a future approval banner all resolve
 * to the same token pair. Re-deriving `warningSoft` / `warningStrong` at each call
 * site is how one screen ends up amber-text-on-amber and another amber-text-on-
 * white.
 *
 * ## Why the title is mandatory (V10)
 *
 * The tint *is* the state, and a tint is invisible in greyscale and to a
 * colour-blind reader. So the word is required and the colour is the reinforcement,
 * never the message. This is the same rule [`StatusBadge`](src/components/StatusBadge/StatusBadge.tsx:1)
 * follows, applied to a full-width surface.
 *
 * ## Tone table
 *
 * The soft/strong pairs come from Phase 1 and are contrast-checked in both schemes,
 * which is why there is no light/dark branch here:
 *
 * | tone | fill | text | border |
 * |------|------|------|--------|
 * | `info` | `infoSoft` | `infoStrong` | `primaryBorder` |
 * | `success` | `successSoft` | `successStrong` | `success` |
 * | `warning` | `warningSoft` | `warningStrong` | `warning` |
 * | `danger` | `dangerSoft` | `dangerStrong` | `danger` |
 * | `neutral` | `surfaceMuted` | `textSecondary` | `border` |
 */
export type StatusScaffoldTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type StatusScaffoldProps = {
    tone: StatusScaffoldTone;
    /** The state in words. Required — the tint is never the only signal. */
    title: string;
    /** One sentence explaining what the state means for the user. */
    description?: string;
    /** Trailing slot — typically a `StatusBadge` or an icon. */
    trailing?: React.ReactNode;
    /** Extra content inside the tinted area (a caption, a link, a button). */
    children?: React.ReactNode;
    /**
     * Break out of the parent gutter so the strip runs edge-to-edge. Used by the
     * shift detail hero, which bleeds full-width under the top safe area.
     */
    fullBleed?: boolean;
    /** Horizontal padding. Defaults to the screen gutter. */
    gutter?: number;
    testID?: string;
    style?: ViewStyle;
};

export function StatusScaffold({
    tone,
    title,
    description,
    trailing,
    children,
    fullBleed = false,
    gutter,
    testID,
    style,
}: StatusScaffoldProps): React.JSX.Element {
    const theme = useTheme();

    const tones: Record<StatusScaffoldTone, { fill: string; text: string; border: string }> = {
        neutral: {
            fill: theme.colors.surfaceMuted,
            text: theme.colors.textSecondary,
            border: theme.colors.border,
        },
        info: {
            fill: theme.colors.infoSoft,
            text: theme.colors.infoStrong,
            border: theme.colors.primaryBorder,
        },
        success: {
            fill: theme.colors.successSoft,
            text: theme.colors.successStrong,
            border: theme.colors.success,
        },
        warning: {
            fill: theme.colors.warningSoft,
            text: theme.colors.warningStrong,
            border: theme.colors.warning,
        },
        danger: {
            fill: theme.colors.dangerSoft,
            text: theme.colors.dangerStrong,
            border: theme.colors.danger,
        },
    };

    const { fill, text, border } = tones[tone];
    const horizontalPadding = gutter ?? theme.screenGutter;

    return (
        <View
            testID={testID}
            style={{
                ...styles.root,
                backgroundColor: fill,
                borderColor: border,
                paddingHorizontal: horizontalPadding,
                // A full-bleed strip cancels the parent gutter with a negative
                // margin so the tint reaches the screen edge while its *content*
                // stays aligned to the 16pt rule.
                marginHorizontal: fullBleed ? -horizontalPadding : 0,
                ...style,
            }}>
            <View style={{ gap: spacing.xs }}>
                <View style={[styles.heading, { gap: spacing.sm }]}>
                    <AppText variant="bodyStrong" style={{ color: text }}>
                        {title}
                    </AppText>
                    {trailing !== undefined ? trailing : null}
                </View>

                {description !== undefined ? (
                    <AppText variant="body" style={{ color: text }}>
                        {description}
                    </AppText>
                ) : null}

                {children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        borderWidth: 1,
        borderRadius: radiusRoles.macro.md,
        paddingVertical: spacing.md,
        width: '100%',
    },
    heading: {
        alignItems: 'center',
        flexDirection: 'row',
    },
});
