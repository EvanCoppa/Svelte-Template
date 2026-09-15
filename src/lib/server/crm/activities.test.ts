import { describe, expect, it, vi } from 'vitest';
import {
	createActivity,
	deleteActivity,
	listActivities,
	logSystemActivity,
	updateActivity
} from './activities';
import { ORG_ID, supabaseMock } from './test-support';

const ACTIVITY_ID = '60000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';

describe('activities data access', () => {
	it('lists the timeline newest first by when things happened', async () => {
		const rows = [{ id: ACTIVITY_ID, type: 'call' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listActivities(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('activities');
		expect(builder.order).toHaveBeenCalledWith('occurred_at', { ascending: false });
	});

	it('filters to one record’s timeline', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listActivities(supabase, ORG_ID, {
			entity: { entityType: 'company', entityId: COMPANY_ID },
			type: 'call'
		});
		expect(builder.eq).toHaveBeenCalledWith('entity_type', 'company');
		expect(builder.eq).toHaveBeenCalledWith('entity_id', COMPANY_ID);
		expect(builder.eq).toHaveBeenCalledWith('type', 'call');
	});

	it('logs an activity against a record', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: ACTIVITY_ID } });

		await createActivity(
			supabase,
			ORG_ID,
			{ type: 'call', direction: 'outbound', body: 'Left a voicemail', duration_minutes: 2 },
			{ entityType: 'company', entityId: COMPANY_ID }
		);
		expect(builder.insert).toHaveBeenCalledWith({
			type: 'call',
			direction: 'outbound',
			body: 'Left a voicemail',
			duration_minutes: 2,
			org_id: ORG_ID,
			entity_type: 'company',
			entity_id: COMPANY_ID
		});
	});

	it('logs an org-level note with no record at all', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: ACTIVITY_ID } });

		await createActivity(supabase, ORG_ID, { type: 'note', body: 'Team standup' });
		expect(builder.insert).toHaveBeenCalledWith({
			type: 'note',
			body: 'Team standup',
			org_id: ORG_ID,
			entity_type: null,
			entity_id: null
		});
	});

	it('logs a system entry with a fixed occurred_at and no direction', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-19T12:00:00.000Z'));
		try {
			const { supabase, builder } = supabaseMock({ data: { id: ACTIVITY_ID } });

			await logSystemActivity(
				supabase,
				ORG_ID,
				{ entityType: 'deal', entityId: COMPANY_ID },
				{
					type: 'stage_changed',
					subject: 'Moved from Prospecting to Qualification',
					metadata: { from: 'a', to: 'b' }
				}
			);
			expect(builder.insert).toHaveBeenCalledWith({
				type: 'stage_changed',
				subject: 'Moved from Prospecting to Qualification',
				occurred_at: '2026-09-19T12:00:00.000Z',
				metadata: { from: 'a', to: 'b' },
				org_id: ORG_ID,
				entity_type: 'deal',
				entity_id: COMPANY_ID
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('updates scoped to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: ACTIVITY_ID } });

		await updateActivity(supabase, ORG_ID, ACTIVITY_ID, { body: 'Corrected' });
		expect(builder.update).toHaveBeenCalledWith({ body: 'Corrected' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
	});

	it('deletes scoped to org and id, throwing on zero rows', async () => {
		const filtered = supabaseMock({ data: [] });
		await expect(deleteActivity(filtered.supabase, ORG_ID, ACTIVITY_ID)).rejects.toThrow(
			'Activity was not deleted'
		);
	});
});
