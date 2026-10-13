import {
    attachmentFileName,
    dayPartLabel,
    decisionDate,
    formatLeaveRange,
    formatTotalDays,
    previewTotalDays,
    resolveAttachmentUrl,
    sessionLabel,
    validateAttachment,
} from '../leaveRequest';

/**
 * Pins the leave display helpers (spec Screens 8–10):
 * - sessions are slot labels, never clock times
 * - total preview is display-only (server recalculates)
 * - attachments resolve via APP_URL/storage/ (relative) or pass through (absolute)
 * - attachment validation mirrors StoreLeaveRequestRequest (ext + 5MB)
 */
describe('sessionLabel', () => {
    it('collapses a single-day full-day request to one label', () => {
        expect(sessionLabel('2026-09-20', '2026-09-20', 'full_day', 'full_day')).toBe('Full day');
    });

    it('describes a multi-day range as start to end slots', () => {
        expect(sessionLabel('2026-09-20', '2026-09-22', 'first_half', 'second_half')).toBe(
            'First half → Second half',
        );
    });
});

describe('formatLeaveRange', () => {
    it('collapses a single-day request to one date', () => {
        expect(formatLeaveRange('2026-09-21', '2026-09-21')).toBe('Mon 21 Sep 2026');
    });

    it('shortens a same-month range without repeating the month and year', () => {
        expect(formatLeaveRange('2026-09-21', '2026-09-23')).toBe('21 – 23 Sep 2026');
    });

    it('keeps both full dates when the range crosses a month boundary', () => {
        expect(formatLeaveRange('2026-09-30', '2026-10-02')).toBe(
            'Wed 30 Sep 2026 – Fri 2 Oct 2026',
        );
    });

    it('passes a malformed range through rather than rendering NaN', () => {
        expect(formatLeaveRange('not-a-date', '2026-09-23')).toBe('not-a-date – 2026-09-23');
    });
});

describe('dayPartLabel', () => {
    it('reads "Full day" for a full-day request', () => {
        expect(dayPartLabel('full_day', 'full_day')).toBe('Full day');
    });

    it('names the half for a half-day request', () => {
        expect(dayPartLabel('first_half', 'first_half')).toBe('First half');
    });

    it('describes a range with different edge slots as a pair', () => {
        expect(dayPartLabel('first_half', 'second_half')).toBe('First half → Second half');
    });

    it('defaults a missing slot to a full day', () => {
        expect(dayPartLabel(null, null)).toBe('Full day');
    });
});

describe('decisionDate', () => {
    it('returns the approved date for an approved request', () => {
        expect(
            decisionDate({
                status: 'approved',
                approved_at: '2026-09-25T10:00:00+10:00',
                rejected_at: null,
            }),
        ).toBe('2026-09-25');
    });

    it('returns the rejected date for a rejected request', () => {
        expect(
            decisionDate({
                status: 'rejected',
                approved_at: null,
                rejected_at: '2026-09-26T10:00:00+10:00',
            }),
        ).toBe('2026-09-26');
    });

    it('returns null while a request is still pending', () => {
        expect(
            decisionDate({ status: 'pending', approved_at: null, rejected_at: null }),
        ).toBeNull();
    });
});

describe('previewTotalDays', () => {
    it('counts inclusive calendar days for full-day ranges', () => {
        expect(previewTotalDays('2026-09-20', '2026-09-22', 'full_day', 'full_day')).toBe(3);
    });

    it('returns 0.5 for a single half-day', () => {
        expect(previewTotalDays('2026-09-20', '2026-09-20', 'first_half', 'first_half')).toBe(0.5);
    });

    it('subtracts half days from each edge of a range', () => {
        expect(previewTotalDays('2026-09-20', '2026-09-22', 'first_half', 'second_half')).toBe(2);
    });

    it('returns 0 for an inverted range instead of a negative preview', () => {
        expect(previewTotalDays('2026-09-22', '2026-09-20', 'full_day', 'full_day')).toBe(0);
    });
});

describe('formatTotalDays', () => {
    it('renders the decimal:2 wire string as days', () => {
        expect(formatTotalDays('3.00')).toBe('3 days');
        expect(formatTotalDays('1.00')).toBe('1 day');
        expect(formatTotalDays('0.50')).toBe('0.5 days');
    });

    it('returns an em dash for missing totals', () => {
        expect(formatTotalDays(null)).toBe('—');
    });
});

describe('validateAttachment', () => {
    it('accepts an allowed extension within the size limit', () => {
        expect(validateAttachment('note.pdf', 1024)).toBeNull();
    });

    it('rejects disallowed extensions', () => {
        expect(validateAttachment('run.exe', 1024)).not.toBeNull();
    });

    it('rejects files over 5MB', () => {
        expect(validateAttachment('big.pdf', 6 * 1024 * 1024)).not.toBeNull();
    });
});

describe('resolveAttachmentUrl', () => {
    it('prefixes relative storage paths with APP_URL/storage/', () => {
        expect(resolveAttachmentUrl('leave-request-attachments/abc.pdf')).toBe(
            'http://localhost/storage/leave-request-attachments/abc.pdf',
        );
    });

    it('passes absolute URLs through untouched', () => {
        expect(resolveAttachmentUrl('https://cdn.example.com/a.pdf')).toBe(
            'https://cdn.example.com/a.pdf',
        );
    });
});

describe('attachmentFileName', () => {
    it('returns the last path segment', () => {
        expect(attachmentFileName('leave-request-attachments/abc.pdf')).toBe('abc.pdf');
    });
});
