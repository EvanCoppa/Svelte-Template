import { z } from 'zod';
import { BADGE_TONES } from '$lib/components/ui/badge/badge-tones.js';
import { recordRefField } from '$lib/schemas/record-ref';

/**
 * The calendar page's four forms. An event is not a row of strings the
 * generic record form could hold — two instants that must stay in order, an
 * all-day switch that changes what the date inputs mean, a colour, a member
 * and a record — so the page keeps its own forms (schema.ts) and says so,
 * like the quick plans page. `move` is what a drag posts: the same two
 * instants and nothing else, so a gesture never overwrites a title someone
 * else is editing.
 */

/**
 * An instant as the browser posts it — ISO with its offset — or the naive
 * wall-clock value a no-JS post carries, which the server reads as UTC
 * (`instant()` in `$lib/server/records`). Both fields take the same shape,
 * so the ordering check below compares like with like.
 */
const instant = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/, {
		error: 'Choose a date and time.'
	});

const title = z
	.string()
	.trim()
	.min(1, 'Give the event a title.')
	.max(200, 'Keep the title under 200 characters.');

/** Blank is the empty string throughout; the action turns it into a null column. */
const location = z.string().trim().max(200, 'Keep the location under 200 characters.').default('');
const description = z
	.string()
	.trim()
	.max(5000, 'Keep the description under 5000 characters.')
	.default('');

/** Ids are `z.guid()` for the reason the staff schema gives: seeded fixture ids. */
const memberId = z.guid().or(z.literal('')).default('');

/**
 * The record an event is for, as the picker posts it: `<kind>:<id>` or blank
 * (`$lib/schemas/record-ref`, shared with the task modal).
 */
const record = recordRefField;

const fields = {
	/** Blank on a booking; the event being edited otherwise. One value type for both forms. */
	id: z.guid().or(z.literal('')).default(''),
	title,
	starts_at: instant,
	ends_at: instant,
	all_day: z.boolean().default(false),
	color: z.enum(BADGE_TONES).default('info'),
	location,
	description,
	assigned_to: memberId,
	record
};

/** The `calendar_events_ends_after_start` check, said where the form can show it. */
const inOrder = {
	check: (data: { starts_at: string; ends_at: string }) =>
		Date.parse(data.ends_at) > Date.parse(data.starts_at),
	options: { error: 'The event has to end after it starts.', path: ['ends_at'] }
};

export const createEventSchema = z.object(fields).refine(inOrder.check, inOrder.options);

/** The same fields, and the event they belong to. */
export const updateEventSchema = createEventSchema.refine((data) => data.id !== '', {
	error: 'Which event to save was not sent.',
	path: ['id']
});

/** A drag or a stretch: the two columns it changes, and only those. */
export const moveEventSchema = z
	.object({ id: z.guid(), starts_at: instant, ends_at: instant })
	.refine(inOrder.check, inOrder.options);

export const deleteEventSchema = z.object({ id: z.guid() });

export type EventFormValues = z.infer<typeof createEventSchema>;

/** One member the assignee picker offers. */
export type Assignee = { userId: string; name: string };
