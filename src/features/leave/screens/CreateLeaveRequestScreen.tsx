import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { AppCard, Divider } from '../../../components/AppCard';
import { AppIcon } from '../../../components/AppIcon';
import { PaperclipGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { DateField } from '../../../components/DateField';
import { KeyboardAwareView } from '../../../components/KeyboardAwareView';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { StickyActionTray } from '../../../components/StickyActionTray';
import { PrimaryButton, SegmentedControl, TextField } from '../../../components/ui';
import { useClearRootError } from '../../../hooks';
import type { LeaveStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme/useTheme';
import type { LeaveSession } from '../../../types/api';
import { isAppError } from '../../../types/appError';
import { announceForAccessibility } from '../../../utils/accessibility';
import { todayApiDate } from '../../../utils/date';
import { toFieldErrorMap } from '../../../utils/errors';
import { useSessionValidity } from '../../auth/hooks/useSessionValidity';
import { useSessionStore } from '../../auth/store/sessionStore';
import { AuthHeader } from '../../auth/components';
import { LeaveTypeChips } from '../components';
import { useCreateLeaveRequest, useLeaveTypes } from '../hooks';
import type { LeaveAttachmentInput, LeaveType } from '../types';
import { useDatePicker } from '../utils/datePicker';
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

/** The spec's body gutter. */
const BODY_GUTTER = 20;
/** Space the scroller must leave for the sticky submit tray. */
const SUBMIT_TRAY_RESERVE = 52 + 16 * 2 + 24;
/** The spec's "Add file" button height. */
const ADD_FILE_HEIGHT = 48;
/** The spec's "Add file" button radius. */
const ADD_FILE_RADIUS = 14;
/** The spec's paperclip glyph size. */
const PAPERCLIP_SIZE = 18;

/**
 * Request Leave (spec Screen 9).
 *
 * A guided single-column form: leave type chips, two date rows that open a real
 * picker, an estimated-total block, two segmented session controls, a reason box
 * and an attachments card, over a sticky submit bar.
 *
 * - `leave_type_id/start_date/end_date` required; `start_session/end_session`
 *   nullable slots; `total_days` hint (server recalculates); `reason` max 1000;
 *   `attachments` max 5 (`pdf,jpg,jpeg,png,doc,docx`, 5MB each) sent as
 *   `multipart/form-data` when present, else JSON.
 * - `employee_id` **is** sent, resolved from the session's `user.employee_id`.
 * - G2: `GET /leave-types` 403 → "types unavailable — contact admin" fallback + retry.
 * - G6: no cancel/withdraw endpoint — no cancel UI is built.
 * - Success → back to the leave list (which refetches on focus); error → stay with
 *   field errors.
 * - Back/cancel navigates straight back — there is no unsaved-changes prompt.
 */
export function CreateLeaveRequestScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const leaveTypes = useLeaveTypes();
    const createRequest = useCreateLeaveRequest();
    const employeeId = useSessionStore(state => state.user?.employee_id ?? null);
    const { canMutate, blockedReason } = useSessionValidity();
    const [attachments, setAttachments] = useState<LeaveAttachmentInput[]>([]);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [pendingFileName, setPendingFileName] = useState('');

    // One picker for the whole screen, not one per field.
    const picker = useDatePicker();

    const {
        control,
        clearErrors,
        handleSubmit,
        setValue,
        setError,
        watch,
        formState: { errors, isSubmitting },
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

    const clearRootError = useClearRootError(clearErrors, errors.root !== undefined);

    const selectedTypeId = watch('leave_type_id');
    const startSession = watch('start_session');
    const endSession = watch('end_session');
    const startDate = watch('start_date');
    const endDate = watch('end_date');

    const selectedType = useMemo(
        () => leaveTypes.leaveTypes.find((type: LeaveType) => type.id === selectedTypeId),
        [leaveTypes.leaveTypes, selectedTypeId],
    );

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

    const sessionOptions = useMemo(
        () =>
            availableSessions.map(session => ({
                value: session,
                label: SESSION_LABELS[session],
            })),
        [availableSessions],
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

        setAttachments(previous => [...previous, { uri: `file://${name}`, name, mimeType }]);
        setPendingFileName('');
        setAttachmentError(null);
        clearRootError();
    };

    const handleRemoveAttachment = (name: string): void => {
        setAttachments(previous => previous.filter(item => item.name !== name));
    };

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
            await createRequest.mutateAsync({
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

            announceForAccessibility('Leave request submitted.');
            // Return to the list the user came from. The list refetches on focus, so
            // the new request appears without a manual pull-to-refresh.
            navigation.goBack();
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

    return (
        <ScreenContainer hasHeader scrollable={false} withGutter={false}>
            <AuthHeader
                title="Request leave"
                subtitle="Submit a request for approval."
                onBack={() => navigation.goBack()}
            />

            <KeyboardAwareView
                ownsTopInset={false}
                contentContainerStyle={{ paddingHorizontal: 0, paddingBottom: SUBMIT_TRAY_RESERVE }}>
                <View style={styles.body}>
                    {/* ---- Leave type ---- */}
                    <AppText variant="caption" color="textSecondary" style={styles.sectionLabel}>
                        Leave type
                    </AppText>

                    {leaveTypes.isLoading ? (
                        <AppText variant="caption" color="textMuted" style={styles.gutter}>
                            Loading leave types…
                        </AppText>
                    ) : leaveTypes.isUnsupported ? (
                        <AppCard
                            testID="leave-types-gap-banner"
                            style={{ ...styles.gutter, backgroundColor: theme.colors.warningSoft }}>
                            <View style={{ gap: theme.spacing.xs }}>
                                <AppText variant="bodyStrong" color="warningStrong">
                                    Leave types unavailable — contact admin
                                </AppText>
                                <AppText variant="caption" color="warningStrong">
                                    Your role cannot load leave types right now (missing
                                    permission). A request needs a type, so submission is paused
                                    until this is fixed.
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
                    ) : leaveTypes.isError ? (
                        <AppCard
                            testID="leave-types-error"
                            style={{ ...styles.gutter, backgroundColor: theme.colors.dangerSoft }}>
                            <View style={{ gap: theme.spacing.xs }}>
                                <AppText variant="bodyStrong" color="dangerStrong">
                                    Could not load leave types
                                </AppText>
                                <AppText variant="caption" color="dangerStrong">
                                    {leaveTypes.error?.message ??
                                        'Check your connection and try again.'}
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
                    ) : (
                        <LeaveTypeChips
                            types={leaveTypes.leaveTypes}
                            selectedId={selectedTypeId}
                            onSelect={id =>
                                setValue('leave_type_id', id, {
                                    shouldValidate: true,
                                    shouldDirty: true,
                                })
                            }
                            testID="leave-type-chips"
                        />
                    )}

                    {errors.leave_type_id ? (
                        <AppText
                            variant="caption"
                            color="danger"
                            style={styles.gutter}
                            testID="leave-error-type">
                            {errors.leave_type_id.message}
                        </AppText>
                    ) : null}

                    {/* ---- Dates ---- */}
                    <View style={[styles.gutter, styles.dateBlock]}>
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
                                    onRequestPicker={handleRequestPicker(
                                        'start_date',
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
                                    helper={startDate === endDate ? 'Single-day request.' : undefined}
                                    minimumDate={startDate}
                                    onRequestPicker={handleRequestPicker('end_date')}
                                />
                            )}
                        />
                    </View>

                    {/* ---- Estimated total ---- */}
                    <View style={styles.gutter}>
                        <Divider />
                        <View style={styles.totalBlock}>
                            <AppText variant="caption" color="textMuted">
                                Estimated total
                            </AppText>
                            <AppText variant="title" color="text" testID="leave-total-preview">
                                {previewValid ? formatDays(totalPreview) : '—'}
                            </AppText>
                            <AppText variant="caption" color="textMuted" style={styles.totalNote}>
                                Preview only — the server recalculates the final total from the
                                working calendar.
                            </AppText>
                        </View>
                    </View>

                    {/* ---- Sessions ---- */}
                    <View style={[styles.gutter, styles.sessionBlock]}>
                        <AppText variant="caption" color="textSecondary" style={styles.sectionLabel}>
                            Starts
                        </AppText>
                        <SegmentedControl
                            options={sessionOptions}
                            value={startSession ?? 'full_day'}
                            onChange={value =>
                                setValue('start_session', value as LeaveSession, {
                                    shouldValidate: true,
                                    shouldDirty: true,
                                })
                            }
                            accessibilityLabel="Starts"
                            testID="leave-start-session"
                        />
                        {errors.start_session ? (
                            <AppText variant="caption" color="danger">
                                {errors.start_session.message}
                            </AppText>
                        ) : null}

                        <AppText
                            variant="caption"
                            color="textSecondary"
                            style={[styles.sectionLabel, styles.endsLabel]}>
                            Ends
                        </AppText>
                        <SegmentedControl
                            options={sessionOptions}
                            value={endSession ?? 'full_day'}
                            onChange={value =>
                                setValue('end_session', value as LeaveSession, {
                                    shouldValidate: true,
                                    shouldDirty: true,
                                })
                            }
                            accessibilityLabel="Ends"
                            testID="leave-end-session"
                        />
                        {errors.end_session ? (
                            <AppText variant="caption" color="danger">
                                {errors.end_session.message}
                            </AppText>
                        ) : null}
                    </View>

                    {/* ---- Reason ---- */}
                    <View style={[styles.gutter, styles.reasonBlock]}>
                        <Controller
                            control={control}
                            name="reason"
                            render={({ field }) => (
                                <TextField
                                    label="Reason"
                                    multiline
                                    numberOfLines={4}
                                    placeholder="Optional — add context for your approver"
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
                    </View>

                    {/* ---- Attachments ---- */}
                    <View style={[styles.gutter, styles.attachmentsBlock]}>
                        <AppCard
                            testID="leave-attachments-card"
                            style={styles.attachmentsCard}>
                            <AppText variant="heading" color="text">
                                Attachments
                            </AppText>
                            <AppText
                                variant="caption"
                                color="textSecondary"
                                style={styles.attachmentsHelper}>
                                Up to {LEAVE_ATTACHMENT_MAX_COUNT} files · pdf, jpg, jpeg, png, doc,
                                docx · 5MB each.
                            </AppText>

                            {attachments.length > 0 ? (
                                <View style={styles.attachmentChips}>
                                    {attachments.map(item => (
                                        <View
                                            key={item.name}
                                            testID={`leave-attachment-${item.name}`}
                                            style={[
                                                styles.attachmentChip,
                                                { backgroundColor: theme.colors.surfaceMuted },
                                            ]}>
                                            <AppText
                                                variant="caption"
                                                color="text"
                                                numberOfLines={1}
                                                style={styles.attachmentChipName}>
                                                {item.name}
                                            </AppText>
                                            <Pressable
                                                accessibilityRole="button"
                                                accessibilityLabel={`Remove ${item.name}`}
                                                testID={`leave-attachment-remove-${item.name}`}
                                                onPress={() => handleRemoveAttachment(item.name)}
                                                hitSlop={8}>
                                                <AppText variant="caption" color="danger">
                                                    Remove
                                                </AppText>
                                            </Pressable>
                                        </View>
                                    ))}
                                </View>
                            ) : null}

                            <TextField
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
                            />

                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Add file"
                                testID="leave-attachment-add"
                                onPress={handleAddAttachment}
                                style={({ pressed }) => [
                                    styles.addFile,
                                    {
                                        backgroundColor: pressed
                                            ? theme.colors.surfaceSunken
                                            : theme.colors.surfaceMuted,
                                    },
                                ]}>
                                <AppIcon
                                    icon={PaperclipGlyph}
                                    sizePoints={PAPERCLIP_SIZE}
                                    color="text"
                                />
                                <AppText variant="bodyStrong" color="text">
                                    Add file
                                </AppText>
                            </Pressable>
                        </AppCard>
                    </View>

                    {errors.root ? (
                        <AppText
                            variant="caption"
                            color="danger"
                            style={styles.gutter}
                            testID="leave-error-root">
                            {errors.root.message}
                        </AppText>
                    ) : null}

                    <AppText
                        variant="caption"
                        color="textSecondary"
                        align="center"
                        style={styles.footer}>
                        Requests are subject to approval and to your available leave balance, which
                        is checked when your request is reviewed. Pending requests cannot be
                        withdrawn from the app.
                    </AppText>
                </View>
            </KeyboardAwareView>

            <StickyActionTray testID="leave-submit-tray">
                {blockedReason !== null ? (
                    <AppText variant="caption" color="textMuted" testID="leave-offline-notice">
                        {blockedReason}
                    </AppText>
                ) : null}
                <PrimaryButton
                    label="Submit request"
                    onPress={onSubmit}
                    loading={isSubmitting || createRequest.isPending}
                    disabled={isBlocked}
                    testID="leave-submit"
                />
            </StickyActionTray>

            {/* The picker modal is rendered once, at the screen root. */}
            {picker.renderModal?.()}
        </ScreenContainer>
    );
}

/** `1` → "1 day", `0.5` → "0.5 days". */
function formatDays(days: number): string {
    return `${days} day${days === 1 ? '' : 's'}`;
}

const styles = StyleSheet.create({
    body: {
        paddingTop: 16,
    },
    gutter: {
        paddingHorizontal: BODY_GUTTER,
    },
    sectionLabel: {
        marginBottom: 8,
    },
    dateBlock: {
        marginTop: 24,
        gap: 16,
    },
    totalBlock: {
        marginVertical: 20,
        gap: 4,
    },
    totalNote: {
        marginTop: 4,
    },
    sessionBlock: {
        gap: 8,
    },
    endsLabel: {
        marginTop: 16,
    },
    reasonBlock: {
        marginTop: 24,
    },
    attachmentsBlock: {
        marginTop: 24,
    },
    attachmentsCard: {
        gap: 12,
    },
    attachmentsHelper: {
        marginTop: -4,
    },
    attachmentChips: {
        gap: 8,
    },
    attachmentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
    },
    attachmentChipName: {
        flex: 1,
        minWidth: 0,
    },
    addFile: {
        height: ADD_FILE_HEIGHT,
        borderRadius: ADD_FILE_RADIUS,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 12,
    },
    footer: {
        marginTop: 20,
        paddingHorizontal: BODY_GUTTER,
    },
});
