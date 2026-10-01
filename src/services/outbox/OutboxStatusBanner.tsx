import { StyleSheet, View } from 'react-native';

import { AppButton, AppIcon, AppText, AlertTriangleGlyph, CheckGlyph, ClockGlyph } from '../../components';
import { useTheme } from '../../theme';
import { selectOutboxSummary, useOutboxStore } from './outboxStore';
import { syncOutbox } from './syncOutbox';

/**
 * Outbox status banner.
 *
 * Makes deferred writes **visible**, which is the whole point of the outbox: a user
 * must never be led to believe a write succeeded when the server has not received it.
 * It renders nothing when the queue is empty.
 *
 * Two states:
 *
 * - **Pending** — "N change(s) waiting to sync", with a spinner while a flush is in
 *   flight. Informational; the user need do nothing.
 * - **Failed** — "N change(s) couldn't be saved", with a **Retry** that re-arms the
 *   dead-lettered entries and flushes immediately. This is the only place a queued
 *   write becomes a user-actionable failure.
 */
export function OutboxStatusBanner(): React.JSX.Element | null {
    const theme = useTheme();

    const entries = useOutboxStore(state => state.entries);
    const isFlushing = useOutboxStore(state => state.isFlushing);
    const retry = useOutboxStore(state => state.retry);

    const summary = selectOutboxSummary(entries);

    if (summary.total === 0) {
        return null;
    }

    const hasFailed = summary.failedCount > 0;

    const onRetry = (): void => {
        void (async () => {
            const failed = useOutboxStore.getState().entries.filter(entry => entry.status === 'failed');

            for (const entry of failed) {
                await retry(entry.id);
            }

            await syncOutbox();
        })();
    };

    return (
        <View
            testID="outbox-status-banner"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[
                styles.root,
                {
                    backgroundColor: hasFailed ? theme.colors.dangerSoft : theme.colors.infoSoft,
                    borderBottomColor: hasFailed ? theme.colors.danger : theme.colors.primaryBorder,
                },
            ]}>
            <AppIcon
                icon={hasFailed ? AlertTriangleGlyph : ClockGlyph}
                size="small"
                color={hasFailed ? 'dangerStrong' : 'infoStrong'}
            />

            <AppText
                variant="label"
                style={[styles.label, { color: hasFailed ? theme.colors.dangerStrong : theme.colors.infoStrong }]}>
                {hasFailed
                    ? `${summary.failedCount} change${summary.failedCount === 1 ? '' : 's'} couldn't be saved.`
                    : isFlushing
                        ? `Syncing ${summary.pendingCount} change${summary.pendingCount === 1 ? '' : 's'}…`
                        : `${summary.pendingCount} change${summary.pendingCount === 1 ? '' : 's'} waiting to sync.`}
            </AppText>

            {hasFailed ? (
                <AppButton label="Retry" variant="text" size="sm" fullWidth={false} onPress={onRetry} />
            ) : (
                <AppIcon icon={CheckGlyph} size="small" color="infoStrong" />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    label: {
        flexShrink: 1,
    },
});
