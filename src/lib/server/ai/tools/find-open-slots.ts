import { tool } from 'ai';
import { z } from 'zod';
import { listCalendarEvents } from '$lib/server/crm/calendar';
import { resolveTimeZone } from '../prompts';
import { toolContextSchema } from '../context';
import { openSlots } from '../slots';
import { isToolActive, requireToolContext, type ToolAccess } from './access';

/**
 * Finding a gap is reading the calendar; taking it is the page's `book`
 * action, which asks for `manage` on its own.
 */
export const findOpenSlotsAccess: ToolAccess = { feature: 'calendar', level: 'read' };

/** How many slots the card offers at most. */
const MAX_SLOTS = 12;

const slotSchema = z.object({
	startsAt: z.string(),
	/** Exclusive, like a calendar event's `ends_at`. */
	endsAt: z.string()
});

export const findOpenSlots = tool({
	description:
		'Find free time on the calendar and offer it to the user as a pick-a-time card: every ' +
		'open slot of the length asked for inside the working day, with nothing booked across ' +
		'it. The user books one with a click, so do not book it yourself — say what you found ' +
		'and let them choose. Resolve "next week" or "Tuesday afternoon" into the window ' +
		'against the session time zone, and pass that zone.',
	inputSchema: z.object({
		from: z.iso.datetime({ offset: true }).describe('Window start, ISO 8601 with offset.'),
		to: z.iso.datetime({ offset: true }).describe('Window end (exclusive), ISO 8601 with offset.'),
		timeZone: z
			.string()
			.trim()
			.min(1)
			.max(64)
			.describe('The IANA zone the working day is read in — the session time zone.'),
		title: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.describe('What the booking is for; the event takes it as its title when a slot is picked.'),
		durationMinutes: z
			.number()
			.int()
			.min(15)
			.max(480)
			.default(60)
			.describe('How long the slot has to be, in minutes. Default 60.'),
		dayStartHour: z
			.number()
			.int()
			.min(0)
			.max(23)
			.default(9)
			.describe('The working day opens at this local hour. Default 9.'),
		dayEndHour: z
			.number()
			.int()
			.min(1)
			.max(24)
			.default(17)
			.describe('…and closes at this one. Default 17.'),
		weekdaysOnly: z.boolean().default(true).describe('Skip Saturday and Sunday. Default true.'),
		assignedTo: z
			.guid()
			.optional()
			.describe(
				'Only this member’s events count as busy — their user id, from the staff roster. ' +
					'Omit to treat every event on the calendar as busy.'
			)
	}),
	outputSchema: z.object({
		slots: z.array(slotSchema),
		/** How many events fell inside the window, whoever they belong to. */
		busy: z.number().int(),
		timeZone: z.string(),
		durationMinutes: z.number().int(),
		/** Whether the caller may book one — the calendar's `manage`, which the page's action re-checks. */
		canBook: z.boolean()
	}),
	contextSchema: toolContextSchema,
	execute: async (input, { context }) => {
		const { supabase, orgId, org } = requireToolContext(context, findOpenSlotsAccess);
		if (input.dayEndHour <= input.dayStartHour) {
			throw new Error('The working day has to close after it opens.');
		}
		const rows = await listCalendarEvents(supabase, orgId, { from: input.from, to: input.to });
		const busy = input.assignedTo
			? rows.filter((row) => row.assigned_to === input.assignedTo)
			: rows;
		const timeZone = resolveTimeZone(input.timeZone);

		return {
			slots: openSlots({
				from: input.from,
				to: input.to,
				busy: busy.map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at })),
				durationMinutes: input.durationMinutes,
				timeZone,
				dayStartHour: input.dayStartHour,
				dayEndHour: input.dayEndHour,
				weekdaysOnly: input.weekdaysOnly,
				stepMinutes: 30,
				limit: MAX_SLOTS
			}),
			busy: busy.length,
			timeZone,
			durationMinutes: input.durationMinutes,
			canBook: isToolActive(org, { feature: 'calendar', level: 'manage' })
		};
	}
});
