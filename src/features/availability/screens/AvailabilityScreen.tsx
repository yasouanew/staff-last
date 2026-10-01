import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Switch, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { AppCard, Divider } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { AppText } from '../../../components/AppText';
import { AppTextInput } from '../../../components/AppTextInput';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorView } from '../../../components/ErrorView';
import { KeyboardAwareView } from '../../../components/KeyboardAwareView';
import { SkeletonRows } from '../../../components/Skeleton';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { clockInputHint } from '../../../i18n';
import type { AppTabParamList } from '../../../navigation/types';
import { spacing, useTheme } from '../../../theme';
import { announceForAccessibility } from '../../../utils/accessibility';
import { formatTime, getDayName } from '../../../utils/date';
import { toFieldErrorMap } from '../../../utils/errors';
import { useAvailability, useSyncWeeklyAvailability } from '../hooks';
import {
    buildSyncPayload,
    isWeekDirty,
    toWeekDrafts,
    validateSlotTime,
    type WeekDayDraft,
} from '../utils';

type Props = BottomTabScreenProps<AppTabParamList, 'AvailabilityTab'>;

/**
 * My Availability — spec Screen 7.
 *
 * 7-day list (Sun 0 – Sat 6 with `day_name`), per-day time range or
 * "Unavailable" toggle, Save-week via `PUT …/sync` (RECOMMENDED), loading /
 * empty / error, dirty-state guard, pull-to-refresh.
 *
 * BACKEND GAP (BLOCKING): list requires `employee.view`, sync requires
 * `employee.update` — the employee role holds neither, so both 403 until the
 * backend grants scoped own-record access. A 403 is surfaced distinctly as
 * "Availability editing not enabled for your role — contact admin", never as
 * a retryable error.
 */
export function AvailabilityScreen(_props: Props): React.JSX.Element {
    const theme = useTheme();
    const query = useAvailability();
    const syncMutation = useSyncWeeklyAvailability();

    const [drafts, setDrafts] = useState<WeekDayDraft[] | null>(null);
    const [savedMessage, setSavedMessage] = useState<string | null>(null);

    /*
     * The time inputs always take 24-hour `HH:MM` (the API's interchange format), but
     * the *display* of the saved value follows the locale. The hint under each field
     * must therefore describe the locale's own cycle: on a 24-hour locale the field
     * and the summary now agree, which is the defect this replaces a hardcoded
     * "HH:MM, 24-hour" for.
     */
    const timeHint = clockInputHint();

    const original = useMemo(
        () => toWeekDrafts(query.availability),
        [query.availability],
    );

    useEffect(() => {
        if (query.availability.length > 0 && drafts === null) {
            setDrafts(toWeekDrafts(query.availability));
        }
    }, [query.availability, drafts]);

    // Empty week (no rows yet) still gets an editable 7-day scaffold.
    useEffect(() => {
        if (!query.isLoading && !query.isError && !query.isUnsupported && drafts === null) {
            setDrafts(original);
        }
    }, [query.isLoading, query.isError, query.isUnsupported, drafts, original]);

    const refreshControl = (
        <RefreshControl
            refreshing={query.isRefreshing}
            onRefresh={() => {
                setSavedMessage(null);
                syncMutation.reset();
                // Discard unsaved edits on pull-to-refresh so the list always
                // reflects the server after the refetch re-initialises drafts.
                setDrafts(null);
                query.refresh();
            }}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
        />
    );

    const header = <AppHeader title="Availability" subtitle="Your usual working pattern." />;

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

    const days: WeekDayDraft[] = drafts ?? original;
    const dirty = isWeekDirty(original, days);

    const fieldErrors = new Map<number, string>();
    days.forEach(d => {
        const message = validateSlotTime(d.start_time, d.end_time, d.is_available);
        if (message) {
            fieldErrors.set(d.day_of_week, message);
        }
    });
    const isValid = fieldErrors.size === 0;

    const mutationError = syncMutation.error;
    const mutationForbidden =
        mutationError?.kind === 'forbidden' || mutationError?.kind === 'unauthorized';
    const mutationFieldErrors =
        mutationError?.kind === 'validation' ? toFieldErrorMap(mutationError) : {};

    const updateDay = (day: number, patch: Partial<WeekDayDraft>): void => {
        setSavedMessage(null);
        syncMutation.reset();
        setDrafts(previous =>
            (previous ?? original).map(entry =>
                entry.day_of_week === day ? { ...entry, ...patch } : entry,
            ),
        );
    };

    const handleReset = (): void => {
        setSavedMessage(null);
        syncMutation.reset();
        setDrafts(original);
    };

    const handleSave = (): void => {
        if (query.employeeId === null || !dirty || !isValid) {
            return;
        }
        setSavedMessage(null);
        syncMutation.mutate(
            { employeeId: query.employeeId, payload: { availabilities: buildSyncPayload(days) } },
            {
                onSuccess: result => {
                    if (result.queued) {
                        // Explicit pending state — the server has NOT received this yet,
                        // so the copy must not read as a completed save.
                        const queuedMessage =
                            'Saved on this device. It will sync when you are back online.';
                        setSavedMessage(queuedMessage);
                        // The banner is visual only; announce it so the outcome is not
                        // silently implied to a screen-reader user.
                        announceForAccessibility(queuedMessage);
                        return;
                    }

                    setDrafts(toWeekDrafts(result.availability ?? []));
                    setSavedMessage('Availability saved.');
                    announceForAccessibility('Availability saved.');
                },
            },
        );
    };

    return (
        <ScreenContainer hasHeader scrollable={false}>
            {header}

            {/*
             * `KeyboardAwareView` rather than the container's own scroller. This screen
             * is a form — fourteen time inputs, two per available day — so on a short
             * device the lower days' fields end up behind the keyboard with no
             * scroll-into-view. The pull-to-refresh control is forwarded to this
             * scroller instead, so the screen keeps both features. `ownsTopInset` is
             * false because `AppHeader` above already absorbed the top inset.
             */}
            <KeyboardAwareView
                ownsTopInset={false}
                refreshControl={refreshControl}
                contentContainerStyle={{ gap: theme.spacing.md }}>
                <View style={[styles.summaryRow, { gap: theme.spacing.sm }]}>
                    <AppText variant="body" color="textSecondary">
                        Set the hours you prefer to work each day. Days marked unavailable are
                        left out of rostering.
                    </AppText>
                    {dirty ? (
                        <AppText variant="caption" color="warningStrong" testID="availability-dirty-hint">
                            You have unsaved changes.
                        </AppText>
                    ) : null}
                </View>

                {savedMessage ? (
                    <AppCard
                        testID="availability-saved-message"
                        style={{ backgroundColor: theme.colors.successSoft }}>
                        <AppText variant="body" color="successStrong">
                            {savedMessage}
                        </AppText>
                    </AppCard>
                ) : null}

                {mutationError && !mutationForbidden ? (
                    <AppCard style={{ backgroundColor: theme.colors.dangerSoft }}>
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
                        style={{ backgroundColor: theme.colors.warningSoft }}>
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

                <View style={[styles.list, { gap: theme.spacing.sm }]}>
                    {days.map(day => {
                        const error = fieldErrors.get(day.day_of_week);
                        const summary = !day.is_available
                            ? 'Unavailable'
                            : day.start_time == null && day.end_time == null
                                ? 'Available all day'
                                : `${formatTime(day.start_time)} – ${formatTime(day.end_time)}`;

                        return (
                            <AppCard key={day.day_of_week} testID={`availability-day-${day.day_of_week}`}>
                                <View style={[styles.dayHeader, { gap: theme.spacing.sm }]}>
                                    <View style={styles.dayText}>
                                        <AppText variant="bodyStrong">
                                            {getDayName(day.day_of_week)}
                                        </AppText>
                                        <AppText variant="caption" color="textSecondary">
                                            {summary}
                                        </AppText>
                                    </View>
                                    <View style={[styles.toggleRow, { gap: theme.spacing.xs }]}>
                                        <AppText variant="caption" color="textSecondary">
                                            {day.is_available ? 'Available' : 'Off'}
                                        </AppText>
                                        <Switch
                                            testID={`availability-toggle-${day.day_of_week}`}
                                            accessibilityLabel={`${getDayName(day.day_of_week)} available`}
                                            value={day.is_available}
                                            onValueChange={value =>
                                                updateDay(day.day_of_week, {
                                                    is_available: value,
                                                    ...(value
                                                        ? {}
                                                        : { start_time: null, end_time: null }),
                                                })
                                            }
                                        />
                                    </View>
                                </View>

                                {day.is_available ? (
                                    <>
                                        <Divider />
                                        <View style={[styles.times, { gap: theme.spacing.sm }]}>
                                            <View style={styles.timeField}>
                                                <AppTextInput
                                                    label="Start"
                                                    testID={`availability-start-${day.day_of_week}`}
                                                    placeholder="09:00"
                                                    autoCapitalize="none"
                                                    autoCorrect={false}
                                                    keyboardType="numbers-and-punctuation"
                                                    value={day.start_time ?? ''}
                                                    onChangeText={text =>
                                                        updateDay(day.day_of_week, {
                                                            start_time: text.trim() === '' ? null : text.trim(),
                                                        })
                                                    }
                                                    helper={timeHint}
                                                />
                                            </View>
                                            <View style={styles.timeField}>
                                                <AppTextInput
                                                    label="End"
                                                    testID={`availability-end-${day.day_of_week}`}
                                                    placeholder="17:00"
                                                    autoCapitalize="none"
                                                    autoCorrect={false}
                                                    keyboardType="numbers-and-punctuation"
                                                    value={day.end_time ?? ''}
                                                    onChangeText={text =>
                                                        updateDay(day.day_of_week, {
                                                            end_time: text.trim() === '' ? null : text.trim(),
                                                        })
                                                    }
                                                    helper="Must be after start"
                                                />
                                            </View>
                                        </View>
                                        {error ? (
                                            <AppText
                                                variant="caption"
                                                color="dangerStrong"
                                                testID={`availability-error-${day.day_of_week}`}>
                                                {error}
                                            </AppText>
                                        ) : (
                                            <Pressable
                                                accessibilityRole="button"
                                                accessibilityLabel={`Mark ${getDayName(day.day_of_week)} as unavailable`}
                                                testID={`availability-clear-${day.day_of_week}`}
                                                onPress={() =>
                                                    updateDay(day.day_of_week, {
                                                        is_available: false,
                                                        start_time: null,
                                                        end_time: null,
                                                    })
                                                }>
                                                <AppText variant="caption" color="textLink">
                                                    Mark as unavailable
                                                </AppText>
                                            </Pressable>
                                        )}
                                    </>
                                ) : null}
                            </AppCard>
                        );
                    })}
                </View>

                <View style={[styles.actions, { gap: theme.spacing.sm }]}>
                    <AppButton
                        label="Save week"
                        testID="availability-save"
                        onPress={handleSave}
                        loading={syncMutation.isPending}
                        disabled={!dirty || !isValid}
                        accessibilityLabel="Save weekly availability"
                    />
                    {dirty ? (
                        <AppButton
                            label="Reset changes"
                            testID="availability-reset"
                            variant="secondary"
                            onPress={handleReset}
                            disabled={syncMutation.isPending}
                        />
                    ) : null}
                    <AppText variant="caption" color="textMuted" align="center">
                        Saving replaces the whole week at once.
                    </AppText>
                </View>
            </KeyboardAwareView>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    summaryRow: {
        marginBottom: spacing.xxs,
    },
    list: {
        paddingBottom: spacing.xxs,
    },
    dayHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    dayText: {
        flex: 1,
        // `xxs` (4) rather than the previous 2: the half-step is the smallest
        // permitted gap, and 2 was below it — an off-grid value the eye reads as
        // two lines colliding rather than as a deliberate tight stack.
        gap: spacing.xxs,
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    times: {
        flexDirection: 'row',
        marginTop: spacing.sm,
    },
    timeField: {
        flex: 1,
    },
    actions: {
        marginTop: spacing.xs,
        paddingBottom: spacing.xl,
    },
});
