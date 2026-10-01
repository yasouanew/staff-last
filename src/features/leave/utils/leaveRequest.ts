import { env } from '../../../config/env';
import type { LeaveSession } from '../../../types/api';
import { daysBetween } from '../../../utils/date';
import {
    LEAVE_ATTACHMENT_EXTENSIONS,
    LEAVE_ATTACHMENT_MAX_BYTES,
} from '../validation/leaveSchemas';

export const LEAVE_SESSION_LABELS: Record<LeaveSession, string> = {
    full_day: 'Full day',
    first_half: 'First half',
    second_half: 'Second half',
};

/**
 * Human label for a request's session pair.
 *
 * The backend models a request as a date range with a slot at each end, not as
 * clock times. A single-day request collapses to one label; anything else is
 * described as a range so the user can see that only part of an edge day is taken.
 */
export function sessionLabel(
    startDate: string,
    endDate: string,
    startSession: LeaveSession | null,
    endSession: LeaveSession | null,
): string {
    const start = startSession ? LEAVE_SESSION_LABELS[startSession] : 'Full day';
    const end = endSession ? LEAVE_SESSION_LABELS[endSession] : 'Full day';

    if (startDate === endDate && start === end) {
        return start;
    }

    return `${start} → ${end}`;
}

/**
 * Client-side total-days preview (NON-AUTHORITATIVE).
 *
 * The server recalculates via `LeaveRequestService` (working calendar, holidays,
 * balance), so this is display-only and sent as a hint. Rule: inclusive calendar
 * days, minus half a day for each edge that is a half-day session.
 */
export function previewTotalDays(
    startDate: string,
    endDate: string,
    startSession?: LeaveSession | null,
    endSession?: LeaveSession | null,
): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return 0;
    }

    if (endDate < startDate) {
        return 0;
    }

    let total = daysBetween(startDate, endDate);

    if (startDate === endDate) {
        const start = startSession ?? 'full_day';
        const end = endSession ?? 'full_day';

        if (start === end && start !== 'full_day') {
            return 0.5;
        }

        if (start !== 'full_day' || end !== 'full_day') {
            // Mixed single-day edge (e.g. first_half → full_day) still reads as one
            // day to the user; the server decides the exact fraction.
            return 1;
        }

        return total;
    }

    if ((startSession ?? 'full_day') !== 'full_day') {
        total -= 0.5;
    }

    if ((endSession ?? 'full_day') !== 'full_day') {
        total -= 0.5;
    }

    return Math.max(total, 0.5);
}

/** `decimal:2` string (e.g. `"3.00"`) → `"3 days"` / `"1 day"` / `"0.5 days"`. */
export function formatTotalDays(totalDays: string | number | null): string {
    if (totalDays === null || totalDays === undefined) {
        return '—';
    }

    const numeric = typeof totalDays === 'string' ? Number(totalDays) : totalDays;

    if (!Number.isFinite(numeric)) {
        return '—';
    }

    const display = Number.isInteger(numeric) ? String(numeric) : String(numeric);

    return `${display} day${numeric === 1 ? '' : 's'}`;
}

/**
 * Validates a picked attachment against spec Screen 9 §6:
 * `pdf,jpg,jpeg,png,doc,docx` max 5120KB. Returns the error message or null.
 */
export function validateAttachment(name: string, size?: number): string | null {
    const extension = name.split('.').pop()?.toLowerCase() ?? '';

    if (!(LEAVE_ATTACHMENT_EXTENSIONS as readonly string[]).includes(extension)) {
        return `Only ${LEAVE_ATTACHMENT_EXTENSIONS.join(', ')} files are accepted.`;
    }

    if (size !== undefined && size > LEAVE_ATTACHMENT_MAX_BYTES) {
        return 'Each file must be 5MB or smaller.';
    }

    return null;
}

/**
 * Resolves a backend attachment path to a viewable URL.
 *
 * The backend returns a relative path on the `public` disk; mobile must prefix
 * `APP_URL/storage/` (spec Screen 10 §3). Absolute URLs pass through untouched.
 */
export function resolveAttachmentUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    const base = env.appPublicUrl.replace(/\/+$/, '');
    const relative = path.replace(/^\/+/, '').replace(/^storage\/+/, '');

    if (base.length === 0) {
        return `/storage/${relative}`;
    }

    return `${base}/storage/${relative}`;
}

/** File name from a storage path (`leave-request-attachments/abc.pdf` → `abc.pdf`). */
export function attachmentFileName(path: string): string {
    const segments = path.split('/').filter(segment => segment.length > 0);
    const last = segments.length > 0 ? segments[segments.length - 1] : undefined;

    return last ?? path;
}
