import { api } from '../../../../api/client';
import { availabilityApi } from '../availabilityApi';

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

/** A minimal but schema-valid `Availability`. */
function makeAvailability(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        employee_id: 9,
        day_of_week: 1,
        day_name: 'Monday',
        is_available: true,
        start_time: '09:00',
        end_time: '17:00',
        created_at: '2026-09-01T00:00:00+10:00',
        updated_at: '2026-09-01T00:00:00+10:00',
        ...overrides,
    };
}

/**
 * Pins the Availability wire contract (spec Screen 7 §6):
 * - every route nests under `/employees/{employee}/availabilities`
 * - `employee` is `employees.id` from `me.employee_id`, never `users.id`
 * - list is a plain collection (no pagination params)
 * - sync is `PUT …/sync` and is the recommended mobile save
 *
 * Responses are parsed through [`availabilitySchema`](../validation/apiSchemas.ts:1).
 */
describe('availabilityApi', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('lists availability as a plain collection under the employee scope', async () => {
        mockedApi.get.mockResolvedValueOnce([makeAvailability()] as never);

        const result = await availabilityApi.list(9);

        expect(mockedApi.get).toHaveBeenCalledWith('/employees/9/availabilities');
        expect(result).toHaveLength(1);
    });

    it('creates a slot under the employee scope', async () => {
        mockedApi.post.mockResolvedValueOnce(makeAvailability() as never);

        await availabilityApi.create(9, {
            day_of_week: 1,
            start_time: '09:00',
            end_time: '17:00',
            is_available: true,
        });

        expect(mockedApi.post).toHaveBeenCalledWith('/employees/9/availabilities', {
            day_of_week: 1,
            start_time: '09:00',
            end_time: '17:00',
            is_available: true,
        });
    });

    it('syncs the whole week via PUT …/sync (recommended mobile save)', async () => {
        mockedApi.put.mockResolvedValueOnce([makeAvailability()] as never);

        await availabilityApi.sync(9, {
            availabilities: [
                { day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true },
                { day_of_week: 3, is_available: false },
            ],
        });

        expect(mockedApi.put).toHaveBeenCalledWith('/employees/9/availabilities/sync', {
            availabilities: [
                { day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true },
                { day_of_week: 3, is_available: false },
            ],
        });
    });

    it('shows a single slot by id', async () => {
        mockedApi.get.mockResolvedValueOnce(makeAvailability() as never);

        await availabilityApi.show(9, 1);

        expect(mockedApi.get).toHaveBeenCalledWith('/employees/9/availabilities/1');
    });

    it('updates a single slot with a partial body', async () => {
        mockedApi.put.mockResolvedValueOnce(makeAvailability({ end_time: '18:00' }) as never);

        await availabilityApi.update(9, 1, { end_time: '18:00' });

        expect(mockedApi.put).toHaveBeenCalledWith('/employees/9/availabilities/1', {
            end_time: '18:00',
        });
    });

    it('deletes a single slot by id', async () => {
        mockedApi.delete.mockResolvedValueOnce(undefined as never);

        await availabilityApi.remove(9, 1);

        expect(mockedApi.delete).toHaveBeenCalledWith('/employees/9/availabilities/1');
    });

    it('rejects a day_of_week outside the 0–6 range', async () => {
        mockedApi.get.mockResolvedValueOnce([makeAvailability({ day_of_week: 9 })] as never);

        await expect(availabilityApi.list(9)).rejects.toMatchObject({ kind: 'server' });
    });
});
