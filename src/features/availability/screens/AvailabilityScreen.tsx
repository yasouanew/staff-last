import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useEffect, useReducer, useRef } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppCard } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { AppText } from '../../../components/AppText';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorView } from '../../../components/ErrorView';
import { KeyboardAwareView } from '../../../components/KeyboardAwareView';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { SkeletonRows } from '../../../components/Skeleton';
import { availabilityCopy } from '../../../constants/copy';
import type { AppTabParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme/useTheme';
import { announceForAccessibility } from '../../../utils/accessibility';
import { getDayName } from '../../../utils/date';
import { toFieldErrorMap } from '../../../utils/errors';
import { DayRow, SaveBar, UnsavedBanner } from '../components';
import { useAvailability, useSyncWeeklyAvailability } from '../hooks';
import type { DayOfWeek } from '../../../utils/date';
import {
    availabilityReducer,
    buildSyncPayload,
    createAvailabilityState,
    isAvailabilityDirty,
    toWeekDrafts,
    validateSlotTime,
    type WeekDayDraft,
} from '../utils';

type Props = BottomTabScreenProps<AppTabParamList, 'AvailabilityTab'>;

/**
 * Space the scroller must leave for the sticky save bar.
 *
 * The bar is an absolute sibling of the scroller, not an overlay inside it, so the
 * scroller has to reserve the bar's height or the final day row would sit
 * permanently behind the button. Derived from the same tokens the bar uses (a 54pt
 * button, its 16pt paddings and the caption note) rather than measured, because a
 * measurement arrives one frame late and the gap would visibly snap on first paint.
 */
const SAVE_BAR_RESERVE = 54 + 16 + 16 + 26;

/**
 * The range a day is seeded with when it is switched on from the blank state.
 *
 * Sep 2026 - the common case is a single shift-day, and seeding a concrete
 * 09:00-17:00 means the day is immediately valid and saveable. "Available all
 * day" remains expressible (clear both times) and is what the backend treats a
 * range-less available day as.
 */
const DEFAULT_AVAILABILITY_START = '09:00';
const DEFAULT_AVAILABILITY_END = '17:00';

/**
 * My Availability — spec Screen 7.
 *
 * A 7-day settings list (Sun 0 – Sat 6 with `day_name`), per-day time range or
 * "Unavailable" toggle, Save-week via `PUT …/sync` (RECOMMENDED), loading / empty
 * / error, dirty-state guard, pull-to-refresh.
 *
 * ## Structure
 *
 * The seven days are a *single grouped container* with row children — the
 * platform-conventional settings-list shape — rather than seven floating cards.
 * The container owns the radius, the shadow and the hairline separators; each
 * [`DayRow`](src/features/availability/components/DayRow.tsx:1) owns only its own
 * content. That is what makes the group read as one surface instead of a stack of
 * boxes.
 *
 * ## State
 *
 * All screen state lives in one reducer
 * ([`availabilityReducer`](src/features/availability/utils/availabilityReducer.ts:1)),
 * so `isDirty` is derived from the data rather than tracked separately. The
 * unsaved banner and the save button's enabled state both read from that one
 * derivation and therefore cannot disagree.
 *
 * BACKEND GAP (BLOCKING): list requires `employee.view`, sync requires
 * `employee.update` — the employee role holds neither, so both 403 until the
 * backend grants scoped own-record access. A 403 is surfaced distinctly as
 * "Availability editing not enabled for your role — contact admin", never as a
 * retryable error.
 */
export function AvailabilityScreen(_props: Props): React.JSX.Element {
    const theme = useTheme();
    const query = useAvailability();
    const syncMutation = useSyncWeeklyAvailability();

    const [state, dispatch] = useReducer(availabilityReducer, undefined, () =>
        createAvailabilityState(toWeekDrafts(query.availability)),
    );

    /*
     * Re-seed the slice only when the *server week's values* change — the initial
     * load, a pull-to-refresh that returned different data, or the refetch after a
     * successful save.
     *
     * ## Why a value fingerprint rather than the array reference
     *
     * The previous dependency was `query.availability`. That is a `useMemo` over
     * `query.data`, but the hook returns a freshly-memoised object on every TanStack
     * observer transition, so the array can arrive with a new identity while carrying
     * identical values. Each such identity change dispatched `init`, which rebuilds
     * **both** `days` and `original` from the server week — silently reverting the
     * user's edit and resetting the dirty baseline so `isDirty` became false. The
     * visible result was a toggle that looked switched on (the switch and the row's
     * expansion ref are local, so they held their own state) while the Save button
     * stayed greyed and the unsaved banner never appeared, because both read the
     * now-false `isDirty`. It read as "Save only responds to the first change".
     *
     * Comparing a serialised fingerprint keeps the re-seed at the moments that
     * genuinely need it, and makes it impossible for a query-state change with no new
     * data to discard an in-progress edit.
     */
    const serverWeekFingerprint = weekFingerprint(query.availability);
    const seededFingerprint = useRef<string | null>(null);

    useEffect(() => {
        if (query.isLoading || query.isError || query.isUnsupported) {
            return;
        }

        // Nothing new from the server — leave the user's draft exactly as it is.
        if (seededFingerprint.current === serverWeekFingerprint) {
            return;
        }

        seededFingerprint.current = serverWeekFingerprint;
        dispatch({ type: 'init', days: toWeekDrafts(query.availability) });
        // `query.availability` is intentionally not a dependency: the fingerprint is
        // the change signal, and depending on the array would reintroduce the
        // identity-driven reset this effect exists to prevent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverWeekFingerprint, query.isLoading, query.isError, query.isUnsupported]);

    const refreshControl = (
        <RefreshControl
            refreshing={query.isRefreshing}
            onRefresh={() => {
                syncMutation.reset();
                query.refresh();
            }}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
        />
    );

    const header = (
        <AppHeader title={availabilityCopy.title} subtitle={availabilityCopy.subtitle} />
    );

    if (query.isLoading) {
        return (
            <ScreenContainer hasHeader refreshControl={refreshControl}>
                {header}
                {/* Seven day rows, so the placeholder count matches the real list. */}
                <SkeletonRows count={7} />
            </ScreenContainer>
        );
    }

    if (query.isUnsupported) {
        return (
            <ScreenContainer hasHeader refreshControl={refreshControl}>
                {header}
                <AppCard
                    testID="availability-gap-banner"
                    style={{ backgroundColor: theme.colors.warningSoft }}>
                    <View style={{ gap: theme.spacing.xs }}>
                        <AppText variant="bodyStrong" color="warningStrong">
                            Availability editing not enabled
                        </AppText>
                        <AppText variant="body" color="warningStrong">
                            Availability editing not enabled for your role — contact admin.
                        </AppText>
                        <AppText variant="caption" color="textSecondary">
                            Your administrator needs to enable availability editing for your
                            account before this screen can load or save.
                        </AppText>
                    </View>
                </AppCard>
            </ScreenContainer>
        );
    }

    if (query.isError && query.error) {
        return (
            <ScreenContainer hasHeader refreshControl={refreshControl}>
                {header}
                <ErrorView error={query.error} onRetry={query.retry} />
            </ScreenContainer>
        );
    }

    if (query.employeeId === null) {
        return (
            <ScreenContainer hasHeader refreshControl={refreshControl}>
                {header}
                <EmptyState
                    title="No employee record"
                    description="Your account is not linked to an employee record yet. Ask your administrator to link it, then pull to refresh."
                />
            </ScreenContainer>
        );
    }

    const days = state.days;
    const dirty = isAvailabilityDirty(state);

    /*
     * Validate what the user can actually see.
     *
     * `validateSlotTime` reports a half-filled range ("Set both start and end
     * times.") as soon as *either* field is set, which is correct: a week with a
     * lone start time is not saveable. But turning a day on now begins in that
     * exact half-filled state — the day is available with both times `null`
     * (the deliberate all-day state, which validates clean), and the moment the
     * user picks a start time the row becomes an error until they also pick an
     * end time.
     *
     * That used to render as an error the user could not clear: the error line
     * and the "Mark as unavailable" link are mutually exclusive, so the row
     * swapped its affordances mid-edit and looked stuck. Worse, the *previous*
     * day's message stayed bound to whatever it last rendered as, because the
     * `error` prop was passed to both time fields and to the row caption.
     *
     * Only days that are switched on carry errors now. A day that is off cannot
     * be invalid, so it never inherits a message from the last time it was on.
     */
    const fieldErrors = new Map<number, string>();
    days.forEach(day => {
        if (!day.is_available) {
            return;
        }

        const message = validateSlotTime(day.start_time, day.end_time, true);
        if (message) {
            fieldErrors.set(day.day_of_week, message);
        }
    });
    const isValid = fieldErrors.size === 0;

    const mutationError = syncMutation.error;
    const mutationForbidden =
        mutationError?.kind === 'forbidden' || mutationError?.kind === 'unauthorized';
    const mutationFieldErrors =
        mutationError?.kind === 'validation' ? toFieldErrorMap(mutationError) : {};

    /**
     * Turning a day on seeds it with a usable default range rather than leaving
     * it half-filled.
     *
     * This is what closes the "validation error on the day I just switched on"
     * loop. An available day with both times `null` means "available all day",
     * so switching on has to *decide* between that and a concrete range: the
     * edit then either stands as all-day or, if the user picks one boundary,
     * is immediately half-filled and flagged until they pick the other. Seeding
     * `09:00 – 17:00` makes the common case (a normal working day) valid the
     * instant the switch flips, while "all day" remains reachable through
     * "Mark as unavailable" → toggle, and stays editable from the time select.
     *
     * Turning a day *off* clears its range, so re-enabling a day never resurrects
     * stale times from a previous edit.
     */
    const updateDay = (day: DayOfWeek, patch: Partial<WeekDayDraft>): void => {
        dispatch({ type: 'updateDay', day, patch });
    };

    const handleSave = (): void => {
        if (query.employeeId === null || !dirty || !isValid) {
            return;
        }
        syncMutation.mutate(
            { employeeId: query.employeeId, payload: { availabilities: buildSyncPayload(days) } },
            {
                onSuccess: result => {
                    if (result.queued) {
                        // Explicit pending state — the server has NOT received this yet,
                        // so the copy must not read as a completed save.
                        dispatch({ type: 'saved', message: availabilityCopy.queued });
                        announceForAccessibility(availabilityCopy.queued);
                        return;
                    }

                    dispatch({
                        type: 'saved',
                        message: availabilityCopy.saved,
                        days: toWeekDrafts(result.availability ?? []),
                    });
                    announceForAccessibility(availabilityCopy.saved);
                },
            },
        );
    };

    return (
        /*
         * The save bar is a sibling of the container, not a child, so its absolute
         * `bottom` is measured from the *screen* edge rather than from the
         * container's padded content box. That is what lets it sit flush above the
         * tab bar instead of 12pt inside it.
         */
        <View style={styles.root}>
            <ScreenContainer hasHeader scrollable={false} withGutter={false}>
                {header}

                {/*
                 * `KeyboardAwareView` rather than the container's own scroller. The
                 * time fields are now tap-to-open selects rather than text inputs, so
                 * the keyboard no longer covers the lower days — but the scroller is
                 * still the right host for the pull-to-refresh control, which is
                 * forwarded here so the screen keeps that feature.
                 * `ownsTopInset` is false because `AppHeader` above already absorbed
                 * the top inset.
                 *
                 * `paddingHorizontal: 0` cancels the scroller's own 16pt gutter: this
                 * screen's rows carry the spec's 20pt gutter themselves, and the two
                 * would otherwise stack to 36pt.
                 */}
                <KeyboardAwareView
                    ownsTopInset={false}
                    refreshControl={refreshControl}
                    contentContainerStyle={{
                        paddingHorizontal: 0,
                        paddingBottom: SAVE_BAR_RESERVE,
                    }}>
                    <AppText variant="body" color="textSecondary" style={styles.intro}>
                        {availabilityCopy.intro}
                    </AppText>

                    {dirty ? <UnsavedBanner /> : null}

                    {state.savedMessage ? (
                        <AppCard
                            testID="availability-saved-message"
                            style={{ ...styles.banner, backgroundColor: theme.colors.successSoft }}>
                            <AppText variant="body" color="successStrong">
                                {state.savedMessage}
                            </AppText>
                        </AppCard>
                    ) : null}

                    {mutationError && !mutationForbidden ? (
                        <AppCard style={{ ...styles.banner, backgroundColor: theme.colors.dangerSoft }}>
                            <View style={{ gap: theme.spacing.xs }}>
                                <AppText variant="bodyStrong" color="dangerStrong">
                                    Could not save
                                </AppText>
                                <AppText variant="body" color="dangerStrong">
                                    {mutationError.message}
                                </AppText>
                                {Object.keys(mutationFieldErrors).length > 0 ? (
                                    <AppText variant="caption" color="textSecondary">
                                        Check the highlighted days and try again.
                                    </AppText>
                                ) : null}
                            </View>
                        </AppCard>
                    ) : null}

                    {mutationForbidden ? (
                        <AppCard
                            testID="availability-gap-banner"
                            style={{ ...styles.banner, backgroundColor: theme.colors.warningSoft }}>
                            <View style={{ gap: theme.spacing.xs }}>
                                <AppText variant="bodyStrong" color="warningStrong">
                                    Availability editing not enabled
                                </AppText>
                                <AppText variant="body" color="warningStrong">
                                    Availability editing not enabled for your role — contact admin.
                                </AppText>
                            </View>
                        </AppCard>
                    ) : null}

                    {/* The grouped settings container: one surface, hairline-separated rows. */}
                    <View
                        testID="availability-list"
                        style={[
                            styles.group,
                            theme.tokens.shadows.shadowCard,
                            {
                                backgroundColor: theme.colors.surface,
                                borderRadius: theme.tokens.radius.rLg,
                            },
                        ]}>
                        {days.map((day, index) => (
                            <DayRow
                                key={day.day_of_week}
                                day={day}
                                dayName={getDayName(day.day_of_week)}
                                error={fieldErrors.get(day.day_of_week)}
                                isLast={index === days.length - 1}
                                onToggle={value =>
                                    updateDay(day.day_of_week, {
                                        is_available: value,
                                        ...(value
                                            ? {
                                                // Only seed a range when the day has no
                                                // times at all. A day that was on, had its
                                                // times set, and is being re-enabled keeps
                                                // whatever the user last chose.
                                                ...(day.start_time === null &&
                                                    day.end_time === null
                                                    ? {
                                                        start_time:
                                                            DEFAULT_AVAILABILITY_START,
                                                        end_time:
                                                            DEFAULT_AVAILABILITY_END,
                                                    }
                                                    : {}),
                                            }
                                            : { start_time: null, end_time: null }),
                                    })
                                }
                                onChangeStart={value =>
                                    updateDay(day.day_of_week, { start_time: value })
                                }
                                onChangeEnd={value =>
                                    updateDay(day.day_of_week, { end_time: value })
                                }
                                onMarkUnavailable={() =>
                                    updateDay(day.day_of_week, {
                                        is_available: false,
                                        start_time: null,
                                        end_time: null,
                                    })
                                }
                            />
                        ))}
                    </View>
                </KeyboardAwareView>
            </ScreenContainer>

            <SaveBar
                onSave={handleSave}
                disabled={!dirty || !isValid}
                loading={syncMutation.isPending}
            />
        </View>
    );
}

/**
 * A stable, comparable representation of a server availability week.
 *
 * Only the fields the editor round-trips are included, in a fixed order, so two
 * weeks with identical values always produce the same string and two weeks that
 * differ in anything the user can edit always produce different ones. Slot order is
 * normalised because [`toWeekDrafts`](src/features/availability/utils/availabilityWeek.ts:62)
 * reduces each day to its first slot by start time — a reordering by the server must
 * not look like an edit.
 */
function weekFingerprint(items: { day_of_week: number; is_available: boolean; start_time: string | null; end_time: string | null }[]): string {
    return items
        .slice()
        .sort((a, b) => {
            if (a.day_of_week !== b.day_of_week) {
                return a.day_of_week - b.day_of_week;
            }

            return (a.start_time ?? '').localeCompare(b.start_time ?? '');
        })
        .map(item => `${item.day_of_week}:${item.is_available ? 1 : 0}:${item.start_time ?? ''}:${item.end_time ?? ''}`)
        .join('|');
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    intro: {
        paddingHorizontal: 20,
        marginTop: 16,
    },
    banner: {
        marginHorizontal: 20,
        marginTop: 16,
    },
    group: {
        marginVertical: 8,
        marginHorizontal: 20,
        // Clips the first/last row's corners to the container radius.
        overflow: 'hidden',
    },
});
