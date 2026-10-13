import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { AppCard } from '../../../components/AppCard';
import { AppIcon } from '../../../components/AppIcon';
import { CheckCircleGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { FormErrorPanel } from '../../../components/FormErrorPanel';
import { KeyboardAwareView, useKeyboardAwareField } from '../../../components/KeyboardAwareView';
import { PrimaryButton, TextField } from '../../../components/ui';
import { useClearRootError } from '../../../hooks';
import type { AuthStackParamList } from '../../../navigation/types';
import { spacing } from '../../../theme/spacing';
import { useTheme } from '../../../theme/useTheme';
import type { AppError } from '../../../types/appError';
import { toFieldErrorMap } from '../../../utils/errors';
import { AuthHeader } from '../components';
import { useForgotPassword } from '../hooks';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '../validation';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

/** The submit lifecycle. `sent` swaps the body for the confirmation card. */
type SubmitStatus = 'idle' | 'sending' | 'sent';

/* ---- Spec geometry -------------------------------------------------- */

/** Body horizontal gutter — the spec's 24. */
const BODY_PADDING = 24;
/** Success badge diameter — the spec's 80. */
const SUCCESS_BADGE_SIZE = 80;
/** Success glyph size — the spec's 56. */
const SUCCESS_ICON_SIZE = 56;

/**
 * Forgot password (spec Screen 2 — Recovery Screen).
 *
 * ## Structure
 *
 * A fixed [`AuthHeader`](src/features/auth/components/AuthHeader.tsx:1) above a
 * [`KeyboardAwareView`](src/components/KeyboardAwareView/KeyboardAwareView.tsx:1)
 * scroller. The header owns the top inset and its own 16pt gutter; the scroller
 * owns the 24pt body gutter. Keeping the two gutters on separate owners is what
 * stops the header's 16 from compounding with the body's 24.
 *
 * ## The clipped-label defect
 *
 * The field is [`TextField`](src/components/ui/TextField/TextField.tsx:1), whose
 * label is a **static** line above the control — never transformed, so it cannot
 * clip. The 24pt gutter is enforced on the scroller's content container, so the
 * label always starts at a positive x-offset. This is the same structural fix
 * the Sign In refactor applied.
 *
 * ## One field, so Return submits
 *
 * There is no second field to advance to, so `returnKeyType="done"` and
 * `onSubmitEditing` map straight to submit. This is the shortest possible path
 * from "typed my address" to "link on its way".
 *
 * ## State machine
 *
 * `idle → sending → sent` is local state, not navigation. On success the body is
 * swapped for the confirmation card in place, so the user never leaves the
 * screen and the back affordance stays available.
 *
 * ## Anti-enumeration
 *
 * The success copy is deliberately non-enumerating: the backend returns the same
 * message whether or not the address exists, and the UI repeats that
 * indistinguishability rather than confirming "we found your account". The
 * fallback link is worded as "Already have a reset code?" so it does not leak
 * whether the address was recognised.
 */
export function ForgotPasswordScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();

    const [status, setStatus] = useState<SubmitStatus>('idle');

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
        setStatus('sending');

        try {
            await requestReset.mutateAsync(values);
            setStatus('sent');
        } catch (error) {
            // Back to `idle` so the form is editable again and the button is
            // re-armed; the error is painted below the field.
            setStatus('idle');

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

    return (
        <View style={[styles.screen, { backgroundColor: theme.colors.surface }]}>
            <AuthHeader title="Forgot password" onBack={goBack} />

            <KeyboardAwareView
                ownsTopInset={false}
                backgroundColor={theme.colors.surface}
                contentContainerStyle={styles.content}>
                {status === 'sent' ? (
                    <View style={styles.body}>
                        <AppCard elevated="low" padded>
                            <View style={styles.confirmation}>
                                <View
                                    style={[
                                        styles.successBadge,
                                        { backgroundColor: theme.colors.successSoft },
                                    ]}>
                                    <AppIcon
                                        icon={CheckCircleGlyph}
                                        sizePoints={SUCCESS_ICON_SIZE}
                                        color="success"
                                        accessibilityLabel="Reset link sent"
                                    />
                                </View>

                                <AppText
                                    variant="title"
                                    align="center"
                                    style={[
                                        styles.confirmationTitle,
                                        { color: theme.tokens.colors.inkPrimary },
                                    ]}>
                                    Check your email
                                </AppText>

                                <AppText
                                    variant="body"
                                    align="center"
                                    style={{ color: theme.tokens.colors.inkSecondary }}>
                                    If an account exists for that address, a password reset link is
                                    on its way. The link expires shortly, so use it soon.
                                </AppText>
                            </View>
                        </AppCard>

                        <Pressable
                            accessibilityRole="link"
                            accessibilityLabel="Back to sign in"
                            onPress={() => navigation.navigate('Login')}
                            hitSlop={12}
                            style={styles.resetLink}>
                            <AppText
                                variant="bodyStrong"
                                align="center"
                                style={{ color: theme.colors.primary }}>
                                Back to sign in
                            </AppText>
                        </Pressable>
                    </View>
                ) : (
                    <View style={styles.body}>
                        <AppText
                            variant="title"
                            style={[styles.hero, { color: theme.tokens.colors.inkPrimary }]}>
                            Enter the email address on your account and we will send a reset link.
                        </AppText>

                        <AppText
                            variant="body"
                            style={[styles.secondary, { color: theme.tokens.colors.inkSecondary }]}>
                            The link expires shortly, so use it soon. Reset requests are rate
                            limited.
                        </AppText>

                        <View {...email.wrapperProps} style={styles.field}>
                            <Controller
                                control={control}
                                name="email"
                                render={({ field }) => (
                                    <TextField
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

                        <PrimaryButton
                            label="Send reset link"
                            onPress={onSubmit}
                            loading={status === 'sending'}
                            style={styles.cta}
                        />

                        <Pressable
                            accessibilityRole="link"
                            accessibilityLabel="Already have a reset code?"
                            onPress={() => navigation.navigate('ResetPassword')}
                            hitSlop={12}
                            style={styles.resetLink}>
                            <AppText
                                variant="bodyStrong"
                                align="center"
                                style={{ color: theme.colors.primary }}>
                                Already have a reset code?
                            </AppText>
                        </Pressable>
                    </View>
                )}
            </KeyboardAwareView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    content: {
        // The spec's 24pt body gutter, enforced on the scroller so the field
        // label always starts at a positive x-offset — the structural half of
        // the clipped-label fix.
        paddingHorizontal: BODY_PADDING,
    },
    body: {
        marginTop: spacing.xl,
    },
    hero: {
        // The spec's 22/28 at weight 600; the `title` token is 22/28 at 700, so
        // the weight is overridden to match the spec exactly.
        fontWeight: '600',
    },
    secondary: {
        // The spec's 10pt — a half-step off the 4pt grid, kept verbatim.
        marginTop: 10,
    },
    field: {
        marginTop: spacing.xxl,
    },
    cta: {
        marginTop: spacing.xl,
    },
    resetLink: {
        marginTop: spacing.lg,
        alignSelf: 'center',
    },
    confirmation: {
        alignItems: 'center',
        gap: spacing.sm,
    },
    successBadge: {
        width: SUCCESS_BADGE_SIZE,
        height: SUCCESS_BADGE_SIZE,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmationTitle: {
        marginTop: spacing.xxs,
    },
});
