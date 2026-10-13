import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, StyleSheet, View } from 'react-native';

import { AppText } from '../../../components/AppText';
import { FormErrorPanel } from '../../../components/FormErrorPanel';
import { KeyboardAwareView, useKeyboardAwareField } from '../../../components/KeyboardAwareView';
import { PrimaryButton, TextField, type TextFieldRef } from '../../../components/ui';
import { useClearRootError } from '../../../hooks';
import type { AuthStackParamList } from '../../../navigation/types';
import { spacing } from '../../../theme/spacing';
import { useTheme } from '../../../theme/useTheme';
import type { AppError } from '../../../types/appError';
import { toFieldErrorMap } from '../../../utils/errors';
import {
    evaluatePasswordStrength,
    PASSWORD_MIN_LENGTH,
    PASSWORD_STRENGTH_FILL,
    PASSWORD_STRENGTH_SEGMENTS,
    type PasswordStrengthLevel,
} from '../../../utils/passwordStrength';
import { AuthHeader } from '../components';
import { useResetPassword } from '../hooks';
import { useRecoveryStore } from '../store';
import { parseResetParams } from '../utils';
import { resetPasswordSchema, type ResetPasswordFormValues } from '../validation';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

/* ---- Spec geometry -------------------------------------------------- */

/** Body horizontal gutter — the spec's 24. */
const BODY_PADDING = 24;
/** Gap between the four fields — the spec's 20. */
const FIELD_GAP = 20;
/** Instruction bottom margin — the spec's 28. */
const INSTRUCTION_MARGIN = 28;
/** CTA top margin — the spec's 32. */
const CTA_MARGIN = 32;
/** Segment height — the spec's 4. */
const SEGMENT_HEIGHT = 4;
/** Segment radius — the spec's 2. */
const SEGMENT_RADIUS = 2;
/** Gap between segments — the spec's 4. */
const SEGMENT_GAP = 4;

/** Filled-segment colour per level. */
const STRENGTH_COLOR: Record<PasswordStrengthLevel, 'danger' | 'warning' | 'success'> = {
    weak: 'danger',
    medium: 'warning',
    strong: 'success',
};

/**
 * The three-segment strength hint.
 *
 * A row of equal-width segments rather than a single bar: the discrete segments
 * make the three levels legible at a glance and give the state a shape, not just
 * a length. Colour is never the only signal — the filled count differs too, so a
 * colour-blind user reads the same state.
 */
function StrengthBar({ level }: { level: PasswordStrengthLevel }): React.JSX.Element {
    const theme = useTheme();
    const filled = PASSWORD_STRENGTH_FILL[level];

    return (
        <View
            accessibilityRole="progressbar"
            accessibilityLabel={`Password strength: ${level}`}
            accessibilityValue={{ min: 1, max: PASSWORD_STRENGTH_SEGMENTS, now: filled }}
            style={styles.strengthBar}>
            {Array.from({ length: PASSWORD_STRENGTH_SEGMENTS }, (_, index) => (
                <View
                    key={index}
                    style={[
                        styles.strengthSegment,
                        {
                            backgroundColor:
                                index < filled
                                    ? theme.tokens.colors[STRENGTH_COLOR[level]]
                                    : theme.tokens.colors.borderHairline,
                        },
                    ]}
                />
            ))}
        </View>
    );
}

/**
 * Reset password (spec Screen 3 — Set a new password).
 *
 * ## Structure
 *
 * A fixed [`AuthHeader`](src/features/auth/components/AuthHeader.tsx:1) above a
 * [`KeyboardAwareView`](src/components/KeyboardAwareView/KeyboardAwareView.tsx:1)
 * scroller. The header owns the top inset and its own 16pt gutter; the scroller
 * owns the 24pt body gutter, so the two never compound. The CTA is the last child
 * of the scroller, so the keyboard-avoidance behaviour lifts it above the
 * keyboard rather than letting it hide underneath.
 *
 * ## The clipped-label defect
 *
 * Every field is [`TextField`](src/components/ui/TextField/TextField.tsx:1), whose
 * label is a **static** line above the control — never transformed, so it cannot
 * clip. The 24pt gutter is enforced on the scroller's content container, so the
 * label always starts at a positive x-offset. This is the same structural fix the
 * Sign In and Forgot Password refactors applied.
 *
 * ## Live validation
 *
 * The password and confirmation fields carry `validators` — local checks that run
 * against the current value on every render and drive the frame colour and the
 * message band, exactly like a server error. A server 422 still outranks them, so
 * a passing local check can never mask a rejection. The strength bar is computed
 * by [`evaluatePasswordStrength`](src/utils/passwordStrength.ts:1) and rendered in
 * a fixed-height slot, so typing the first character cannot shift the Confirm
 * field.
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
 * 3. Nothing at all — the token field is simply empty and the user pastes the code.
 *
 * ## Success
 *
 * On success the screen navigates to Sign In with a one-shot `toast` param, which
 * the Login screen surfaces as a transient confirmation pill. The flow does not
 * render its own success state: the destination is the sign-in form, and the toast
 * is the acknowledgement.
 */
export function ResetPasswordScreen({ navigation, route }: Props): React.JSX.Element {
    const theme = useTheme();

    const pendingEmail = useRecoveryStore(state => state.pendingEmail);

    const emailRef = useRef<TextFieldRef | null>(null);
    const passwordRef = useRef<TextFieldRef | null>(null);
    const confirmRef = useRef<TextFieldRef | null>(null);

    /**
     * `route.params` is optional at the type level (deep links can omit it
     * entirely), so everything is funnelled through the same tolerant parser the
     * link handler uses. Memoised because `useForm`'s `defaultValues` are read
     * once on mount, and a fresh object identity on every render serves no purpose.
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

    const passwordValue = watch('password') ?? '';
    const strength = useMemo(() => evaluatePasswordStrength(passwordValue), [passwordValue]);

    // A root panel is not attached to a field, so it must be cleared by hand.
    const clearRootError = useClearRootError(clearErrors, errors.root !== undefined);

    const resetPassword = useResetPassword();

    const onSubmit = handleSubmit(async values => {
        Keyboard.dismiss();

        try {
            await resetPassword.mutateAsync(values);
            // The flow ends on the sign-in form; the toast is the acknowledgement.
            navigation.navigate('Login', { toast: 'Password updated' });
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

    const rootError = errors.root?.message;

    return (
        <View style={[styles.screen, { backgroundColor: theme.colors.surface }]}>
            <AuthHeader title="Set a new password" onBack={goBack} />

            <KeyboardAwareView
                ownsTopInset={false}
                backgroundColor={theme.colors.surface}
                contentContainerStyle={styles.content}>
                <View style={styles.body}>
                    <AppText
                        variant="heading"
                        style={[styles.instruction, { color: theme.tokens.colors.inkPrimary }]}>
                        Paste the reset code from your email, then choose a new password.
                    </AppText>

                    <View style={styles.form}>
                        <View {...token.wrapperProps}>
                            <Controller
                                control={control}
                                name="token"
                                render={({ field }) => (
                                    <TextField
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

                        <View {...email.wrapperProps}>
                            <Controller
                                control={control}
                                name="email"
                                render={({ field }) => (
                                    <TextField
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

                        {/* The strength bar belongs to the password field, so both
                            live in one group with a tight inner gap. */}
                        <View style={styles.fieldGroup}>
                            <View {...password.wrapperProps}>
                                <Controller
                                    control={control}
                                    name="password"
                                    render={({ field }) => (
                                        <TextField
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
                                            helper="At least 8 characters."
                                            validators={[
                                                value =>
                                                    value.length > 0 &&
                                                        value.length < PASSWORD_MIN_LENGTH
                                                        ? `Use at least ${PASSWORD_MIN_LENGTH} characters.`
                                                        : undefined,
                                            ]}
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

                            {/* Fixed-height slot: the bar appears inside space that
                                already existed, so typing cannot shift the Confirm
                                field. */}
                            <View style={styles.strengthSlot}>
                                {passwordValue.length > 0 ? (
                                    <StrengthBar level={strength} />
                                ) : null}
                            </View>
                        </View>

                        <View {...confirmation.wrapperProps}>
                            <Controller
                                control={control}
                                name="password_confirmation"
                                render={({ field }) => (
                                    <TextField
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
                                        validators={[
                                            value =>
                                                value.length > 0 && value !== passwordValue
                                                    ? 'Passwords do not match.'
                                                    : undefined,
                                        ]}
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

                        <PrimaryButton
                            label="Update password"
                            onPress={onSubmit}
                            loading={resetPassword.isPending}
                            style={styles.cta}
                        />
                    </View>
                </View>
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
        // labels always start at a positive x-offset — the structural half of
        // the clipped-label fix.
        paddingHorizontal: BODY_PADDING,
    },
    body: {
        marginTop: spacing.xl,
    },
    instruction: {
        marginBottom: INSTRUCTION_MARGIN,
    },
    form: {
        width: '100%',
        gap: FIELD_GAP,
    },
    fieldGroup: {
        width: '100%',
        gap: spacing.xs,
    },
    strengthSlot: {
        // Reserved unconditionally so the bar's appearance cannot move the
        // Confirm field.
        height: SEGMENT_HEIGHT,
        justifyContent: 'center',
    },
    strengthBar: {
        flexDirection: 'row',
        gap: SEGMENT_GAP,
    },
    strengthSegment: {
        flex: 1,
        height: SEGMENT_HEIGHT,
        borderRadius: SEGMENT_RADIUS,
    },
    cta: {
        marginTop: CTA_MARGIN,
    },
});
