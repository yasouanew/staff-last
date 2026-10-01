import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { AppCard } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { UserGlyph } from '../../../components/AppIcon';
import { AppListItem } from '../../../components/AppListItem';
import { AppText } from '../../../components/AppText';
import { AppTextInput } from '../../../components/AppTextInput';
import { KeyboardAwareView } from '../../../components/KeyboardAwareView';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { useClearRootError } from '../../../hooks';
import type { AccountStackParamList } from '../../../navigation/types';
import { spacing } from '../../../theme';
import { isAppError } from '../../../types/appError';
import { announceForAccessibility } from '../../../utils/accessibility';
import {
    updateProfileSchema,
    type UpdateProfileFormValues,
} from '../../auth/validation';
import { useSession } from '../../auth/hooks';
import { useSessionStore } from '../../auth/store/sessionStore';
import { useUpdateProfile } from '../../profile/hooks';
import { toFieldErrorMap } from '../../../utils/errors';

type Props = NativeStackScreenProps<AccountStackParamList, 'Profile'>;

/**
 * Personal details (spec Screen 12).
 *
 * Only `name` and `email` are editable — the backend's `UpdateProfileRequest` accepts
 * nothing else, and `phone` is read-only on `UserResource`. Phone is therefore shown
 * as a non-editable row rather than an input that would silently discard edits.
 *
 * Changing the email resets `email_verified_at` server-side. That is surfaced as a
 * warning *before* submitting, because the consequence (losing access to parts of the
 * app until re-verification) is not discoverable afterwards.
 */
export function ProfileScreen({ navigation }: Props): React.JSX.Element {
    const session = useSession();
    const cachedUser = useSessionStore(state => state.user);
    const user = session.data ?? cachedUser;

    const updateProfile = useUpdateProfile();

    const {
        control,
        clearErrors,
        handleSubmit,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<UpdateProfileFormValues>({
        resolver: zodResolver(updateProfileSchema),
        defaultValues: {
            name: user?.name ?? '',
            email: user?.email ?? '',
        },
    });

    /**
     * A root error (a 500 or a dropped connection) belongs to *no field*, so React
     * Hook Form never re-validates it away — it would stay pinned while the user
     * fixes the form. Clearing it on the first edit keeps the message describing the
     * current attempt rather than a stale one.
     */
    const clearRootError = useClearRootError(clearErrors, errors.root !== undefined);

    const onSubmit = handleSubmit(async values => {
        try {
            await updateProfile.mutateAsync(values);

            // The screen pops on success; announce before leaving so the save is not
            // silently implied to an assistive-tech user.
            announceForAccessibility('Personal details saved.');

            navigation.goBack();
        } catch (error) {
            if (!isAppError(error)) {
                setError('root', {
                    type: 'server',
                    message: 'We could not save your details. Please try again.',
                });
                return;
            }

            const fieldErrors = toFieldErrorMap(error);

            if (Object.keys(fieldErrors).length === 0) {
                setError('root', { type: 'server', message: error.message });
                return;
            }

            (Object.keys(fieldErrors) as (keyof UpdateProfileFormValues)[]).forEach(key => {
                setError(key, { type: 'server', message: fieldErrors[key] });
            });
        }
    });

    return (
        <ScreenContainer hasHeader>
            <AppHeader
                title="Personal details"
                subtitle="Update your name and email."
                onBack={() => navigation.goBack()}
            />

            {/*
             * `KeyboardAwareView`, not a bare `ScrollView`. The two fields sit low in
             * the form, and on a short device a plain scroller leaves the focused
             * field — and the Save button — underneath the keyboard with no
             * scroll-into-view. `ownsTopInset={false}` because `AppHeader` above is a
             * flow sibling and already absorbed the top inset.
             */}
            <KeyboardAwareView
                ownsTopInset={false}
                contentContainerStyle={{ ...styles.content, gap: spacing.xl }}>
                {/*
                 * The two editable fields are grouped under one overline inside a
                 * single card. Ungrouped, they read as two unrelated inputs floating
                 * on the page; grouped, the screen states that these two things —
                 * and only these two — are what "personal details" means.
                 */}
                <View style={{ gap: spacing.sm }}>
                    <AppText variant="overline" color="textMuted" style={styles.sectionLabel}>
                        Identity
                    </AppText>

                    <AppCard>
                        <View style={{ gap: spacing.md }}>
                            <Controller
                                control={control}
                                name="name"
                                render={({ field }) => (
                                    <AppTextInput
                                        label="Full name"
                                        required
                                        autoCapitalize="words"
                                        autoComplete="name"
                                        value={field.value}
                                        onChangeText={text => {
                                            field.onChange(text);
                                            clearRootError();
                                        }}
                                        onBlur={field.onBlur}
                                        error={errors.name?.message}
                                    />
                                )}
                            />

                            <Controller
                                control={control}
                                name="email"
                                render={({ field }) => (
                                    <AppTextInput
                                        label="Email"
                                        required
                                        autoCapitalize="none"
                                        autoComplete="email"
                                        keyboardType="email-address"
                                        value={field.value}
                                        onChangeText={text => {
                                            field.onChange(text);
                                            clearRootError();
                                        }}
                                        onBlur={field.onBlur}
                                        error={errors.email?.message}
                                        helper="Changing your email requires you to verify the new address."
                                    />
                                )}
                            />
                        </View>
                    </AppCard>
                </View>

                {/*
                 * Phone is read-only on the API, so it is presented as a list row
                 * with a locked framing rather than as a disabled input. A greyed-out
                 * input invites a tap that will never work; a row that states who can
                 * change it does not.
                 */}
                {user?.phone ? (
                    <View style={{ gap: spacing.sm }}>
                        <AppText variant="overline" color="textMuted" style={styles.sectionLabel}>
                            Contact
                        </AppText>
                        <AppCard padded={false}>
                            <AppListItem
                                label="Phone"
                                value={user.phone}
                                icon={UserGlyph}
                                trailing={null}
                                isLast
                            />
                        </AppCard>
                        <AppText variant="caption" color="textMuted">
                            Contact your administrator to change your phone number.
                        </AppText>
                    </View>
                ) : null}

                {errors.root ? (
                    <AppText variant="caption" color="danger">
                        {errors.root.message}
                    </AppText>
                ) : null}

                <AppButton
                    label="Save changes"
                    onPress={onSubmit}
                    loading={isSubmitting || updateProfile.isPending}
                />
            </KeyboardAwareView>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    content: {
        // `xxxl` clears the keyboard and the home indicator with room to spare,
        // replacing the previous hand-picked 40.
        paddingBottom: spacing.xxxl,
    },
    sectionLabel: {
        paddingHorizontal: spacing.xxs,
    },
});
