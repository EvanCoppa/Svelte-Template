import { describe, expect, it } from 'vitest';
import { supabaseMock, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { AssistantToolContext } from '../context';
import { orgContext, toolContext, ORG_ID, USER_ID } from '../test-support';
import { createEvent, createEventInputSchema } from './create-event';
import { deleteEvent } from './delete-event';
import { updateEvent } from './update-event';

/**
 * Booking, changing and cancelling time. An event is neither an activity nor
 * a task (docs/calendar.md): both instants are stored as given, `ends_at` is
 * exclusive, and `all_day` says how to draw one rather than how to store it —
 * so these tools pass instants through and never do date arithmetic.
 */

const EVENT_ID = '60000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const DANA_ID = '00000000-0000-0000-0000-0000000000d1';

/** A tool's result. None of these tools stream, so the SDK's iterable form never arrives. */
function settled<T>(result: T | AsyncIterable<T>): T {
	// SAFETY: every tool here returns its object from `execute`; the streaming form is never used.
	return result as T;
}

const options = (context: AssistantToolContext) => ({
	toolCallId: 'call-1',
	messages: [],
	abortSignal: new AbortController().signal,
	context
});

const STAMPS = { created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-01T09:00:00Z' };

/** The row as the table holds it: two instants, the end exclusive. */
const booking = {
	id: EVENT_ID,
	org_id: ORG_ID,
	title: 'Consultation',
	description: null,
	location: null,
	starts_at: '2026-09-15T14:00:00.000Z',
	ends_at: '2026-09-15T15:00:00.000Z',
	all_day: false,
	color: 'info',
	assigned_to: null,
	entity_type: null,
	entity_id: null,
	created_by: USER_ID,
	...STAMPS
};

/** The three term rows `loadVocabulary()` insists on. */
const terms = ['proposal_presenter', 'proposal_responsible', 'graph_member'].map((id) => ({
	id,
	label: id,
	industry_terms: []
}));

const lucius = {
	id: CONTACT_ID,
	org_id: ORG_ID,
	company_id: null,
	name: 'Lucius Fox',
	email: null,
	phone: null,
	title: null,
	is_primary: false,
	status: 'active',
	companies: null,
	created_by: USER_ID,
	...STAMPS
};

/** A tool context over the table double — describing an event reads several tables. */
function tablesContext(
	results: Parameters<typeof supabaseTablesMock>[0],
	org = orgContext()
): AssistantToolContext & { db: ReturnType<typeof supabaseTablesMock> } {
	const db = supabaseTablesMock(results);
	return { supabase: db.supabase, orgId: ORG_ID, userId: USER_ID, org, db };
}

describe('createEvent', () => {
	it('books the block, assigns the colleague and points it at the record', async () => {
		const row = {
			...booking,
			assigned_to: DANA_ID,
			entity_type: 'contact',
			entity_id: CONTACT_ID
		};
		const context = tablesContext({
			calendar_events: { data: row },
			terms: { data: terms },
			contacts: { data: lucius },
			profiles: { data: [{ id: DANA_ID, display_name: 'Dana Reyes', email: null }] }
		});

		const result = settled(
			await createEvent.execute!(
				{
					title: 'Consultation',
					startsAt: '2026-09-15T14:00:00.000Z',
					endsAt: '2026-09-15T15:00:00.000Z',
					assignedTo: DANA_ID,
					about: { kind: 'contact', id: CONTACT_ID }
				},
				options(context)
			)
		);

		expect(context.db.builders.calendar_events.insert).toHaveBeenCalledWith({
			title: 'Consultation',
			// Passed through as given: the browser decides what a local day is,
			// and nothing here does date arithmetic.
			starts_at: '2026-09-15T14:00:00.000Z',
			ends_at: '2026-09-15T15:00:00.000Z',
			all_day: false,
			location: null,
			description: null,
			// Who it is booked FOR…
			assigned_to: DANA_ID,
			// …and what it is ABOUT. Two different links.
			entity_type: 'contact',
			entity_id: CONTACT_ID,
			org_id: ORG_ID
		});
		expect(result.event).toMatchObject({
			id: EVENT_ID,
			title: 'Consultation',
			endsAt: '2026-09-15T15:00:00.000Z',
			assignedTo: 'Dana Reyes',
			about: { kind: 'contact', id: CONTACT_ID, name: 'Lucius Fox' }
		});
	});

	it('leaves the colour to the column when nobody asked for one', async () => {
		const context = tablesContext({ calendar_events: { data: booking }, terms: { data: terms } });

		await createEvent.execute!(
			{
				title: 'Consultation',
				startsAt: '2026-09-15T14:00:00.000Z',
				endsAt: '2026-09-15T15:00:00.000Z'
			},
			options(context)
		);

		const [values] = context.db.builders.calendar_events.insert.mock.calls[0];
		expect(values).not.toHaveProperty('color');
	});

	it('refuses to book against a record the caller may not open', async () => {
		// The page's `refusesRecord`: an event about something out of reach is
		// one they could never follow, and letting the insert answer would say
		// whether that id exists.
		const context = toolContext(orgContext({ role: 'member', grants: { calendar: 'manage' } }));

		await expect(
			createEvent.execute!(
				{
					title: 'Consultation',
					startsAt: '2026-09-15T14:00:00.000Z',
					endsAt: '2026-09-15T15:00:00.000Z',
					about: { kind: 'contact', id: CONTACT_ID }
				},
				options(context)
			)
		).rejects.toThrow(/does not allow "read" on contact/);
		expect(context.mock.from).not.toHaveBeenCalled();
	});

	it('refuses a block that ends before it starts, in the schema the model reads', () => {
		const ends = createEventInputSchema.safeParse({
			title: 'Consultation',
			startsAt: '2026-09-15T15:00:00.000Z',
			endsAt: '2026-09-15T14:00:00.000Z'
		});
		expect(ends.success).toBe(false);
		expect(ends.error?.issues[0]?.message).toBe('The event has to end after it starts.');
		// Zero length is not a block either: the end is exclusive.
		expect(
			createEventInputSchema.safeParse({
				title: 'Consultation',
				startsAt: '2026-09-15T14:00:00.000Z',
				endsAt: '2026-09-15T14:00:00.000Z'
			}).success
		).toBe(false);
	});

	it('refuses a caller who may only read the calendar', async () => {
		const context = toolContext(orgContext({ role: 'member', grants: { calendar: 'read' } }));

		await expect(
			createEvent.execute!(
				{
					title: 'Consultation',
					startsAt: '2026-09-15T14:00:00.000Z',
					endsAt: '2026-09-15T15:00:00.000Z'
				},
				options(context)
			)
		).rejects.toThrow(/does not allow "manage" on calendar/);
		expect(context.mock.from).not.toHaveBeenCalled();
	});
});

describe('updateEvent', () => {
	it('writes only what was named, so a move cannot overwrite a title', async () => {
		const context = tablesContext({
			calendar_events: { data: { ...booking, starts_at: '2026-09-15T16:00:00.000Z' } },
			terms: { data: terms }
		});

		await updateEvent.execute!(
			{
				eventId: EVENT_ID,
				startsAt: '2026-09-15T16:00:00.000Z',
				endsAt: '2026-09-15T17:00:00.000Z'
			},
			options(context)
		);

		expect(context.db.builders.calendar_events.update).toHaveBeenCalledWith({
			starts_at: '2026-09-15T16:00:00.000Z',
			ends_at: '2026-09-15T17:00:00.000Z'
		});
	});

	it('clears a field with null and leaves out one nobody named', async () => {
		const context = tablesContext({
			calendar_events: { data: { ...booking, assigned_to: null } },
			terms: { data: terms }
		});

		await updateEvent.execute!(
			{ eventId: EVENT_ID, assignedTo: null, location: null },
			options(context)
		);

		expect(context.db.builders.calendar_events.update).toHaveBeenCalledWith({
			assigned_to: null,
			location: null
		});
	});

	it('takes the record link off as a pair, because it is one fact in two columns', async () => {
		const context = tablesContext({
			calendar_events: { data: booking },
			terms: { data: terms }
		});

		await updateEvent.execute!({ eventId: EVENT_ID, about: null }, options(context));

		expect(context.db.builders.calendar_events.update).toHaveBeenCalledWith({
			entity_type: null,
			entity_id: null
		});
	});

	it('checks the order against what the row will say, not against what the call named', async () => {
		// Only the start moves, past the end the event already has.
		const context = tablesContext({ calendar_events: { data: booking }, terms: { data: terms } });

		await expect(
			updateEvent.execute!(
				{ eventId: EVENT_ID, startsAt: '2026-09-15T18:00:00.000Z' },
				options(context)
			)
		).rejects.toThrow('The event has to end after it starts.');
		expect(context.db.builders.calendar_events.update).not.toHaveBeenCalled();
	});

	it('refuses an event that is not there, and a call that changes nothing', async () => {
		const missing = tablesContext({ calendar_events: { data: null }, terms: { data: terms } });
		await expect(
			updateEvent.execute!({ eventId: EVENT_ID, title: 'Anything' }, options(missing))
		).rejects.toThrow(/no event with id/);

		const nothing = tablesContext({ calendar_events: { data: booking }, terms: { data: terms } });
		await expect(updateEvent.execute!({ eventId: EVENT_ID }, options(nothing))).rejects.toThrow(
			/at least one thing to change/
		);
		expect(nothing.db.builders.calendar_events.update).not.toHaveBeenCalled();
	});
});

describe('deleteEvent', () => {
	it('cancels the booking and reports the id back', async () => {
		const context = toolContext(orgContext(), { data: [{ id: EVENT_ID }] });

		const result = await deleteEvent.execute!(
			{ eventId: EVENT_ID, title: 'Consultation' },
			options(context)
		);

		expect(context.mock.builder.delete).toHaveBeenCalled();
		expect(result).toEqual({ deleted: true, eventId: EVENT_ID });
	});

	it('surfaces a delete RLS filtered away as an error, not a success', async () => {
		const { supabase } = supabaseMock({ data: [] });
		const context: AssistantToolContext = {
			supabase,
			orgId: ORG_ID,
			userId: USER_ID,
			org: orgContext()
		};

		await expect(
			deleteEvent.execute!({ eventId: EVENT_ID, title: 'Consultation' }, options(context))
		).rejects.toThrow('Event was not deleted');
	});

	it('takes the delete grant, not manage: managing the calendar does not empty it', async () => {
		const context = toolContext(orgContext({ role: 'member', grants: { calendar: 'manage' } }));

		await expect(
			deleteEvent.execute!({ eventId: EVENT_ID, title: 'Consultation' }, options(context))
		).rejects.toThrow(/does not allow "delete" on calendar/);
		expect(context.mock.from).not.toHaveBeenCalled();
	});
});
