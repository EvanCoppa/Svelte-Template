import { tool } from 'ai';
import { z } from 'zod';
import { BADGE_TONES } from '$lib/components/ui/badge/badge-tones.js';
import { createCalendarEvent, type CalendarEventInput } from '$lib/server/crm/calendar';
import { toolContextSchema, type AssistantToolContext } from '../context';
import { canOpenFor, requireToolContext, type ToolAccess } from './access';
import { describeEvents, eventSchema } from './list-events';
import { recordKindSchema } from './record-ref';

/** Booking time is the calendar's `manage`, exactly as the page's create action is. */
export const createEventAccess: ToolAccess = { feature: 'calendar', level: 'manage' };

/**
 * Booking a block of time, and — in `update-event.ts` — changing one.
 *
 * An event is not a row of strings the generic record form could hold: two
 * instants that must stay in order, an all-day switch that changes what they
 * mean, a colour, a member and a record. So the calendar keeps its own forms
 * (docs/calendar.md) and the assistant its own tools, the way tasks do.
 *
 * The two links an event carries are the two a task carries, and they are
 * not the same question: `assignedTo` is the colleague it is booked FOR, and
 * `about` is the record it concerns. The schemas below are shared with the
 * edit, the way `assign-task.ts` shares its pair.
 */

/** The record an event is about: the entity link, as a kind and an id. */
export const eventAbout = z
	.object({ kind: recordKindSchema, id: z.guid() })
	.optional()
	.describe('The record the event is about — a contact, a company, a deal — from findRecords.');

export type EventAbout = z.infer<typeof eventAbout>;

/**
 * The entity link as two columns, refusing a record the caller may not open.
 * The page's rule (`refusesRecord`): an event about something out of reach
 * would be one they could never follow, and letting the insert answer would
 * say whether that id exists.
 */
export function eventLinkColumns(
	context: AssistantToolContext,
	about: EventAbout
): Pick<CalendarEventInput, 'entity_type' | 'entity_id'> {
	if (!about) return { entity_type: null, entity_id: null };
	if (!canOpenFor(context.org)(about.kind)) {
		throw new Error(`This organization or your role does not allow "read" on ${about.kind}.`);
	}
	return { entity_type: about.kind, entity_id: about.id };
}

/** Said in the tool so the model reads a sentence, not the check constraint's name. */
export const ENDS_AFTER_STARTS = 'The event has to end after it starts.';

/**
 * The booking's own fields. Named rather than inlined so the order rule — the
 * database's `calendar_events_ends_after_start`, said where the model reads
 * it — is testable the way the page's schema is.
 */
export const createEventInputSchema = z
	.object({
		title: z.string().trim().min(1).max(200).describe('What the time is for.'),
		startsAt: z.iso.datetime({ offset: true }).describe('When it starts, ISO 8601 with offset.'),
		endsAt: z.iso
			.datetime({ offset: true })
			.describe('When it ends, exclusive, ISO 8601 with offset.'),
		allDay: z
			.boolean()
			.optional()
			.describe('Draw it as an all-day block. The instants still say when it runs.'),
		location: z.string().trim().max(200).optional(),
		description: z.string().trim().max(5000).optional(),
		assignedTo: z
			.guid()
			.optional()
			.describe('Who it is booked for: a colleague’s user id, from listMembers.'),
		about: eventAbout,
		color: z.enum(BADGE_TONES).optional().describe('Only when the user asks for one.')
	})
	.refine((data) => Date.parse(data.endsAt) > Date.parse(data.startsAt), {
		error: ENDS_AFTER_STARTS,
		path: ['endsAt']
	});

export const createEvent = tool({
	description:
		'Book an event on the calendar. Both instants are ISO 8601 with offset and the end is ' +
		'EXCLUSIVE, so a 2pm hour ends at 3pm and an all-day event runs midnight to midnight in ' +
		'the user’s zone — allDay only says how it is drawn. Resolve "Tuesday at 2" against the ' +
		'session time zone first. Two different links, and an event often has both: ASSIGN it ' +
		'to a colleague who works here (assignedTo, a user id from listMembers), and point it ' +
		'at the record it is ABOUT (about, from findRecords). Use findOpenSlots instead when ' +
		'the user is asking what time is free rather than naming one.',
	inputSchema: createEventInputSchema,
	outputSchema: z.object({ event: eventSchema }),
	contextSchema: toolContextSchema,
	execute: async (input, { context }) => {
		const ctx = requireToolContext(context, createEventAccess);
		const values: CalendarEventInput = {
			title: input.title,
			starts_at: input.startsAt,
			ends_at: input.endsAt,
			all_day: input.allDay ?? false,
			location: input.location ?? null,
			description: input.description ?? null,
			assigned_to: input.assignedTo ?? null,
			...eventLinkColumns(ctx, input.about)
		};
		// The column has a default, so a colour nobody asked for is left to it
		// rather than guessed at.
		if (input.color) values.color = input.color;

		const [event] = await describeEvents(ctx, [
			await createCalendarEvent(ctx.supabase, ctx.orgId, values)
		]);
		return { event };
	}
});
