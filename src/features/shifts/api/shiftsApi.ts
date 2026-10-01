import { api } from '../../../api/client';
import { paginatedSchema, parseApiResponse } from '../../../api/schemas';
import type { PaginatedData } from '../../../types/api';
import type { Shift, ShiftListParams } from '../types';
import { shiftSchema } from '../validation/apiSchemas';

/**
 * Shift API service.
 *
 * Every method requires `employee_id` because the backend does not scope shifts to
 * the authenticated employee (spec §0.5, G-series note). The caller supplies it from
 * the session (`AuthUser.employee_id`); this module never guesses a default, since
 * silently omitting it returns another branch's data or a 403 depending on the
 * middleware chain.
 *
 * Responses are parsed through [`shiftSchema`](src/features/shifts/validation/apiSchemas.ts:1)
 * so a field rename or a null-where-required surfaces as an `AppError` at the boundary
 * rather than as `undefined` in a row.
 */
const shiftListSchema = paginatedSchema(shiftSchema);

export const shiftsApi = {
    /** `GET /shifts?employee_id=&date_from=&date_to=` — paginated (spec Screen 4 API 2). */
    async list(params: ShiftListParams): Promise<PaginatedData<Shift>> {
        const data = await api.get<unknown>('/shifts', { params });

        return parseApiResponse(shiftListSchema, data, 'GET /shifts');
    },

    /** `GET /shifts/{id}` — requires `shift.view`. */
    async detail(id: number): Promise<Shift> {
        const data = await api.get<unknown>(`/shifts/${id}`);

        return parseApiResponse(shiftSchema, data, `GET /shifts/${id}`);
    },
};
