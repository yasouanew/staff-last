/**
 * Locale and clock-cycle resolution.
 *
 * ## Why this is a module and not a context
 *
 * Locale is read from exactly two places that are not render code — the date/time
 * formatters in [`format.ts`](src/i18n/format.ts:1) and the string catalogue in
 * [`strings.ts`](src/i18n/strings.ts:1) — and both are called from style factories and
 * pure utilities as well as components. A React context would force every one of
 * those call sites to become a hook. Keeping the resolved value at module scope (with
 * an explicit override seam) means the 90% case — "follow the device" — costs nothing.
 *
 * ## The 12 h / 24 h problem this closes
 *
 * [`AvailabilityScreen`](src/features/availability/screens/AvailabilityScreen.tsx:1)
 * asked the user to *type* `HH:MM` 24-hour times while the summary line above rendered
 * them back as `9:00 AM`. Two conventions for one value on one screen is a defect, not
 * a preference. The clock cycle is therefore derived from the locale — many locales
 * (en-GB, en-AU, de-DE, …) are 24-hour — so the display agrees with the input format.
 */

/** Hour cycle used for every clock rendering in the app. */
export type HourCycle = 'h12' | 'h23';

/**
 * Fallback locale. `en` is used rather than a region tag so an unrecognised device
 * locale still resolves to a valid formatter.
 */
export const DEFAULT_LOCALE = 'en';

let localeOverride: string | null = null;
let hourCycleOverride: HourCycle | null = null;

/**
 * The device's locale, or the default.
 *
 * `resolvedOptions().locale` is preferred over `navigator.language`: it is the tag
 * `Intl` itself will use, so it can never disagree with the formatters this file
 * configures.
 */
export function getDeviceLocale(): string {
    try {
        const resolved = Intl.DateTimeFormat().resolvedOptions().locale;

        return resolved.length > 0 ? resolved : DEFAULT_LOCALE;
    } catch {
        return DEFAULT_LOCALE;
    }
}

/** The active locale. */
export function getLocale(): string {
    return localeOverride ?? getDeviceLocale();
}

/**
 * The active hour cycle.
 *
 * Derived from the locale by asking `Intl` what it actually renders, rather than from
 * a hardcoded list of "24-hour countries": the platform's own CLDR data is the
 * authority, and a hand-maintained list is wrong the moment a region changes its
 * convention.
 *
 * The probe formats 13:00 and looks for a day-period part. `resolvedOptions()
 * .hourCycle` reports this more directly, but it is absent from the TypeScript
 * `lib` this project compiles against, and reaching for it would mean a cast around
 * the very value being tested. Formatting is the same operation the real formatter
 * performs, so it cannot disagree with the displayed output.
 */
export function getHourCycle(): HourCycle {
    if (hourCycleOverride !== null) {
        return hourCycleOverride;
    }

    try {
        const parts = new Intl.DateTimeFormat(getLocale(), {
            hour: 'numeric',
        }).formatToParts(new Date(2000, 0, 1, 13, 0));

        // A 12-hour locale emits a `dayPeriod` part ("PM"); a 24-hour one does not.
        return parts.some(part => part.type === 'dayPeriod') ? 'h12' : 'h23';
    } catch {
        return 'h12';
    }
}

/** True when the active locale renders clocks in 24-hour time. */
export function uses24HourClock(): boolean {
    return getHourCycle() === 'h23';
}

/**
 * Pins the locale for the current session, or restores device resolution with `null`.
 *
 * This is the seam a future language setting writes to; it exists now so the
 * formatters are never hard-wired to the device and a test can pin a locale.
 */
export function setLocaleOverride(locale: string | null): void {
    localeOverride = locale;
}

/** Pins the hour cycle, or restores locale-derived resolution with `null`. */
export function setHourCycleOverride(cycle: HourCycle | null): void {
    hourCycleOverride = cycle;
}

/** Restores both locale and hour cycle to device derived values. */
export function resetLocaleOverrides(): void {
    localeOverride = null;
    hourCycleOverride = null;
}
