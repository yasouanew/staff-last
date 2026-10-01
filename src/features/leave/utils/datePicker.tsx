import { useCallback, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet } from 'react-native';

import { AppButton } from '../../../components/AppButton';
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

    if (nativeModule === null) {
        return { open, renderModal: null };
    }

    const Picker = nativeModule.default;

    const renderModal = (): React.JSX.Element | null => {
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

                    if (Platform.OS === 'ios') {
                        commit(toApiDate(date));
                        return;
                    }

                    // Android's dialog dismisses itself once a date is chosen.
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
    };

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
});
