import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme/useTheme';
import { AppText } from '../AppText/AppText';
import { StatusBadge } from '../StatusBadge/StatusBadge';

/**
 * Bento stat card — the "Worked today" tile on the Home dashboard.
 *
 * ## Why a dedicated component
 *
 * The dashboard's headline figure is a *stat*, not a hero banner: a label, one
 * large number with its unit, a status pill and a supporting line. That shape
 * recurs (hours worked, leave balance, shifts this week), so it lives here as a
 * reusable tile rather than as inline JSX in the screen. The screen then reads as
 * a composition of named surfaces, which is the whole point of the Bento layout.
 *
 * ## The figure is two nodes, not one string
 *
 * `formatDuration` returns `"8h 30m"`. Typesetting that whole string at 40pt makes
 * the minutes shout as loudly as the hours, and there is no way to weight them
 * differently inside one `<Text>` without nesting spans. So the caller passes the
 * hours and the unit separately and the card sets the number at 40/48 w700 and the
 * unit at 20/24 w600, baseline-aligned in a row. The number carries
 * `fontVariant: ['tabular-nums']` so the tile does not reflow when the total
 * crosses from 9 to 10.
 *
 * ## Status is never colour-only
 *
 * The pill renders the status *word* through [`StatusBadge`](src/components/StatusBadge/StatusBadge.tsx:1),
 * so the tile is still readable in greyscale and by a screen reader. The tone is
 * derived from the raw status enum by the shared status table, which is what fixes
 * the previous red/blue inconsistency: "Clocked in" is an `info` pill everywhere.
 */
export type BentoStatCardProps = {
    /** Micro uppercase eyebrow, e.g. `"WORKED TODAY"`. */
    label: string;
    /** The large figure — whole hours. */
    hours: number;
    /** Unit rendered beside the figure. Defaults to `"h"`. */
    unit?: string;
    /** Raw status enum used to derive the pill's tone. */
    status?: string;
    /** Human label for the pill. Falls back to the humanised status. */
    statusLabel?: string;
    /** Supporting line under the figure, e.g. `"1 shift scheduled."`. */
    subtext?: string;
    testID?: string;
    style?: ViewStyle;
};

export function BentoStatCard({
    label,
    hours,
    unit = 'h',
    status,
    statusLabel,
    subtext,
    testID,
    style,
}: BentoStatCardProps): React.JSX.Element {
    const theme = useTheme();
    const { colors, radius, shadows } = theme.tokens;

    return (
        <View
            testID={testID}
            style={[
                styles.card,
                {
                    backgroundColor: colors.surface,
                    borderRadius: radius.rXl,
                    padding: theme.spacing.lg,
                    ...shadows.shadowCard,
                },
                style,
            ]}>
            <AppText variant="micro" style={{ color: colors.inkTertiary }}>
                {label}
            </AppText>

            {/*
             * `alignItems: 'baseline'` is what makes the unit sit on the numeral's
             * baseline rather than on its line box — the difference between a
             * typeset figure and a number with a stray letter beside it.
             */}
            <View style={styles.figureRow}>
                <AppText style={[styles.hours, { color: colors.primary }]}>{hours}</AppText>
                <AppText style={[styles.unit, { color: colors.primary }]}>{unit}</AppText>
            </View>

            {status !== undefined ? <StatusBadge status={status} label={statusLabel} /> : null}

            {subtext !== undefined ? (
                <AppText variant="caption" style={{ color: colors.inkSecondary }}>
                    {subtext}
                </AppText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        gap: 12,
        width: '100%',
    },
    figureRow: {
        alignItems: 'baseline',
        flexDirection: 'row',
        gap: 4,
    },
    hours: {
        fontSize: 40,
        lineHeight: 48,
        fontWeight: '700',
        // Tabular figures so the tile does not reflow as the total changes.
        fontVariant: ['tabular-nums'],
    },
    unit: {
        fontSize: 20,
        lineHeight: 24,
        fontWeight: '600',
    },
});
