import { StyleSheet, View } from 'react-native';

import type { Colors } from '../../theme/colors';
import { radiusRoles } from '../../theme/radius';
import { useTheme } from '../../theme/useTheme';
import { AppIcon, type IconComponent } from '../AppIcon/AppIcon';
import { AlertTriangleGlyph, ClockGlyph } from '../AppIcon/glyphs';
import { AppText } from '../AppText/AppText';

/**
 * Form-level error panel.
 *
 * Used for failures that belong to **no single field** — a network drop, a 500, a
 * rate limit — as distinct from a 422, which is routed back onto its input by the
 * screen's error mapping. Field errors live in the input's reserved message band;
 * this panel is for everything else.
 *
 * ## Why it is a panel and not a line of text
 *
 * A bare red line above a submit button is easy to miss precisely when the user is
 * looking at the button. Wrapping it in a tinted surface with a leading glyph makes
 * it a distinct object in the visual hierarchy, so it is found on the first scan.
 *
 * ## Two tones
 *
 * - **`danger`** (default) — the attempt failed and retrying immediately is fine.
 * - **`throttled`** — the attempt failed because it *should not be retried yet*.
 *   Amber, a clock glyph, and copy that says so. Painting this the same red as a
 *   wrong password invites the user to mash the button and extend their own lockout.
 *
 * The panel is `accessibilityRole="alert"` with a polite live region so it is
 * announced when it appears, without stealing focus from the field being typed in.
 */

export type FormErrorPanelProps = {
    message: string;
    tone?: 'danger' | 'throttled';
    testID?: string;
};

type PanelTone = {
    background: keyof Colors;
    foreground: keyof Colors;
    icon: IconComponent;
};

const TONE_MAP: Record<NonNullable<FormErrorPanelProps['tone']>, PanelTone> = {
    danger: { background: 'dangerSoft', foreground: 'dangerStrong', icon: AlertTriangleGlyph },
    throttled: { background: 'warningSoft', foreground: 'warningStrong', icon: ClockGlyph },
};

export function FormErrorPanel({ message, tone = 'danger', testID }: FormErrorPanelProps) {
    const theme = useTheme();
    const resolved = TONE_MAP[tone];

    if (message.length === 0) {
        return null;
    }

    return (
        <View
            testID={testID}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[
                styles.panel,
                {
                    backgroundColor: theme.colors[resolved.background],
                    borderRadius: radiusRoles.micro.md,
                    padding: theme.spacing.sm,
                    gap: theme.spacing.xs,
                },
            ]}>
            <AppIcon icon={resolved.icon} size="small" color={resolved.foreground} />
            {/* `flexShrink: 1` lets the copy wrap to a second line while the glyph
                keeps its square box. The glyph never squashes. */}
            <AppText
                variant="label"
                numberOfLines={3}
                style={[styles.message, { color: theme.colors[resolved.foreground] }]}>
                {message}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    panel: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
    },
    message: {
        flexShrink: 1,
    },
});
