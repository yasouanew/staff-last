import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppIcon, CheckGlyph, ChevronDownGlyph } from '../../../components/AppIcon';
import { AppText } from '../../../components/AppText';
import { BottomSheet } from '../../../components/BottomSheet';
import { useTheme } from '../../../theme/useTheme';
import { TIME_OPTIONS } from '../utils';

/**
 * A single availability time *select*.
 *
 * ## Why a select rather than a text input
 *
 * The field previously accepted free text and validated it against `HH:MM`
 * afterwards, so a typo ("9:0", "0900", "9am") was only caught on save. The
 * roster only ever uses 30-minute boundaries, so every legal value is a member of
 * a fixed 48-entry set — which makes a chooser strictly better than a keyboard:
 * the user cannot enter an invalid time, and the format question disappears.
 *
 * The control keeps the original compact geometry (a 48pt band with a static
 * label above it) so the two fields in a day row still read as a matched pair.
 * Tapping the band opens a [`BottomSheet`](src/components/BottomSheet/BottomSheet.tsx:1)
 * listing the options; the sheet's drag gesture is bound to its header only, so
 * the list scrolls without fighting the dismiss gesture.
 *
 * The hint is passed in rather than derived, so the caller owns the copy and the
 * two fields can carry different guidance ("HH:MM (24h)" vs "Must be after
 * start") from one centralised source.
 */

/** The spec's 48pt control band. */
const FIELD_HEIGHT = 48;
/** The spec's 12pt corner. */
const FIELD_RADIUS = 12;
/** Label-to-control gap. A half-step, matching the spec's other 2pt offsets. */
const LABEL_GAP = 6;
/** Cap on the option list's height so a long list scrolls inside the sheet. */
const OPTION_LIST_MAX_HEIGHT = 320;
/** Height of one option row — comfortably above the 44pt touch-target floor. */
const OPTION_HEIGHT = 48;

export type TimeFieldProps = {
    label: string;
    /** The selected `HH:MM` value, or `null` when unset. */
    value: string | null;
    /** Called with the chosen `HH:MM` value. */
    onChange: (value: string) => void;
    placeholder?: string;
    /** Guidance shown when there is no error. */
    hint?: string;
    /** Validation message; takes precedence over `hint` and tints the frame. */
    error?: string;
    testID?: string;
};

export function TimeField({
    label,
    value,
    onChange,
    placeholder,
    hint,
    error,
    testID,
}: TimeFieldProps): React.JSX.Element {
    const theme = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const hasError = typeof error === 'string' && error.length > 0;
    const hasValue = value !== null && value !== '';

    const handleSelect = (option: string): void => {
        onChange(option);
        setIsOpen(false);
    };

    return (
        <View style={styles.field}>
            <AppText variant="caption" color="textSecondary" scaling="fixed" numberOfLines={1}>
                {label}
            </AppText>

            <Pressable
                testID={testID}
                accessibilityRole="button"
                accessibilityLabel={`${label}. ${hasValue ? value : 'No time chosen'}. Tap to choose a time.`}
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setIsOpen(true)}
                style={({ pressed }) => [
                    styles.control,
                    {
                        borderColor: hasError
                            ? theme.colors.danger
                            : theme.tokens.colors.borderHairline,
                        backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
                    },
                ]}>
                <AppText
                    variant="body"
                    color={hasValue ? 'text' : 'textMuted'}
                    scaling="fixed"
                    numberOfLines={1}
                    style={styles.value}>
                    {hasValue ? value : (placeholder ?? '')}
                </AppText>
                <AppIcon icon={ChevronDownGlyph} size="small" color="textMuted" />
            </Pressable>

            {hasError ? (
                <AppText
                    variant="caption"
                    color="danger"
                    scaling="fixed"
                    numberOfLines={2}
                    accessibilityLiveRegion="polite">
                    {error}
                </AppText>
            ) : hint !== undefined ? (
                <AppText variant="caption" color="textMuted" scaling="fixed" numberOfLines={2}>
                    {hint}
                </AppText>
            ) : null}

            <BottomSheet
                visible={isOpen}
                onClose={() => setIsOpen(false)}
                title={label}
                testID={testID !== undefined ? `${testID}-sheet` : undefined}>
                <ScrollView
                    style={styles.optionList}
                    contentContainerStyle={styles.optionListContent}
                    keyboardShouldPersistTaps="handled">
                    {TIME_OPTIONS.map(option => {
                        const isSelected = option === value;
                        return (
                            <Pressable
                                key={option}
                                testID={testID !== undefined ? `${testID}-option-${option}` : undefined}
                                accessibilityRole="button"
                                accessibilityState={{ selected: isSelected }}
                                onPress={() => handleSelect(option)}
                                style={({ pressed }) => [
                                    styles.option,
                                    {
                                        backgroundColor: pressed
                                            ? theme.colors.surfaceMuted
                                            : 'transparent',
                                    },
                                ]}>
                                <AppText
                                    variant={isSelected ? 'bodyStrong' : 'body'}
                                    color={isSelected ? 'textLink' : 'text'}
                                    scaling="fixed">
                                    {option}
                                </AppText>
                                {isSelected ? (
                                    <AppIcon icon={CheckGlyph} size="small" color="textLink" />
                                ) : null}
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </BottomSheet>
        </View>
    );
}

const styles = StyleSheet.create({
    field: {
        flex: 1,
        gap: LABEL_GAP,
    },
    control: {
        height: FIELD_HEIGHT,
        borderRadius: FIELD_RADIUS,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        gap: 8,
    },
    value: {
        flex: 1,
    },
    optionList: {
        maxHeight: OPTION_LIST_MAX_HEIGHT,
    },
    optionListContent: {
        paddingBottom: 4,
    },
    option: {
        height: OPTION_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
});
