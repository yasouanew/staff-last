import { leaveApi } from '../../src/features/leave/api/leaveApi';
import { notificationsApi } from '../../src/features/notifications/api/notificationsApi';
import type { AppError } from '../../src/types/appError';
import type { LeaveRequest } from '../../src/features/leave/types';
import { leaveRequest, notificationList, paginationMeta } from '../../src/testing/api/fixtures';
import { createApiHarness, rejectionOf } from '../../src/testing/api/harness';
import { fail, ok } from '../../src/testing/api/mockServer';

/**
 * Suite 3 — Data Handling.
 *
 * Two concerns that are easy to get subtly wrong and expensive when they are:
 *
 * - **Pagination state** — the query parameters a screen sends, and the shape it reads
 *   back. The Leave list accumulates pages client-side, so an off-by-one in `page` or a
 *   mis-read `last_page` produces a feed that silently stops loading with no error.
 * - **Attachment upload** — the one request whose *transport encoding* is a correctness
 *   concern. A multipart body that gets JSON-serialised loses the file parts entirely.
 */

const harness = createApiHarness();

beforeEach(() => {
    harness.setup();
});

afterEach(() => {
    harness.teardown();
});

describe('Data Handling — pagination', () => {
    it('sends page and per_page rather than a cursor, matching the Laravel paginator', async () => {
        harness.server.get('/leave-requests', () => ok(paginatedPage([leaveRequest()], 1, 3, 45)));

        await leaveApi.list({ page: 2, per_page: 20 });

        const [request] = harness.server.requestsTo('/leave-requests');

        expect(request?.params).toEqual({ page: '2', per_page: '20' });
    });

    it('omits every filter that is not set, so the server applies its own defaults', async () => {
        harness.server.get('/leave-requests', () => ok(paginatedPage([], 1, 1, 0)));

        await leaveApi.list();

        const [request] = harness.server.requestsTo('/leave-requests');

        // Sending `status=undefined` would serialise to the string "undefined" and 422
        // the enum. Absence is the contract for "no filter".
        expect(request?.params).toEqual({});
        expect(request?.url).not.toContain('employee_id');
    });

    it('sends only the filters that are provided', async () => {
        harness.server.get('/leave-requests', () => ok(paginatedPage([leaveRequest()], 1, 1, 1)));

        await leaveApi.list({ status: 'pending', date_from: '2026-10-01', page: 1 });

        const [request] = harness.server.requestsTo('/leave-requests');

        expect(request?.params).toEqual({
            status: 'pending',
            date_from: '2026-10-01',
            page: '1',
        });
        expect(request?.params).not.toHaveProperty('date_to');
    });

    it('never sends employee_id, because the endpoint auto-scopes', async () => {
        harness.server.get('/leave-requests', () => ok(paginatedPage([], 1, 1, 0)));

        // The list endpoint scopes to the token's employee server-side; sending an id
        // would be ignored at best and wrong at worst.
        await leaveApi.list({ status: 'approved' });

        const [request] = harness.server.requestsTo('/leave-requests');

        expect(request?.params).not.toHaveProperty('employee_id');
    });

    it('surfaces the metadata a stopping-condition depends on', async () => {
        harness.server.get('/leave-requests', () => ok(paginatedPage([leaveRequest()], 3, 5, 97)));

        const result = await leaveApi.list({ page: 3, per_page: 20 });

        // The screen keeps fetching while `current_page < last_page`; both numbers must
        // survive validation intact or the feed stops early.
        expect(result.meta.current_page).toBe(3);
        expect(result.meta.last_page).toBe(5);
        expect(result.meta.total).toBe(97);
        expect(result.meta.per_page).toBe(20);
    });

    it('reads rows from data.data, as the paginator nests them', async () => {
        harness.server.get('/leave-requests', () =>
            ok(paginatedPage([leaveRequest({ id: 1 }), leaveRequest({ id: 2 })], 1, 1, 2)),
        );

        const result = await leaveApi.list();

        expect(result.data.map((row: LeaveRequest) => row.id)).toEqual([1, 2]);
    });

    it('accepts a final page with no rows without erroring', async () => {
        harness.server.get('/leave-requests', () => ok(paginatedPage([], 5, 5, 81)));

        const result = await leaveApi.list({ page: 5 });

        expect(result.data).toEqual([]);
        // A populated `total` with an empty page is the normal end-of-feed case.
        expect(result.meta.total).toBe(81);
        expect(result.meta.current_page).toBe(5);
    });

    it('rejects a paginator missing its meta block', async () => {
        harness.server.get('/leave-requests', () => ok({ data: [leaveRequest()] }));

        const error = (await rejectionOf(leaveApi.list())) as AppError;

        // Without `meta` a screen cannot know whether to fetch another page, so this is
        // a contract violation rather than a warning.
        expect(error.kind).toBe('server');
    });

    it('rejects a paginator whose meta fields are strings', async () => {
        harness.server.get('/leave-requests', () =>
            ok(
                paginatedPage([leaveRequest()], 1, 1, 1, {
                    current_page: '1' as unknown as number,
                }),
            ),
        );

        const error = (await rejectionOf(leaveApi.list())) as AppError;

        expect(error.kind).toBe('server');
    });

    it('accepts the notifications wrapper, which is paginated differently', async () => {
        harness.server.get('/notifications', () =>
            ok(
                notificationList(
                    [],
                    { meta: paginationMeta({ current_page: 2, last_page: 4, total: 70 }) },
                ),
            ),
        );

        const result = await notificationsApi.list({ page: 2 });

        // The notification feed uses `data.notifications` + its own `unread_count`, but
        // the `meta` block is the same paginator shape.
        expect(result.meta.last_page).toBe(4);
        expect(result.unread_count).toBe(0);
    });

    it('does not retry a paginated GET beyond the policy, even when a page fails', async () => {
        harness.server.get('/leave-requests', () => fail(404, 'Page out of range.'));

        await rejectionOf(leaveApi.list({ page: 99 }));

        // 404 is deterministic: the page will not exist on the next attempt.
        expect(harness.server.hitCount('/leave-requests')).toBe(1);
    });
});

describe('Data Handling — attachment upload', () => {
    const attachment = {
        uri: 'file:///tmp/medical-certificate.pdf',
        name: 'medical-certificate.pdf',
        mimeType: 'application/pdf',
    };

    it('sends multipart when attachments are present, never JSON', async () => {
        const appendSpy = jest.spyOn(FormData.prototype, 'append');

        harness.server.post('/leave-requests', () => ok(leaveRequest(), 'Created'));

        await leaveApi.create({
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-10-01',
            end_date: '2026-10-01',
            attachments: [attachment],
        });

        const [request] = harness.server.requestsTo('/leave-requests');

        // The decisive assertion: a `FormData` reached the transport, so the platform
        // can encode a boundary. A string here would mean the file parts were destroyed
        // by axios's JSON `transformRequest`.
        expect(request?.body).toBeInstanceOf(FormData);
        expect(typeof request?.body).not.toBe('string');

        appendSpy.mockRestore();
    });

    it('attaches each file under the attachments[] array key the backend expects', async () => {
        const appendSpy = jest.spyOn(FormData.prototype, 'append');

        harness.server.post('/leave-requests', () => ok(leaveRequest(), 'Created'));

        await leaveApi.create({
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-10-01',
            end_date: '2026-10-01',
            attachments: [attachment],
        });

        expect(appendSpy).toHaveBeenCalledWith(
            'attachments[]',
            expect.objectContaining({
                uri: 'file:///tmp/medical-certificate.pdf',
                name: 'medical-certificate.pdf',
                type: 'application/pdf',
            }),
        );

        appendSpy.mockRestore();
    });

    it('stringifies the scalar fields so they survive a multipart round-trip', async () => {
        const appendSpy = jest.spyOn(FormData.prototype, 'append');

        harness.server.post('/leave-requests', () => ok(leaveRequest(), 'Created'));

        await leaveApi.create({
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-10-01',
            end_date: '2026-10-02',
            start_session: 'first_half',
            end_session: 'second_half',
            total_days: 1.5,
            reason: 'Medical appointment',
            attachments: [attachment],
        });

        // FormData carries strings only; a number would be coerced by the platform, so
        // the conversion is made explicit here to keep the wire format predictable.
        expect(appendSpy).toHaveBeenCalledWith('employee_id', '42');
        expect(appendSpy).toHaveBeenCalledWith('leave_type_id', '2');
        expect(appendSpy).toHaveBeenCalledWith('start_date', '2026-10-01');
        expect(appendSpy).toHaveBeenCalledWith('end_date', '2026-10-02');
        expect(appendSpy).toHaveBeenCalledWith('start_session', 'first_half');
        expect(appendSpy).toHaveBeenCalledWith('end_session', 'second_half');
        expect(appendSpy).toHaveBeenCalledWith('total_days', '1.5');
        expect(appendSpy).toHaveBeenCalledWith('reason', 'Medical appointment');

        appendSpy.mockRestore();
    });

    it('does not hardcode a boundary-less multipart Content-Type', async () => {
        harness.server.post('/leave-requests', () => ok(leaveRequest(), 'Created'));

        await leaveApi.create({
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-10-01',
            end_date: '2026-10-01',
            attachments: [attachment],
        });

        const [request] = harness.server.requestsTo('/leave-requests');

        // A literal "multipart/form-data" omits the boundary, and Laravel cannot parse
        // the parts. The header must be cleared so the platform generates one.
        expect(request?.headers['content-type']).not.toBe('multipart/form-data');
    });

    it('omits the reason field entirely when it is empty, rather than sending blank', async () => {
        const appendSpy = jest.spyOn(FormData.prototype, 'append');

        harness.server.post('/leave-requests', () => ok(leaveRequest(), 'Created'));

        await leaveApi.create({
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-10-01',
            end_date: '2026-10-01',
            reason: '',
            attachments: [attachment],
        });

        expect(appendSpy).not.toHaveBeenCalledWith('reason', expect.anything());

        appendSpy.mockRestore();
    });

    it('sends JSON when there are no attachments, keeping the cheap path cheap', async () => {
        harness.server.post('/leave-requests', () => ok(leaveRequest(), 'Created'));

        await leaveApi.create({
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-10-01',
            end_date: '2026-10-01',
        });

        const [request] = harness.server.requestsTo('/leave-requests');

        expect(typeof request?.body).toBe('object');
        expect(request?.body).not.toBeInstanceOf(FormData);
        expect(request?.body).toEqual({
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-10-01',
            end_date: '2026-10-01',
        });
        expect(request?.headers['content-type']).toContain('application/json');
    });

    it('never includes the attachments key on the JSON path', async () => {
        harness.server.post('/leave-requests', () => ok(leaveRequest(), 'Created'));

        await leaveApi.create({
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-10-01',
            end_date: '2026-10-01',
            attachments: [],
        });

        const [request] = harness.server.requestsTo('/leave-requests');

        // An empty array is deleted rather than sent, so the backend takes its JSON
        // branch instead of trying to parse a multipart body that has no parts.
        expect(request?.body).not.toHaveProperty('attachments');
    });

    it('validates the created resource returned by an upload', async () => {
        harness.server.post('/leave-requests', () =>
            ok(leaveRequest({ attachments: ['leave-attachments/cert.pdf'] }), 'Created'),
        );

        const created = await leaveApi.create({
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-10-01',
            end_date: '2026-10-01',
            attachments: [attachment],
        });

        expect(created.attachments).toEqual(['leave-attachments/cert.pdf']);
        expect(created.status).toBe('pending');
    });

    it('rejects an upload whose response violates the leave-request contract', async () => {
        harness.server.post('/leave-requests', () => ok({ id: 101 }, 'Created'));

        const error = (await rejectionOf(
            leaveApi.create({
                employee_id: 42,
                leave_type_id: 2,
                start_date: '2026-10-01',
                end_date: '2026-10-01',
                attachments: [attachment],
            }),
        )) as AppError;

        expect(error.kind).toBe('server');
    });

    it('surfaces a rejected upload (422) with its field errors intact', async () => {
        harness.server.post('/leave-requests', () =>
            fail(422, 'The given data was invalid.', {
                'attachments.0': ['The attachments.0 must not be greater than 5120 kilobytes.'],
            }),
        );

        const error = (await rejectionOf(
            leaveApi.create({
                employee_id: 42,
                leave_type_id: 2,
                start_date: '2026-10-01',
                end_date: '2026-10-01',
                attachments: [attachment],
            }),
        )) as AppError;

        expect(error.kind).toBe('validation');
        expect(error.fieldErrors?.['attachments.0']?.[0]).toContain('5120 kilobytes');
    });

    it('does not retry an upload, because a replay could create a duplicate request', async () => {
        harness.server.post('/leave-requests', () => fail(503, 'Service Unavailable'));

        await rejectionOf(
            leaveApi.create({
                employee_id: 42,
                leave_type_id: 2,
                start_date: '2026-10-01',
                end_date: '2026-10-01',
                attachments: [attachment],
            }),
        );

        // This is the single most important non-retry in the app: a multipart POST that
        // timed out may already have been applied.
        expect(harness.server.hitCount('/leave-requests')).toBe(1);
    });
});

/** Builds a paginator page. */
function paginatedPage(
    items: unknown[],
    currentPage: number,
    lastPage: number,
    total: number,
    metaOverrides: Partial<ReturnType<typeof paginationMeta>> = {},
) {
    return {
        data: items,
        meta: paginationMeta({
            current_page: currentPage,
            last_page: lastPage,
            total,
            ...metaOverrides,
        }),
        links: { first: null, last: null, prev: null, next: null },
    };
}
