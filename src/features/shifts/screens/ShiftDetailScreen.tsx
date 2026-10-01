import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppCard, Divider } from '../../../components/AppCard';
import {
    AppIcon,
    ArrowLeftGlyph,
    CalendarGlyph,
    ClockGlyph,
    MapPinGlyph,
    NoteGlyph,
    TagGlyph,
    UserGlyph,
} from '../../../components/AppIcon';
import { AppText } from '../../../components/AppText';
import { DetailMatrix } from '../../../components/DetailMatrix';
import type { DetailRow } from '../../../components/DetailMatrix';
import { ErrorView } from '../../../components/ErrorView';
import { SkeletonDetail } from '../../../components/Skeleton';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { StatusScaffold } from '../../../components/StatusScaffold';
import type { StatusScaffoldTone } from '../../../components/StatusScaffold';
import { spacing, useTheme } from '../../../theme';
import { radiusRoles } from '../../../theme/radius';
import type { AppError } from '../../../types/appError';
import {
    formatDate,
    formatDayMonth,
    formatDuration,
    formatTime,
    shiftDurationMinutes,
} from '../../../utils/date';
import type { ShiftStatus } from '../../../types/api';
import { useShiftDetail } from '../hooks';

/**
 * Shift detail params are declared inline rather than imported from the nav types
 * because the same screen is mounted in both the Home and Roster stacks, which declare
 * structurally identical params. Depending on one of them would make the screen
 * unusable from the other.
 */
type Props = {
    navigation: { goBack: () => void };
    route: { params: { shiftId: number } };
};

/**
 * Status → scaffold tone.
 *
 * Kept as an exhaustive `Record<ShiftStatus, ...>` rather than a chain of
 * ternaries so that adding a shift status to the API union becomes a compile
 * error here, instead of silently falling through to a neutral tint. The brief
 * asks for "light green for Approved, soft amber for Pending"; the app's status
 * vocabulary is scheduled / completed / cancelled / swap_requested, which map
 * onto the same semantic ladder.
 */
const STATUS_TONE: Record<ShiftStatus, StatusScaffoldTone> = {
    scheduled: 'info',
    completed: 'success',
    cancelled: 'danger',
    swap_requested: 'warning',
};

const STATUS_TITLE: Record<ShiftStatus, string> = {
    scheduled: 'Scheduled',
    completed: 'Completed',
    cancelled: 'Cancelled',
    swap_requested: 'Swap requested',
};

const STATUS_DESCRIPTION: Record<ShiftStatus, string> = {
    scheduled: 'This shift is confirmed and on your roster.',
    completed: 'This shift has finished.',
    cancelled: 'This shift was cancelled and no longer requires you.',
    swap_requested: 'A swap has been requested for this shift and is awaiting a decision.',
};

/**
 * Shift detail (spec Screen 6).
 *
 * Read-only detail loaded via `GET /shifts/{id}` (spec Screen 6 API 1), which eager
 * loads `company,branch,roster,employee,position,department`. Only the id travels
 * through navigation; the record is refetched here so a restored deep link or a
 * stale navigation payload cannot show outdated times.
 *
 * ## Layout architecture
 *
 * The screen is a fixed native container (`ScreenContainer scrollable={false}`)
 * holding a back row above a single scroller. There is no bottom bar: the scroller
 * owns the full remaining height.
 *
 * ## Why there is no action tray at all
 *
 * The brief described a tray with a primary "Clock In" or a secondary-danger
 * "Decline Shift", but no employee-facing transition endpoint exists — clock
 * in/out and decline are not exposed to the employee role, and `PUT shifts`
 * requires `shift.edit` (→ 403). Any such button would be *dead*: it would
 * render, accept a tap, and do nothing. Rather than shipping an inert control
 * (or a bar whose only value is a caption that duplicates the hero), the tray is
 * omitted entirely so the detail reads as a clean, fully scrollable record.
 */
export function ShiftDetailScreen({ navigation, route }: Props): React.JSX.Element {
    const theme = useTheme();
    const { shiftId } = route.params;
    const query = useShiftDetail(shiftId);

    const goBack = useCallback(() => navigation.goBack(), [navigation]);

    const minutes = query.data
        ? shiftDurationMinutes(
            query.data.start_time,
            query.data.end_time,
            query.data.break_minutes,
            query.data.paid_break,
        )
        : 0;

    /**
     * The three detail matrices.
     *
     * Rows with no value are filtered by `DetailMatrix` itself, so a null
     * supervisor or an absent note simply does not produce a row — it never
     * renders a blank or a dash. That is the brief's "group data logically"
     * applied honestly: a group shows what exists.
     */
    const groups = useMemo(() => {
        const shift = query.data;

        if (!shift) {
            return [];
        }

        const breakLabel =
            (shift.break_minutes ?? 0) > 0
                ? `${shift.break_minutes} min (${shift.paid_break ? 'paid' : 'unpaid'})`
                : null;

        const whenRows: DetailRow[] = [
            {
                key: 'date',
                label: 'Date',
                value: formatDate(shift.date, { withWeekday: true, long: true }),
                icon: CalendarGlyph,
            },
            {
                key: 'times',
                label: 'Shift times',
                value: `${formatTime(shift.start_time)} – ${formatTime(shift.end_time)}`,
                icon: ClockGlyph,
            },
            {
                key: 'duration',
                label: 'Duration',
                value: formatDuration(minutes),
                icon: ClockGlyph,
            },
            {
                key: 'break',
                label: 'Break',
                value: breakLabel,
                icon: ClockGlyph,
            },
        ];

        const whereRows: DetailRow[] = [
            {
                key: 'branch',
                label: 'Location',
                value: shift.branch?.name ?? null,
                icon: MapPinGlyph,
            },
            {
                key: 'address',
                label: 'Address',
                value: shift.branch?.address ?? null,
                icon: MapPinGlyph,
            },
            {
                key: 'company',
                label: 'Company',
                value: shift.company?.name ?? null,
                icon: TagGlyph,
            },
        ];

        const whoRows: DetailRow[] = [
            {
                key: 'employee',
                label: 'Employee',
                value: shift.employee?.full_name ?? null,
                icon: UserGlyph,
            },
            {
                key: 'position',
                label: 'Position',
                value: shift.position?.name ?? null,
                icon: TagGlyph,
            },
            {
                key: 'department',
                label: 'Department',
                value: shift.department?.name ?? null,
                icon: TagGlyph,
            },
            {
                key: 'roster',
                label: 'Roster week',
                value: shift.roster
                    ? `${formatDayMonth(shift.roster.week_start)} – ${formatDayMonth(
                        shift.roster.week_end,
                    )}`
                    : null,
                icon: CalendarGlyph,
            },
        ];

        const notesRows: DetailRow[] = [
            {
                key: 'notes',
                label: 'Notes',
                value: shift.notes?.trim() ? shift.notes.trim() : null,
                icon: NoteGlyph,
            },
        ];

        return [
            { title: 'When', icon: CalendarGlyph, rows: whenRows },
            { title: 'Where', icon: MapPinGlyph, rows: whereRows },
            { title: 'Who', icon: UserGlyph, rows: whoRows },
            { title: 'Notes', icon: NoteGlyph, rows: notesRows },
        ];
    }, [query.data, minutes]);

    if (query.isPending) {
        return (
            <ScreenContainer hasHeader>
                <BackRow onBack={goBack} title="Shift" />
                {/* A skeleton mirroring the record's geometry, not a spinner: the
                    hero strip and field matrix are already laid out, so the swap
                    to real data does not move anything. */}
                <SkeletonDetail />
            </ScreenContainer>
        );
    }

    if (query.isError || !query.data) {
        return (
            <ScreenContainer hasHeader>
                <BackRow onBack={goBack} title="Shift" />
                <ErrorView error={query.error as AppError} onRetry={() => void query.refetch()} />
            </ScreenContainer>
        );
    }

    const shift = query.data;

    return (
        <ScreenContainer hasHeader={false} scrollable={false}>
            <BackRow onBack={goBack} title={formatDate(shift.date)} />

            <ScrollView
                contentContainerStyle={[
                    styles.content,
                    { paddingHorizontal: theme.screenGutter },
                ]}
                showsVerticalScrollIndicator={false}>
                <StatusScaffold
                    tone={STATUS_TONE[shift.status]}
                    title={STATUS_TITLE[shift.status]}
                    description={STATUS_DESCRIPTION[shift.status]}
                    fullBleed
                    style={styles.hero}
                />

                <View style={{ gap: theme.spacing.md }}>
                    {groups.map(group => (
                        <AppCard key={group.title}>
                            <DetailMatrix
                                title={group.title}
                                titleIcon={group.icon}
                                rows={group.rows}
                            />
                        </AppCard>
                    ))}
                </View>

                <Divider />

                <AppText variant="caption" color="textMuted">
                    Shift #{shift.id}
                </AppText>
            </ScrollView>
        </ScreenContainer>
    );
}

/**
 * Back row.
 *
 * A local row rather than `AppHeader` because the detail screen's header is
 * transparent over the hero strip and carries only a back affordance — using
 * the full header would add a second title that duplicates the hero. The
 * button is a 44pt square holding an `ArrowLeftGlyph`, matching the auth flow's
 * back affordance for consistency.
 */
function BackRow({ onBack, title }: { onBack: () => void; title: string }): React.JSX.Element {
    const theme = useTheme();

    return (
        <View style={[styles.backRow, { paddingHorizontal: theme.screenGutter }]}>
            <BackButton onPress={onBack} />
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.backTitle}>
                {title}
            </AppText>
        </View>
    );
}

function BackButton({ onPress }: { onPress: () => void }): React.JSX.Element {
    return (
        <View
            accessible
            accessibilityRole="button"
            accessibilityLabel="Go back"
            // The whole 44pt box is the target; the glyph is decorative inside it.
            onStartShouldSetResponder={() => true}
            onResponderRelease={onPress}
            style={styles.backButton}>
            <AppIcon icon={ArrowLeftGlyph} size="medium" color="text" />
        </View>
    );
}

const styles = StyleSheet.create({
    content: {
        gap: spacing.md,
        paddingTop: spacing.md,
        // Breathing room at the end of the record now that no bar sits beneath
        // the scroller; the container already contributes the bottom safe-area
        // inset on its side of the boundary.
        paddingBottom: spacing.xl,
    },
    hero: {
        borderRadius: radiusRoles.macro.lg,
        // The strip bleeds edge-to-edge under the top safe area; `StatusScaffold`
        // handles the negative gutter, this just removes the corner radius.
        marginHorizontal: 0,
    },
    backRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: spacing.xs,
        // 56 (the chrome content band) rather than a hard-coded `layout.headerHeight`,
        // because this row is not the shared header — it is a local transparent row
        // whose height must satisfy the 44pt target with `spacing.sm` of breathing
        // room once the safe-area inset has been added by `ScreenContainer`.
        height: 56,
    },
    backButton: {
        alignItems: 'center',
        height: 44,
        justifyContent: 'center',
        marginLeft: -12,
        width: 44,
    },
    backTitle: {
        flex: 1,
        minWidth: 0,
    },
});
