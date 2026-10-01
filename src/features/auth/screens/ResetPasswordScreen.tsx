import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, StyleSheet, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { AppCard } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { AppIcon } from '../../../components/AppIcon';
import { ShieldCheckGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { AppTextInput, type AppTextInputRef } from '../../../components/AppTextInput';
import { FormErrorPanel } from '../../../components/FormErrorPanel';
import { KeyboardAwareView, useKeyboardAwareField } from '../../../components/KeyboardAwareView';
import {
    PasswordStrengthMeter,
    STRENGTH_SLOT_HEIGHT,
} from '../../../components/PasswordStrengthMeter';
import type { AuthStackParamList } from '../../../navigation/types';
import { spacing } from '../../../theme/spacing';
import { useTheme } from '../../../theme/useTheme';
import type { AppError } from '../../../types/appError';
import { useClearRootError } from '../../../hooks';
import { toFieldErrorMap } from '../../../utils/errors';
import { useResetPassword } from '../hooks';
import { useRecoveryStore } from '../store';
import { parseResetParams } from '../utils';
import { evaluatePasswordStrength } from '../utils/passwordStrength';
import { resetPasswordSchema, type ResetPasswordFormValues } from '../validation';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

/**
 * Reset password (spec Screen 3 — Reset Password with Strength Meter).
 *
 * ## Token and email arrive three ways
 *
 * `token` and `email` normally arrive as route params, populated by the deep-link
 * handler at the root of the app. Both are treated as **optional inputs** rather
 * than assumptions, because a link can be opened without its query string (a
 * truncated share, a hand-typed address, an OS that strips the fragment) and a
 * crash-on-mount is a far worse failure than an empty field. Priority order:
 *
 * 1. Deep link params — `staffapp://reset-password?token=…&email=…` — the normal path.
 * 2. The recovery store — set by Forgot Password when the user stayed in the app.
 * 3. Nothing at all — the token field is revealed and the user pastes the code.
 *
 * There is no endpoint to validate the token ahead of time, so the screen submits
 * blind and maps any 422 back onto `token` / `email`.
 *
 * ## The strength meter sits inside the password field's group
 *
 * The meter is rendered in a `PasswordFieldGroup` immediately below the primary
 * password input, in a slot of **fixed** height (`STRENGTH_SLOT_HEIGHT`). That
 * fixed slot is what lets the pill appear the moment the first character is typed
 * **without moving the Confirm field** — the space is already reserved, exactly as
 * [`AppTextInput`](src/components/AppTextInput/AppTextInput.tsx:1) reserves its
 * message band. A conditionally-inserted meter would push the rest of the form down
 * mid-keystroke, which is the single most jarring thing a form can do.
 *
 * ## Focus chain
 *
 * `token` → `email` → `password` → `confirmation` → submit. The last field is the
 * only one with `returnKeyType="done"`, so the keyboard's action key is never
 * ambiguous about whether it will advance or submit.
 */
export function ResetPasswordScreen({ navigation, route }: Props): React.JSX.Element {
    const theme = useTheme();

    const pendingEmail = useRecoveryStore(state => state.pendingEmail);

    const emailRef = useRef<AppTextInputRef | null>(null);
    const passwordRef = useRef<AppTextInputRef | null>(null);
    const confirmRef = useRef<AppTextInputRef | null>(null);

    /**
     * `route.params` is optional at the type level (deep links can omit it entirely),
     * so everything is funnelled through the same tolerant parser the link handler
     * uses. Memoised because `useForm`'s `defaultValues` are read once on mount, and
     * a fresh object identity on every render serves no purpose.
     */
    const initial = useMemo(() => {
        const parsed = parseResetParams(route.params);

        return {
            token: parsed.token,
            email: parsed.email.length > 0 ? parsed.email : (pendingEmail ?? ''),
        };
    }, [route.params, pendingEmail]);

    const {
        control,
        clearErrors,
        handleSubmit,
        setError,
        watch,
        formState: { errors },
    } = useForm<ResetPasswordFormValues>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: {
            token: initial.token,
            email: initial.email,
            password: '',
            password_confirmation: '',
        },
        mode: 'onBlur',
    });

    const passwordValue = watch('password');
    const strength = useMemo(() => evaluatePasswordStrength(passwordValue ?? ''), [passwordValue]);

    // A root panel is not attached to a field, so it must be cleared by hand.
    const clearRootError = useClearRootError(clearErrors, errors.root !== undefined);

    const resetPassword = useResetPassword();

    /**
     * When no token came in with the link there is nothing to submit, so the field is
     * revealed instead of failing validation on an invisible input. The user is told
     * where to find the code rather than being left staring at an empty form.
     */
    const hasToken = initial.token.length > 0;

    const onSubmit = handleSubmit(async values => {
        Keyboard.dismiss();

        try {
            await resetPassword.mutateAsync(values);
        } catch (error) {
            const appError = error as AppError;

            if (appError.kind === 'validation' && appError.fieldErrors) {
                const fields = toFieldErrorMap(appError);
                const resetFields: Array<keyof ResetPasswordFormValues> = [
                    'token',
                    'email',
                    'password',
                    'password_confirmation',
                ];
                let handled = false;

                resetFields.forEach(field => {
                    const message = fields[field];

                    if (message) {
                        setError(field, { type: 'server', message });
                        handled = true;
                    }
                });

                if (handled) {
                    return;
                }
            }

            setError('root', { type: 'server', message: appError.message });
        }
    });

    const submitFromKeyboard = useCallback(() => {
        onSubmit().catch(() => undefined);
    }, [onSubmit]);

    const goBack = useCallback(() => navigation.goBack(), [navigation]);

    const focusEmail = useCallback(() => {
        emailRef.current?.focus();
    }, []);

    const focusPassword = useCallback(() => {
        passwordRef.current?.focus();
    }, []);

    const focusConfirm = useCallback(() => {
        confirmRef.current?.focus();
    }, []);

    const token = useKeyboardAwareField('token');
    const email = useKeyboardAwareField('email');
    const password = useKeyboardAwareField('password');
    const confirmation = useKeyboardAwareField('password_confirmation');

    /**
     * The evaluator's first suggestion replaces the field's static helper once the
     * user has typed something. The pill is a single-line badge by contract, so the
     * actionable copy has to live in the helper slot rather than inside the pill —
     * that keeps the badge geometry intact and avoids a second wrapping line under
     * the field.
     */
    const passwordHelper =
        strength.suggestions.length > 0 ? strength.suggestions[0] : 'At least 8 characters.';

    if (resetPassword.isSuccess) {
        return (
            <KeyboardAwareView ownsTopInset>
                {/* No back arrow here: the flow is complete, and an arrow back into
                    a consumed one-time token would dead-end on a 422. */}
                <AppHeader title="Password updated" />

                <View style={[styles.stack, { gap: theme.spacing.xl }]}>
                    <AppCard elevated="low" padded>
                        <View style={[styles.confirmation, { gap: theme.spacing.sm }]}>
                            <AppIcon
                                icon={ShieldCheckGlyph}
                                size="large"
                                color="success"
                                accessibilityLabel="Password updated"
                            />

                            <AppText variant="subtitle">
                                Your password has been changed. Sign in with your new password to
                                continue.
                            </AppText>
                        </View>
                    </AppCard>

                    <AppButton
                        label="Back to sign in"
                        onPress={() => navigation.navigate('Login')}
                        fullWidth
                        size="lg"
                    />
                </View>
            </KeyboardAwareView>
        );
    }

    const rootError = errors.root?.message;

    return (
        <KeyboardAwareView ownsTopInset>
            <AppHeader title="Set a new password" onBack={goBack} flat separator={false} />

            <View style={[styles.stack, { gap: theme.spacing.xl }]}>
                <View style={styles.infoBlock}>
                    <AppText variant="body" color="textSecondary">
                        {hasToken
                            ? 'Choose a new password for your account.'
                            : 'Paste the reset code from your email, then choose a new password.'}
                    </AppText>
                </View>

                <View style={[styles.form, { gap: theme.spacing.md }]}>
                    {hasToken ? null : (
                        <View {...token.wrapperProps}>
                            <Controller
                                control={control}
                                name="token"
                                render={({ field }) => (
                                    <AppTextInput
                                        label="Reset code"
                                        value={field.value}
                                        onChangeText={text => {
                                            field.onChange(text);
                                            clearRootError();
                                        }}
                                        onBlur={field.onBlur}
                                        onFocus={token.onFocus}
                                        error={errors.token?.message}
                                        helper="Copy it from the reset link in your email."
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        returnKeyType="next"
                                        onSubmitEditing={focusEmail}
                                        required
                                    />
                                )}
                            />
                        </View>
                    )}

                    <View {...email.wrapperProps}>
                        <Controller
                            control={control}
                            name="email"
                            render={({ field }) => (
                                <AppTextInput
                                    ref={emailRef}
                                    label="Email"
                                    value={field.value}
                                    onChangeText={text => {
                                        field.onChange(text);
                                        clearRootError();
                                    }}
                                    onBlur={field.onBlur}
                                    onFocus={email.onFocus}
                                    error={errors.email?.message}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoComplete="email"
                                    autoCorrect={false}
                                    textContentType="emailAddress"
                                    returnKeyType="next"
                                    onSubmitEditing={focusPassword}
                                    required
                                />
                            )}
                        />
                    </View>

                    {/* The meter belongs to the password field, so both live in one
                        group with a tight inner gap. */}
                    <View style={[styles.fieldGroup, { gap: theme.spacing.sm }]}>
                        <View {...password.wrapperProps}>
                            <Controller
                                control={control}
                                name="password"
                                render={({ field }) => (
                                    <AppTextInput
                                        ref={passwordRef}
                                        label="New password"
                                        value={field.value}
                                        onChangeText={text => {
                                            field.onChange(text);
                                            clearRootError();
                                        }}
                                        onBlur={field.onBlur}
                                        onFocus={password.onFocus}
                                        error={errors.password?.message}
                                        helper={passwordHelper}
                                        secureToggle
                                        autoCapitalize="none"
                                        autoComplete="new-password"
                                        textContentType="newPassword"
                                        returnKeyType="next"
                                        onSubmitEditing={focusConfirm}
                                        required
                                    />
                                )}
                            />
                        </View>

                        {/* Fixed-height slot: the pill appears inside space that
                            already existed, so typing cannot shift the Confirm field. */}
                        <View style={styles.strengthSlot}>
                            <PasswordStrengthMeter
                                score={strength.score}
                                label={strength.label}
                                showLabel
                            />
                        </View>
                    </View>

                    <View {...confirmation.wrapperProps}>
                        <Controller
                            control={control}
                            name="password_confirmation"
                            render={({ field }) => (
                                <AppTextInput
                                    ref={confirmRef}
                                    label="Confirm new password"
                                    value={field.value}
                                    onChangeText={text => {
                                        field.onChange(text);
                                        clearRootError();
                                    }}
                                    onBlur={field.onBlur}
                                    onFocus={confirmation.onFocus}
                                    error={errors.password_confirmation?.message}
                                    secureToggle
                                    autoCapitalize="none"
                                    autoComplete="new-password"
                                    textContentType="newPassword"
                                    returnKeyType="done"
                                    onSubmitEditing={submitFromKeyboard}
                                    required
                                />
                            )}
                        />
                    </View>

                    {rootError !== undefined ? <FormErrorPanel message={rootError} /> : null}

                    <AppButton
                        label="Update password"
                        onPress={onSubmit}
                        loading={resetPassword.isPending}
                        fullWidth
                        size="lg"
                    />
                </View>
            </View>
        </KeyboardAwareView>
    );
}

const styles = StyleSheet.create({
    stack: {
        flexGrow: 1,
        marginTop: spacing.xl,
    },
    infoBlock: {
        paddingHorizontal: spacing.xxs,
    },
    form: {
        width: '100%',
    },
    fieldGroup: {
        width: '100%',
    },
    strengthSlot: {
        // Reserved unconditionally. `STRENGTH_SLOT_HEIGHT` is the pill's own
        // measured height, exported by the meter so the two cannot drift.
        height: STRENGTH_SLOT_HEIGHT,
        justifyContent: 'center',
        paddingHorizontal: spacing.xxs,
    },
    confirmation: {
        alignItems: 'center',
    },
});
