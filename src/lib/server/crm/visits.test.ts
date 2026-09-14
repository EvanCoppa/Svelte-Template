import { describe, expect, it } from 'vitest';
import {
	createVisit,
	deleteVisit,
	getVisit,
	listVisitOutcomes,
	listVisits,
	updateVisit
} from './visits';
import { ORG_ID, supabaseMock } from './test-support';

const VISIT_ID = 'f5000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const OUTCOME_ID = 'f6000000-0000-0000-0000-000000000001';

describe('visits data access', () => {
	it('lists the org’s visits with their outcome, unplanned ones first', async () => {
		const rows = [{ id: VISIT_ID, entity_type: 'company', entity_id: COMPANY_ID }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listVisits(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('visits');
		expect(builder.select).toHaveBeenCalledWith('*, visit_outcomes(id, name, result, tone)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		// Nulls first: a visit with no occurrence is one still to be made.
		expect(builder.order).toHaveBeenCalledWith('occurred_at', {
			ascending: false,
			nullsFirst: true
		});
	});

	it('filters to one record’s own history, and to what is still on the plan', async () => {
		const byRecord = supabaseMock({ data: [] });
		await listVisits(byRecord.supabase, ORG_ID, { entityType: 'company', entityId: COMPANY_ID });
		expect(byRecord.builder.eq).toHaveBeenCalledWith('entity_type', 'company');
		expect(byRecord.builder.eq).toHaveBeenCalledWith('entity_id', COMPANY_ID);

		const planned = supabaseMock({ data: [] });
		await listVisits(planned.supabase, ORG_ID, { plannedOnly: true });
		expect(planned.builder.eq).toHaveBeenCalledWith('status', 'planned');

		const named = supabaseMock({ data: [] });
		await listVisits(named.supabase, ORG_ID, { ids: [VISIT_ID] });
		expect(named.builder.in).toHaveBeenCalledWith('id', [VISIT_ID]);
	});

	it('fetches one visit, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getVisit(supabase, ORG_ID, VISIT_ID)).resolves.toBeNull();
		expect(builder.eq).toHaveBeenCalledWith('id', VISIT_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a visit against the record it was to', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: VISIT_ID } });

		await createVisit(supabase, ORG_ID, {
			entity_type: 'company',
			entity_id: COMPANY_ID,
			status: 'completed',
			notes: 'Left a sample'
		});
		expect(builder.insert).toHaveBeenCalledWith({
			entity_type: 'company',
			entity_id: COMPANY_ID,
			status: 'completed',
			notes: 'Left a sample',
			org_id: ORG_ID
		});
		expect(builder.single).toHaveBeenCalled();
	});

	it('updates and deletes scoped to org and id, with evidence for the delete', async () => {
		const updated = supabaseMock({ data: { id: VISIT_ID } });
		await updateVisit(updated.supabase, ORG_ID, VISIT_ID, { outcome_id: OUTCOME_ID });
		expect(updated.builder.update).toHaveBeenCalledWith({ outcome_id: OUTCOME_ID });
		expect(updated.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(updated.builder.eq).toHaveBeenCalledWith('id', VISIT_ID);

		const deleted = supabaseMock({ data: [{ id: VISIT_ID }] });
		await deleteVisit(deleted.supabase, ORG_ID, VISIT_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteVisit(filtered.supabase, ORG_ID, VISIT_ID)).rejects.toThrow(
			'Visit was not deleted'
		);
	});

	it('lists the org’s outcomes in its own order', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [{ id: OUTCOME_ID }] });

		await listVisitOutcomes(supabase, ORG_ID);
		expect(from).toHaveBeenCalledWith('visit_outcomes');
		expect(builder.order).toHaveBeenCalledWith('sort_order', { ascending: true });
	});
});
