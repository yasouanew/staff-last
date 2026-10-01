import { api } from '../../../../api/client';
import { shiftsApi } from '../shiftsApi';

jest.mock('../../../../api/client', () => ({
    api: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
    },
}));

const mockedApi = api as jest.Mocked<typeof api>;

/** A minimal but schema-valid `ShiftResource`. */
function makeShift(overrides: Record<string, unknown> = {}) {
    return {
        id: 101,
        company_id: 1,
        company: null,
        branch_id: null,
        branch: null,
        roster_id: null,
        roster: null,
        employee_id: 9,
        employee: null,
        position_id: null,
        position: null,
        department_id: null,
        department: null,
        date: '2026-09-15',
        start_time: '09:00',
        end_time: '17:00',
        break_minutes: 30,
        paid_break: true,
        required_staff: 1,
        status: 'scheduled',
        notes: null,
        created_at: '2026-09-01T00:00:00+10:00',
        updated_at: '2026-09-01T00:00:00+10:00',
        ...overrides,
    };
}

function paginated(items: unknown[]) {
    return {
        data: items,
        meta: { current_page: 1, last_page: 1, per_page: 10, total: items.length },
    };
}

/**
 * Pins the Home wire contract (spec Screen 4 API 2):
 * `GET /shifts?employee_id=&date_from=&date_to=`. The old `from`/`to` names
 * were silently ignored by the backend, returning unfiltered company data.
 *
 * The responses are now parsed through [`shiftSchema`](../validation/apiSchemas.ts:1),
 * so the fixtures must be schema-valid — which is itself the point: a fixture that
 * drifts from the contract fails here rather than in a screen.
 */
describe('shiftsApi', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('lists today shifts with date_from/date_to, never from/to', async () => {
        mockedApi.get.mockResolvedValueOnce(paginated([makeShift()]) as never);

        await shiftsApi.list({
            employee_id: 9,
            date_from: '2026-09-15',
            date_to: '2026-09-15',
            per_page: 10,
        });

        expect(mockedApi.get).toHaveBeenCalledWith('/shifts', {
            params: {
                employee_id: 9,
                date_from: '2026-09-15',
                date_to: '2026-09-15',
                per_page: 10,
            },
        });
        const sent = (mockedApi.get.mock.calls[0]?.[1] as { params: Record<string, unknown> }).params;
        expect(sent).not.toHaveProperty('from');
        expect(sent).not.toHaveProperty('to');
    });

    it('returns the validated, unwrapped list', async () => {
        mockedApi.get.mockResolvedValueOnce(paginated([makeShift()]) as never);

        const result = await shiftsApi.list({ employee_id: 9 });

        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.id).toBe(101);
        expect(result.meta.total).toBe(1);
    });

    it('fetches a single shift by id for the detail screen', async () => {
        mockedApi.get.mockResolvedValueOnce(makeShift({ id: 101 }) as never);

        await shiftsApi.detail(101);

        expect(mockedApi.get).toHaveBeenCalledWith('/shifts/101');
    });

    it('throws a server-kind AppError when a response violates the contract', async () => {
        // A renamed field is exactly the failure mode runtime validation exists for.
        mockedApi.get.mockResolvedValueOnce(paginated([{ id: 101, date: '2026-09-15' }]) as never);

        await expect(shiftsApi.list({ employee_id: 9 })).rejects.toMatchObject({ kind: 'server' });
    });
});
