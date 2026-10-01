import { StyleSheet, View, type ViewStyle } from 'react-native';

import { radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { AppCard } from '../AppCard';
import { AppText } from '../AppText/AppText';
import { StatusBadge } from '../StatusBadge/StatusBadge';

/**
 * The "Today" summary hero.
 *
 * A single macro card that answers the two questions an employee opens the app to
 * ask: *how long have I worked today*, and *am I clocked in*. Everything else on
 * the Home screen is secondary to this, which is why it is the only element on the
 * screen allowed the `display` type size and a tinted brand fill.
 *
 * ## Why the value is split into two nodes
 *
 * `formatDuration` returns one string (`"8h 30m"`). Typesetting that whole string
 * at `display` size makes the minutes shout as loudly as the hours, and there is no
 * way to weight them differently inside one `<Text>` without nesting spans. So the
 * caller passes `hours` and `minutes` separately (via
 * [`formatDurationParts`](src/utils/date.ts:300)) and the hero sets the hours at
 * `display` and the remainder at `subtitle`, baseline-aligned in a row.
 *
 * The hours figure carries `fontVariant: ['tabular-nums']` so the block does not
 * reflow when the total crosses from 9 to 10.
 *
 * ## Non-scrolling
 *
 * This is a *non-scrolling macro container* in the sense that it is never inside a
 * nested scroller and never itself scrolls. On Home it is mounted as the
 * `ListHeaderComponent` of the shift feed, which is the one position that keeps it
 * above the feed without violating the no-list-inside-a-scroller rule.
 */
export type SummaryHeroCardProps = {
    /** Small label above the figure, e.g. `"Worked today"`. */
    eyebrow: string;
    /** Whole hours — the large figure. */
    hours: number;
    /** Leftover minutes rendered beside the figure. Omitted when zero. */
    minutes?: number;
    /** Raw status used to derive the pill's tone. */
    status?: string;
    /** Human label for the pill. Falls back to the humanised status. */
    statusLabel?: string;
    /** Supporting line under the figure, e.g. `"2 shifts today"`. */
    footnote?: string;
    testID?: string;
    style?: ViewStyle;
};

export function SummaryHeroCard({
    eyebrow,
    hours,
    minutes = 0,
    status,
    statusLabel,
    footnote,
    testID,
    style,
}: SummaryHeroCardProps): React.JSX.Element {
    const theme = useTheme();

    return (
        <AppCard
            testID={testID}
            elevated="medium"
            style={{
                ...styles.card,
                backgroundColor: theme.colors.primarySoft,
                borderColor: theme.colors.primaryBorder,
                borderRadius: radiusRoles.macro.lg,
                ...style,
            }}>
            <View style={{ gap: spacing.sm }}>
                <AppText variant="overline" style={{ color: theme.colors.textSecondary }}>
                    {eyebrow}
                </AppText>

                {/*
                 * `alignItems: 'flex-end'` with a small bottom margin on the unit
                 * approximates baseline alignment: the numeral's own descender
                 * space means true `baseline` alignment would float the unit.
                 */}
                <View
                    style={styles.figureRow}
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={
                        minutes > 0
                            ? `${hours} hours ${minutes} minutes ${eyebrow.toLowerCase()}`
                            : `${hours} hours ${eyebrow.toLowerCase()}`
                    }>
                    <AppText variant="display" style={{ color: theme.colors.primary }} accessible={false}>
                        {hours}
                    </AppText>
                    <AppText variant="headerMedium" style={{ color: theme.colors.primary }} accessible={false}>
                        h
                    </AppText>
                    {minutes > 0 ? (
                        <AppText
                            variant="subtitle"
                            style={{ color: theme.colors.textSecondary }}
                            accessible={false}>
                            {minutes}m
                        </AppText>
                    ) : null}
                </View>

                {status !== undefined ? (
                    <StatusBadge status={status} label={statusLabel} />
                ) : null}

                {footnote !== undefined ? (
                    <AppText variant="caption" style={{ color: theme.colors.textSecondary }}>
                        {footnote}
                    </AppText>
                ) : null}
            </View>
        </AppCard>
    );
}

const styles = StyleSheet.create({
    card: {
        // The hero owns its own border colour, so the hairline width is stated
        // here rather than inherited — `AppCard`'s default border is `border`.
        borderWidth: 1,
        width: '100%',
    },
    figureRow: {
        alignItems: 'flex-end',
        flexDirection: 'row',
        gap: spacing.xxs,
    },
});
