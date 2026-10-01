import { ScrollView, StyleSheet, View } from 'react-native';

import { AppCard } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { AppText } from '../../../components/AppText';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorView } from '../../../components/ErrorView';
import { SkeletonList } from '../../../components/Skeleton';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { StatusBadge } from '../../../components/StatusBadge';
import { ShiftCard } from '../../home/components/ShiftCard';
import { spacing, useTheme } from '../../../theme';
import type { AppError } from '../../../types/appError';
import { formatDate } from '../../../utils/date';
import { useSessionStore } from '../../auth/store/sessionStore';
import { useRosterDetail } from '../hooks';
import { filterOwnShifts } from '../utils/filterOwnShifts';

type Props = {
    navigation: { goBack: () => void; navigate: (screen: string, params: unknown) => void };
    route: { params: { rosterId: number } };
};

/**
 * Roster detail (spec Screen 5 API 3).
 *
 * `GET /rosters/{id}` eager-loads every shift on the roster — including coworkers'.
 * Mobile MUST filter `shifts where employee_id == own` (spec Screen 5 API 3), because
 * `ShiftPolicy@view` allows viewing any company shift and linking a coworker's shift
 * would leak their schedule. The filter is client-side and explicit so a missing
 * `employee_id` degrades to an explanatory empty state, never to someone else's data.
 *
 * The roster's shifts are rendered only when the roster itself has loaded, and the
 * empty state is reachable only after that success — a roster with no shifts and a
 * roster that failed to load must not look the same.
 */
export function RosterDetailScreen({ navigation, route }: Props): React.JSX.Element {
    const theme = useTheme();
    const { rosterId } = route.params;
    const query = useRosterDetail(rosterId);
    const employeeId = useSessionStore(state => state.user?.employee_id ?? null);

    if (query.isPending) {
        return (
            <ScreenContainer hasHeader>
                <AppHeader title="Roster" onBack={() => navigation.goBack()} />
                <SkeletonList count={3} />
            </ScreenContainer>
        );
    }

    if (query.isError || !query.data) {
        return (
            <ScreenContainer hasHeader>
                <AppHeader title="Roster" onBack={() => navigation.goBack()} />
                <ErrorView error={query.error as AppError} onRetry={() => void query.refetch()} />
            </ScreenContainer>
        );
    }

    const roster = query.data;
    const ownShifts = filterOwnShifts(roster.shifts ?? [], employeeId);

    return (
        <ScreenContainer hasHeader>
            <AppHeader
                title={`Week of ${formatDate(roster.week_start)}`}
                subtitle={`${formatDate(roster.week_start, { long: true })} – ${formatDate(
                    roster.week_end,
                    { long: true },
                )}`}
                onBack={() => navigation.goBack()}
            />

            <ScrollView
                contentContainerStyle={[styles.content, { padding: theme.screenGutter }]}
                showsVerticalScrollIndicator={false}>
                <AppCard>
                    <View style={[styles.metaRow, { gap: theme.spacing.sm }]}>
                        <View style={styles.metaText}>
                            <AppText variant="caption" color="textSecondary">
                                Status
                            </AppText>
                            <AppText variant="bodyStrong">
                                {roster.published_at
                                    ? `Published ${formatDate(roster.published_at.slice(0, 10))}`
                                    : 'Not published yet'}
                            </AppText>
                        </View>
                        <StatusBadge status={roster.status} />
                    </View>
                </AppCard>

                <AppText variant="subtitle">Your shifts</AppText>

                {employeeId === null ? (
                    <EmptyState
                        title="No employee record"
                        description="Your account is not linked to an employee record yet, so your shifts cannot be identified on this roster. Ask your administrator to link it."
                    />
                ) : ownShifts.length === 0 ? (
                    <EmptyState
                        title="No shifts for you"
                        description="This roster week has no shifts assigned to you. Your shifts will appear here once published."
                    />
                ) : (
                    <View style={{ gap: theme.spacing.sm }}>
                        {ownShifts.map(shift => (
                            <ShiftCard
                                key={shift.id}
                                shift={shift}
                                onPress={() =>
                                    navigation.navigate('ShiftDetail', { shiftId: shift.id })
                                }
                            />
                        ))}
                    </View>
                )}
            </ScrollView>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    content: {
        gap: spacing.md,
        paddingBottom: spacing.xxl,
    },
    metaRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    metaText: {
        flexShrink: 1,
    },
});
