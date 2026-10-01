import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, StyleSheet, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { AppCard } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { AppIcon } from '../../../components/AppIcon';
import { MailCheckGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { AppTextInput } from '../../../components/AppTextInput';
import { FormErrorPanel } from '../../../components/FormErrorPanel';
import { KeyboardAwareView, useKeyboardAwareField } from '../../../components/KeyboardAwareView';
import { useClearRootError } from '../../../hooks';
import type { AuthStackParamList } from '../../../navigation/types';
import { spacing } from '../../../theme/spacing';
import { useTheme } from '../../../theme/useTheme';
import type { AppError } from '../../../types/appError';
import { toFieldErrorMap } from '../../../utils/errors';
import { useForgotPassword } from '../hooks';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '../validation';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

/**
 * Forgot password (spec Screen 2 — Recovery Screen).
 *
 * ## Header, not a native bar
 *
 * The header is rendered by [`AppHeader`](src/components/AppHeader/AppHeader.tsx:1)
 * inside the scroller (`headerShown: false` on the stack), and its back affordance
 * is the Phase 4 **left back-arrow icon** rather than the previous "Back" text.
 * The header is part of the scrolling content deliberately: it means the title
 * scrolls away to give a short device more room for the field and the keyboard,
 * instead of permanently costing 56pt of viewport.
 *
 * ## One field, so Return submits
 *
 * There is no second field to advance to, so `returnKeyType="done"` and
 * `onSubmitEditing` map straight to submit. This is the shortest possible path
 * from "typed my address" to "link on its way".
 *
 * ## Anti-enumeration
 *
 * The success state is intentionally one-way and non-enumerating: the backend
 * returns the same message whether or not the address exists, and the UI repeats
 * that indistinguishability rather than confirming "we found your account". This is
 * a deliberate security property, not an oversight. The fallback CTA is worded as
 * "I already have a reset code" so it does not leak whether the address was
 * recognised.
 */
export function ForgotPasswordScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();

    const {
        control,
        clearErrors,
        handleSubmit,
        setError,
        formState: { errors },
    } = useForm<ForgotPasswordFormValues>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: { email: '' },
        mode: 'onBlur',
    });

    // A root panel is not attached to a field, so it must be cleared by hand.
    const clearRootError = useClearRootError(clearErrors, errors.root !== undefined);

    const requestReset = useForgotPassword();

    const onSubmit = handleSubmit(async values => {
        Keyboard.dismiss();

        try {
            await requestReset.mutateAsync(values);
        } catch (error) {
            const appError = error as AppError;

            if (appError.kind === 'validation' && appError.fieldErrors) {
                const fields = toFieldErrorMap(appError);
                const message = fields.email;

                if (message) {
                    setError('email', { type: 'server', message });
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

    const email = useKeyboardAwareField('email');

    const rootError = errors.root?.message;

    /**
     * Success replaces the form but keeps the header, and keeps the back arrow:
     * a user who has finished reading the confirmation must still be able to leave.
     */
    if (requestReset.isSuccess) {
        return (
            <KeyboardAwareView ownsTopInset>
                <AppHeader title="Check your email" onBack={goBack} flat separator={false} />

                <View style={[styles.stack, { gap: theme.spacing.xl }]}>
                    <AppCard elevated="low" padded>
                        <View style={[styles.confirmation, { gap: theme.spacing.sm }]}>
                            <AppIcon
                                icon={MailCheckGlyph}
                                size="large"
                                color="success"
                                accessibilityLabel="Reset link sent"
                            />

                            <AppText variant="subtitle">
                                If an account exists for that address, a password reset link is
                                on its way.
                            </AppText>

                            <AppText variant="caption" color="textMuted">
                                Nothing arrived? Check your spam folder before requesting another
                                link — the reset endpoint is rate limited.
                            </AppText>
                        </View>
                    </AppCard>

                    <View style={[styles.actions, { gap: theme.spacing.sm }]}>
                        <AppButton
                            label="Back to sign in"
                            onPress={() => navigation.navigate('Login')}
                            fullWidth
                        />

                        <AppButton
                            label="I already have a reset code"
                            onPress={() => navigation.navigate('ResetPassword')}
                            variant="secondary"
                            fullWidth
                        />
                    </View>
                </View>
            </KeyboardAwareView>
        );
    }

    return (
        <KeyboardAwareView ownsTopInset>
            <AppHeader title="Forgot password" onBack={goBack} flat separator={false} />

            <View style={[styles.stack, { gap: theme.spacing.xl }]}>
                <View style={[styles.infoBlock, { gap: theme.spacing.sm }]}>
                    {/* `subtitle` (17/24) rather than `body`: this is the one
                        sentence that explains the whole screen, so it is given the
                        same weight as a section lead. */}
                    <AppText variant="subtitle">
                        Enter the email address on your account and we will send a reset link.
                    </AppText>

                    <AppText variant="caption" color="textMuted">
                        The link expires shortly, so use it soon. Reset requests are rate limited.
                    </AppText>
                </View>

                <View style={[styles.form, { gap: theme.spacing.md }]}>
                    <View {...email.wrapperProps}>
                        <Controller
                            control={control}
                            name="email"
                            render={({ field }) => (
                                <AppTextInput
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
                                    // An address is never capitalised; leaving the OS
                                    // default on would let the keyboard ship
                                    // "John@Example.com" to a lookup that lowercases.
                                    autoCapitalize="none"
                                    autoComplete="email"
                                    autoCorrect={false}
                                    textContentType="emailAddress"
                                    returnKeyType="done"
                                    onSubmitEditing={submitFromKeyboard}
                                    required
                                />
                            )}
                        />
                    </View>

                    {rootError !== undefined ? <FormErrorPanel message={rootError} /> : null}

                    <AppButton
                        label="Send reset link"
                        onPress={onSubmit}
                        loading={requestReset.isPending}
                        fullWidth
                        size="lg"
                    />

                    <AppButton
                        label="Already have a reset code?"
                        onPress={() => navigation.navigate('ResetPassword')}
                        variant="text"
                        size="sm"
                        fullWidth={false}
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
        // Optical inset so the explanatory copy aligns with the text *inside* the
        // input box rather than with its outer frame.
        paddingHorizontal: spacing.xxs,
    },
    form: {
        width: '100%',
    },
    confirmation: {
        alignItems: 'center',
    },
    actions: {
        width: '100%',
    },
});
