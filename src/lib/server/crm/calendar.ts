import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `calendar_events` — the planned blocks of time the calendar
 * page draws (the calendar migration says why an event is neither an
 * activity nor a task). Same contract as tasks.ts: the request-scoped client
 * plus the active org id, RLS deciding what exists, `created_by` filled by
 * the database.
 *
 * Both instants are stored as given and `ends_at` is exclusive, so "what is
 * on screen" is one overlap test and a drag is a change to two columns. The
 * browser decides what a local day is; nothing here does date arithmetic.
 */

export type CalendarEvent = Tables<'calendar_events'>;

type EventColumn =
	| 'entity_type'
	| 'entity_id'
	| 'title'
	| 'description'
	| 'location'
	| 'starts_at'
	| 'ends_at'
	| 'all_day'
	| 'color'
	| 'assigned_to';

/** The columns a new event is written with; the rest have defaults. */
export type CalendarEventInput = Pick<TablesInsert<'calendar_events'>, EventColumn>;

/** What an edit may set — the same columns, any subset. A drag sends two of them. */
export type CalendarEventEdit = Pick<TablesUpdate<'calendar_events'>, EventColumn>;

/** An instant range, both ends ISO strings, `to` exclusive like `ends_at`. */
export type InstantRange = { from: string; to: string };

/**
 * Every event that overlaps the range, in start order. Overlap, not
 * containment: an event that started before the window and ends inside it
 * is on screen too, which is why the two comparisons are on opposite columns.
 */
export async function listCalendarEvents(
	supabase: SupabaseClient<Database>,
	orgId: string,
	range: InstantRange
): Promise<CalendarEvent[]> {
	return unwrap(
		await supabase
			.from('calendar_events')
			.select('*')
			.eq('org_id', orgId)
			.lt('starts_at', range.to)
			.gt('ends_at', range.from)
			.order('starts_at', { ascending: true })
			.order('ends_at', { ascending: true })
	);
}

export async function getCalendarEvent(
	supabase: SupabaseClient<Database>,
	orgId: string,
	eventId: string
): Promise<CalendarEvent | null> {
	return unwrap(
		await supabase
			.from('calendar_events')
			.select('*')
			.eq('org_id', orgId)
			.eq('id', eventId)
			.maybeSingle()
	);
}

export async function createCalendarEvent(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: CalendarEventInput
): Promise<CalendarEvent> {
	return unwrap(
		await supabase
			.from('calendar_events')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

/**
 * Applies an edit. A row RLS hides comes back as zero rows, and `.single()`
 * turns that into the thrown error every other module's refusals arrive as.
 */
export async function updateCalendarEvent(
	supabase: SupabaseClient<Database>,
	orgId: string,
	eventId: string,
	values: CalendarEventEdit
): Promise<CalendarEvent> {
	return unwrap(
		await supabase
			.from('calendar_events')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', eventId)
			.select()
			.single()
	);
}

export async function deleteCalendarEvent(
	supabase: SupabaseClient<Database>,
	orgId: string,
	eventId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('calendar_events')
			.delete()
			.eq('org_id', orgId)
			.eq('id', eventId)
			.select('id'),
		'Event'
	);
}
