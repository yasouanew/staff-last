import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppCard } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { AppText } from '../../../components/AppText';
import { ErrorView } from '../../../components/ErrorView';
import { SkeletonDetail } from '../../../components/Skeleton';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { StatusBadge } from '../../../components/StatusBadge';
import type { LeaveStackParamList } from '../../../navigation/types';
import { spacing, useTheme } from '../../../theme';
import { formatDate, formatRelative } from '../../../utils/date';
import { useLeaveRequestDetail } from '../hooks';
import type { LeaveRequest } from '../types';
import {
    attachmentFileName,
    formatTotalDays,
    resolveAttachmentUrl,
    sessionLabel,
} from '../utils/leaveRequest';

type Props = NativeStackScreenProps<LeaveStackParamList, 'LeaveDetail'>;

function DetailRow({ label, value }: { label: string; value: string }): React.JSX.Element {
    const theme = useTheme();

    return (
        <View style={[styles.detailRow, { gap: theme.spacing.sm }]}>
            <AppText variant="caption" color="textSecondary">
                {label}
            </AppText>
            <AppText variant="body" style={styles.detailValue}>
                {value}
            </AppText>
        </View>
    );
}

/**
 * Leave Details (spec Screen 10).
 *
 * Read-only by design. The backend exposes no cancel/withdraw route for employee
 * roles (spec G6), and `approve` / `reject` endpoints are forbidden for employees
 * by design — none of those actions are offered here.
 *
 * Attachments arrive as relative paths on the `public` disk; they are resolved via
 * `APP_URL/storage/` prefixing (spec Screen 10 §3) and opened in the system viewer.
 */
export function LeaveDetailScreen({ route, navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const { leaveRequestId } = route.params;
    const query = useLeaveRequestDetail(leaveRequestId);

    if (query.isPending) {
        return (
            <ScreenContainer hasHeader>
                <AppHeader title="Leave request" onBack={() => navigation.goBack()} />
                <SkeletonDetail />
            </ScreenContainer>
        );
    }

    if (query.isError) {
        return (
            <ScreenContainer hasHeader>
                <AppHeader title="Leave request" onBack={() => navigation.goBack()} />
                <ErrorView error={query.error} onRetry={() => void query.refetch()} />
            </ScreenContainer>
        );
    }

    const request: LeaveRequest = query.data;
    const sessions = sessionLabel(
        request.start_date,
        request.end_date,
        request.start_session,
        request.end_session,
    );
    const allAttachments = [
        ...(request.attachments ?? []),
        ...(request.attachment && !request.attachments?.includes(request.attachment)
            ? [request.attachment]
            : []),
    ];
    const deciderName =
        request.status === 'approved'
            ? (request.approver?.name ?? (request.approved_by ? `User #${request.approved_by}` : null))
            : request.status === 'rejected'
                ? (request.rejecter?.name ?? (request.rejected_by ? `User #${request.rejected_by}` : null))
                : null;

    const handleOpenAttachment = (path: string): void => {
        const url = resolveAttachmentUrl(path);

        void Linking.openURL(url).catch(() => {
            // System viewer unavailable — stay on screen; the URL is still visible.
        });
    };

    return (
        <ScreenContainer hasHeader>
            <AppHeader
                title="Leave request"
                subtitle={request.leave_type?.name ?? 'Leave'}
                onBack={() => navigation.goBack()}
            />

            <ScrollView
                contentContainerStyle={[styles.content, { gap: theme.spacing.md }]}
                testID="leave-detail-scroll">
                <AppCard
                    testID="leave-detail-banner"
                    style={{
                        backgroundColor:
                            request.status === 'approved'
                                ? theme.colors.successSoft
                                : request.status === 'rejected'
                                    ? theme.colors.dangerSoft
                                    : theme.colors.warningSoft,
                    }}>
                    <View style={[styles.statusRow, { gap: theme.spacing.sm }]}>
                        <View style={{ gap: theme.spacing.xxs }}>
                            <AppText variant="subtitle">{request.leave_type?.name ?? 'Leave'}</AppText>
                            <AppText variant="caption" color="textSecondary">
                                {formatDate(request.start_date, { long: true })} →{' '}
                                {formatDate(request.end_date, { long: true })}
                            </AppText>
                        </View>
                        <StatusBadge status={request.status} />
                    </View>
                </AppCard>

                <AppCard>
                    <View style={{ gap: theme.spacing.sm }}>
                        <DetailRow
                            label="Dates"
                            value={`${formatDate(request.start_date, { long: true })} → ${formatDate(
                                request.end_date,
                                { long: true },
                            )}`}
                        />
                        <DetailRow label="Session" value={sessions} />
                        <DetailRow label="Total days" value={formatTotalDays(request.total_days)} />
                        {request.leave_type ? (
                            <DetailRow
                                label="Type"
                                value={`${request.leave_type.name}${request.leave_type.is_paid ? ' · Paid' : ' · Unpaid'}`}
                            />
                        ) : null}
                    </View>
                </AppCard>

                {request.reason ? (
                    <AppCard testID="leave-detail-reason">
                        <View style={{ gap: theme.spacing.sm }}>
                            <AppText variant="caption" color="textSecondary">
                                Reason
                            </AppText>
                            <AppText variant="body">{request.reason}</AppText>
                        </View>
                    </AppCard>
                ) : null}

                <AppCard testID="leave-detail-attachments">
                    <View style={{ gap: theme.spacing.sm }}>
                        <AppText variant="bodyStrong">
                            Attachments{allAttachments.length > 0 ? ` (${allAttachments.length})` : ''}
                        </AppText>
                        {allAttachments.length === 0 ? (
                            <AppText variant="caption" color="textMuted">
                                No attachments on this request.
                            </AppText>
                        ) : (
                            allAttachments.map(path => (
                                <Pressable
                                    key={path}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Open ${attachmentFileName(path)}`}
                                    testID={`leave-attachment-${attachmentFileName(path)}`}
                                    onPress={() => handleOpenAttachment(path)}
                                    style={[
                                        styles.attachmentRow,
                                        {
                                            borderColor: theme.colors.border,
                                            borderRadius: theme.radius.md,
                                            paddingVertical: theme.spacing.sm,
                                            paddingHorizontal: theme.spacing.sm,
                                        },
                                    ]}>
                                    <AppText variant="caption" numberOfLines={1} style={styles.attachmentName}>
                                        {attachmentFileName(path)}
                                    </AppText>
                                    <AppText variant="caption" color="textLink">
                                        View
                                    </AppText>
                                </Pressable>
                            ))
                        )}
                    </View>
                </AppCard>

                <AppCard testID="leave-detail-decision">
                    <View style={{ gap: theme.spacing.sm }}>
                        <AppText variant="bodyStrong">Decision</AppText>
                        <DetailRow label="Submitted" value={formatRelative(request.created_at)} />
                        {request.approved_at ? (
                            <DetailRow label="Approved" value={formatRelative(request.approved_at)} />
                        ) : null}
                        {request.rejected_at ? (
                            <DetailRow label="Rejected" value={formatRelative(request.rejected_at)} />
                        ) : null}
                        {deciderName ? (
                            <DetailRow
                                label={request.status === 'approved' ? 'Approver' : 'Rejecter'}
                                value={deciderName}
                            />
                        ) : null}
                        {request.admin_notes ? (
                            <View style={{ gap: theme.spacing.xxs }}>
                                <AppText variant="caption" color="textSecondary">
                                    Admin notes
                                </AppText>
                                <AppText variant="body">{request.admin_notes}</AppText>
                            </View>
                        ) : null}
                    </View>
                </AppCard>

                {request.rejection_reason ? (
                    <AppCard
                        testID="leave-detail-rejection"
                        style={{ backgroundColor: theme.colors.dangerSoft }}>
                        <View style={{ gap: theme.spacing.sm }}>
                            <AppText variant="caption" color="danger">
                                Rejection reason
                            </AppText>
                            <AppText variant="body">{request.rejection_reason}</AppText>
                        </View>
                    </AppCard>
                ) : null}

                <AppCard testID="leave-detail-timeline">
                    <View style={{ gap: theme.spacing.sm }}>
                        <AppText variant="bodyStrong">Timeline</AppText>
                        <TimelineStep done label="Submitted" value={formatRelative(request.created_at)} />
                        {request.status === 'pending' ? (
                            <TimelineStep
                                done={false}
                                label="Awaiting decision"
                                value="Your manager has not decided yet."
                            />
                        ) : null}
                        {request.status === 'approved' ? (
                            <TimelineStep
                                done
                                label={`Approved${deciderName ? ` by ${deciderName}` : ''}`}
                                value={request.approved_at ? formatRelative(request.approved_at) : ''}
                            />
                        ) : null}
                        {request.status === 'rejected' ? (
                            <TimelineStep
                                done
                                label={`Rejected${deciderName ? ` by ${deciderName}` : ''}`}
                                value={request.rejected_at ? formatRelative(request.rejected_at) : ''}
                            />
                        ) : null}
                    </View>
                </AppCard>

                {request.status === 'pending' ? (
                    <AppText variant="caption" color="textMuted" testID="leave-detail-pending-note">
                        Pending requests cannot be withdrawn from the app. Contact your manager or
                        administrator if this request needs to be cancelled.
                    </AppText>
                ) : null}
            </ScrollView>
        </ScreenContainer>
    );
}

function TimelineStep({
    done,
    label,
    value,
}: {
    done: boolean;
    label: string;
    value: string;
}): React.JSX.Element {
    const theme = useTheme();

    return (
        <View style={[styles.timelineRow, { gap: theme.spacing.sm }]}>
            <View
                style={[
                    styles.dot,
                    {
                        backgroundColor: done ? theme.colors.success : theme.colors.borderStrong,
                        borderRadius: theme.radius.full,
                    },
                ]}
            />
            <View style={styles.timelineText}>
                <AppText variant="caption">{label}</AppText>
                {value ? (
                    <AppText variant="caption" color="textMuted">
                        {value}
                    </AppText>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingBottom: spacing.xxl,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    detailValue: {
        flexShrink: 1,
        textAlign: 'right',
    },
    attachmentRow: {
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    attachmentName: {
        flex: 1,
    },
    timelineRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    dot: {
        height: 10,
        width: 10,
        marginTop: spacing.xxs,
    },
    timelineText: {
        flex: 1,
    },
});
