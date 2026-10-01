/**
 * Small display formatters shared across features.
 */

/**
 * Uppercases and trims a value for use as a status label, e.g. `"pending"` →
 * `"Pending"`. Handles the snake_case enum values the API returns
 * (`swap_requested` → `"Swap requested"`).
 */
export function humanizeEnum(value: string): string {
    const words = value.replace(/_/g, ' ').trim();

    if (words.length === 0) {
        return '';
    }

    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Initials for an avatar fallback: `"Jane Doe"` → `"JD"`.
 *
 * `employees.photo` upload is not available to the employee role (spec GAP G4), so
 * every avatar in the app is an initials fallback — this is the only avatar path
 * that exists today.
 */
export function getInitials(fullName: string | null | undefined): string {
    if (!fullName) {
        return '?';
    }

    const parts = fullName.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
        return '?';
    }

    const first = parts[0]?.charAt(0) ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';

    return `${first}${last}`.toUpperCase();
}

/**
 * `total_days` arrives as a `decimal:2` string (e.g. `"3.00"`). Trailing zeros are
 * dropped for display: `"3.00"` → `"3"`, `"1.50"` → `"1.5"`.
 */
export function formatDays(value: string | number | null | undefined): string {
    if (value === null || value === undefined) {
        return '—';
    }

    const numeric = typeof value === 'number' ? value : Number.parseFloat(value);

    if (!Number.isFinite(numeric)) {
        return String(value);
    }

    return String(Number.parseFloat(numeric.toFixed(2)));
}

/** Pluralises a noun for a count: `2, 'day'` → `"2 days"`. */
export function pluralize(count: number, singular: string, plural?: string): string {
    return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/**
 * Resolves a storage path returned by the API into an absolute URL.
 *
 * Leave attachments are stored on the `public` disk and the API returns a relative
 * path, so the app prefix is required (spec Screen 10). Absolute values are passed
 * through untouched in case the backend later emits full URLs.
 */
export function resolvePublicUrl(path: string | null | undefined, publicBaseUrl: string): string | null {
    if (!path) {
        return null;
    }

    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    const base = publicBaseUrl.replace(/\/+$/, '');
    const suffix = path.replace(/^\/+/, '');

    if (base.length === 0) {
        return null;
    }

    return `${base}/storage/${suffix}`;
}

/** Joins non-empty strings with a separator, e.g. branch and position labels. */
export function joinNonEmpty(values: Array<string | null | undefined>, separator = ' • '): string {
    return values.filter((value): value is string => Boolean(value && value.length > 0)).join(separator);
}
