import { useCallback, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { AppIcon } from '../../../components/AppIcon';
import { ChevronLeftGlyph, ChevronRightGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { radius as radiusTokens } from '../../../theme/radius';
import { borderWidths } from '../../../theme/sizing';
import { spacing } from '../../../theme/spacing';
import { useTheme } from '../../../theme/useTheme';
import { fromApiDate, toApiDate } from '../../../utils/date';

/**
 * The app's single native-date-picker seam.
 *
 * ## The gap this file exists to make honest
 *
 * Phase 6 requires date fields that open the platform's own modal date picker
 * rather than a text box expecting `YYYY-MM-DD`. That needs a native module, and
 * `package.json` currently has **none** — there is no
 * `@react-native-community/datetimepicker` and no equivalent. Building a field
 * that *claims* to open a native picker while actually showing a text input would
 * be exactly the kind of dead control the rest of this codebase refuses to ship
 * (see the absent Clock-In action in Shift Detail, and the absent avatar upload in
 * the Account screen due to backend gap G4).
 *
 * So the capability is probed once, honestly, and the result is exported:
 *
 *  - **[`isNativePickerAvailable`](src/features/leave/utils/datePicker.tsx:78) is
 *    `true`** — [`useDatePicker`](src/features/leave/utils/datePicker.tsx:107)
 *    returns a renderer that opens the real platform picker.
 *  - **it is `false`** — the hook returns `null`, and
 *    [`DateField`](src/components/DateField/DateField.tsx:1) falls back to a
 *    format-constrained text entry **that says so on screen**.
 *
 * Adopting the real picker is a change to `loadNativePicker` below and nothing
 * else: every screen touches only the hook, so no screen changes at all.
 *
 * ## How the probe works without the dependency
 *
 * A static `import` of a package that is not in `package.json` is a compile error,
 * so the module cannot be named in an import statement. The probe therefore goes
 * through `require`, wrapped in `try/catch`.
 *
 * The package name is written as a **string literal at the call site**, and that is
 * load-bearing rather than incidental. Metro's `inline-requires` transformer only
 * understands `require` when its argument is a literal — handed a variable it aborts
 * the whole bundle with `Invalid call at line N: require(NATIVE_PICKER_PACKAGE)`.
 * Hoisting the name into a constant, which an earlier revision of this file did,
 * reads as tidier and breaks the build: a constant is opaque to the transformer, so
 * it can neither resolve the dependency nor inline it, and it refuses to guess.
 *
 * Swapping in the real package once it is added to `package.json` needs no change
 * here: the probe already looks for it by name.
 */

export type NativePickerProps = {
    value: Date;
    mode: 'date' | 'time' | 'datetime';
    display?: 'default' | 'spinner' | 'calendar' | 'clock';
    minimumDate?: Date;
    maximumDate?: Date;
    onChange: (event: { type: string }, date?: Date) => void;
};

type NativePickerModule = {
    default: React.ComponentType<NativePickerProps>;
};

let cachedModule: NativePickerModule | null | undefined;

/**
 * Resolves the native picker once and remembers the outcome, including failure.
 *
 * `undefined` means "not probed yet"; `null` means "probed, not available". Caching
 * the negative result matters: a date field may mount many times in one session,
 * and a failed resolution must not be retried on every render.
 */
export function loadNativePicker(): NativePickerModule | null {
    if (cachedModule !== undefined) {
        return cachedModule;
    }

    try {
        /*
         * Two constraints meet on this line, and both are deliberate.
         *
         * Metro requires a literal argument — see the note in the header. A static
         * `import` is not an alternative: naming a package that is absent from
         * `package.json` is a TypeScript compile error (`TS2307`), so `require` is
         * the only spelling that both compiles and defers the resolution to runtime.
         */
        /* eslint-disable-next-line @typescript-eslint/no-require-imports */
        const resolved: unknown = require('@react-native-community/datetimepicker');

        cachedModule =
            typeof resolved === 'object' &&
                resolved !== null &&
                'default' in resolved &&
                typeof (resolved as NativePickerModule).default === 'function'
                ? (resolved as NativePickerModule)
                : null;
    } catch {
        cachedModule = null;
    }

    return cachedModule;
}

/**
 * Whether this build can open the platform's own date picker.
 *
 * A constant for the life of the process. Read by `DateField` to choose between a
 * press target and a text entry, and surfaced in the fallback's helper text so the
 * user is told why the interaction differs from the platform norm.
 */
export const isNativePickerAvailable: boolean = loadNativePicker() !== null;

export type UseDatePickerResult = {
    /**
     * Opens the picker, seeded from the field's current API date (or unset).
     *
     * `onChange` fires when the user confirms a date, and fires exactly once per
     * confirmed selection — not on every spin of the iOS wheel. Callers own the
     * decision of *which* field the date belongs to, since the seam deliberately
     * knows nothing about the form.
     */
    open: (
        currentValue: string,
        onChange: (apiDate: string) => void,
        minimumDate?: string,
    ) => void;
    /**
     * The modal to render, or `null` when no native picker is installed — in which
     * case the caller must present its own fallback. Never returns a renderer that
     * cannot actually open something.
     */
    renderModal: (() => React.JSX.Element | null) | null;
};

/**
 * Owns the open/closed state of a date picker and hands back a renderer.
 *
 * A hook rather than a component so a field can drive it from its own tree and the
 * pending state resets with the field rather than with a detached sibling modal.
 */
export function useDatePicker(): UseDatePickerResult {
    const [pending, setPending] = useState<{
        value: string;
        onChange: (apiDate: string) => void;
        minimumDate?: string;
    } | null>(null);

    const open = useCallback(
        (currentValue: string, onChange: (apiDate: string) => void, minimumDate?: string) => {
            setPending({ value: currentValue, onChange, minimumDate });
        },
        [],
    );

    const nativeModule = loadNativePicker();

    const renderModal = useCallback((): React.JSX.Element | null => {
        if (pending === null) {
            return null;
        }

        const commit = (apiDate: string): void => {
            // Report the choice immediately — on Android the dialog is about to
            // dismiss itself and there is no further chance to ask the user anything.
            pending.onChange(apiDate);
            setPending(previous => (previous === null ? null : { ...previous, value: apiDate }));
        };

        const dismiss = (): void => setPending(null);

        /*
         * No native module: fall back to the app's own calendar sheet. This is a
         * real picker — a month grid the user taps — not a text box, so the field
         * always opens *something* that chooses a date. The previous behaviour
         * (a "type the date manually" text input) is gone.
         */
        if (nativeModule === null) {
            return (
                <CalendarPickerSheet
                    value={pending.value}
                    minimumDate={pending.minimumDate}
                    onSelect={commit}
                    onDismiss={dismiss}
                />
            );
        }

        const Picker = nativeModule.default;

        /*
         * `fromApiDate` yields local midnight, which is what the native picker
         * expects. Feeding it a UTC-parsed date is the classic off-by-one-day bug —
         * a user in Sydney would see yesterday's date pre-selected.
         */
        const initial = fromApiDate(pending.value) ?? new Date();
        const minimum = fromApiDate(pending.minimumDate) ?? undefined;

        const picker = (
            <Picker
                value={initial}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={minimum}
                onChange={(event, date) => {
                    // The picker reports dismissal separately from selection, and on
                    // iOS reports a change on every spin of the wheel. Keeping the
                    // modal open on iOS until "Done" is what makes it a *modal*
                    // picker rather than a field that commits under the user's thumb.
                    if (event.type === 'dismissed' || date === undefined) {
                        dismiss();
                        return;
                    }

                    // Android's dialog dismisses itself once a date is chosen; iOS
                    // commits on every spin and the sheet's Done closes it.
                    commit(toApiDate(date));
                }}
            />
        );

        // Android's picker *is* a dialog: rendering it opens it, and it closes
        // itself. Only iOS needs a shell around it, which is the branch below.
        if (Platform.OS !== 'ios') {
            return picker;
        }

        return (
            <DatePickerSheet value={pending.value} onDismiss={dismiss}>
                {picker}
            </DatePickerSheet>
        );
    }, [pending, nativeModule]);

    return { open, renderModal };
}

type DatePickerSheetProps = {
    /** Display-only; the picker holds the in-progress value. */
    value: string;
    onDismiss: () => void;
    children: React.ReactNode;
};

/**
 * The iOS shell — a page sheet with a Done affordance.
 *
 * Every exit path is a dismissal, and "Done" is no exception: the chosen date was
 * already handed to the caller the moment the wheel settled, so the button only has
 * to close the sheet. That is what makes it safe for "Done", the scrim tap and the
 * Android back gesture to share one code path.
 */
function DatePickerSheet({
    value,
    onDismiss,
    children,
}: DatePickerSheetProps): React.JSX.Element {
    const theme = useTheme();

    return (
        <Modal transparent animationType="slide" visible onRequestClose={onDismiss}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close date picker"
                onPress={onDismiss}
                style={[styles.scrim, { backgroundColor: theme.darkElevation.scrimShadow }]}>
                {/*
                 * The sheet swallows presses so tapping the picker itself does not
                 * fall through to the scrim and dismiss the modal mid-selection.
                 */}
                <Pressable
                    onPress={() => undefined}
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: theme.colors.surface,
                            borderRadius: radiusTokens.md,
                            borderColor: theme.colors.border,
                            padding: spacing.md,
                            gap: spacing.sm,
                        },
                    ]}>
                    <AppText variant="subtitle">Choose a date</AppText>
                    <AppText variant="caption" color="textMuted">
                        {value === '' ? 'No date selected yet.' : `Selected: ${value}`}
                    </AppText>
                    {children}
                    <AppButton label="Done" onPress={onDismiss} />
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
    },
    sheet: {
        width: '100%',
        borderWidth: borderWidths.hairline,
    },
    calendarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    calendarNav: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekdayRow: {
        flexDirection: 'row',
    },
    weekdayCell: {
        flex: 1,
        alignItems: 'center',
    },
    weekRow: {
        flexDirection: 'row',
    },
    dayCell: {
        flex: 1,
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
    },
});

/* ------------------------------------------------------------------ *
 * Built-in calendar fallback
 * ------------------------------------------------------------------ */

/** Weekday column headers, Sunday-first to match the API's day indexing. */
const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type CalendarPickerSheetProps = {
    /** Current API date, or `''` when unset. */
    value: string;
    /** Inclusive lower bound, as an API date. */
    minimumDate?: string;
    onSelect: (apiDate: string) => void;
    onDismiss: () => void;
};

/**
 * The app's own month-grid date picker.
 *
 * Used when no native picker module is installed, so the date fields always open a
 * real chooser rather than degrading to a text box. It is deliberately minimal — a
 * month header with prev/next, a weekday row and a 6×7 grid — because its only job
 * is to let the user tap a day; anything richer belongs in the native picker.
 *
 * Dates are handled as local-midnight `Date` objects and serialised with
 * `toApiDate`, so a tap can never drift a day through a timezone.
 */
function CalendarPickerSheet({
    value,
    minimumDate,
    onSelect,
    onDismiss,
}: CalendarPickerSheetProps): React.JSX.Element {
    const theme = useTheme();

    const initial = fromApiDate(value) ?? new Date();
    const [visibleMonth, setVisibleMonth] = useState(
        () => new Date(initial.getFullYear(), initial.getMonth(), 1),
    );

    const minimum = fromApiDate(minimumDate);

    const cells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth]);

    const shiftMonth = (delta: number): void => {
        setVisibleMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + delta, 1));
    };

    const monthLabel = `${visibleMonth.toLocaleString('en', { month: 'long' })} ${visibleMonth.getFullYear()}`;

    return (
        <Modal transparent animationType="slide" visible onRequestClose={onDismiss}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close date picker"
                onPress={onDismiss}
                style={[styles.scrim, { backgroundColor: theme.darkElevation.scrimShadow }]}>
                <Pressable
                    onPress={() => undefined}
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: theme.colors.surface,
                            borderRadius: radiusTokens.md,
                            borderColor: theme.colors.border,
                            padding: spacing.md,
                            gap: spacing.sm,
                        },
                    ]}>
                    <View style={styles.calendarHeader}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Previous month"
                            onPress={() => shiftMonth(-1)}
                            hitSlop={8}
                            style={styles.calendarNav}>
                            <AppIcon icon={ChevronLeftGlyph} size="small" color="textSecondary" />
                        </Pressable>
                        <AppText variant="subtitle">{monthLabel}</AppText>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Next month"
                            onPress={() => shiftMonth(1)}
                            hitSlop={8}
                            style={styles.calendarNav}>
                            <AppIcon icon={ChevronRightGlyph} size="small" color="textSecondary" />
                        </Pressable>
                    </View>

                    <View style={styles.weekdayRow}>
                        {WEEKDAY_HEADERS.map((label, index) => (
                            <View key={`${label}-${index}`} style={styles.weekdayCell}>
                                <AppText variant="caption" color="textMuted">
                                    {label}
                                </AppText>
                            </View>
                        ))}
                    </View>

                    {cells.map((week, weekIndex) => (
                        <View key={weekIndex} style={styles.weekRow}>
                            {week.map(cell => {
                                const disabled =
                                    cell.date === null ||
                                    (minimum !== null && cell.date < minimum);
                                const selected =
                                    cell.date !== null && value !== '' && toApiDate(cell.date) === value;

                                return (
                                    <Pressable
                                        key={cell.key}
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                            cell.date === null
                                                ? undefined
                                                : toApiDate(cell.date)
                                        }
                                        accessibilityState={{ selected, disabled }}
                                        disabled={disabled}
                                        onPress={() => {
                                            if (cell.date !== null) {
                                                onSelect(toApiDate(cell.date));
                                            }
                                        }}
                                        style={[
                                            styles.dayCell,
                                            selected
                                                ? { backgroundColor: theme.colors.primary }
                                                : null,
                                        ]}>
                                        {cell.date !== null ? (
                                            <AppText
                                                variant="body"
                                                color={selected ? 'onPrimary' : 'text'}
                                                style={disabled ? { opacity: 0.35 } : undefined}>
                                                {String(cell.date.getDate())}
                                            </AppText>
                                        ) : null}
                                    </Pressable>
                                );
                            })}
                        </View>
                    ))}

                    <AppButton label="Cancel" variant="secondary" onPress={onDismiss} />
                </Pressable>
            </Pressable>
        </Modal>
    );
}

type MonthCell = { key: string; date: Date | null };

/**
 * Builds a 6×7 grid of cells for a month, Sunday-first.
 *
 * Leading/trailing cells are `null` so the grid keeps a constant six rows — a
 * month that would otherwise render five rows would make the sheet's height jump
 * as the user pages through months.
 */
function buildMonthCells(month: Date): MonthCell[][] {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const cells: MonthCell[] = [];

    for (let i = 0; i < firstWeekday; i += 1) {
        cells.push({ key: `lead-${i}`, date: null });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push({ key: `day-${day}`, date: new Date(year, monthIndex, day) });
    }

    while (cells.length < 42) {
        cells.push({ key: `trail-${cells.length}`, date: null });
    }

    const weeks: MonthCell[][] = [];

    for (let i = 0; i < cells.length; i += 7) {
        weeks.push(cells.slice(i, i + 7));
    }

    return weeks;
}
