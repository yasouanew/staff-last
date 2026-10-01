import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

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
import { avatarSizes, borderWidths } from '../../../theme/sizing';
import { radius, radiusRoles, spacing, useTheme } from '../../../theme';
import { useSession, useSignOut, useSignOutEverywhere } from '../../auth/hooks';
import { useSessionStore } from '../../auth/store/sessionStore';
import { useResendVerification } from '../../profile/hooks';
import { usePreferencesStore } from '../store/preferencesStore';

type Props = NativeStackScreenProps<AccountStackParamList, 'Account'>;

/**
 * Account (spec Screen 11) — the settings hub, rebuilt to the Phase 6 brief.
 *
 * Structure, top to bottom:
 *
 *  1. **Profile Identity Header** — one macro `AppCard` holding a 64pt circular
 *     avatar beside a dense vertical text block (name / corporate email /
 *     operational role). The avatar is *displayed* only.
 *  2. **Grouped settings matrix** — rows under bold section headers, each row a
 *     44pt target with a 24pt leading glyph, a title, and either a chevron (nav)
 *     or a live native `Switch` (preference).
 *  3. **Destructive action slot** — "Sign out" as the final scroll child, in the
 *     Semantic Danger Red token.
 *
 * Why there is no avatar upload: `POST /auth/profile` accepts `name`/`email` only
 * and the avatar endpoint rejects the employee role (backend gap G4). Rendering an
 * avatar *control* here would be a dead end that photographs a missing capability
 * as a working one, so the header shows identity and nothing more. This is the
 * same stance taken in Shift Detail (no clock-in) and Leave Detail (read-only).
 *
 * The initials fallback is not decoration: a large empty ring where a face should
 * be reads as a failed image load, so the circle always paints something.
 */
export function AccountScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const session = useSession();
    const cachedUser = useSessionStore(state => state.user);
    const user = session.data ?? cachedUser;

    const signOut = useSignOut();
    const signOutEverywhere = useSignOutEverywhere();
    const resendVerification = useResendVerification();

    const isVerified = user?.email_verified_at !== null && user?.email_verified_at !== undefined;

    const initials = useMemo(() => deriveInitials(user?.name), [user?.name]);

    /**
     * Preferences are device-local state, so the Switch reflects the persisted
     * store rather than anything from the API.
     */
    const darkMode = usePreferencesStore(state => state.appearance === 'dark');
    const setAppearance = usePreferencesStore(state => state.setAppearance);
    const pushEnabled = usePreferencesStore(state => state.pushEnabled);
    const setPushEnabled = usePreferencesStore(state => state.setPushEnabled);
    const preferencesHydrated = usePreferencesStore(state => state.isHydrated);

    /**
     * Dark Mode as a boolean.
     *
     * `appearance === 'dark'` is treated as "on" and anything else as "off", rather
     * than reading the tri-state `system` as a third position. A three-state
     * control needs three labelled stops, and a bare Switch cannot express them —
     * so a user on `system` who flips it on gets an explicit `dark`, and flipping
     * it off gets an explicit `light`. The richer system/light/dark choice still
     * lives on the Preferences screen, which is the pair of rows directly below.
     */
    const handleToggleDarkMode = useCallback(
        (enabled: boolean) => {
            void setAppearance(enabled ? 'dark' : 'light');
        },
        [setAppearance],
    );

    const handleTogglePush = useCallback(
        (enabled: boolean) => {
            void setPushEnabled(enabled);
        },
        [setPushEnabled],
    );

    /**
     * Which confirmation sheet is open, if any.
     *
     * A single nullable discriminator rather than two booleans: two flags can
     * both be true, and the screen would then have to decide which sheet wins.
     * One value makes that state unrepresentable.
     */
    const [confirming, setConfirming] = useState<'signOut' | 'signOutEverywhere' | null>(null);

    const confirmSignOut = useCallback(() => {
        setConfirming('signOut');
    }, []);

    const confirmSignOutEverywhere = useCallback(() => {
        setConfirming('signOutEverywhere');
    }, []);

    const closeConfirmation = useCallback(() => {
        setConfirming(null);
    }, []);

    /**
     * Actions are built from the *same* state that opened the sheet, so the
     * confirm button's `loading` flag tracks the in-flight mutation and the
     * sheet cannot be dismissed mid-request by a double tap.
     */
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
                {
                    label: 'Cancel',
                    variant: 'secondary',
                    onPress: closeConfirmation,
                },
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
            {
                label: 'Cancel',
                variant: 'secondary',
                onPress: closeConfirmation,
            },
        ];
    }, [confirming, closeConfirmation, signOut, signOutEverywhere]);

    return (
        <ScreenContainer hasHeader>
            <AppHeader title="Account" subtitle="Your profile and settings." />

            <ScrollView
                contentContainerStyle={[styles.content, { gap: theme.spacing.md }]}
                testID="account-scroll">
                {/* ---------- 1. Profile Identity Header ---------- */}
                {/*
                 * The avatar plate is brand-tinted rather than a grey ring: at 64pt
                 * an untinted circle with initials reads as a failed image load,
                 * whereas `primarySoft` on `primaryBorder` reads as a deliberate
                 * monogram. The verification chip sits beside the name rather than
                 * as a separate notice card, because "is this me and is it trusted"
                 * is one glance, not two.
                 */}
                <AppCard testID="account-identity">
                    <View style={[styles.identity, { gap: spacing.md }]}>
                        <View
                            style={[
                                styles.avatar,
                                {
                                    backgroundColor: theme.colors.primarySoft,
                                    borderColor: theme.colors.primaryBorder,
                                },
                            ]}
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants">
                            <AppText variant="headerMedium" style={{ color: theme.colors.primary }}>
                                {initials}
                            </AppText>
                        </View>

                        {/*
                         * The text block is the flexed centre and carries `minWidth: 0`
                         * so a long corporate email truncates instead of nudging the
                         * avatar off its fixed left edge.
                         */}
                        <View style={styles.identityText}>
                            <View style={[styles.identityNameRow, { gap: spacing.xs }]}>
                                <AppText
                                    variant="subtitle"
                                    numberOfLines={1}
                                    style={styles.identityName}>
                                    {user?.name ?? 'Signed in'}
                                </AppText>
                                {isVerified ? (
                                    <View
                                        style={[
                                            styles.verifiedChip,
                                            {
                                                backgroundColor: theme.colors.successSoft,
                                                borderRadius: radiusRoles.pill.full,
                                            },
                                        ]}
                                        testID="account-verified-badge">
                                        <AppText
                                            variant="label"
                                            style={{ color: theme.colors.successStrong }}>
                                            Verified
                                        </AppText>
                                    </View>
                                ) : null}
                            </View>
                            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                                {user?.email ?? ''}
                            </AppText>
                            {user !== null && user !== undefined ? (
                                <AppText
                                    variant="label"
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
                    <AppCard testID="account-unverified">
                        <View style={{ gap: spacing.xs }}>
                            <View style={[styles.noticeRow, { gap: spacing.xs }]}>
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
                    <AppListItem
                        label="Name and email"
                        value="Personal details"
                        icon={UserGlyph}
                        onPress={() => navigation.navigate('Profile')}
                    />
                    <AppListItem
                        label="Password"
                        value="Change password"
                        icon={SlidersGlyph}
                        isLast
                        onPress={() => navigation.navigate('ChangePassword')}
                    />
                </SettingsGroup>

                {/* ---------- 2b. Preferences ---------- */}
                <SettingsGroup
                    title="Preferences"
                    note={
                        preferencesHydrated
                            ? undefined
                            : 'Restoring your saved preferences…'
                    }>
                    <AppListItem
                        label="Dark Mode"
                        icon={SunMoonGlyph}
                        /*
                         * A Switch row is not a navigation row: it has no `onPress`,
                         * so `AppListItem` renders a `View` rather than a `Pressable`
                         * and the Switch itself becomes the only target. Attaching
                         * `onPress` as well would give the row and the switch two
                         * different ideas of the current value.
                         */
                        trailing={
                            <Switch
                                value={darkMode}
                                // Gated on hydration so the Switch never paints the
                                // default (light) and then flips once AsyncStorage
                                // reports back — a visible lie on every cold start.
                                disabled={!preferencesHydrated}
                                onValueChange={handleToggleDarkMode}
                                trackColor={{
                                    false: theme.colors.divider,
                                    true: theme.colors.primary,
                                }}
                                thumbColor={theme.colors.surface}
                                accessibilityLabel="Dark Mode"
                                testID="account-dark-mode"
                            />
                        }
                    />
                    <AppListItem
                        label="Shift notifications"
                        value={pushEnabled ? 'On' : 'Off'}
                        icon={BellGlyph}
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
                    <AppListItem
                        label="More preferences"
                        value="Roster view, appearance"
                        icon={SlidersGlyph}
                        isLast
                        onPress={() => navigation.navigate('Preferences')}
                    />
                </SettingsGroup>

                {user?.company_access.is_locked ? (
                    <AppCard testID="account-company-locked">
                        <View style={{ gap: spacing.xs }}>
                            <View style={[styles.noticeRow, { gap: spacing.xs }]}>
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

                {/* ---------- 3. Destructive Action Slot ---------- */}
                <SettingsGroup title="Session">
                    <AppListItem
                        label="Sign out"
                        icon={SignOutGlyph}
                        iconColor="danger"
                        destructive
                        trailing={null}
                        onPress={confirmSignOut}
                    />
                    <AppListItem
                        label="Sign out everywhere"
                        icon={SignOutGlyph}
                        iconColor="danger"
                        destructive
                        trailing={null}
                        isLast
                        onPress={confirmSignOutEverywhere}
                    />
                </SettingsGroup>

                <AppText variant="caption" color="textMuted" testID="account-signout-note">
                    Sign out everywhere revokes access on all devices. Use it if you have lost a
                    device or shared your password.
                </AppText>
            </ScrollView>

            {/**
             * One sheet serves both destructive actions. It is deliberately
             * mounted *outside* the ScrollView: a modal does not participate in
             * the scroll content's layout, and keeping it a sibling of the scroll
             * means opening it cannot change the scroll offset.
             */}
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

/* ------------------------------------------------------------------ *
 * Local layout pieces
 * ------------------------------------------------------------------ */

type SettingsGroupProps = {
    title: string;
    note?: string;
    children: React.ReactNode;
};

/**
 * A section header above one `padded={false}` card of rows.
 *
 * The label is set as a small-caps **overline** rather than a `bodyStrong` line:
 * at 12pt with wide tracking it reads as a group name stamped above the card,
 * which is what makes a settings list scan as sections instead of one long
 * column. A body-sized grey line competes with the rows it labels.
 */
function SettingsGroup({ title, note, children }: SettingsGroupProps): React.JSX.Element {
    const theme = useTheme();

    return (
        <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="overline" color="textMuted" style={styles.groupTitle}>
                {title}
            </AppText>

            <AppCard padded={false}>{children}</AppCard>

            {note !== undefined ? (
                <AppText variant="caption" color="textMuted">
                    {note}
                </AppText>
            ) : null}
        </View>
    );
}

/**
 * Up to two initials from a display name.
 *
 * Falls back to a bullet rather than an empty string so the circle is never blank,
 * and handles the single-word case (many corporate names are just a first name)
 * without producing a stray trailing space.
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
        // Mirrors screenGutter so the last row is not flush against the tab bar.
        paddingBottom: spacing.xxl,
    },
    identity: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: avatarSizes.profile,
        height: avatarSizes.profile,
        borderRadius: radius.full,
        borderWidth: borderWidths.hairline,
        alignItems: 'center',
        justifyContent: 'center',
        // Fixed so the row height is predictable regardless of glyph metrics.
        flexGrow: 0,
        flexShrink: 0,
    },
    identityText: {
        flex: 1,
        // Phase 6 spec §0.3: truncate rather than displace the avatar.
        minWidth: 0,
        gap: spacing.xxs,
    },
    identityNameRow: {
        alignItems: 'center',
        flexDirection: 'row',
    },
    /**
     * `flexShrink: 1` + `minWidth: 0` on the name: the name yields to the chip
     * rather than the chip being pushed off the card by a long legal name.
     */
    identityName: {
        flexShrink: 1,
        minWidth: 0,
    },
    verifiedChip: {
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.xxs,
    },
    /** A leading glyph beside a status sentence, aligned to its first line. */
    noticeRow: {
        alignItems: 'center',
        flexDirection: 'row',
    },
    noticeText: {
        flex: 1,
        minWidth: 0,
    },
    groupTitle: {
        // The card below is inset by nothing, so the header lines up with the row
        // labels' left edge only if it shares their horizontal padding.
        paddingHorizontal: spacing.xxs,
    },
});
