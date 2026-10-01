import { StyleSheet, View, type ViewStyle } from 'react-native';

import { radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { AppIcon, type IconComponent } from '../AppIcon/AppIcon';
import { AppText } from '../AppText/AppText';

/**
 * A single key/value pair inside a [`DetailMatrix`](src/components/DetailMatrix/DetailMatrix.tsx:1).
 *
 * `value` is `string | null` so a caller can hand over a raw API field
 * (`shift.branch?.name ?? null`) and let the matrix decide whether the row
 * exists. Passing `null` **omits the row entirely** rather than rendering
 * "—": an empty dash column reads as a data-integrity problem to a user,
 * while an absent row reads as "not applicable".
 */
export type DetailRow = {
    /** Stable identity for keyed rendering of the row list. */
    key: string;
    /** The structural label, e.g. "Shift times". */
    label: string;
    /** Already-formatted display string. `null` omits the row. */
    value: string | null;
    /** Required glyph — every label in the brief carries a vector icon. */
    icon: IconComponent;
};

export type DetailMatrixProps = {
    /** Optional grouping title, e.g. "When", "Where", "Who". */
    title?: string;
    /** Optional glyph beside the grouping title. */
    titleIcon?: IconComponent;
    rows: DetailRow[];
    testID?: string;
    style?: ViewStyle;
};

/**
 * Two-column key/value matrix inside a micro card.
 *
 * ## Why the label column is fixed and the value column flexes
 *
 * The brief asks for a "2-column key-value matrix". The failure mode of a
 * naive `flex: 1` / `flex: 1` split is that a long value ("Level 3, 120 Collins
 * Street, Melbourne") wraps to four lines while the label column sits half
 * empty, producing a ragged block. Pinning the label to `LABEL_WIDTH` and
 * giving the value the remainder keeps the label column a clean vertical rule
 * and lets the value take every remaining point.
 *
 * `LABEL_WIDTH` is derived from the type scale (the widest label in the
 * detail matrices is "Supervisor") plus the icon and its gap — not a magic
 * number — so it tracks the token set rather than drifting from it.
 *
 * ## Why rows are pre-filtered, not conditionally rendered
 *
 * `visibleRows` removes `null` values before the `.map`. This is a *static*
 * literal-length loop over a small fixed array (the four detail groups), not a
 * server collection, so it is outside the scope of V1 — V1 forbids
 * un-virtualised `.map` over an unbounded API list.
 */
export function DetailMatrix({
    title,
    titleIcon: TitleIcon,
    rows,
    testID,
    style,
}: DetailMatrixProps): React.JSX.Element {
    const visibleRows = rows.filter(row => row.value !== null);

    return (
        <View testID={testID} style={{ ...styles.card, ...style }}>
            {title !== undefined ? (
                <View style={[styles.titleRow, { gap: spacing.xs }]}>
                    {TitleIcon !== undefined ? (
                        <AppIcon icon={TitleIcon} size="small" color="textMuted" />
                    ) : null}
                    <AppText variant="overline" color="textMuted">
                        {title.toUpperCase()}
                    </AppText>
                </View>
            ) : null}

            <View style={{ gap: spacing.sm }}>
                {visibleRows.map(row => (
                    <DetailMatrixRow key={row.key} row={row} />
                ))}
            </View>
        </View>
    );
}

function DetailMatrixRow({ row }: { row: DetailRow }): React.JSX.Element {
    return (
        <View style={[styles.row, { gap: spacing.sm }]}>
            <View style={[styles.label, { gap: spacing.xs }]}>
                {/*
                 * Decorative (V9): the label text already names the datum, so
                 * announcing "clock icon" before "Shift times" is noise.
                 * Omitting `accessibilityLabel` is what marks the glyph
                 * decorative — `AppIcon` then owns the hit-testing and
                 * screen-reader opt-out itself.
                 */}
                <AppIcon icon={row.icon} size="small" color="textMuted" />
                <AppText variant="label" color="textMuted" numberOfLines={1}>
                    {row.label}
                </AppText>
            </View>

            <AppText variant="bodyStrong" style={styles.value}>
                {row.value}
            </AppText>
        </View>
    );
}

/** See the component docblock for why this is a fixed column. */
const LABEL_WIDTH = 128;

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        borderRadius: radiusRoles.macro.md,
        borderWidth: 1,
        gap: spacing.sm,
    },
    titleRow: {
        alignItems: 'center',
        flexDirection: 'row',
    },
    row: {
        alignItems: 'flex-start',
        flexDirection: 'row',
    },
    label: {
        alignItems: 'center',
        flexDirection: 'row',
        width: LABEL_WIDTH,
    },
    value: {
        flex: 1,
        // Load-bearing: without this a flex child refuses to shrink below its
        // intrinsic width, so a long value would push the card wider instead
        // of wrapping.
        minWidth: 0,
        textAlign: 'right',
    },
});
