import { api, postMultipart } from '../../../api/client';
import { paginatedSchema, parseApiResponse } from '../../../api/schemas';
import type { PaginatedData } from '../../../types/api';
import { z } from 'zod';
import type {
    CreateLeaveRequestPayload,
    LeaveRequest,
    LeaveRequestListParams,
    LeaveType,
    LeaveTypeListParams,
} from '../types';
import { leaveRequestSchema, leaveTypeSchema } from '../validation/apiSchemas';

const leaveRequestListSchema = paginatedSchema(leaveRequestSchema);

/** `GET /leave-types` may return a paginator or a plain collection. */
const leaveTypesSchema = z.union([paginatedSchema(leaveTypeSchema), z.array(leaveTypeSchema)]);

/**
 * Leave API service — spec Screens 8–10 §6.
 *
 * `GET /leave-requests` is auto-scoped server-side, so `employee_id` is never sent.
 * Contrast with [`shiftsApi`](src/features/shifts/api/shiftsApi.ts:1) and
 * [`rosterApi`](src/features/roster/api/rosterApi.ts:1), which require it.
 */
export const leaveApi = {
    /**
     * `GET /leave-requests` — **auto-scoped** to the authenticated employee.
     * Requires `leave_request.view`. Query: `status`, `leave_type_id`,
     * `date_from`, `date_to`, `per_page`. Client MUST NOT send `employee_id`.
     */
    async list(params: LeaveRequestListParams = {}): Promise<PaginatedData<LeaveRequest>> {
        const { status, leave_type_id, date_from, date_to, page, per_page } = params;

        const data = await api.get<unknown>('/leave-requests', {
            params: {
                ...(status !== undefined ? { status } : {}),
                ...(leave_type_id !== undefined ? { leave_type_id } : {}),
                ...(date_from !== undefined ? { date_from } : {}),
                ...(date_to !== undefined ? { date_to } : {}),
                ...(page !== undefined ? { page } : {}),
                ...(per_page !== undefined ? { per_page } : {}),
            },
        });

        return parseApiResponse(leaveRequestListSchema, data, 'GET /leave-requests');
    },

    /** `GET /leave-requests/{id}` — the server enforces ownership (403 other employee, 404 unknown). */
    async detail(id: number): Promise<LeaveRequest> {
        const data = await api.get<unknown>(`/leave-requests/${id}`);

        return parseApiResponse(leaveRequestSchema, data, `GET /leave-requests/${id}`);
    },

    /**
     * `POST /leave-requests` — requires `leave_request.create`.
     *
     * Content-Type: `multipart/form-data` when attachments present, else JSON.
     *
     * `employee_id` **must** be sent and must be the caller's own id, taken from the
     * session. The spec originally stated the server injects it, but the deployed
     * backend validates it as required and answers
     * `422 {"employee_id": ["The employee id field is required."]}` without it, so
     * `CreateLeaveRequestPayload` makes the field non-optional and both branches
     * below transmit it. `company_id` stays omitted — the backend derives it and
     * does not validate it as required.
     *
     * Note the asymmetry with `list`/`detail` above, which are server-scoped and
     * must *not* send `employee_id`: this requirement is on the create body only.
     * `total_days` is a hint only — the server recalculates via
     * `LeaveRequestService`.
     */
    async create(payload: CreateLeaveRequestPayload): Promise<LeaveRequest> {
        if (payload.attachments !== undefined && payload.attachments.length > 0) {
            const formData = new FormData();

            formData.append('employee_id', String(payload.employee_id));
            formData.append('leave_type_id', String(payload.leave_type_id));
            formData.append('start_date', payload.start_date);
            formData.append('end_date', payload.end_date);

            if (payload.start_session !== undefined) {
                formData.append('start_session', payload.start_session);
            }

            if (payload.end_session !== undefined) {
                formData.append('end_session', payload.end_session);
            }

            if (payload.total_days !== undefined) {
                formData.append('total_days', String(payload.total_days));
            }

            if (payload.reason !== undefined && payload.reason.length > 0) {
                formData.append('reason', payload.reason);
            }

            payload.attachments.forEach(attachment => {
                formData.append('attachments[]', {
                    uri: attachment.uri,
                    name: attachment.name,
                    type: attachment.mimeType,
                } as unknown as Blob);
            });

            const created = await postMultipart<unknown>('/leave-requests', formData);

            return parseApiResponse(leaveRequestSchema, created, 'POST /leave-requests');
        }

        const jsonBody = { ...payload };
        delete jsonBody.attachments;

        const created = await api.post<unknown, typeof jsonBody>('/leave-requests', jsonBody);

        return parseApiResponse(leaveRequestSchema, created, 'POST /leave-requests');
    },

    /**
     * `GET /leave-types` — for the picker.
     *
     * **Backend gap (G2):** this endpoint requires `leave_type.view` which the
     * employee role does not hold, so it currently returns 403 for employees.
     * Callers must handle 403 by showing the "types unavailable — contact admin"
     * fallback with retry, not a fatal error (spec Screen 9 §5).
     */
    async types(params: LeaveTypeListParams = {}): Promise<PaginatedData<LeaveType> | LeaveType[]> {
        const data = await api.get<unknown>('/leave-types', { params });

        return parseApiResponse(leaveTypesSchema, data, 'GET /leave-types');
    },
};

// NOTE (G6): there is deliberately no `cancel` method. The backend exposes no
// withdraw endpoint for leave requests, so the UI cannot promise one. Adding a
// method here to call an invented route would be the exact kind of guessed
// behaviour the specification forbids.
// NOTE: `approve` / `reject` endpoints exist but are forbidden for employees by
// design — mobile MUST NOT call them (spec Screen 10 §6).
