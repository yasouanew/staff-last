import { api } from '../../../api/client';
import { paginatedSchema, parseApiResponse } from '../../../api/schemas';
import type { PaginatedData } from '../../../types/api';
import type { Roster, RosterListParams } from '../types';
import { rosterSchema } from '../validation/apiSchemas';

/**
 * Roster API service.
 *
 * As with shifts, `employee_id` must be supplied explicitly — the endpoint is not
 * auto-scoped to the token (spec §0.5). "My Roster" therefore always passes the
 * signed-in employee's id from the session.
 *
 * Responses are parsed through [`rosterSchema`](src/features/roster/validation/apiSchemas.ts:1),
 * which validates the embedded `shifts` on the detail endpoint as well.
 */
const rosterListSchema = paginatedSchema(rosterSchema);

export const rosterApi = {
    /** `GET /rosters?employee_id=&date_from=&date_to=` — paginated; requires `roster.view`. */
    async list(params: RosterListParams): Promise<PaginatedData<Roster>> {
        const data = await api.get<unknown>('/rosters', { params });

        return parseApiResponse(rosterListSchema, data, 'GET /rosters');
    },

    /** `GET /rosters/{id}` — includes the roster's shifts. */
    async detail(id: number): Promise<Roster> {
        const data = await api.get<unknown>(`/rosters/${id}`);

        return parseApiResponse(rosterSchema, data, `GET /rosters/${id}`);
    },
};
