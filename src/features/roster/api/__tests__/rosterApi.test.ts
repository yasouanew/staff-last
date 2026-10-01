import { api } from '../../../../api/client';
import { rosterApi } from '../rosterApi';

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

/** A minimal but schema-valid `RosterResource`. */
function makeRoster(overrides: Record<string, unknown> = {}) {
    return {
        id: 20,
        company_id: 1,
        branch_id: null,
        employee_id: 9,
        employee: null,
        week_start: '2026-09-14',
        week_end: '2026-09-20',
        status: 'published',
        notes: null,
        published_at: '2026-09-10T00:00:00+10:00',
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
 * Pins the My Roster wire contract (spec Screen 5 API 1 + API 2):
 * - API 1: `GET /shifts?employee_id=&date_from=&date_to=&per_page=50` (tested in shiftsApi).
 * - API 2: `GET /rosters?status=published&per_page=10` for week chrome.
 * - API 3: `GET /rosters/{id}` includes shifts; mobile filters to own client-side.
 *
 * Responses are parsed through [`rosterSchema`](../validation/apiSchemas.ts:1).
 */
describe('rosterApi', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('lists published rosters for week chrome with status=published', async () => {
        mockedApi.get.mockResolvedValueOnce(paginated([makeRoster()]) as never);

        await rosterApi.list({ status: 'published', per_page: 10 });

        expect(mockedApi.get).toHaveBeenCalledWith('/rosters', {
            params: { status: 'published', per_page: 10 },
        });
    });

    it('scopes "my roster" chrome with employee_id explicitly (no auto-scoping)', async () => {
        mockedApi.get.mockResolvedValueOnce(paginated([makeRoster()]) as never);

        await rosterApi.list({ employee_id: 9, status: 'published', per_page: 10 });

        expect(mockedApi.get).toHaveBeenCalledWith('/rosters', {
            params: { employee_id: 9, status: 'published', per_page: 10 },
        });
    });

    it('fetches a single roster by id for the detail screen', async () => {
        mockedApi.get.mockResolvedValueOnce(makeRoster() as never);

        await rosterApi.detail(20);

        expect(mockedApi.get).toHaveBeenCalledWith('/rosters/20');
    });

    it('throws a server-kind AppError on a contract violation', async () => {
        mockedApi.get.mockResolvedValueOnce({ id: 20 } as never);

        await expect(rosterApi.detail(20)).rejects.toMatchObject({ kind: 'server' });
    });
});
