import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { AppCard } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { AppListItem } from '../../../components/AppListItem';
import { AppText } from '../../../components/AppText';
import { SkeletonRows } from '../../../components/Skeleton';
import { ScreenContainer } from '../../../components/ScreenContainer';
import type { AccountStackParamList } from '../../../navigation/types';
import { usePushStatus } from '../../../services/push';
import { openSystemSettings } from '../../../services/push/pushStatus';
import { spacing, useTheme } from '../../../theme';
import { usePreferencesStore, type AppearancePreference } from '../store';

/** Human-readable label for each registration state. */
const REGISTRATION_LABEL: Record<string, string> = {
    registered: 'Registered',
    pending: 'Waiting to sync',
    failed: 'Not registered',
    unregistered: 'Not registered',
    unknown: 'Checking…',
};

/** Human-readable label for each OS permission state. */
const PERMISSION_LABEL: Record<string, string> = {
    granted: 'Allowed',
    denied: 'Blocked in device settings',
    'not-determined': 'Not requested yet',
    unsupported: 'Not available in this build',
    unknown: 'Checking…',
};

/** Order and copy for the appearance picker. `system` is listed first (default). */
const APPEARANCE_OPTIONS: ReadonlyArray<{ value: AppearancePreference; label: string }> = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
];

type Props = NativeStackScreenProps<AccountStackParamList, 'Preferences'>;

/**
 * Preferences.
 *
 * These are device-local UI settings held in [`usePreferencesStore`](src/features/settings/store/preferencesStore.ts:1) —
 * nothing here is sent to the API, which is why this is Zustand and not a query.
 *
 * The push toggle is an *app-level* opt-in layered on top of the OS permission. It is
 * deliberately not presented as a way to grant permission: if the OS has denied push,
 * turning this on cannot help, so the screen says so rather than letting the user flip
 * a switch that has no effect.
 */
export function PreferencesScreen(_props: Props): React.JSX.Element {
    const theme = useTheme();

    const isHydrated = usePreferencesStore(state => state.isHydrated);
    const pushEnabled = usePreferencesStore(state => state.pushEnabled);
    const rosterWeekView = usePreferencesStore(state => state.rosterWeekView);
    const appearance = usePreferencesStore(state => state.appearance);
    const setPushEnabled = usePreferencesStore(state => state.setPushEnabled);
    const setRosterWeekView = usePreferencesStore(state => state.setRosterWeekView);
    const setAppearance = usePreferencesStore(state => state.setAppearance);
    const reset = usePreferencesStore(state => state.reset);

    const pushStatus = usePushStatus();
    const [retrying, setRetrying] = useState(false);

    const onRetry = async (): Promise<void> => {
        setRetrying(true);

        try {
            await pushStatus.retry();
        } finally {
            setRetrying(false);
        }
    };

    if (!isHydrated) {
        return (
            <ScreenContainer hasHeader>
                <AppHeader title="Preferences" />
                {/* The settings list is a fixed set of rows, so the skeleton can
                    match its count and geometry exactly. */}
                <SkeletonRows count={4} />
            </ScreenContainer>
        );
    }

    return (
        <ScreenContainer hasHeader>
            <AppHeader title="Preferences" subtitle="How the app works on this device." />

            <ScrollView contentContainerStyle={[styles.content, { gap: theme.spacing.md }]}>
                <View style={{ gap: theme.spacing.sm }}>
                    <AppText variant="caption" color="textSecondary">
                        Notifications
                    </AppText>

                    <AppCard padded={false}>
                        <AppListItem
                            label="Push notifications"
                            isLast
                            onPress={() => {
                                void setPushEnabled(!pushEnabled);
                            }}
                            trailing={
                                <Switch
                                    value={pushEnabled}
                                    onValueChange={value => {
                                        void setPushEnabled(value);
                                    }}
                                />
                            }
                        />
                    </AppCard>

                    <AppText variant="caption" color="textMuted">
                        Shift and roster updates are sent as push notifications. If notifications are
                        blocked in your device settings, turning this on will not override that.
                    </AppText>

                    {/**
                     * Status block. Push failures are non-fatal by design, so without this
                     * a user would have no way to know notifications are not working, or
                     * why. Permission and registration are shown separately because they
                     * fail separately and have different remedies.
                     */}
                    <AppCard padded={false} testID="push-status">
                        <AppListItem
                            label="Device permission"
                            isLast={false}
                            trailing={
                                <AppText
                                    variant="bodyStrong"
                                    color={pushStatus.permission === 'granted' ? 'successStrong' : 'warningStrong'}>
                                    {PERMISSION_LABEL[pushStatus.permission] ?? 'Unknown'}
                                </AppText>
                            }
                        />
                        <AppListItem
                            label="Registration"
                            isLast
                            trailing={
                                <AppText
                                    variant="bodyStrong"
                                    color={pushStatus.registration === 'registered' ? 'successStrong' : 'textSecondary'}>
                                    {REGISTRATION_LABEL[pushStatus.registration] ?? 'Unknown'}
                                </AppText>
                            }
                        />
                    </AppCard>

                    {pushStatus.message !== null ? (
                        <AppText
                            variant="caption"
                            color={pushStatus.isPermissionDenied ? 'dangerStrong' : 'textMuted'}
                            testID="push-status-message">
                            {pushStatus.message}
                        </AppText>
                    ) : null}

                    {pushStatus.isPermissionDenied ? (
                        <AppButton
                            label="Open device settings"
                            variant="secondary"
                            size="sm"
                            fullWidth={false}
                            testID="push-open-settings"
                            onPress={() => {
                                void openSystemSettings();
                            }}
                        />
                    ) : null}

                    {pushEnabled && !pushStatus.isHealthy && !pushStatus.isPermissionDenied ? (
                        <AppButton
                            label="Retry registration"
                            variant="secondary"
                            size="sm"
                            fullWidth={false}
                            loading={retrying}
                            testID="push-retry-registration"
                            onPress={() => {
                                void onRetry();
                            }}
                        />
                    ) : null}
                </View>

                <View style={{ gap: theme.spacing.sm }}>
                    <AppText variant="caption" color="textSecondary">
                        Appearance
                    </AppText>

                    <View style={[styles.segmented, { gap: theme.spacing.xs }]}>
                        {APPEARANCE_OPTIONS.map(option => {
                            const isSelected = option.value === appearance;

                            return (
                                <Pressable
                                    key={option.value}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isSelected }}
                                    testID={`appearance-${option.value}`}
                                    onPress={() => {
                                        void setAppearance(option.value);
                                    }}
                                    style={[
                                        styles.segment,
                                        {
                                            borderRadius: theme.radius.md,
                                            borderWidth: theme.sizing.borderWidths.hairline,
                                            borderColor: isSelected
                                                ? theme.colors.primary
                                                : theme.colors.border,
                                            backgroundColor: isSelected
                                                ? theme.colors.primarySoft
                                                : theme.colors.surface,
                                        },
                                    ]}>
                                    <AppText
                                        variant="bodyStrong"
                                        color={isSelected ? 'textLink' : 'textSecondary'}
                                        align="center">
                                        {option.label}
                                    </AppText>
                                </Pressable>
                            );
                        })}
                    </View>

                    <AppText variant="caption" color="textMuted">
                        System follows your device setting. Choosing Light or Dark pins the app to
                        that appearance on this device.
                    </AppText>
                </View>

                <View style={{ gap: theme.spacing.sm }}>
                    <AppText variant="caption" color="textSecondary">
                        Roster
                    </AppText>

                    <AppCard padded={false}>
                        <AppListItem
                            label="Open rosters in week view"
                            isLast
                            onPress={() => {
                                void setRosterWeekView(!rosterWeekView);
                            }}
                            trailing={
                                <Switch
                                    value={rosterWeekView}
                                    onValueChange={value => {
                                        void setRosterWeekView(value);
                                    }}
                                />
                            }
                        />
                    </AppCard>
                </View>

                <View style={{ gap: theme.spacing.sm }}>
                    <AppText variant="caption" color="textSecondary">
                        Reset
                    </AppText>

                    <AppCard padded={false}>
                        <AppListItem
                            label="Restore default preferences"
                            isLast
                            destructive
                            onPress={() => {
                                void reset();
                            }}
                        />
                    </AppCard>

                    <AppText variant="caption" color="textMuted">
                        This only affects settings on this device. It does not change your account or
                        your notification history.
                    </AppText>
                </View>
            </ScrollView>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingBottom: spacing.xxl,
    },
    /** Equal-width segments laid out in a row. */
    segmented: {
        flexDirection: 'row',
    },
    segment: {
        flex: 1,
        // `sm`/`xs` rather than the previous 10/8: 10 is the one value that sat
        // between two grid steps, which is what made this control's label look
        // fractionally mis-centred next to every other chip in the app.
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.sm,
    },
});
