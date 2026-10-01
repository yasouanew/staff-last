import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { AppCard } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { SignOutGlyph, ShieldCheckGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { AppTextInput } from '../../../components/AppTextInput';
import { BottomSheet, type BottomSheetAction } from '../../../components/BottomSheet';
import {
    KeyboardAwareView,
    useKeyboardAwareField,
} from '../../../components/KeyboardAwareView';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { useClearRootError } from '../../../hooks';
import type { AccountStackParamList } from '../../../navigation/types';
import { spacing, useTheme } from '../../../theme';
import { announceForAccessibility } from '../../../utils/accessibility';
import { isAppError } from '../../../types/appError';
import { toFieldErrorMap } from '../../../utils/errors';
import { useSignOutEverywhere } from '../../auth/hooks';
import { updatePasswordSchema, type UpdatePasswordFormValues } from '../../auth/validation';
import { useUpdatePassword } from '../../profile/hooks';

type Props = NativeStackScreenProps<AccountStackParamList, 'ChangePassword'>;

/**
 * Change password (spec Screen 14).
 *
 * **The backend does not accept or verify the current password** — `UpdatePasswordRequest`
 * only validates `password` + `password_confirmation`. Inventing a "current password"
 * field would be pure theatre: it could be filled with anything and the change would
 * still succeed, which is worse than not asking.
 *
 * Because there is no re-authentication, the screen is explicit about the risk and
 * offers "sign out everywhere" as the follow-up action, so a user who suspects their
 * account is compromised can revoke the other sessions in the same flow. That button
 * is the reason this screen renders alongside the mutation rather than after it.
 */
export function ChangePasswordScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const updatePassword = useUpdatePassword();
    const signOutEverywhere = useSignOutEverywhere();

    const {
        control,
        clearErrors,
        handleSubmit,
        reset,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<UpdatePasswordFormValues>({
        resolver: zodResolver(updatePasswordSchema),
        defaultValues: {
            password: '',
            password_confirmation: '',
        },
    });

    // A root error carries no field to re-validate, so it must be cleared by hand.
    const clearRootError = useClearRootError(clearErrors, errors.root !== undefined);

    // Registers each field with the keyboard-aware container so focus scrolls it
    // clear of the keyboard on a short device.
    const passwordField = useKeyboardAwareField('password');
    const confirmationField = useKeyboardAwareField('password_confirmation');

    /**
     * A single nullable discriminator keeps the two confirmations mutually exclusive:
     * `'updated'` is the post-success prompt, `'signOutEverywhere'` is the destructive
     * confirmation. Both render through the same `BottomSheet`, so promoting one to the
     * other swaps the content in place rather than stacking two native modals.
     */
    const [sheet, setSheet] = useState<'updated' | 'signOutEverywhere' | null>(null);

    const closeSheet = useCallback(() => {
        setSheet(null);
    }, []);

    const confirmSignOutEverywhere = useCallback(() => {
        setSheet('signOutEverywhere');
    }, []);

    const sheetActions = useMemo<BottomSheetAction[]>(() => {
        if (sheet === 'updated') {
            return [
                {
                    label: 'Done',
                    onPress: () => navigation.goBack(),
                    testID: 'password-updated-done',
                },
                {
                    label: 'Sign out other devices',
                    variant: 'danger',
                    onPress: confirmSignOutEverywhere,
                    testID: 'password-updated-sign-out-others',
                },
            ];
        }

        return [
            {
                label: 'Sign out everywhere',
                variant: 'danger',
                loading: signOutEverywhere.isPending,
                onPress: () => signOutEverywhere.mutate(),
                testID: 'password-sign-out-everywhere-confirm',
            },
            { label: 'Cancel', variant: 'secondary', onPress: closeSheet },
        ];
    }, [sheet, closeSheet, confirmSignOutEverywhere, navigation, signOutEverywhere]);

    const onSubmit = handleSubmit(async values => {
        try {
            await updatePassword.mutateAsync(values);

            // Clear the fields before leaving: the password must not linger in form
            // state behind the previous screen.
            reset();

            /*
             * The sheet is a *visual* confirmation, and it is not announced by the
             * act of opening — a modal's arrival does not speak its own title. Without
             * this an assistive-tech user gets no confirmation that the password
             * actually changed. The sheet's own content remains readable afterwards.
             */
            announceForAccessibility('Password updated.');

            setSheet('updated');
        } catch (error) {
            if (!isAppError(error)) {
                setError('root', {
                    type: 'server',
                    message: 'We could not update your password. Please try again.',
                });
                return;
            }

            const fieldErrors = toFieldErrorMap(error);

            if (Object.keys(fieldErrors).length === 0) {
                setError('root', { type: 'server', message: error.message });
                return;
            }

            (Object.keys(fieldErrors) as (keyof UpdatePasswordFormValues)[]).forEach(key => {
                setError(key, { type: 'server', message: fieldErrors[key] });
            });
        }
    });

    return (
        <ScreenContainer hasHeader>
            <AppHeader
                title="Change password"
                subtitle="Choose a new password."
                onBack={() => navigation.goBack()}
            />

            {/*
             * `KeyboardAwareView` rather than a bare `ScrollView`: the Confirm field
             * sits low enough to fall behind the keyboard on a short device, and the
             * Update button below it would go with it. `ownsTopInset={false}` because
             * `AppHeader` above already absorbed the top inset.
             */}
            <KeyboardAwareView
                ownsTopInset={false}
                contentContainerStyle={{ ...styles.content, gap: theme.spacing.md }}>
                <View {...passwordField.wrapperProps}>
                    <Controller
                        control={control}
                        name="password"
                        render={({ field }) => (
                            <AppTextInput
                                label="New password"
                                required
                                secureToggle
                                autoCapitalize="none"
                                autoComplete="new-password"
                                value={field.value}
                                onChangeText={text => {
                                    field.onChange(text);
                                    clearRootError();
                                }}
                                onFocus={passwordField.onFocus}
                                onBlur={field.onBlur}
                                error={errors.password?.message}
                                helper="At least 8 characters."
                            />
                        )}
                    />
                </View>

                <View {...confirmationField.wrapperProps}>
                    <Controller
                        control={control}
                        name="password_confirmation"
                        render={({ field }) => (
                            <AppTextInput
                                label="Confirm new password"
                                required
                                secureToggle
                                autoCapitalize="none"
                                autoComplete="new-password"
                                value={field.value}
                                onChangeText={text => {
                                    field.onChange(text);
                                    clearRootError();
                                }}
                                onFocus={confirmationField.onFocus}
                                onBlur={field.onBlur}
                                error={errors.password_confirmation?.message}
                            />
                        )}
                    />
                </View>

                <AppCard>
                    <AppText variant="caption" color="textSecondary">
                        Changing your password does not sign out other devices. Use the option below
                        if you think someone else has access to your account.
                    </AppText>
                </AppCard>

                {errors.root ? (
                    <AppText variant="caption" color="danger">
                        {errors.root.message}
                    </AppText>
                ) : null}

                <AppButton
                    label="Update password"
                    onPress={onSubmit}
                    loading={isSubmitting || updatePassword.isPending}
                />

                <AppButton
                    label="Sign out everywhere"
                    variant="danger"
                    onPress={confirmSignOutEverywhere}
                    loading={signOutEverywhere.isPending}
                />
            </KeyboardAwareView>

            <BottomSheet
                visible={sheet !== null}
                onClose={closeSheet}
                icon={sheet === 'updated' ? ShieldCheckGlyph : SignOutGlyph}
                tone={sheet === 'updated' ? 'success' : 'danger'}
                title={sheet === 'updated' ? 'Password updated' : 'Sign out everywhere'}
                description={
                    sheet === 'updated'
                        ? 'Your password has been changed. For security, you can sign out other devices below.'
                        : 'This revokes every active session, including this device. You will need to sign in again.'
                }
                actions={sheetActions}
                testID="change-password-sheet"
            />
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    content: {
        // `xxxl` (48) on the grid, replacing the previous hand-picked 40.
        paddingBottom: spacing.xxxl,
    },
});
