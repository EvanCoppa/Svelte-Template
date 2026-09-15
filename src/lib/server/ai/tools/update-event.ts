import { tool } from 'ai';
import { z } from 'zod';
import { BADGE_TONES } from '$lib/components/ui/badge/badge-tones.js';
import {
	getCalendarEvent,
	updateCalendarEvent,
	type CalendarEventEdit
} from '$lib/server/crm/calendar';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';
import { ENDS_AFTER_STARTS, eventAbout, eventLinkColumns } from './create-event';
import { describeEvents, eventSchema } from './list-events';

export const updateEventAccess: ToolAccess = { feature: 'calendar', level: 'manage' };

/**
 * Changing a booking — moving it, stretching it, retitling it, putting
 * somebody else on it. One tool rather than the page's two forms: the page
 * splits `update` from `move` so that a DRAG cannot overwrite a title
 * somebody is editing, and a tool that names only the fields it means gets
 * that property for nothing.
 *
 * `null` clears a field and leaving it out keeps it, which is why the event
 * is read first: a move that names one end has to be checked for order
 * against the end it did not name, and only the stored row knows that.
 */
export const updateEvent = tool({
	description:
		'Change an event on the calendar: name only what changes and the rest stays as it is. ' +
		'Moving one is its two instants (both ISO 8601 with offset, the end exclusive) — pass ' +
		'both when the whole block moves, so its length is what you meant. Pass null to clear ' +
		'location, description, who it is booked for or what it is about. Read the event first ' +
		'(listEvents) when you are not sure what it says now.',
	inputSchema: z.object({
		eventId: z.guid().describe('The event, from listEvents.'),
		title: z.string().trim().min(1).max(200).optional(),
		startsAt: z.iso.datetime({ offset: true }).optional(),
		endsAt: z.iso.datetime({ offset: true }).optional().describe('Exclusive, like the booking.'),
		allDay: z.boolean().optional(),
		location: z.string().trim().max(200).nullable().optional(),
		description: z.string().trim().max(5000).nullable().optional(),
		assignedTo: z
			.guid()
			.nullable()
			.optional()
			.describe('A colleague’s user id from listMembers, or null to take them off it.'),
		about: eventAbout.unwrap().nullable().optional(),
		color: z.enum(BADGE_TONES).optional()
	}),
	outputSchema: z.object({ event: eventSchema }),
	contextSchema: toolContextSchema,
	execute: async (input, { context }) => {
		const ctx = requireToolContext(context, updateEventAccess);
		const current = await getCalendarEvent(ctx.supabase, ctx.orgId, input.eventId);
		if (!current) throw new Error(`There is no event with id ${input.eventId}.`);

		// The database's `calendar_events_ends_after_start`, checked against
		// what the row will say once this edit lands rather than against what
		// the call happened to name.
		const startsAt = input.startsAt ?? current.starts_at;
		const endsAt = input.endsAt ?? current.ends_at;
		if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error(ENDS_AFTER_STARTS);

		const values: CalendarEventEdit = {};
		if (input.title !== undefined) values.title = input.title;
		if (input.startsAt !== undefined) values.starts_at = input.startsAt;
		if (input.endsAt !== undefined) values.ends_at = input.endsAt;
		if (input.allDay !== undefined) values.all_day = input.allDay;
		if (input.location !== undefined) values.location = input.location;
		if (input.description !== undefined) values.description = input.description;
		if (input.assignedTo !== undefined) values.assigned_to = input.assignedTo;
		if (input.color !== undefined) values.color = input.color;
		// Both columns move together or not at all: the entity link is one
		// fact spelled in two columns (the crm entity rule).
		if (input.about !== undefined) {
			Object.assign(values, eventLinkColumns(ctx, input.about ?? undefined));
		}
		if (Object.keys(values).length === 0) throw new Error('Name at least one thing to change.');

		const row = await updateCalendarEvent(ctx.supabase, ctx.orgId, input.eventId, values);
		const [event] = await describeEvents(ctx, [row]);
		return { event };
	}
});
