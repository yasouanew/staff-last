import { z } from 'zod';

import type { AppError } from '../types/appError';
import { logger } from '../utils/logger';

/**
 * Runtime response validation.
 *
 * TypeScript types are erased at runtime, so `response.data as RawEnvelope` in
 * [`client.ts`](src/api/client.ts:1) is a compile-time promise the server has not made.
 * If the backend renames a field, starts returning `null` for something the type says is
 * required, or a gateway returns an HTML error page, the cast passes silently and a
 * screen renders `undefined`.
 *
 * This module is the boundary where that stops. API service methods parse the unwrapped
 * payload through a Zod schema and either return a **typed, validated** value or throw a
 * normalised [`AppError`](src/types/appError.ts:1). Screens therefore never validate —
 * they only render.
 *
 * ## What a mismatch becomes
 *
 * A contract violation is thrown as `kind: 'server'`. That choice is deliberate:
 *
 * - it is a server-side problem, not the caller's, so it reads correctly in the existing
 *   [`ErrorView`](src/components/ErrorView/ErrorView.tsx:1);
 * - [`isRetryable`](src/utils/errors.ts:1) treats `server` as retryable, which is right
 *   for the transient cases (a gateway blip, a truncated body) and harmless for a
 *   permanent one (the retry affordance simply fails again).
 *
 * The raw `ZodError` is attached as `cause` for logging and is never shown to the user.
 */

/** Pagination metadata (`data.meta`), per spec §0.3. */
export const paginationMetaSchema = z.object({
    current_page: z.number(),
    last_page: z.number(),
    per_page: z.number(),
    total: z.number(),
});

/**
 * A Laravel-paginated payload: `{ data: T[], meta, links? }`.
 *
 * Parameterised by the item schema so each list endpoint validates its own rows.
 */
export function paginatedSchema<TItem extends z.ZodTypeAny>(item: TItem) {
    return z.object({
        data: z.array(item),
        meta: paginationMetaSchema,
        links: z.record(z.unknown()).optional(),
    });
}

/** `{ id, name }` relation summary. */
export const relationSummarySchema = z.object({
    id: z.number(),
    name: z.string(),
});

/** `company` relation. Structurally identical to a relation summary. */
export const companySummarySchema = relationSummarySchema;

/** `branch` relation with display hints. */
export const branchSummarySchema = z.object({
    id: z.number(),
    name: z.string(),
    timezone: z.string().nullish(),
    address: z.string().nullish(),
});

/** `employee` relation embedded in shift/roster resources. */
export const employeeSummarySchema = z.object({
    id: z.number(),
    full_name: z.string(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
});

/** `rosters.status` enum — `draft,published`. */
export const rosterStatusSchema = z.enum(['draft', 'published']);

/** `rosters` relation embedded in a shift. */
export const rosterSummarySchema = z.object({
    id: z.number(),
    week_start: z.string(),
    week_end: z.string(),
    status: rosterStatusSchema,
});

/**
 * Parses `value` against `schema`.
 *
 * @param context a label such as `'GET /shifts'`, used only for the log line — it makes
 *   a contract violation findable in a crash report without leaking the payload.
 * @throws `AppError` of kind `server` when the value does not satisfy the schema.
 */
export function parseApiResponse<T>(schema: z.ZodType<T>, value: unknown, context: string): T {
    const result = schema.safeParse(value);

    if (result.success) {
        return result.data;
    }

    // Log the issue paths, not the values: response bodies can contain PII.
    logger.warn(
        `[api] Response contract violation for ${context}:`,
        result.error.issues.slice(0, 5).map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
    );

    throw {
        kind: 'server',
        message: 'The app received an unexpected response from the server. Please try again.',
        cause: result.error,
    } satisfies AppError;
}
