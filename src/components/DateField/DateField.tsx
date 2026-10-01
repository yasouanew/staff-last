import { Pressable, StyleSheet, View } from 'react-native';

import type { Colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { borderWidths, controlHeights, MIN_TOUCH_TARGET } from '../../theme/sizing';
import { spacing } from '../../theme/spacing';
import { lineHeight } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';
import { formatDate } from '../../utils/date';
import { AppIcon } from '../AppIcon/AppIcon';
import { CalendarGlyph, ChevronRightGlyph } from '../AppIcon/glyphs';
import { AppText } from '../AppText/AppText';
import { AppTextInput } from '../AppTextInput';

/**
 * A date field that opens a native picker when the build has one, and says so when
 * it does not.
 *
 * ## Why this is not simply a text input
 *
 * The brief is explicit that dates must not be "raw web text drops", and the screen
 * this replaces was exactly that: an `AppTextInput` with
 * `placeholder="YYYY-MM-DD"`, which asks the user to know and type an interchange
 * format. A date is chosen, not spelled.
 *
 * ## Why it is also not simply a button
 *
 * `package.json` has no date-picker dependency, so a press target that does nothing
 * would be a dead control. This component therefore has two honest modes, chosen by
 * [`isNativePickerAvailable`](src/features/leave/utils/datePicker.tsx:78):
 *
 *  - **Native** — a press target, styled like a settings row (leading calendar
 *    glyph, centred value, trailing chevron). Reads as "tap to choose".
 *  - **Fallback** — a real `AppTextInput` constrained to the API's date format,
 *    with helper text that names the missing capability. Reads as "type it, because
 *    nothing here can open a picker".
 *
 * The two modes are visually distinct on purpose. A text box pretending to be a
 * picker is worse than a text box: the user taps it expecting a calendar and gets a
 * keyboard.
 *
 * ## Why the value is an API date string, not a `Date`
 *
 * The form's schema, the zod validation, and the request payload all speak
 * `YYYY-MM-DD` (see [`leaveSchemas`](src/features/leave/validation/leaveSchemas.ts:1)).
 * Converting at the boundary — and only at the boundary — means the screen never
 * holds a `Date` that might drift a day through a timezone. `''` means "unset",
 * which is what the form starts with and what `zod` treats as empty.
 */

export type DateFieldProps = {
    label: string;
    /** API-shaped `YYYY-MM-DD`, or `''` when unset. Never a display format. */
    value: string;
    onChange: (apiDate: string) => void;
    error?: string;
    helper?: string;
    required?: boolean;
    /** Inclusive lower bound, as an API date. Passed through to the native picker. */
    minimumDate?: string;
    /**
     * Whether the build can actually open a native picker.
     *
     * Supplied by the screen from a single
     * [`useDatePicker`](src/features/leave/utils/datePicker.tsx:1) call so this atom
     * holds no dependency on the feature module, and so a unit test can render both
     * branches without stubbing a native module.
     *
     * Defaults to `false`: if a caller forgets to thread it through, the field
     * degrades to a working typed input rather than to a press target that does
     * nothing. Failing towards "usable" is the only safe default for a control the
     * user must operate to submit the form.
     */
    isNativePickerAvailable?: boolean;
    /** Opens the native picker. Supplied by the screen's single `useDatePicker`. */
    onRequestPicker: (currentValue: string, minimumDate?: string) => void;
    testID?: string;
    /** Rendered inside the same row as the value, for a trailing slot. */
    trailing?: React.ReactNode;
};

export function DateField({
    label,
    value,
    onChange,
    error,
    helper,
    required = false,
    minimumDate,
    isNativePickerAvailable = false,
    onRequestPicker,
    testID,
    trailing,
}: DateFieldProps): React.JSX.Element {
    const hasError = typeof error === 'string' && error.length > 0;

    /*
     * Both branches share the label band and the message band so that a field
     * swapping between them — which cannot happen at runtime, but *can* happen
     * between builds — occupies the same vertical space either way. That keeps a
     * screenshot diff honest.
     */
    const shared = {
        label: required ? `${label} *` : label,
        error,
        helper,
    };

    return (
        <View style={styles.container} testID={testID}>
            <FieldLabel text={shared.label} hasError={hasError} />
            <DateFieldControl
                value={value}
                onChange={onChange}
                hasError={hasError}
                minimumDate={minimumDate}
                isNativePickerAvailable={isNativePickerAvailable}
                onRequestPicker={onRequestPicker}
                trailing={trailing}
            />
            <MessageBand error={error} helper={helper} />
        </View>
    );
}

/** Label band, deliberately the same height as `AppTextInput`'s. */
function FieldLabel({ text, hasError }: { text: string; hasError: boolean }): React.JSX.Element {
    return (
        <View style={styles.labelBand}>
            <AppText variant="label" color={hasError ? 'danger' : 'textSecondary'} numberOfLines={1}>
                {text}
            </AppText>
        </View>
    );
}

type ControlProps = {
    value: string;
    onChange: (apiDate: string) => void;
    hasError: boolean;
    minimumDate?: string;
    isNativePickerAvailable: boolean;
    onRequestPicker: (currentValue: string, minimumDate?: string) => void;
    trailing?: React.ReactNode;
};

function DateFieldControl({
    value,
    onChange,
    hasError,
    minimumDate,
    isNativePickerAvailable,
    onRequestPicker,
    trailing,
}: ControlProps): React.JSX.Element {
    const theme = useTheme();

    /*
     * The fallback is a real, format-constrained input rather than a disabled
     * button: the user still has to be able to submit the form on a build whose
     * native picker is missing. The helper text names the absent capability so the
     * gap is visible to whoever reads the screen, not just to whoever reads the
     * package manifest.
     */
    if (!isNativePickerAvailable) {
        return (
            <AppTextInput
                label=""
                value={value}
                onChangeText={onChange}
                placeholder="YYYY-MM-DD"
                helper="Date picker unavailable in this build — type the date."
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                error={hasError ? ' ' : undefined}
            />
        );
    }

    const borderColor = hasError ? theme.colors.danger : theme.colors.borderStrong;

    return (
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${value === '' ? 'No date chosen' : formatDate(value)}. Tap to choose a date.`}
                onPress={() => onRequestPicker(value, minimumDate)}
                style={({ pressed }) => [
                    styles.control,
                    {
                        borderColor,
                        borderRadius: theme.radius.sm,
                        backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
                        paddingHorizontal: spacing.sm,
                        minHeight: controlHeights.md,
                    },
                ]}>
                <AppIcon icon={CalendarGlyph} size="small" color="textSecondary" />
                <AppText
                    variant="body"
                    color={value === '' ? 'textMuted' : 'text'}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={styles.value}>
                    {value === '' ? 'Choose a date' : formatDate(value, { long: true })}
                </AppText>
                <AppIcon icon={ChevronRightGlyph} size="small" color="textMuted" />
            </Pressable>
            {trailing}
        </View>
    );
}

/**
 * The message band, always mounted at a fixed height.
 *
 * Same rule as `AppTextInput`: reserving the line means an error appearing does not
 * push the rest of the form down, which is what stops a validation failure from
 * moving the button the user is about to press.
 */
function MessageBand({ error, helper }: { error?: string; helper?: string }): React.JSX.Element {
    const hasError = typeof error === 'string' && error.length > 0;

    return (
        <View style={styles.messageBand}>
            {hasError ? (
                <AppText variant="caption" color="danger">
                    {error}
                </AppText>
            ) : helper !== undefined ? (
                <AppText variant="caption" color="textMuted">
                    {helper}
                </AppText>
            ) : null}
        </View>
    );
}

/** The colour a caller should tint a calendar glyph with, by state. */
export const DATE_FIELD_ICON_COLOR: keyof Colors = 'textSecondary';

const styles = StyleSheet.create({
    container: {
        gap: spacing.xxs,
    },
    labelBand: {
        minHeight: lineHeight.xs,
        justifyContent: 'center',
    },
    messageBand: {
        minHeight: lineHeight.xs,
        justifyContent: 'center',
    },
    control: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        borderWidth: borderWidths.hairline,
        // A field must never be shorter than the minimum touch target even though
        // its painted band matches the other inputs at 44.
        minHeight: MIN_TOUCH_TARGET,
    },
    value: {
        flex: 1,
        // See the Phase 6 spec §0.3: without this a long formatted date pushes the
        // trailing chevron out of the field.
        minWidth: 0,
    },
});

export { radius as dateFieldRadius };
