import { tool } from 'ai';
import { z } from 'zod';
import { isRecordKind } from '$lib/crm/records';
import { listCalendarEvents } from '$lib/server/crm/calendar';
import { recordLinks } from '$lib/server/crm/links';
import { loadVocabulary } from '$lib/server/features';
import { getDisplayNames } from '$lib/server/profiles';
import { toolContextSchema } from '../context';
import { canOpenFor, requireToolContext, type ToolAccess } from './access';
import { recordRefSchema } from './record-ref';

export const listEventsAccess: ToolAccess = { feature: 'calendar', level: 'read' };

/** A window can be a year; the model gets the first hundred and a count. */
const MAX_EVENTS = 100;

const eventSchema = z.object({
	id: z.string(),
	title: z.string(),
	startsAt: z.string(),
	/** Exclusive: an all-day event runs midnight to midnight. */
	endsAt: z.string(),
	allDay: z.boolean(),
	location: z.string().nullable(),
	description: z.string().nullable(),
	assignedTo: z.string().nullable().describe('The member it is booked for, by name.'),
	/** The record the event is about, when it is about one the caller may open. */
	about: recordRefSchema.nullable()
});

export const listEvents = tool({
	description:
		'The calendar: every event overlapping a window of time, in start order, with the record ' +
		'each is about. Resolve "this week" or "tomorrow" against the session time zone before ' +
		'passing the window.',
	inputSchema: z.object({
		from: z.iso.datetime({ offset: true }).describe('Window start, ISO 8601 with offset.'),
		to: z.iso.datetime({ offset: true }).describe('Window end (exclusive), ISO 8601 with offset.')
	}),
	outputSchema: z.object({
		events: z.array(eventSchema),
		total: z.number().int().describe('How many events overlap the window, before the cap.')
	}),
	contextSchema: toolContextSchema,
	execute: async ({ from, to }, { context }) => {
		const { supabase, orgId, org } = requireToolContext(context, listEventsAccess);
		const rows = await listCalendarEvents(supabase, orgId, { from, to });
		const shown = rows.slice(0, MAX_EVENTS);

		const vocabulary = await loadVocabulary(supabase, org.activeOrg.industryId);
		const [links, people] = await Promise.all([
			recordLinks(supabase, orgId, shown, canOpenFor(org), vocabulary),
			getDisplayNames(
				supabase,
				shown.flatMap((row) => (row.assigned_to ? [row.assigned_to] : []))
			)
		]);

		return {
			events: shown.map((row) => {
				const link = links[row.id];
				const kind = row.entity_type && isRecordKind(row.entity_type) ? row.entity_type : null;
				return {
					id: row.id,
					title: row.title,
					startsAt: row.starts_at,
					endsAt: row.ends_at,
					allDay: row.all_day,
					location: row.location,
					description: row.description,
					assignedTo: row.assigned_to ? (people.get(row.assigned_to) ?? null) : null,
					about:
						link && kind && row.entity_id ? { kind, id: row.entity_id, name: link.label } : null
				};
			}),
			total: rows.length
		};
	}
});
