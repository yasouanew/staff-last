import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { AppCard, Divider } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { AlertTriangleGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { AppTextInput } from '../../../components/AppTextInput';
import { BottomSheet, type BottomSheetAction } from '../../../components/BottomSheet';
import { DateField } from '../../../components/DateField';
import { KeyboardAwareView } from '../../../components/KeyboardAwareView';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { SegmentedControl, type SegmentedOption } from '../../../components/SegmentedControl';
import { StickyActionTray } from '../../../components/StickyActionTray';
import type { LeaveStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import type { LeaveSession } from '../../../types/api';
import { isAppError } from '../../../types/appError';
import { useClearRootError } from '../../../hooks';
import { announceForAccessibility } from '../../../utils/accessibility';
import { toFieldErrorMap } from '../../../utils/errors';
import { todayApiDate } from '../../../utils/date';
import { useSessionValidity } from '../../auth/hooks/useSessionValidity';
import { useSessionStore } from '../../auth/store/sessionStore';
import { useCreateLeaveRequest, useLeaveTypes } from '../hooks';
import type { LeaveAttachmentInput, LeaveType } from '../types';
import { isNativePickerAvailable, useDatePicker } from '../utils/datePicker';
import { previewTotalDays, validateAttachment } from '../utils/leaveRequest';
import {
    LEAVE_ATTACHMENT_MAX_COUNT,
    createLeaveRequestSchema,
    leaveSessions,
    type CreateLeaveRequestFormValues,
} from '../validation';

type Props = NativeStackScreenProps<LeaveStackParamList, 'CreateLeaveRequest'>;

const SESSION_LABELS: Record<LeaveSession, string> = {
    full_day: 'Full day',
    first_half: 'First half',
    second_half: 'Second half',
};

/**
 * Height cap for the narrative notes field.
 *
 * The brief fixes the bound at 120pt. Above that the field would push the
 * attachments block off the fold on a small phone, and since the notes are optional
 * the cost of that would be paid by every user to serve the few who write essays.
 * Past 120pt the field scrolls internally (see `AppTextInput`'s `maxHeight`), so the
 * page geometry — and therefore the submit button — never moves while the user types.
 */
const NOTES_MAX_HEIGHT = 120;

/**
 * Space the scroll view must leave for the submit tray.
 *
 * The tray is a sibling of the scroller, not an overlay inside it, so the scroller
 * has to reserve the tray's height or the final field would sit permanently behind
 * the button. Derived from the same tokens the tray uses (a `lg` button plus its
 * vertical padding) rather than measured, because a measurement arrives one frame
 * late and on first paint the gap would visibly snap.
 */
const SUBMIT_TRAY_RESERVE = 52 + spacing.md * 2;

/**
 * Request Leave (spec Screen 9).
 *
 * - `leave_type_id/start_date/end_date` required; `start_session/end_session`
 *   nullable slots; `total_days` hint (server recalculates); `reason` max 1000;
 *   `attachments` max 5 (`pdf,jpg,jpeg,png,doc,docx`, 5MB each) sent as
 *   `multipart/form-data` when present, else JSON.
 * - `employee_id` **is** sent, resolved from the session's `user.employee_id`.
 *   The backend validates it as `required` on the create body (a live 422 proved
 *   the spec's §0.5 "server injects it" note wrong), so it is authoritative here.
 *   `company_id` is still never sent — the token implies it for create.
 * - G2: `GET /leave-types` 403 → "types unavailable — contact admin" fallback + retry.
 * - G6: no cancel/withdraw endpoint — no cancel UI is built.
 * - Success → Leave Details with the new id; error → stay with field errors.
 * - Cancel/back → dirty guard.
 *
 * ## Pull to refresh
 *
 * The only server-backed data on this screen is the leave-type catalogue, so that
 * is what the gesture reloads. It deliberately does **not** touch the form: the
 * user's in-progress values live in `react-hook-form`, not in the query cache, so a
 * pull can never discard a half-filled request. That matters here more than on a
 * read-only feed — the whole point of the dirty guard is that this form's contents
 * are expensive to lose, and a refresh that silently reset them would defeat it.
 *
 * The gesture matters because of the G2 backend gap: when `GET /leave-types`
 * returns 403 the picker is replaced by the "unavailable — contact admin" banner,
 * and the natural instinct on seeing that is to drag the page down. Wiring the
 * scroller's `refreshControl` means that instinct works, rather than silently doing
 * nothing.
 */
export function CreateLeaveRequestScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const leaveTypes = useLeaveTypes();
    const createRequest = useCreateLeaveRequest();
    /*
     * Read once from the session, not per submit: `employee_id` is a property of who
     * is signed in, and resolving it here mirrors `useShifts`. A user with no linked
     * employee record has nothing to submit against, so the submit path is guarded
     * rather than allowed to fire a request the backend will always 422.
     */
    const employeeId = useSessionStore(state => state.user?.employee_id ?? null);
    /**
     * Submitting leave is a sensitive, state-changing action, so it is gated on a
     * server-validated session. `requireValidatedSession` inside the mutation is the
     * non-bypassable half; disabling the control here is the user-facing half, so an
     * offline user is told why rather than tapping a button that silently fails.
     */
    const { canMutate, blockedReason } = useSessionValidity();
    const [attachments, setAttachments] = useState<LeaveAttachmentInput[]>([]);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [pendingFileName, setPendingFileName] = useState('');

    /*
     * One picker for the whole screen, not one per field.
     *
     * Two `useDatePicker` calls would mean two modals and, on Android, two racing
     * dialogs if the user tapped both fields quickly. A single instance also gives
     * the screen one place to render `renderModal` — the `DateField`s only ever ask
     * it to open.
     */
    const picker = useDatePicker();

    const {
        control,
        clearErrors,
        handleSubmit,
        setValue,
        setError,
        watch,
        formState: { errors, isSubmitting, isDirty },
    } = useForm<CreateLeaveRequestFormValues>({
        resolver: zodResolver(createLeaveRequestSchema),
        defaultValues: {
            leave_type_id: 0,
            start_date: todayApiDate(),
            end_date: todayApiDate(),
            start_session: 'full_day',
            end_session: 'full_day',
            total_days: undefined,
            reason: '',
        },
    });

    /*
     * A root error here is either "your account is not linked to an employee record"
     * or a server failure with no field to attach to. Neither is re-validated away, so
     * clearing on the first edit stops a stale message describing a half-filled form
     * that has since changed.
     */
    const clearRootError = useClearRootError(clearErrors, errors.root !== undefined);

    const selectedTypeId = watch('leave_type_id');
    const startSession = watch('start_session');
    const endSession = watch('end_session');
    const startDate = watch('start_date');
    const endDate = watch('end_date');

    /**
     * The prevented navigation action, held while the discard sheet is open.
     *
     * `beforeRemove` gives us the exact action the user attempted (a back gesture, a
     * header tap, a tab switch). Storing it — rather than replaying a generic
     * `goBack()` — means confirming the discard resumes the *original* intent, so a
     * deep link or programmatic pop is not silently rewritten into a plain back.
     */
    const [pendingExit, setPendingExit] = useState<{ run: () => void } | null>(null);

    // Dirty guard — a half-filled request is not worth losing to an accidental back.
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', event => {
            if (!isDirty && attachments.length === 0) {
                return;
            }

            if (createRequest.isSuccess) {
                return;
            }

            event.preventDefault();
            const action = event.data.action;
            setPendingExit({ run: () => navigation.dispatch(action) });
        });

        return unsubscribe;
    }, [navigation, isDirty, attachments.length, createRequest.isSuccess]);

    const discardSheetActions = useMemo<BottomSheetAction[]>(
        () => [
            {
                label: 'Discard',
                variant: 'danger',
                onPress: () => {
                    const exit = pendingExit;
                    setPendingExit(null);
                    exit?.run();
                },
                testID: 'discard-leave-request',
            },
            {
                label: 'Keep editing',
                variant: 'secondary',
                onPress: () => setPendingExit(null),
            },
        ],
        [pendingExit],
    );

    const selectedType = useMemo(
        () => leaveTypes.leaveTypes.find((type: LeaveType) => type.id === selectedTypeId),
        [leaveTypes.leaveTypes, selectedTypeId],
    );

    /**
     * Only offer session slots the chosen type supports: `allow_half_day` is the
     * server's own signal, so honouring it client-side prevents a round-trip that is
     * guaranteed to fail. Falls back to allowing all slots when no type is selected.
     */
    const allowsHalfDay = selectedType ? selectedType.allow_half_day : true;
    const availableSessions = useMemo<readonly LeaveSession[]>(
        () => (allowsHalfDay ? leaveSessions : (['full_day'] as const)),
        [allowsHalfDay],
    );

    // Keep sessions valid when the type changes (e.g. Annual allows halves, Sick may not).
    useEffect(() => {
        if (!allowsHalfDay) {
            setValue('start_session', 'full_day', { shouldValidate: true });
            setValue('end_session', 'full_day', { shouldValidate: true });
        }
    }, [allowsHalfDay, setValue]);

    /**
     * Leave types as segmented options.
     *
     * `scrollable` because type names vary from "Annual" to "Bereavement" — equal-width
     * segments would crush the long ones. The numeric id is stringified here and parsed
     * back at the `onChange` boundary, which is the only place the form sees a number.
     */
    const typeOptions = useMemo<SegmentedOption[]>(
        () => leaveTypes.leaveTypes.map((type: LeaveType) => ({
            value: String(type.id),
            label: type.name,
        })),
        [leaveTypes.leaveTypes],
    );

    const totalPreview = previewTotalDays(
        startDate,
        endDate,
        startSession ?? 'full_day',
        endSession ?? 'full_day',
    );
    const previewValid =
        /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
        /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
        endDate >= startDate;

    const handleAddAttachment = (): void => {
        const name = pendingFileName.trim();

        if (!name) {
            setAttachmentError('Enter a file name to attach (e.g. certificate.pdf).');
            return;
        }

        if (attachments.length >= LEAVE_ATTACHMENT_MAX_COUNT) {
            setAttachmentError(`You can attach up to ${LEAVE_ATTACHMENT_MAX_COUNT} files.`);
            return;
        }

        const validation = validateAttachment(name);

        if (validation) {
            setAttachmentError(validation);
            return;
        }

        const extension = name.split('.').pop()?.toLowerCase() ?? '';
        const mimeType =
            extension === 'pdf'
                ? 'application/pdf'
                : extension === 'doc' || extension === 'docx'
                    ? 'application/msword'
                    : `image/${extension === 'jpg' ? 'jpeg' : extension}`;

        setAttachments(previous => [
            ...previous,
            { uri: `file://${name}`, name, mimeType },
        ]);
        setPendingFileName('');
        setAttachmentError(null);
        clearRootError();
    };

    const handleRemoveAttachment = (name: string): void => {
        setAttachments(previous => previous.filter(item => item.name !== name));
    };

    /**
     * Binds one form field to the shared picker.
     *
     * The seam reports a confirmed API date and nothing else; the closure is what
     * supplies the missing context — which field asked, and what should happen to the
     * other field as a consequence.
     */
    const handleRequestPicker = (
        field: 'start_date' | 'end_date',
        onPicked?: (apiDate: string) => void,
    ) => {
        return (currentValue: string, minimumDate?: string): void => {
            picker.open(
                currentValue,
                apiDate => {
                    onPicked?.(apiDate);
                    setValue(field, apiDate, { shouldValidate: true, shouldDirty: true });
                },
                minimumDate,
            );
        };
    };

    const onSubmit = handleSubmit(async values => {
        if (employeeId === null) {
            setError('root', {
                type: 'server',
                message: 'Your account is not linked to an employee record. Contact your admin.',
            });
            return;
        }

        if (values.leave_type_id <= 0) {
            setError('leave_type_id', { type: 'validate', message: 'Choose a leave type.' });
            return;
        }

        try {
            const created = await createRequest.mutateAsync({
                employee_id: employeeId,
                leave_type_id: values.leave_type_id,
                start_date: values.start_date,
                end_date: values.end_date,
                start_session: values.start_session ?? undefined,
                end_session: values.end_session ?? undefined,
                total_days: values.total_days ?? totalPreview,
                reason: values.reason?.trim() ? values.reason.trim() : undefined,
                attachments: attachments.length > 0 ? attachments : undefined,
            });

            /*
             * The screen is replaced, so the confirmation is a *new* screen rather
             * than a message in place. Announcing before the transition means a
             * screen-reader user hears the outcome rather than being silently moved.
             */
            announceForAccessibility('Leave request submitted.');

            navigation.replace('LeaveDetail', { leaveRequestId: created.id });
        } catch (error) {
            if (!isAppError(error)) {
                setError('root', {
                    type: 'server',
                    message: 'We could not submit this request. Check the details and try again.',
                });
                return;
            }

            const fieldErrors = toFieldErrorMap(error);

            if (Object.keys(fieldErrors).length === 0) {
                setError('root', { type: 'server', message: error.message });
                return;
            }

            (Object.keys(fieldErrors) as (keyof CreateLeaveRequestFormValues)[]).forEach(key => {
                setError(key, { type: 'server', message: fieldErrors[key] });
            });
        }
    });

    const typesBlocked =
        leaveTypes.isUnsupported || (!leaveTypes.isLoading && leaveTypes.leaveTypes.length === 0);
    const isBlocked = leaveTypes.isLoading || typesBlocked || !canMutate;

    /*
     * Keyed off `isRefreshing` (any in-flight fetch), not `isLoading` (nothing usable
     * yet). During a pull there is already content on screen, so the spinner has to
     * ride above it; `isLoading` would drop the spinner the instant the cached list
     * was available and leave the gesture looking unresponsive.
     */
    const refreshControl = (
        <RefreshControl
            refreshing={leaveTypes.isRefreshing}
            onRefresh={leaveTypes.retry}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            testID="create-leave-refresh"
        />
    );

    return (
        <ScreenContainer hasHeader scrollable={false}>
            <AppHeader
                title="Request leave"
                subtitle="Submit a request for approval."
                onBack={() => navigation.goBack()}
            />

            {/*
             * The scroller reserves room for the submit tray, and the tray sits
             * outside `KeyboardAwareView` so that the keyboard pushes the form up
             * while the button stays pinned to the viewport base.
             */}
            <KeyboardAwareView
                // `AppHeader` sits above this view as a sibling and already absorbed
                // the top inset, so this scroller must not add it a second time.
                ownsTopInset={false}
                contentContainerStyle={{ paddingBottom: SUBMIT_TRAY_RESERVE }}>
                <ScrollView
                    contentContainerStyle={[styles.content, { gap: theme.spacing.md }]}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={refreshControl}
                    testID="create-leave-scroll">
                    {leaveTypes.isLoading ? (
                        <AppCard testID="leave-types-loading">
                            <AppText variant="caption" color="textSecondary">
                                Loading leave types…
                            </AppText>
                        </AppCard>
                    ) : null}

                    {leaveTypes.isUnsupported ? (
                        <AppCard
                            testID="leave-types-gap-banner"
                            style={{ backgroundColor: theme.colors.warningSoft }}>
                            <View style={{ gap: theme.spacing.xs }}>
                                <AppText variant="bodyStrong" color="warningStrong">
                                    Leave types unavailable — contact admin
                                </AppText>
                                <AppText variant="caption" color="warningStrong">
                                    Your role cannot load leave types right now (missing
                                    permission). A request needs a type, so submission is
                                    paused until this is fixed.
                                </AppText>
                                <AppButton
                                    label="Retry"
                                    variant="secondary"
                                    size="sm"
                                    fullWidth={false}
                                    onPress={leaveTypes.retry}
                                    testID="leave-types-retry"
                                />
                            </View>
                        </AppCard>
                    ) : null}

                    {leaveTypes.isError && leaveTypes.error ? (
                        <AppCard testID="leave-types-error">
                            <View style={{ gap: theme.spacing.sm }}>
                                <AppText variant="caption" color="danger">
                                    {leaveTypes.error.message}
                                </AppText>
                                <AppButton
                                    label="Retry"
                                    variant="secondary"
                                    size="sm"
                                    fullWidth={false}
                                    onPress={leaveTypes.retry}
                                    testID="leave-types-retry-error"
                                />
                            </View>
                        </AppCard>
                    ) : null}

                    <AppCard>
                        <View style={{ gap: theme.spacing.sm }}>
                            {typesBlocked && !leaveTypes.isLoading ? (
                                <AppText
                                    variant="caption"
                                    color="textMuted"
                                    testID="leave-types-blocked-note">
                                    Leave types are unavailable right now, so a request cannot be
                                    submitted. Please retry, or contact your administrator if this
                                    continues.
                                </AppText>
                            ) : (
                                <SegmentedControl
                                    options={typeOptions}
                                    value={selectedTypeId > 0 ? String(selectedTypeId) : null}
                                    onChange={next =>
                                        setValue('leave_type_id', Number(next), {
                                            shouldValidate: true,
                                            shouldDirty: true,
                                        })
                                    }
                                    scrollable
                                    accessibilityLabel="Leave type"
                                    testID="leave-type-picker"
                                />
                            )}

                            {selectedType ? (
                                <AppText
                                    variant="caption"
                                    color="textMuted"
                                    testID="leave-type-meta">
                                    {selectedType.code ?? 'Leave'}
                                    {selectedType.is_paid ? ' · Paid' : ' · Unpaid'}
                                    {selectedType.allow_half_day
                                        ? ' · Half days allowed'
                                        : ' · Full days only'}
                                </AppText>
                            ) : null}

                            {errors.leave_type_id ? (
                                <AppText
                                    variant="caption"
                                    color="danger"
                                    testID="leave-error-type">
                                    {errors.leave_type_id.message}
                                </AppText>
                            ) : null}
                        </View>
                    </AppCard>

                    <AppCard>
                        <View style={{ gap: theme.spacing.md }}>
                            <Controller
                                control={control}
                                name="start_date"
                                render={({ field }) => (
                                    <DateField
                                        label="Start date"
                                        required
                                        testID="leave-start-date"
                                        value={field.value}
                                        onChange={field.onChange}
                                        error={errors.start_date?.message}
                                        isNativePickerAvailable={isNativePickerAvailable}
                                        onRequestPicker={handleRequestPicker(
                                            'start_date',
                                            /*
                                             * Pulling the end date forward is the one
                                             * edit the user would otherwise have to
                                             * make themselves after every change to
                                             * the start. Only widened, never
                                             * narrowed: silently moving a later end
                                             * date backwards would delete a choice.
                                             */
                                            next => {
                                                if (endDate < next) {
                                                    setValue('end_date', next, {
                                                        shouldValidate: true,
                                                        shouldDirty: true,
                                                    });
                                                }
                                            },
                                        )}
                                    />
                                )}
                            />

                            <Controller
                                control={control}
                                name="end_date"
                                render={({ field }) => (
                                    <DateField
                                        label="End date"
                                        required
                                        testID="leave-end-date"
                                        value={field.value}
                                        onChange={field.onChange}
                                        error={errors.end_date?.message}
                                        helper={
                                            startDate === endDate
                                                ? 'Single-day request.'
                                                : 'Must be on or after the start date.'
                                        }
                                        minimumDate={startDate}
                                        isNativePickerAvailable={isNativePickerAvailable}
                                        onRequestPicker={handleRequestPicker('end_date')}
                                    />
                                )}
                            />

                            <Divider />

                            <View style={{ gap: theme.spacing.xs }}>
                                <AppText variant="caption" color="textSecondary">
                                    Estimated total
                                </AppText>
                                <AppText variant="subtitle" testID="leave-total-preview">
                                    {previewValid
                                        ? `${totalPreview} day${totalPreview === 1 ? '' : 's'}`
                                        : '—'}
                                </AppText>
                                <AppText variant="caption" color="textMuted">
                                    Preview only — the server recalculates the final total
                                    from the working calendar.
                                </AppText>
                            </View>
                        </View>
                    </AppCard>

                    <SessionSelector
                        label="Starts"
                        selected={startSession ?? 'full_day'}
                        options={availableSessions}
                        onSelect={value =>
                            setValue('start_session', value, {
                                shouldValidate: true,
                                shouldDirty: true,
                            })
                        }
                        error={errors.start_session?.message}
                        testIDPrefix="leave-start-session"
                    />

                    <SessionSelector
                        label="Ends"
                        selected={endSession ?? 'full_day'}
                        options={availableSessions}
                        onSelect={value =>
                            setValue('end_session', value, {
                                shouldValidate: true,
                                shouldDirty: true,
                            })
                        }
                        error={errors.end_session?.message}
                        helper={
                            startDate !== endDate
                                ? 'Applied to the end date of the range.'
                                : undefined
                        }
                        testIDPrefix="leave-end-session"
                    />

                    <Controller
                        control={control}
                        name="reason"
                        render={({ field }) => (
                            <AppTextInput
                                label="Reason"
                                multiline
                                numberOfLines={4}
                                maxHeight={NOTES_MAX_HEIGHT}
                                placeholder="Optional — add context for your approver (max 1000)."
                                testID="leave-reason"
                                value={field.value ?? ''}
                                onChangeText={text => {
                                    field.onChange(text);
                                    clearRootError();
                                }}
                                onBlur={field.onBlur}
                                error={errors.reason?.message}
                            />
                        )}
                    />

                    <AppCard>
                        <View style={{ gap: theme.spacing.sm }}>
                            <AppText variant="bodyStrong">Attachments</AppText>
                            <AppText variant="caption" color="textMuted">
                                Up to {LEAVE_ATTACHMENT_MAX_COUNT} files · pdf, jpg, jpeg, png,
                                doc, docx · 5MB each. Sent as multipart upload.
                            </AppText>

                            {attachments.map(item => (
                                <View
                                    key={item.name}
                                    testID={`leave-attachment-${item.name}`}
                                    style={[styles.attachmentRow, { gap: theme.spacing.sm }]}>
                                    <AppText
                                        variant="caption"
                                        numberOfLines={1}
                                        style={styles.attachmentName}>
                                        {item.name}
                                    </AppText>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`Remove ${item.name}`}
                                        testID={`leave-attachment-remove-${item.name}`}
                                        onPress={() => handleRemoveAttachment(item.name)}
                                        hitSlop={theme.spacing.sm}>
                                        <AppText variant="caption" color="danger">
                                            Remove
                                        </AppText>
                                    </Pressable>
                                </View>
                            ))}

                            <AppTextInput
                                label="File name"
                                placeholder="e.g. certificate.pdf"
                                autoCapitalize="none"
                                testID="leave-attachment-input"
                                value={pendingFileName}
                                onChangeText={text => {
                                    setPendingFileName(text);
                                    clearRootError();
                                }}
                                error={attachmentError ?? undefined}
                                helper={
                                    attachmentError
                                        ? undefined
                                        : 'On-device picker lands with the native file module; file names are validated here.'
                                }
                            />
                            <AppButton
                                label={attachments.length > 0 ? 'Add another file' : 'Add file'}
                                variant="secondary"
                                size="sm"
                                fullWidth={false}
                                onPress={handleAddAttachment}
                                testID="leave-attachment-add"
                            />
                        </View>
                    </AppCard>

                    {errors.root ? (
                        <AppText variant="caption" color="danger" testID="leave-error-root">
                            {errors.root.message}
                        </AppText>
                    ) : null}

                    <AppText variant="caption" color="textMuted">
                        Requests are subject to approval and to your available leave balance,
                        which is checked when your request is reviewed. Pending requests
                        cannot be withdrawn from the app.
                    </AppText>
                </ScrollView>
            </KeyboardAwareView>

            <StickyActionTray testID="leave-submit-tray">
                {blockedReason !== null ? (
                    <AppText variant="caption" color="textMuted" testID="leave-offline-notice">
                        {blockedReason}
                    </AppText>
                ) : null}
                <AppButton
                    label="Submit request"
                    onPress={onSubmit}
                    loading={isSubmitting || createRequest.isPending}
                    disabled={isBlocked}
                    size="lg"
                    testID="leave-submit"
                />
            </StickyActionTray>

            <BottomSheet
                visible={pendingExit !== null}
                onClose={() => setPendingExit(null)}
                icon={AlertTriangleGlyph}
                tone="warning"
                title="Discard request?"
                description="You have unsaved changes. Discard this leave request?"
                actions={discardSheetActions}
                testID="discard-leave-request-sheet"
            />

            {/*
             * The picker modal is rendered once, at the screen root, and only when a
             * native module is actually present. `renderModal` is `null` otherwise, so
             * nothing here can render a modal that cannot open.
             */}
            {picker.renderModal?.()}
        </ScreenContainer>
    );
}

type SessionSelectorProps = {
    label: string;
    selected: LeaveSession;
    options: readonly LeaveSession[];
    onSelect: (value: LeaveSession) => void;
    error?: string;
    helper?: string;
    testIDPrefix: string;
};

/**
 * Session picker for one end of the range.
 *
 * Now a `SegmentedControl` rather than the hand-rolled chip row it replaces: the
 * options are a closed, three-value set of comparable labels, which is exactly what a
 * segmented control is for, and it brings radio semantics and its own pressed state
 * with it.
 */
function SessionSelector({
    label,
    selected,
    options,
    onSelect,
    error,
    helper,
    testIDPrefix,
}: SessionSelectorProps): React.JSX.Element {
    const theme = useTheme();

    const segmentOptions = useMemo<SegmentedOption[]>(
        () => options.map(session => ({ value: session, label: SESSION_LABELS[session] })),
        [options],
    );

    return (
        <View style={{ gap: theme.spacing.sm }} testID={testIDPrefix}>
            <AppText variant="caption" color="textSecondary">
                {label}
            </AppText>

            <SegmentedControl
                options={segmentOptions}
                value={selected}
                onChange={next => onSelect(next as LeaveSession)}
                accessibilityLabel={label}
                testID={`${testIDPrefix}-control`}
            />

            {error ? (
                <AppText variant="caption" color="danger" testID={`${testIDPrefix}-error`}>
                    {error}
                </AppText>
            ) : helper ? (
                <AppText variant="caption" color="textMuted" testID={`${testIDPrefix}-helper`}>
                    {helper}
                </AppText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingBottom: spacing.xxl,
    },
    attachmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    attachmentName: {
        flex: 1,
        minWidth: 0,
    },
});
