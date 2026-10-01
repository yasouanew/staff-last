import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, StyleSheet, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { AppIcon } from '../../../components/AppIcon';
import { BrandShieldGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { AppTextInput, type AppTextInputRef } from '../../../components/AppTextInput';
import { FormErrorPanel } from '../../../components/FormErrorPanel';
import { KeyboardAwareView, useKeyboardAwareField } from '../../../components/KeyboardAwareView';
import type { AuthStackParamList } from '../../../navigation/types';
import { radiusRoles } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { useTheme } from '../../../theme/useTheme';
import type { AppError } from '../../../types/appError';
import { useClearRootError } from '../../../hooks';
import { toFieldErrorMap } from '../../../utils/errors';
import { useLogin } from '../hooks';
import { loginSchema, type LoginFormValues } from '../validation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/**
 * Login screen (spec Screen 1 — Modern Branded Login).
 *
 * ## Keyboard handling
 *
 * The whole screen is wrapped in [`KeyboardAwareView`](src/components/KeyboardAwareView/KeyboardAwareView.tsx:1)
 * rather than a bare `ScreenContainer`. `ScreenContainer` offers
 * `keyboardShouldPersistTaps` (so a button tap lands while the keyboard is up) but
 * performs no avoidance at all, which on a short device leaves the Password field
 * behind the keyboard. The container supplies the platform-correct avoidance and
 * scrolls each focused field into view.
 *
 * Note that the root is **not** a `ScreenContainer`: `KeyboardAwareView` already
 * provides the scroller, the gutter and the bottom inset. Nesting a second scroller
 * would give the screen two owners of the same inset and two competing scroll
 * positions.
 *
 * ## Focus chain
 *
 * `Email` → `Password` → submit, driven by `returnKeyType` and `onSubmitEditing`
 * (see [`useKeyboardAwareField`](src/components/KeyboardAwareView/KeyboardAwareView.tsx:1)).
 * Return always advances, even when the current field is invalid: the error is
 * already painted in the field's reserved band, and refusing to move would trap the
 * user on the field they are on their way back to fix.
 *
 * ## Validation
 *
 * The Zod schema checks presence and email shape only. Credential correctness,
 * account status and throttling are server concerns — the client must not claim to
 * know whether a password is right. Errors are split by kind rather than dumped as
 * one string: field-scoped 422s go back onto their inputs, a 429 gets its own tone,
 * everything else becomes a form-level panel.
 */
export function LoginScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const login = useLogin();

    const passwordRef = useRef<AppTextInputRef | null>(null);

    const {
        control,
        clearErrors,
        handleSubmit,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: '',
            password: '',
        },
        // `onBlur` rather than `onChange`: validating on every keystroke paints an
        // error on the first character of an address, which reads as hostile.
        mode: 'onBlur',
    });

    /*
     * A form-level panel (wrong credentials, a 429, a dropped connection) is not
     * attached to a field, so nothing re-validates it away. Clearing it on the first
     * edit stops a stale "Sign in failed" message from sitting above a form the user
     * has already changed.
     */
    const clearRootError = useClearRootError(clearErrors, errors.root !== undefined);

    const onSubmit = handleSubmit(async values => {
        // Dismiss first so the keyboard does not sit over the spinner, and so the
        // form-level error panel — if one appears — is visible without scrolling.
        Keyboard.dismiss();

        try {
            await login.mutateAsync({
                email: values.email,
                password: values.password,
            });
            // No navigation on success: the root navigator switches stacks when the
            // session store reports `authenticated`. Navigating here as well would
            // race that switch.
        } catch (error) {
            const appError = error as AppError;

            if (appError.kind === 'validation' && appError.fieldErrors) {
                const fields = toFieldErrorMap(appError);
                const loginFields: Array<keyof LoginFormValues> = ['email', 'password'];

                loginFields.forEach(field => {
                    const message = fields[field];

                    if (message) {
                        setError(field, { type: 'server', message });
                    }
                });

                return;
            }

            // The message is already human-readable and kind-aware (see
            // `normalizeError`), so it is surfaced verbatim.
            setError('root', { type: 'server', message: appError.message });
        }
    });

    const focusPassword = useCallback(() => {
        passwordRef.current?.focus();
    }, []);

    /**
     * `onSubmitEditing` hands the handler a native keyboard event. `handleSubmit`
     * takes an optional *React* synthetic event, so it is adapted here rather than
     * loosening either signature.
     */
    const submitFromKeyboard = useCallback(() => {
        // `handleSubmit` returns a promise whose rejection is already handled inside
        // the submit callback, so it is intentionally not awaited here — the keyboard
        // handler has nothing meaningful to do with the result.
        onSubmit().catch(() => undefined);
    }, [onSubmit]);

    const email = useKeyboardAwareField('email');
    const password = useKeyboardAwareField('password');

    const rootError = errors.root?.message;
    const isThrottled = login.error?.kind === 'throttled';

    return (
        <KeyboardAwareView ownsTopInset contentContainerStyle={styles.content}>
            <View style={styles.hero}>
                <View
                    style={[
                        styles.logoTile,
                        {
                            backgroundColor: theme.colors.primarySoft,
                            borderColor: theme.colors.primaryBorder,
                        },
                    ]}>
                    <AppIcon
                        icon={BrandShieldGlyph}
                        size="large"
                        color="primary"
                        accessibilityLabel="Staff Scheduler"
                    />
                </View>

                <AppText variant="headerLarge" numberOfLines={1} ellipsizeMode="tail">
                    Welcome Back
                </AppText>

                <AppText variant="body" color="textSecondary" style={styles.heroCopy}>
                    Sign in to view your shifts, roster and leave.
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

                <View {...password.wrapperProps}>
                    <Controller
                        control={control}
                        name="password"
                        render={({ field }) => (
                            <AppTextInput
                                ref={passwordRef}
                                label="Password"
                                value={field.value}
                                onChangeText={text => {
                                    field.onChange(text);
                                    clearRootError();
                                }}
                                onBlur={field.onBlur}
                                onFocus={password.onFocus}
                                error={errors.password?.message}
                                // `secureToggle` only renders the Show/Hide affordance;
                                // masking is driven by `secureTextEntry`, which controls
                                // the flag the toggle actually flips. Both are required.
                                secureTextEntry
                                secureToggle
                                autoCapitalize="none"
                                autoComplete="current-password"
                                textContentType="password"
                                returnKeyType="done"
                                onSubmitEditing={submitFromKeyboard}
                                required
                            />
                        )}
                    />
                </View>

                {rootError !== undefined ? (
                    <FormErrorPanel
                        message={rootError}
                        tone={isThrottled ? 'throttled' : 'danger'}
                    />
                ) : null}

                <AppButton
                    label="Sign in"
                    onPress={onSubmit}
                    loading={isSubmitting || login.isPending}
                    fullWidth
                    size="lg"
                />

                <AppButton
                    label="Forgot password?"
                    onPress={() => navigation.navigate('ForgotPassword')}
                    variant="text"
                    size="sm"
                    fullWidth={false}
                />
            </View>
        </KeyboardAwareView>
    );
}

const styles = StyleSheet.create({
    content: {
        // Centres the composition on a tall screen while still allowing the whole
        // form to scroll when the keyboard is up.
        justifyContent: 'center',
    },
    hero: {
        alignItems: 'center',
        marginBottom: spacing.xl,
    },
    logoTile: {
        width: 72,
        height: 72,
        borderRadius: radiusRoles.macro.xl,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        // Clipped so the icon can never paint outside the tile's radius.
        overflow: 'hidden',
        marginBottom: spacing.sm,
    },
    heroCopy: {
        textAlign: 'center',
        marginTop: spacing.xxs,
    },
    form: {
        width: '100%',
    },
});
