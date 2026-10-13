import { FlatList, Pressable, StyleSheet, type ListRenderItemInfo } from 'react-native';

import { AppText } from '../../../components/AppText';
import { useTheme } from '../../../theme/useTheme';
import type { LeaveType } from '../types';

/**
 * Horizontally scrolling leave-type selector.
 *
 * Replaces the free-text chip box the form previously used, which let a user type
 * an arbitrary string ("last new") that could never match a server leave type. The
 * options are now the real catalogue, so a selection is always a valid
 * `leave_type_id`.
 *
 * ## Geometry (2026 spec)
 *
 * Height 36, radius 999, `bodyStrong`. Unselected is `surfaceMuted`/`inkSecondary`;
 * selected is a `primarySoft` fill with a 1.5pt `primary` border and `primary` text
 * — a tinted, outlined chip rather than a solid fill, so a row of them reads as a
 * set of choices rather than a row of buttons.
 *
 * ## Why a scroller
 *
 * Leave-type names vary from "Annual" to "Bereavement". Equal-width segments would
 * crush the long ones, so the chips hug their labels and the row scrolls.
 */
export type LeaveTypeChipsProps = {
    types: LeaveType[];
    /** Selected `leave_type_id`, or `0` when nothing is chosen. */
    selectedId: number;
    onSelect: (id: number) => void;
    testID?: string;
};

/** The spec's painted height. */
const CHIP_HEIGHT = 36;
/** The spec's horizontal padding. */
const CHIP_PADDING = 14;
/** The spec's selected border weight. */
const SELECTED_BORDER = 1.5;

export function LeaveTypeChips({
    types,
    selectedId,
    onSelect,
    testID,
}: LeaveTypeChipsProps): React.JSX.Element {
    const theme = useTheme();

    return (
        <FlatList<LeaveType>
            horizontal
            data={types}
            keyExtractor={type => String(type.id)}
            testID={testID}
            showsHorizontalScrollIndicator={false}
            // A handful of types; there is nothing to defer.
            initialNumToRender={types.length}
            contentContainerStyle={styles.strip}
            // An inner horizontal scroller must not claim height from the column
            // parent, or it swallows the rest of the form.
            style={styles.scroller}
            renderItem={({ item }: ListRenderItemInfo<LeaveType>) => {
                const selected = item.id === selectedId;

                return (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={item.name}
                        accessibilityState={{ selected }}
                        onPress={() => onSelect(item.id)}
                        style={({ pressed }) => [
                            styles.chip,
                            {
                                height: CHIP_HEIGHT,
                                borderRadius: theme.tokens.radius.rPill,
                                paddingHorizontal: CHIP_PADDING,
                                backgroundColor: selected
                                    ? theme.colors.primarySoft
                                    : theme.colors.surfaceMuted,
                                borderWidth: selected ? SELECTED_BORDER : 0,
                                borderColor: selected ? theme.colors.primary : 'transparent',
                                opacity: pressed ? 0.7 : 1,
                            },
                        ]}>
                        <AppText
                            variant="bodyStrong"
                            color={selected ? 'primary' : 'textSecondary'}
                            numberOfLines={1}>
                            {item.name}
                        </AppText>
                    </Pressable>
                );
            }}
        />
    );
}

const styles = StyleSheet.create({
    scroller: {
        flexGrow: 0,
    },
    strip: {
        paddingHorizontal: 20,
        gap: 8,
    },
    chip: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
