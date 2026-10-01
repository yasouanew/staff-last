import { api, postMultipart } from '../../../../api/client';
import { leaveApi } from '../leaveApi';

jest.mock('../../../../api/client', () => ({
    api: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
    },
    postMultipart: jest.fn(),
}));

const mockedApi = api as jest.Mocked<typeof api>;
const mockedPostMultipart = postMultipart as jest.MockedFunction<typeof postMultipart>;

/** A minimal but schema-valid `LeaveRequestResource`. */
function makeLeaveRequest(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        company_id: 1,
        employee_id: 42,
        leave_type_id: 2,
        leave_type: null,
        employee: null,
        start_date: '2026-09-20',
        end_date: '2026-09-20',
        start_session: 'full_day',
        end_session: 'full_day',
        total_days: '1.00',
        reason: null,
        attachment: null,
        attachments: [],
        status: 'pending',
        approved_by: null,
        approved_at: null,
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
        admin_notes: null,
        approver: null,
        rejecter: null,
        created_at: '2026-09-19T00:00:00+10:00',
        updated_at: '2026-09-19T00:00:00+10:00',
        ...overrides,
    };
}

function paginated(items: unknown[]) {
    return {
        data: items,
        meta: { current_page: 1, last_page: 1, per_page: 20, total: items.length },
    };
}

/**
 * Pins the Leave wire contract (spec Screens 8–10 §6):
 * - `GET /leave-requests` is auto-scoped server-side: client MUST NOT send `employee_id`
 * - `POST /leave-requests` is multipart when attachments present, else JSON
 * - `POST` MUST send `employee_id` — the backend validates it as `required`, so the
 *   client resolves it from the session and includes it in both encodings
 * - `GET /leave-types` is the picker source (G2: 403 for employees)
 * - `GET /leave-requests/{id}` detail; no approve/reject/cancel routes exist for mobile
 *
 * Responses are parsed through [`leaveRequestSchema`](../validation/apiSchemas.ts:1).
 */
describe('leaveApi', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('lists own requests auto-scoped without employee_id', async () => {
        mockedApi.get.mockResolvedValueOnce(paginated([makeLeaveRequest()]) as never);

        await leaveApi.list({ status: 'pending', per_page: 20 });

        expect(mockedApi.get).toHaveBeenCalledWith('/leave-requests', {
            params: { status: 'pending', per_page: 20 },
        });
        const params = (mockedApi.get.mock.calls[0]?.[1] as { params: Record<string, unknown> })
            ?.params;
        expect(params).not.toHaveProperty('employee_id');
        expect(params).not.toHaveProperty('company_id');
    });

    it('passes date_from/date_to and leave_type_id filters through', async () => {
        mockedApi.get.mockResolvedValueOnce(paginated([]) as never);

        await leaveApi.list({
            leave_type_id: 3,
            date_from: '2026-09-01',
            date_to: '2026-09-30',
            page: 2,
        });

        expect(mockedApi.get).toHaveBeenCalledWith('/leave-requests', {
            params: {
                leave_type_id: 3,
                date_from: '2026-09-01',
                date_to: '2026-09-30',
                page: 2,
            },
        });
    });

    it('fetches a single request by id for the detail screen', async () => {
        mockedApi.get.mockResolvedValueOnce(makeLeaveRequest({ id: 7 }) as never);

        const result = await leaveApi.detail(7);

        expect(mockedApi.get).toHaveBeenCalledWith('/leave-requests/7');
        expect(result.id).toBe(7);
    });

    it('creates without attachments as JSON with the session employee_id', async () => {
        mockedApi.post.mockResolvedValueOnce(makeLeaveRequest({ id: 1 }) as never);

        await leaveApi.create({
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-09-20',
            end_date: '2026-09-22',
            start_session: 'full_day',
            end_session: 'full_day',
            total_days: 3,
            reason: 'Family trip',
        });

        expect(mockedPostMultipart).not.toHaveBeenCalled();
        expect(mockedApi.post).toHaveBeenCalledWith('/leave-requests', {
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-09-20',
            end_date: '2026-09-22',
            start_session: 'full_day',
            end_session: 'full_day',
            total_days: 3,
            reason: 'Family trip',
        });
    });

    it('creates with attachments as multipart carrying employee_id and attachments[] files', async () => {
        mockedPostMultipart.mockResolvedValueOnce(makeLeaveRequest({ id: 2 }) as never);

        /*
         * Spy on the prototype *before* the call: the RN `FormData` type has no
         * `get`, and the appends happen inside `leaveApi.create`, so instrumenting
         * the instance afterwards would miss them. The backend rejects the body
         * without `employee_id`, so that field must survive the multipart branch.
         */
        const appendSpy = jest.spyOn(FormData.prototype, 'append');

        await leaveApi.create({
            employee_id: 42,
            leave_type_id: 2,
            start_date: '2026-09-20',
            end_date: '2026-09-20',
            attachments: [
                { uri: 'file:///tmp/a.pdf', name: 'a.pdf', mimeType: 'application/pdf' },
            ],
        });

        expect(mockedPostMultipart).toHaveBeenCalledTimes(1);
        expect(mockedApi.post).not.toHaveBeenCalled();
        const [url, formData] = mockedPostMultipart.mock.calls[0] as unknown as [
            string,
            FormData,
        ];
        expect(url).toBe('/leave-requests');
        expect(formData).toBeInstanceOf(FormData);
        expect(appendSpy).toHaveBeenCalledWith('employee_id', '42');
    });

    it('queries leave-types for the picker with status=active passthrough', async () => {
        mockedApi.get.mockResolvedValueOnce(paginated([]) as never);

        await leaveApi.types({ status: 'active', per_page: 100 });

        expect(mockedApi.get).toHaveBeenCalledWith('/leave-types', {
            params: { status: 'active', per_page: 100 },
        });
    });

    it('accepts leave-types returned as a plain array', async () => {
        mockedApi.get.mockResolvedValueOnce([] as never);

        await expect(leaveApi.types()).resolves.toEqual([]);
    });

    it('throws a server-kind AppError when a request payload violates the contract', async () => {
        // `total_days` is a decimal string on the wire; a number here is a contract break.
        mockedApi.get.mockResolvedValueOnce(
            paginated([makeLeaveRequest({ total_days: 3 })]) as never,
        );

        await expect(leaveApi.list()).rejects.toMatchObject({ kind: 'server' });
    });
});
