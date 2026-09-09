import { describe, expect, it } from 'vitest';
import {
	createCalendarEvent,
	deleteCalendarEvent,
	getCalendarEvent,
	listCalendarEvents,
	updateCalendarEvent
} from './calendar';
import { ORG_ID, supabaseMock } from './test-support';

const EVENT_ID = 'e1000000-0000-0000-0000-000000000001';
const RANGE = { from: '2026-09-07T00:00:00.000Z', to: '2026-09-14T00:00:00.000Z' };

describe('calendar events data access', () => {
	it('lists everything overlapping the range, in start order', async () => {
		const rows = [{ id: EVENT_ID, title: 'Site visit' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listCalendarEvents(supabase, ORG_ID, RANGE)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('calendar_events');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		// Overlap, not containment: starts before the end, ends after the start.
		expect(builder.lt).toHaveBeenCalledWith('starts_at', RANGE.to);
		expect(builder.gt).toHaveBeenCalledWith('ends_at', RANGE.from);
		expect(builder.order).toHaveBeenCalledWith('starts_at', { ascending: true });
	});

	it('fetches one event, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getCalendarEvent(supabase, ORG_ID, EVENT_ID)).resolves.toBeNull();
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', EVENT_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates an event under the org without touching created_by', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: EVENT_ID } });

		const values = {
			title: 'Site visit',
			starts_at: '2026-09-08T14:00:00.000Z',
			ends_at: '2026-09-08T15:30:00.000Z',
			all_day: false,
			color: 'violet' as const,
			description: null,
			location: null,
			entity_type: null,
			entity_id: null,
			assigned_to: null
		};
		await createCalendarEvent(supabase, ORG_ID, values);
		expect(builder.insert).toHaveBeenCalledWith({ ...values, org_id: ORG_ID });
		expect(builder.single).toHaveBeenCalled();
	});

	it('updates scoped to org and id, reading the row back', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: EVENT_ID } });

		const move = { starts_at: '2026-09-09T14:00:00.000Z', ends_at: '2026-09-09T15:30:00.000Z' };
		await updateCalendarEvent(supabase, ORG_ID, EVENT_ID, move);
		expect(builder.update).toHaveBeenCalledWith(move);
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', EVENT_ID);
		expect(builder.single).toHaveBeenCalled();
	});

	it('deletes with evidence, throwing on zero rows', async () => {
		const deleted = supabaseMock({ data: [{ id: EVENT_ID }] });
		await deleteCalendarEvent(deleted.supabase, ORG_ID, EVENT_ID);
		expect(deleted.builder.delete).toHaveBeenCalled();
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteCalendarEvent(filtered.supabase, ORG_ID, EVENT_ID)).rejects.toThrow(
			'Event was not deleted'
		);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(listCalendarEvents(supabase, ORG_ID, RANGE)).rejects.toThrow('boom');
	});
});
