import { z } from 'zod';

/**
 * Availability validation — spec Screen 7 §6-§7.
 *
 * Rule: looser than backend, never stricter. Laravel remains authority.
 * Client only checks shape + `end_time after start_time` to save round-trip.
 * NOT enforced here: permission (403 GAP), ownership (404), transactional replace.
 */

const dayOfWeek = z.number().int().min(0).max(6);

const apiTime = z
    .string()
    .trim()
    .regex(/^([01]\d|2[03]):([0-5]\d)$/, 'Use HH:MM 24-hour format.');

function minutesSinceMidnight(value: string): number {
    const [h, m] = value.split(':').map(Number);

    return (h ?? 0) * 60 + (m ?? 0);
}

export const availabilitySlotSchema = z
    .object({
        day_of_week: dayOfWeek,
        start_time: apiTime.nullable().optional(),
        end_time: apiTime.nullable().optional(),
        is_available: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
        if (value.is_available === false) {
            return;
        }

        if (value.start_time != null && value.end_time != null) {
            if (minutesSinceMidnight(value.end_time) <= minutesSinceMidnight(value.start_time)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['end_time'],
                    message: 'End time must be after start time.',
                });
            }
        }
    });

export const syncWeeklyAvailabilitySchema = z.object({
    availabilities: z.array(availabilitySlotSchema).min(1, 'Add at least one day.'),
});

export type AvailabilitySlotForm = z.infer<typeof availabilitySlotSchema>;
