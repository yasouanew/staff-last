import { Pressable, StyleSheet, View } from 'react-native';

import type { Colors } from '../../theme/colors';
import { useTheme } from '../../theme/useTheme';
import { formatDate } from '../../utils/date';
import { AppIcon } from '../AppIcon/AppIcon';
import { CalendarGlyph, ChevronDownGlyph } from '../AppIcon/glyphs';
import { AppText } from '../AppText/AppText';

/**
 * A date field that opens a picker.
 *
 * ## Why this is a pressable row, not a text input
 *
 * A date is chosen, not spelled. The screen this replaces asked the user to type
 * `YYYY-MM-DD` into a text box — an interchange format no user should have to know.
 * This is a settings-style row: a leading calendar glyph, the formatted value, and a
 * trailing chevron-down that reads as "tap to open".
 *
 * ## Geometry (2026 spec)
 *
 *     label (caption, inkSecondary)
 *     control (52pt tall, radius 14, 1pt hairline, 16pt horizontal padding)
 *     message (caption) — only when there is an error/helper
 *
 * ## Why the value is an API date string, not a `Date`
 *
 * The form's schema, the zod validation, and the request payload all speak
 * `YYYY-MM-DD` (see [`leaveSchemas`](src/features/leave/validation/leaveSchemas.ts:1)).
 * Converting at the boundary — and only at the boundary — means the screen never
 * holds a `Date` that might drift a day through a timezone. `''` means "unset".
 */

export type DateFieldProps = {
    label: string;
    /** API-shaped `YYYY-MM-DD`, or `''` when unset. Never a display format. */
    value: string;
    onChange: (apiDate: string) => void;
    error?: string;
    helper?: string;
    required?: boolean;
    /** Inclusive lower bound, as an API date. Passed through to the picker. */
    minimumDate?: string;
    /**
     * Opens the picker. Supplied by the screen's single `useDatePicker`.
     *
     * Retained for API compatibility; the picker seam now always provides a
     * renderer (native module or the built-in calendar), so this is always wired.
     */
    onRequestPicker: (currentValue: string, minimumDate?: string) => void;
    /**
     * @deprecated The picker seam now always opens a real picker, so this no longer
     * selects a fallback branch. Kept so existing call sites keep compiling.
     */
    isNativePickerAvailable?: boolean;
    testID?: string;
    /** Rendered inside the same row as the value, for a trailing slot. */
    trailing?: React.ReactNode;
};

/* ---- Spec geometry -------------------------------------------------- */

/** Control height — the spec's 52. */
const FIELD_HEIGHT = 52;
/** Control radius — the spec's 14. */
const FIELD_RADIUS = 14;
/** Horizontal inset — the spec's 16. */
const FIELD_PADDING = 16;
/** Leading calendar glyph — the spec's 18. */
const CALENDAR_ICON_SIZE = 18;
/** Gap between the label and the control. */
const LABEL_GAP = 6;

export function DateField({
    label,
    value,
    error,
    helper,
    required = false,
    minimumDate,
    onRequestPicker,
    testID,
    trailing,
}: DateFieldProps): React.JSX.Element {
    const theme = useTheme();
    const hasError = typeof error === 'string' && error.length > 0;

    const borderColor = hasError ? theme.colors.danger : theme.tokens.colors.borderHairline;

    return (
        <View style={styles.container}>
            <AppText
                variant="caption"
                scaling="fixed"
                style={[styles.label, { color: theme.tokens.colors.inkSecondary }]}>
                {required ? `${label} *` : label}
            </AppText>

            <View style={styles.row}>
                <Pressable
                    testID={testID}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}. ${value === '' ? 'No date chosen' : formatDate(value)}. Tap to choose a date.`}
                    onPress={() => onRequestPicker(value, minimumDate)}
                    style={({ pressed }) => [
                        styles.control,
                        {
                            height: FIELD_HEIGHT,
                            borderRadius: FIELD_RADIUS,
                            paddingHorizontal: FIELD_PADDING,
                            borderColor,
                            backgroundColor: pressed
                                ? theme.colors.surfaceMuted
                                : theme.colors.surface,
                        },
                    ]}>
                    <AppIcon
                        icon={CalendarGlyph}
                        sizePoints={CALENDAR_ICON_SIZE}
                        color="textMuted"
                    />
                    <AppText
                        variant="body"
                        color={value === '' ? 'textMuted' : 'text'}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={styles.value}>
                        {value === '' ? 'Choose a date' : formatDate(value)}
                    </AppText>
                    <AppIcon icon={ChevronDownGlyph} size="small" color="textMuted" />
                </Pressable>
                {trailing}
            </View>

            {hasError ? (
                <AppText
                    variant="caption"
                    color="danger"
                    scaling="fixed"
                    numberOfLines={2}
                    accessibilityLiveRegion="polite"
                    style={styles.message}>
                    {error}
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
}

/** The colour a caller should tint a calendar glyph with, by state. */
export const DATE_FIELD_ICON_COLOR: keyof Colors = 'textMuted';

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    label: {
        marginBottom: LABEL_GAP,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    control: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
    },
    value: {
        flex: 1,
        // Without this a long formatted date pushes the trailing chevron out.
        minWidth: 0,
    },
    message: {
        marginTop: LABEL_GAP,
    },
});
