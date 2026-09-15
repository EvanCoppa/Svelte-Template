import { tool } from 'ai';
import { z } from 'zod';
import { deleteCalendarEvent } from '$lib/server/crm/calendar';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

/** Cancelling is the calendar's `delete`, as it is on the page — a booking removed is gone. */
export const deleteEventAccess: ToolAccess = { feature: 'calendar', level: 'delete' };

export const deleteEvent = tool({
	description:
		'Cancel an event: the booking is removed from the calendar for everyone, and there is ' +
		'no undo. Read the event first so you can say what is being cancelled, and pass its ' +
		'title so the approval card names it. To move an event rather than call it off, use ' +
		'updateEvent.',
	inputSchema: z.object({
		eventId: z.guid().describe('The event, from listEvents.'),
		title: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.describe('Its title, so the user sees what they are approving.')
	}),
	outputSchema: z.object({ deleted: z.boolean(), eventId: z.string() }),
	contextSchema: toolContextSchema,
	execute: async ({ eventId }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, deleteEventAccess);
		// `unwrapDeleted` turns a row RLS filtered away into an error rather
		// than a cheerful success over nothing.
		await deleteCalendarEvent(supabase, orgId, eventId);
		return { deleted: true, eventId };
	}
});
