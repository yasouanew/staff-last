import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppCard } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { BottomSheet, type BottomSheetAction } from '../../../components/BottomSheet';
import { AppIcon } from '../../../components/AppIcon';
import {
    AlertTriangleGlyph,
    BellGlyph,
    ShieldAlertGlyph,
    SignOutGlyph,
    SlidersGlyph,
    SunMoonGlyph,
    UserGlyph,
} from '../../../components/AppIcon/glyphs';
import { AppListItem } from '../../../components/AppListItem';
import { AppText } from '../../../components/AppText';
import { ScreenContainer } from '../../../components/ScreenContainer';
import type { AccountStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme/useTheme';
import { useColorSchemePreference } from '../../../theme/useColorSchemePreference';
import { useSession, useSignOut, useSignOutEverywhere } from '../../auth/hooks';
import { useSessionStore } from '../../auth/store/sessionStore';
import { useResendVerification } from '../../profile/hooks';
import { SettingsGroup, SettingsRow } from '../components';
import { usePreferencesStore } from '../store/preferencesStore';

type Props = NativeStackScreenProps<AccountStackParamList, 'Account'>;

/** The spec's identity avatar. */
const AVATAR_SIZE = 56;
/** The spec's initials type. */
const INITIALS_SIZE = 20;

/**
 * Account (spec Screen 11) — the settings hub.
 *
 * Structure, top to bottom:
 *
 *  1. **Identity card** — a 56pt `primarySoft` monogram beside the name (with a
 *     "Verified" pill), the email and the role.
 *  2. **Grouped settings** — Personal Details, Preferences and Session, each a
 *     labelled card of [`SettingsRow`](src/features/settings/components/SettingsRow.tsx:1)s.
 *  3. **Sign-out footnote** — the consequence of "Sign out everywhere".
 *
 * ## The safe-area fix
 *
 * The previous build nested a `ScrollView` inside `ScreenContainer`'s own scroller.
 * Two vertical scrollers in a column have no defined height contract, and the inner
 * one could paint its first child (the identity card) up under the status bar — the
 * "name overlapping the clock" defect. This screen now renders **one** scroller:
 * `ScreenContainer` is `scrollable={false}`, the `AppHeader` is a flow sibling that
 * absorbs the top inset, and the single `ScrollView` below it starts at the header's
 * lower edge. `contentInsetAdjustmentBehavior="automatic"` keeps the content clear of
 * any system chrome, and the bottom inset is added so the last row clears the tab bar.
 *
 * Why there is no avatar upload: `POST /auth/profile` accepts `name`/`email` only
 * and the avatar endpoint rejects the employee role (backend gap G4). Rendering an
 * avatar *control* here would photograph a missing capability as a working one.
 */
export function AccountScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const session = useSession();
    const cachedUser = useSessionStore(state => state.user);
    const user = session.data ?? cachedUser;

    const signOut = useSignOut();
    const signOutEverywhere = useSignOutEverywhere();
    const resendVerification = useResendVerification();

    const isVerified = user?.email_verified_at !== null && user?.email_verified_at !== undefined;

    const initials = useMemo(() => deriveInitials(user?.name), [user?.name]);

    // The appearance choice is owned by the ThemeProvider (persisted under
    // `@app/color-scheme`), not the preferences store, so the switch and the
    // rendered theme cannot disagree.
    const { colorScheme, setColorScheme, isHydrated: themeHydrated } = useColorSchemePreference();
    const darkMode = colorScheme === 'dark';
    const pushEnabled = usePreferencesStore(state => state.pushEnabled);
    const setPushEnabled = usePreferencesStore(state => state.setPushEnabled);
    const preferencesHydrated = usePreferencesStore(state => state.isHydrated);

    const handleToggleDarkMode = useCallback(
        (enabled: boolean) => {
            setColorScheme(enabled ? 'dark' : 'light');
        },
        [setColorScheme],
    );

    const handleTogglePush = useCallback(
        (enabled: boolean) => {
            void setPushEnabled(enabled);
        },
        [setPushEnabled],
    );

    const [confirming, setConfirming] = useState<'signOut' | 'signOutEverywhere' | null>(null);

    const confirmSignOut = useCallback(() => setConfirming('signOut'), []);
    const confirmSignOutEverywhere = useCallback(() => setConfirming('signOutEverywhere'), []);
    const closeConfirmation = useCallback(() => setConfirming(null), []);

    const signOutSheetActions = useMemo<BottomSheetAction[]>(() => {
        if (confirming === 'signOut') {
            return [
                {
                    label: 'Sign out',
                    variant: 'danger',
                    loading: signOut.isPending,
                    onPress: () => signOut.mutate(undefined),
                    testID: 'account-confirm-sign-out',
                },
                { label: 'Cancel', variant: 'secondary', onPress: closeConfirmation },
            ];
        }

        return [
            {
                label: 'Sign out everywhere',
                variant: 'danger',
                loading: signOutEverywhere.isPending,
                onPress: () => signOutEverywhere.mutate(),
                testID: 'account-confirm-sign-out-everywhere',
            },
            { label: 'Cancel', variant: 'secondary', onPress: closeConfirmation },
        ];
    }, [confirming, closeConfirmation, signOut, signOutEverywhere]);

    return (
        <ScreenContainer hasHeader scrollable={false} withGutter={false}>
            <AppHeader title="Account" subtitle="Your profile and settings." />

            <ScrollView
                testID="account-scroll"
                // Keeps the content clear of any system chrome the OS insets for.
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={[
                    styles.content,
                    // The tab bar floats over the scroller, so the last row reserves
                    // its lane plus the home-indicator inset.
                    { paddingBottom: insets.bottom + 96 },
                ]}>
                {/* ---------- 1. Identity card ---------- */}
                <AppCard testID="account-identity" style={styles.identityCard}>
                    <View style={styles.identity}>
                        <View
                            style={[styles.avatar, { backgroundColor: theme.colors.primarySoft }]}
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants">
                            <AppText style={[styles.initials, { color: theme.colors.primary }]}>
                                {initials}
                            </AppText>
                        </View>

                        <View style={styles.identityText}>
                            <View style={styles.identityNameRow}>
                                <AppText
                                    variant="heading"
                                    color="text"
                                    numberOfLines={1}
                                    style={styles.identityName}>
                                    {user?.name ?? 'Signed in'}
                                </AppText>
                                {isVerified ? (
                                    <View
                                        style={[
                                            styles.verifiedChip,
                                            { backgroundColor: theme.colors.successSoft },
                                        ]}
                                        testID="account-verified-badge">
                                        <AppText variant="micro" style={{ color: theme.colors.success }}>
                                            Verified
                                        </AppText>
                                    </View>
                                ) : null}
                            </View>
                            <AppText variant="body" color="textSecondary" numberOfLines={1}>
                                {user?.email ?? ''}
                            </AppText>
                            {user !== null && user !== undefined ? (
                                <AppText
                                    variant="caption"
                                    color="textMuted"
                                    numberOfLines={2}
                                    testID="account-roles">
                                    {user.roles.join(', ') || user.role}
                                </AppText>
                            ) : null}
                        </View>
                    </View>
                </AppCard>

                {!isVerified && user !== null && user !== undefined ? (
                    <AppCard testID="account-unverified" style={styles.identityCard}>
                        <View style={{ gap: theme.spacing.xs }}>
                            <View style={styles.noticeRow}>
                                <AppIcon
                                    icon={AlertTriangleGlyph}
                                    size="small"
                                    color="warningStrong"
                                />
                                <AppText
                                    variant="caption"
                                    color="warningStrong"
                                    style={styles.noticeText}>
                                    Your email address is not verified.
                                </AppText>
                            </View>
                            <AppListItem
                                label="Resend verification email"
                                value={resendVerification.isPending ? 'Sending…' : undefined}
                                icon={UserGlyph}
                                disabled={resendVerification.isPending}
                                isLast
                                onPress={() => resendVerification.mutate()}
                            />
                        </View>
                    </AppCard>
                ) : null}

                {/* ---------- 2a. Personal Details ---------- */}
                <SettingsGroup title="Personal Details">
                    <SettingsRow
                        icon={UserGlyph}
                        title="Name and email"
                        subtitle="Personal details"
                        onPress={() => navigation.navigate('Profile')}
                    />

                    <SettingsRow
                        icon={SlidersGlyph}
                        title="Password"
                        subtitle="Change password"
                        isLast
                        onPress={() => navigation.navigate('ChangePassword')}
                    />
                </SettingsGroup>

                {/* ---------- 2b. Preferences ---------- */}
                <SettingsGroup
                    title="Preferences"
                    footnote={
                        preferencesHydrated ? undefined : 'Restoring your saved preferences…'
                    }>
                    <SettingsRow
                        icon={SunMoonGlyph}
                        title="Dark Mode"
                        rightElement="switch"
                        trailing={
                            <Switch
                                value={darkMode}
                                disabled={!themeHydrated}
                                onValueChange={handleToggleDarkMode}
                                trackColor={{
                                    // Off track is the spec's `borderHairline`;
                                    // on track is `success`, matching the
                                    // availability switch's treatment.
                                    false: theme.colors.borderHairline,
                                    true: theme.colors.success,
                                }}
                                thumbColor="#FFFFFF"
                                accessibilityLabel="Dark Mode"
                                testID="account-dark-mode"
                            />
                        }
                    />
                    <SettingsRow
                        icon={BellGlyph}
                        title="Shift notifications"
                        subtitle={pushEnabled ? 'On' : 'Off'}
                        rightElement="switch"
                        trailing={
                            <Switch
                                value={pushEnabled}
                                disabled={!preferencesHydrated}
                                onValueChange={handleTogglePush}
                                trackColor={{
                                    false: theme.colors.divider,
                                    true: theme.colors.primary,
                                }}
                                thumbColor={theme.colors.surface}
                                accessibilityLabel="Shift notifications"
                                testID="account-push"
                            />
                        }
                    />
                    <SettingsRow
                        icon={SlidersGlyph}
                        title="More preferences"
                        subtitle="Roster view, appearance"
                        isLast
                        onPress={() => navigation.navigate('Preferences')}
                    />
                </SettingsGroup>

                {user?.company_access.is_locked ? (
                    <AppCard testID="account-company-locked" style={styles.identityCard}>
                        <View style={{ gap: theme.spacing.xs }}>
                            <View style={styles.noticeRow}>
                                <AppIcon icon={ShieldAlertGlyph} size="small" color="danger" />
                                <AppText variant="caption" color="danger" style={styles.noticeText}>
                                    Company access is locked
                                </AppText>
                            </View>
                            <AppText variant="caption" color="textSecondary">
                                {user.company_access.reason ??
                                    'Some features are unavailable until access is restored.'}
                            </AppText>
                        </View>
                    </AppCard>
                ) : null}

                {/* ---------- 3. Session ---------- */}
                <SettingsGroup
                    title="Session"
                    footnote="Sign out everywhere revokes access on all devices. Use it if you have lost a device or shared your password.">
                    <SettingsRow
                        icon={SignOutGlyph}
                        title="Sign out"
                        variant="danger"
                        rightElement="none"
                        onPress={confirmSignOut}
                    />
                    <SettingsRow
                        icon={SignOutGlyph}
                        title="Sign out everywhere"
                        variant="danger"
                        rightElement="none"
                        isLast
                        onPress={confirmSignOutEverywhere}
                    />
                </SettingsGroup>
            </ScrollView>

            <BottomSheet
                visible={confirming !== null}
                onClose={closeConfirmation}
                icon={SignOutGlyph}
                tone="danger"
                title={confirming === 'signOut' ? 'Sign out' : 'Sign out everywhere'}
                description={
                    confirming === 'signOut'
                        ? 'You will need to sign in again to use the app.'
                        : 'This signs you out on every device and revokes all active sessions.'
                }
                actions={signOutSheetActions}
                testID="account-confirmation-sheet"
            />
        </ScreenContainer>
    );
}

/**
 * Up to two initials from a display name.
 *
 * Falls back to a bullet rather than an empty string so the circle is never blank,
 * and handles the single-word case without producing a stray trailing space.
 */
function deriveInitials(name: string | null | undefined): string {
    if (name === null || name === undefined) {
        return '•';
    }

    const words = name.trim().split(/\s+/).filter(word => word.length > 0);

    if (words.length === 0) {
        return '•';
    }

    const first = Array.from(words[0] ?? '')[0] ?? '';
    const second = words.length > 1 ? (Array.from(words[words.length - 1] ?? '')[0] ?? '') : '';

    return `${first}${second}`.toUpperCase() || '•';
}

const styles = StyleSheet.create({
    content: {
        paddingTop: 16,
    },
    identityCard: {
        marginHorizontal: 20,
    },
    identity: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    avatar: {
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 0,
        flexShrink: 0,
    },
    initials: {
        fontSize: INITIALS_SIZE,
        lineHeight: INITIALS_SIZE + 4,
        fontWeight: '700',
    },
    identityText: {
        flex: 1,
        // Truncate rather than displace the avatar.
        minWidth: 0,
        gap: 2,
    },
    identityNameRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    identityName: {
        flexShrink: 1,
        minWidth: 0,
    },
    verifiedChip: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
    },
    noticeRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    noticeText: {
        flex: 1,
        minWidth: 0,
    },
});
