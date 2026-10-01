import { api } from '../../../api/client';
import { parseApiResponse } from '../../../api/schemas';
import { z } from 'zod';
import type {
    Availability,
    CreateAvailabilityPayload,
    SyncWeeklyAvailabilityPayload,
    UpdateAvailabilityPayload,
} from '../types';
import { availabilitySchema } from '../validation/apiSchemas';

/**
 * Availability API — spec Screen 7 §6.
 *
 * All routes live under `/employees/{employee}/availabilities` where `employee`
 * is `employees.id` (NOT `users.id`) — resolve via `me.employee_id`.
 *
 * - List is NOT paginated (plain collection) ordered `day_of_week,start_time`.
 * - Sync (`PUT …/sync`) is RECOMMENDED for mobile save — replaces ALL rows
 *   transactionally.
 * - Show/Update/Delete operate on a single slot; 404 when the slot belongs to
 *   another employee.
 *
 * BACKEND GAP (BLOCKING): `index` authorizes `employee.view` and
 * `store/sync/update/destroy` authorize `employee.update` via `EmployeePolicy`,
 * which the employee role does NOT hold — real calls 403 until the backend
 * grants scoped own-record access. Callers must surface 403 distinctly.
 *
 * Every response is parsed through [`availabilitySchema`](src/features/availability/validation/apiSchemas.ts:1).
 */
const availabilityListSchema = z.array(availabilitySchema);

function base(employeeId: number): string {
    return `/employees/${employeeId}/availabilities`;
}

export const availabilityApi = {
    /** `GET /employees/{employee}/availabilities` — plain collection, not paginated. */
    async list(employeeId: number): Promise<Availability[]> {
        const data = await api.get<unknown>(base(employeeId));

        return parseApiResponse(availabilityListSchema, data, 'GET /availabilities');
    },

    /** `POST /employees/{employee}/availabilities` — create one slot. */
    async create(employeeId: number, payload: CreateAvailabilityPayload): Promise<Availability> {
        const data = await api.post<unknown, CreateAvailabilityPayload>(base(employeeId), payload);

        return parseApiResponse(availabilitySchema, data, 'POST /availabilities');
    },

    /**
     * `PUT /employees/{employee}/availabilities/sync` — RECOMMENDED mobile save.
     * Replaces the whole week transactionally; returns the full week collection.
     */
    async sync(employeeId: number, payload: SyncWeeklyAvailabilityPayload): Promise<Availability[]> {
        const data = await api.put<unknown, SyncWeeklyAvailabilityPayload>(
            `${base(employeeId)}/sync`,
            payload,
        );

        return parseApiResponse(availabilityListSchema, data, 'PUT /availabilities/sync');
    },

    /** `GET /employees/{employee}/availabilities/{availability}` — single slot. */
    async show(employeeId: number, availabilityId: number): Promise<Availability> {
        const data = await api.get<unknown>(`${base(employeeId)}/${availabilityId}`);

        return parseApiResponse(availabilitySchema, data, 'GET /availabilities/{id}');
    },

    /** `PUT /employees/{employee}/availabilities/{availability}` — partial update. */
    async update(
        employeeId: number,
        availabilityId: number,
        payload: UpdateAvailabilityPayload,
    ): Promise<Availability> {
        const data = await api.put<unknown, UpdateAvailabilityPayload>(
            `${base(employeeId)}/${availabilityId}`,
            payload,
        );

        return parseApiResponse(availabilitySchema, data, 'PUT /availabilities/{id}');
    },

    /** `DELETE /employees/{employee}/availabilities/{availability}`. */
    async remove(employeeId: number, availabilityId: number): Promise<void> {
        await api.delete<void>(`${base(employeeId)}/${availabilityId}`);
    },
};
