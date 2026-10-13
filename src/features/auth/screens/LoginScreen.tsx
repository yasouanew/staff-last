import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../../components/AppText';
import { FormErrorPanel } from '../../../components/FormErrorPanel';
import { Toast } from '../../../components/Toast';
import { KeyboardAwareView, useKeyboardAwareField } from '../../../components/KeyboardAwareView';
import { PrimaryButton, TextField, type TextFieldRef } from '../../../components/ui';
import { useClearRootError } from '../../../hooks';
import type { AuthStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme/useTheme';
import type { AppError } from '../../../types/appError';
import { ROSTA_LOGO_ASPECT_RATIO, ROSTA_LOGO_NAVY } from '../../../utils/brandAssets';
import { toFieldErrorMap } from '../../../utils/errors';
import { useLogin } from '../hooks';
import { loginSchema, type LoginFormValues } from '../validation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/**
 * Login screen (spec Screen 1 — Welcome / Sign In).
 *
 * ## Layout
 *
 * A centred, breathing auth column on a flat `surface` canvas:
 *
 *     top spacer (96)
 *     Rosta wordmark (navy, 200pt wide, intrinsic ratio)
 *     "Welcome Back" (display, inkPrimary)
 *     subtitle (body, inkSecondary, maxWidth 280)
 *     form stack (marginTop 40, alignSelf stretch)
 *
 * The hero block is `alignItems: 'center'`; the form is `alignSelf: 'stretch'`
 * so its fields span the full gutter. The gutter itself is owned by
 * [`KeyboardAwareView`](src/components/KeyboardAwareView/KeyboardAwareView.tsx:1),
 * which applies `paddingHorizontal: 24` to the scroller's content container.
 *
 * ## The clipped-label defect
 *
 * The previous build used the floating-label `AppTextInput`, whose label is
 * scaled from its centre while resting inside the control. At the left edge of a
 * narrow gutter that transform pushed the label off-canvas, so "Email *" and
 * "Password *" rendered as "mail *" / "assword *". The fix is structural, not a
 * nudge: the fields are now [`TextField`](src/components/ui/TextField/TextField.tsx:1),
 * which draws a **static** label above the control that is never transformed and
 * therefore cannot clip, and the gutter is enforced on the scroller so the label
 * always starts at a positive x-offset.
 *
 * ## Keyboard handling
 *
 * The whole screen is wrapped in `KeyboardAwareView` rather than a bare
 * `ScreenContainer`. It supplies the platform-correct avoidance and scrolls each
 * focused field into view. The root is **not** a `ScreenContainer`: the
 * `KeyboardAwareView` already provides the scroller, the gutter and the bottom
 * inset, and nesting a second scroller would give the screen two owners of the
 * same inset.
 *
 * ## Focus chain
 *
 * `Email` → `Password` → submit, driven by `returnKeyType` and
 * `onSubmitEditing`. Return always advances, even when the current field is
 * invalid: the error is already painted below the field, and refusing to move
 * would trap the user on the field they are on their way back to fix.
 *
 * ## Validation
 *
 * The Zod schema checks presence and email shape only. Credential correctness,
 * account status and throttling are server concerns — the client must not claim
 * to know whether a password is right. Errors are split by kind rather than
 * dumped as one string: field-scoped 422s go back onto their inputs, a 429 gets
 * its own tone, everything else becomes a form-level panel.
 */
export function LoginScreen({ navigation, route }: Props): React.JSX.Element {
    const theme = useTheme();

    const login = useLogin();

    /**
     * A one-shot confirmation handed over by the previous screen (the Reset
     * screen navigates here with "Password updated"). It is copied into local
     * state so the toast can dismiss itself, then the param is cleared so a
     * re-render or a back-navigation cannot resurrect it.
     */
    const [toastMessage, setToastMessage] = useState<string | undefined>(route.params?.toast);

    useEffect(() => {
        const incoming = route.params?.toast;

        if (incoming !== undefined) {
            setToastMessage(incoming);
            navigation.setParams({ toast: undefined });
        }
    }, [route.params?.toast, navigation]);

    const passwordRef = useRef<TextFieldRef | null>(null);

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
        <View style={styles.root}>
            <KeyboardAwareView
                ownsTopInset
                backgroundColor={theme.colors.surface}
                contentContainerStyle={styles.content}>
                <View style={styles.hero}>
                    <Image
                        source={ROSTA_LOGO_NAVY}
                        accessible
                        accessibilityRole="image"
                        accessibilityLabel="Rosta"
                        resizeMode="contain"
                        style={styles.brandMark}
                    />

                    <AppText
                        variant="display"
                        align="center"
                        style={{ color: theme.tokens.colors.inkPrimary }}>
                        Welcome Back
                    </AppText>

                    <AppText
                        variant="body"
                        align="center"
                        style={[styles.subtitle, { color: theme.tokens.colors.inkSecondary }]}>
                        Sign in to view your shifts, roster and leave.
                    </AppText>
                </View>

                <View style={styles.form}>
                    <View {...email.wrapperProps}>
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
                                <TextField
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

                    <PrimaryButton
                        label="Sign in"
                        onPress={onSubmit}
                        loading={isSubmitting || login.isPending}
                        style={styles.submit}
                    />

                    <Pressable
                        accessibilityRole="link"
                        accessibilityLabel="Forgot password?"
                        onPress={() => navigation.navigate('ForgotPassword')}
                        hitSlop={8}
                        style={styles.forgot}>
                        <AppText
                            variant="bodyStrong"
                            align="center"
                            style={{ color: theme.colors.primary }}>
                            Forgot password?
                        </AppText>
                    </Pressable>
                </View>
            </KeyboardAwareView>

            <Toast
                message={toastMessage ?? ''}
                visible={toastMessage !== undefined}
                onDismiss={() => setToastMessage(undefined)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    content: {
        // The spec's 24pt auth gutter, overriding the container's 16pt default.
        // Enforced on the scroller so the field labels always start at a positive
        // x-offset — the structural half of the clipped-label fix.
        paddingHorizontal: 24,
        // The spec's top spacer. `flexGrow: 1` (from the container) lets a short
        // form still fill the viewport while a long one scrolls.
        paddingTop: 96,
    },
    hero: {
        alignItems: 'center',
    },
    brandMark: {
        // Fixed width; the height follows the wordmark's own ratio so the mark
        // is never stretched. The navy variant is used because this hero sits on
        // the light `surface` canvas.
        width: 200,
        height: 200 / ROSTA_LOGO_ASPECT_RATIO,
        marginBottom: 28,
    },
    subtitle: {
        marginTop: 8,
        maxWidth: 280,
        alignSelf: 'center',
    },
    form: {
        // `stretch` so the fields span the full gutter; the hero above is centred.
        alignSelf: 'stretch',
        marginTop: 40,
        gap: 16,
    },
    submit: {
        marginTop: 28,
    },
    forgot: {
        marginTop: 20,
        alignSelf: 'center',
    },
});
