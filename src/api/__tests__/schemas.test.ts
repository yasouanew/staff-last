import { z } from 'zod';

import { paginatedSchema, paginationMetaSchema, parseApiResponse } from '../schemas';

/**
 * The boundary parser is what turns "the server sent something unexpected" from a
 * silent `undefined` in a screen into a normalised `AppError`. These tests pin its
 * contract: pass through valid data (including coercion-free strictness), and throw a
 * `server`-kind error — never a raw `ZodError` — on a mismatch.
 */

const itemSchema = z.object({ id: z.number(), name: z.string() });
const listSchema = paginatedSchema(itemSchema);

describe('parseApiResponse', () => {
    it('returns the parsed value when the payload is valid', () => {
        const value = { id: 1, name: 'x' };

        expect(parseApiResponse(itemSchema, value, 'test')).toEqual(value);
    });

    it('throws an AppError of kind `server` on a mismatch', () => {
        expect(() => parseApiResponse(itemSchema, { id: 'nope' }, 'test')).toThrow(
            expect.objectContaining({ kind: 'server' }),
        );
    });

    it('retains the ZodError as `cause` for diagnostics', () => {
        try {
            parseApiResponse(itemSchema, { id: 1 }, 'test');
            throw new Error('expected parseApiResponse to throw');
        } catch (error) {
            expect((error as { cause?: unknown }).cause).toBeInstanceOf(z.ZodError);
        }
    });

    it('never throws the raw ZodError to the caller', () => {
        try {
            parseApiResponse(itemSchema, null, 'test');
        } catch (error) {
            // A ZodError is not an AppError and would break the ErrorView contract.
            expect(error).not.toBeInstanceOf(z.ZodError);
            expect((error as { message?: string }).message).toEqual(expect.any(String));
        }
    });
});

describe('paginatedSchema', () => {
    it('accepts a valid paginator and validates each item', () => {
        const value = {
            data: [{ id: 1, name: 'a' }],
            meta: { current_page: 1, last_page: 2, per_page: 10, total: 11 },
        };

        expect(listSchema.safeParse(value).success).toBe(true);
    });

    it('rejects a paginator whose items violate the item schema', () => {
        const value = {
            data: [{ id: 1 }],
            meta: { current_page: 1, last_page: 1, per_page: 10, total: 1 },
        };

        expect(listSchema.safeParse(value).success).toBe(false);
    });

    it('rejects a payload missing pagination metadata', () => {
        expect(listSchema.safeParse({ data: [] }).success).toBe(false);
    });

    it('requires integer pagination fields', () => {
        expect(
            paginationMetaSchema.safeParse({
                current_page: 1,
                last_page: 1,
                per_page: 10,
                total: 'many',
            }).success,
        ).toBe(false);
    });
});
