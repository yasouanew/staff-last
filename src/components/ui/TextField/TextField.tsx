import { forwardRef, useState } from 'react';
import {
    Pressable,
    StyleSheet,
    TextInput,
    View,
    type TextInputProps,
    type ViewStyle,
} from 'react-native';

import { FONT_SCALE_CAP } from '../../../theme/sizing';
import { useTheme } from '../../../theme/useTheme';
import { AppText } from '../../AppText';

/**
 * Instance type exposed by `TextInput` in React Native 0.87. Used for the
 * forwarded ref so callers can call `.focus()`/`.blur()` (e.g. "next field" on
 * submit) with the correct type across both architectures.
 */
export type TextFieldRef = React.ComponentRef<typeof TextInput>;

/**
 * The 2026 auth text field.
 *
 * ## Why this exists alongside `AppTextInput`
 *
 * [`AppTextInput`](src/components/AppTextInput/AppTextInput.tsx:1) is a
 * *floating-label* field: the label is rendered once and animated up into a
 * reserved band. That animation is what produced the clipped-label defect on the
 * auth screens — the label is scaled from its centre while resting inside the
 * box, so at the left edge of a narrow gutter it bleeds off-canvas ("mail *",
 * "assword *").
 *
 * This field takes the opposite, deliberately simpler approach: the label is a
 * **static line above the control**, never transformed, never clipped. It is the
 * shape the 2026 auth spec calls for, and it is the shape that cannot regress
 * into the reported bug.
 *
 * ## Geometry (spec)
 *
 *     label (caption, inkSecondary, 6pt gap)
 *     control (52pt tall, radius 14, 1pt hairline → 1.5pt primary on focus)
 *     message (13pt, danger, 6pt gap) — only when there is an error/helper
 *
 * Unlike `AppTextInput`, the message band is **not** reserved when empty: the
 * auth spec wants the form to breathe, and these fields are short enough that a
 * late-appearing error line does not push the submit button off-screen.
 *
 * ## Focus and error
 *
 * Focus is a colour *and* a weight change on the frame (hairline → primary,
 * 1 → 1.5). Error outranks focus so a failing field stays red while the user is
 * fixing it. The `Show`/`Hide` affordance is only rendered for a masked field,
 * so it can never appear over an unmasked input.
 */
export type TextFieldProps = Omit<TextInputProps, 'style'> & {
    /** Field label. Rendered verbatim; `required` appends the ` *` marker. */
    label: string;
    /** Validation or server error. Takes precedence over `helper`. */
    error?: string;
    /** Guidance shown when there is no error. */
    helper?: string;
    /** Appends ` *` to the label. */
    required?: boolean;
    /** Renders a Show/Hide control for password fields. */
    secureToggle?: boolean;
    /**
     * Live validators, run against the current value on every render. The first
     * one to return a message drives the frame colour and the message band —
     * the same treatment as a server `error`, but computed locally. A server
     * `error` still outranks a validator, so a 422 is never masked by a passing
     * local check.
     *
     * Validators read the controlled `value` prop, so they only run for a
     * controlled field (which is every auth field).
     */
    validators?: Array<(value: string) => string | undefined>;
    containerStyle?: ViewStyle;
};

/* ---- Spec geometry -------------------------------------------------- */

/** Control height — the spec's 52pt auth field. */
const FIELD_HEIGHT = 52;
/** Control radius — the spec's 14pt. */
const FIELD_RADIUS = 14;
/** Horizontal inset of the value and the trailing affordance. */
const FIELD_PADDING = 16;
/** Multiline floor — the spec's 88pt narrative box. */
const MULTILINE_MIN_HEIGHT = 88;
/** Multiline interior padding — the spec's 14pt. */
const MULTILINE_PADDING = 14;
/** Gap between the label and the control. */
const LABEL_GAP = 6;
/** Gap between the control and its message line. */
const MESSAGE_GAP = 6;
/** Resting frame weight. */
const REST_BORDER = 1;
/** Focused frame weight — the spec's 1.5pt. */
const FOCUS_BORDER = 1.5;

export const TextField = forwardRef<TextFieldRef, TextFieldProps>(function TextFieldImpl(
    {
        label,
        error,
        helper,
        required = false,
        secureToggle = false,
        editable = true,
        secureTextEntry,
        multiline = false,
        containerStyle,
        onFocus,
        onBlur,
        validators,
        value,
        onChangeText,
        ...rest
    },
    ref,
) {
    const theme = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const [isSecureVisible, setIsSecureVisible] = useState(false);

    /**
     * The first failing validator, or `undefined` when all pass. A server
     * `error` outranks it, so the resolved message is the one the field shows.
     */
    const validatorError = validators?.reduce<string | undefined>(
        (found, validate) => found ?? validate(typeof value === 'string' ? value : ''),
        undefined,
    );

    const message = error ?? validatorError;
    const hasError = typeof message === 'string' && message.length > 0;

    // The toggle is only meaningful when the field is actually masked. Defaulting
    // `secureTextEntry` to `true` whenever `secureToggle` is set keeps the prop
    // pair self-consistent: the Show/Hide control can never render over an
    // unmasked input (a no-op toggle), while callers may still force `false`.
    const isSecureField = secureTextEntry ?? secureToggle;

    /**
     * Error outranks focus: a failing field stays red while the user is fixing
     * it. Focus is the only state that also thickens the frame.
     */
    const borderColor = hasError
        ? theme.tokens.colors.danger
        : isFocused
            ? theme.tokens.colors.primary
            : theme.tokens.colors.borderHairline;

    const borderWidth = isFocused && !hasError ? FOCUS_BORDER : REST_BORDER;

    return (
        <View style={[styles.container, containerStyle]}>
            {/* Static label — never transformed, so it can never clip. */}
            <AppText
                variant="caption"
                scaling="fixed"
                style={[styles.label, { color: theme.tokens.colors.inkSecondary }]}>
                {required ? `${label} *` : label}
            </AppText>

            <View
                style={[
                    styles.inputRow,
                    multiline ? styles.inputRowMultiline : null,
                    {
                        // A single-line field is a fixed 52pt band; a multiline field
                        // grows from the spec's 88pt floor so a long reason is not
                        // clipped, while the form's geometry stays predictable.
                        ...(multiline
                            ? { minHeight: MULTILINE_MIN_HEIGHT, padding: MULTILINE_PADDING }
                            : { height: FIELD_HEIGHT, paddingHorizontal: FIELD_PADDING }),
                        borderRadius: FIELD_RADIUS,
                        borderWidth,
                        borderColor,
                        backgroundColor: theme.tokens.colors.surface,
                    },
                ]}>
                <TextInput
                    ref={ref}
                    value={value}
                    onChangeText={onChangeText}
                    editable={editable}
                    secureTextEntry={isSecureField && !isSecureVisible}
                    placeholderTextColor={theme.colors.textMuted}
                    accessibilityLabel={label}
                    accessibilityState={{ disabled: !editable }}
                    // The control band is a fixed 52pt, so an uncapped OS text size
                    // would clip the value. Capping — rather than disabling — keeps
                    // the accessibility setting honoured up to the geometry's limit.
                    maxFontSizeMultiplier={FONT_SCALE_CAP}
                    onFocus={event => {
                        setIsFocused(true);
                        onFocus?.(event);
                    }}
                    onBlur={event => {
                        setIsFocused(false);
                        onBlur?.(event);
                    }}
                    style={[
                        styles.input,
                        multiline ? styles.inputMultiline : null,
                        {
                            color: editable ? theme.colors.text : theme.colors.textDisabled,
                        },
                    ]}
                    {...rest}
                />

                {secureToggle ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={isSecureVisible ? 'Hide password' : 'Show password'}
                        onPress={() => setIsSecureVisible(previous => !previous)}
                        hitSlop={8}
                        style={styles.toggle}>
                        <AppText
                            variant="bodyStrong"
                            scaling="fixed"
                            style={{ color: theme.tokens.colors.primary }}>
                            {isSecureVisible ? 'Hide' : 'Show'}
                        </AppText>
                    </Pressable>
                ) : null}
            </View>

            {hasError ? (
                // `accessibilityLiveRegion` makes screen readers announce the
                // failure as soon as it appears.
                <AppText
                    variant="caption"
                    scaling="fixed"
                    numberOfLines={2}
                    accessibilityLiveRegion="polite"
                    style={[styles.message, { color: theme.tokens.colors.danger }]}>
                    {message}
                </AppText>
            ) : helper !== undefined ? (
                <AppText
                    variant="caption"
                    scaling="fixed"
                    numberOfLines={2}
                    style={[styles.message, { color: theme.tokens.colors.inkTertiary }]}>
                    {helper}
                </AppText>
            ) : null}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    label: {
        marginBottom: LABEL_GAP,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    inputRowMultiline: {
        // A narrative box aligns its text to the top, not the vertical centre.
        alignItems: 'flex-start',
    },
    input: {
        flex: 1,
        fontSize: 15,
        lineHeight: 22,
        paddingVertical: 0,
        // Vertical centring is structural (the row is `alignItems: 'center'`),
        // never faked with padding.
        textAlignVertical: 'center',
    },
    inputMultiline: {
        // The spec's `textAlignVertical: 'top'` for a multiline box.
        textAlignVertical: 'top',
        paddingVertical: 0,
    },
    toggle: {
        // The row already insets the trailing edge by `FIELD_PADDING`; this is
        // only the gap between the value and the affordance.
        paddingLeft: 8,
        paddingVertical: 4,
    },
    message: {
        marginTop: MESSAGE_GAP,
    },
});
