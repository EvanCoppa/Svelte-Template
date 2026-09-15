import { describe, expect, it } from 'vitest';
import {
	createDeal,
	dealPlacement,
	deleteDeal,
	getDeal,
	listDeals,
	moveDeal,
	updateDeal
} from './deals';
import { ORG_ID, supabaseMock, supabaseMockSequence } from './test-support';

const DEAL_ID = '40000000-0000-0000-0000-000000000001';
const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const STAGE_ID = '50000000-0000-0000-0000-000000000001';
const OTHER_STAGE_ID = '50000000-0000-0000-0000-000000000002';
const PIPELINE_ID = '51000000-0000-0000-0000-000000000001';
const MEMBER_A = '70000000-0000-0000-0000-000000000001';
const MEMBER_B = '70000000-0000-0000-0000-000000000002';

describe('deals data access', () => {
	it('lists deals with both parties and their stage, newest first', async () => {
		const rows = [{ id: DEAL_ID, title: 'Annual support contract' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listDeals(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('deals');
		expect(builder.select).toHaveBeenCalledWith(
			'*, companies(id, name), contacts(id, name), pipeline_stages!inner(id, name, outcome, sort_order)'
		);
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
	});

	it('filters by party and board position only when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listDeals(supabase, ORG_ID, { companyId: COMPANY_ID, stageId: STAGE_ID });
		expect(builder.eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
		expect(builder.eq).toHaveBeenCalledWith('stage_id', STAGE_ID);
	});

	it('fetches one deal with its parties, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getDeal(supabase, ORG_ID, DEAL_ID)).resolves.toBeNull();
		expect(builder.select).toHaveBeenCalledWith(
			'*, companies(id, name), contacts(id, name), pipeline_stages!inner(id, name, outcome, sort_order)'
		);
		expect(builder.eq).toHaveBeenCalledWith('id', DEAL_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('places an unplaced deal in the org’s default board, at the first stage', async () => {
		const board = {
			id: PIPELINE_ID,
			is_default: true,
			pipeline_stages: [
				{ id: STAGE_ID, name: 'Lead', sort_order: 10 },
				{ id: 'later', name: 'Qualified', sort_order: 20 }
			]
		};
		const { supabase, builder } = supabaseMockSequence([
			{ data: board },
			{ data: { id: DEAL_ID } }
		]);

		await createDeal(supabase, ORG_ID, {
			company_id: COMPANY_ID,
			contact_id: CONTACT_ID,
			title: 'Renewal',
			amount: 24000
		});
		expect(builder.insert).toHaveBeenCalledWith({
			company_id: COMPANY_ID,
			contact_id: CONTACT_ID,
			title: 'Renewal',
			amount: 24000,
			pipeline_id: PIPELINE_ID,
			stage_id: STAGE_ID,
			org_id: ORG_ID
		});
	});

	it('takes an explicit placement as given, without looking a board up', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: DEAL_ID } });

		await createDeal(supabase, ORG_ID, {
			title: 'Private security retainer',
			pipeline_id: PIPELINE_ID,
			stage_id: STAGE_ID
		});
		expect(from).toHaveBeenCalledTimes(1);
		expect(builder.insert).toHaveBeenCalledWith({
			title: 'Private security retainer',
			pipeline_id: PIPELINE_ID,
			stage_id: STAGE_ID,
			org_id: ORG_ID
		});
	});

	it('refuses to create a deal when the org has no default board', async () => {
		const { supabase } = supabaseMockSequence([{ data: null }]);

		await expect(createDeal(supabase, ORG_ID, { title: 'Orphan' })).rejects.toThrow(
			'no default pipeline'
		);
	});

	it('moves a deal across the board scoped to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: DEAL_ID } });

		await updateDeal(supabase, ORG_ID, DEAL_ID, { stage_id: STAGE_ID });
		expect(builder.update).toHaveBeenCalledWith({ stage_id: STAGE_ID });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', DEAL_ID);
	});

	it('reads nothing extra for an edit that touches neither the stage nor the owner', async () => {
		const { supabase, from } = supabaseMock({ data: { id: DEAL_ID } });

		await updateDeal(supabase, ORG_ID, DEAL_ID, { title: 'Renewal — take two' });
		// The one query the write always needed, and nothing to compare against.
		expect(from).toHaveBeenCalledTimes(1);
	});

	it('logs a system activity when a deal changes stage, naming both stages', async () => {
		const before = {
			id: DEAL_ID,
			stage_id: STAGE_ID,
			assigned_to: null,
			pipeline_stages: { name: 'Prospecting' }
		};
		const after = { id: DEAL_ID, stage_id: OTHER_STAGE_ID, assigned_to: null };
		const { supabase, builder } = supabaseMockSequence([
			{ data: before },
			{ data: after },
			{ data: { name: 'Qualification' } },
			{ data: { id: 'activity-1' } }
		]);

		await updateDeal(supabase, ORG_ID, DEAL_ID, { stage_id: OTHER_STAGE_ID });

		expect(builder.update).toHaveBeenCalledWith({ stage_id: OTHER_STAGE_ID });
		expect(builder.insert).toHaveBeenCalledWith({
			type: 'stage_changed',
			subject: 'Moved from Prospecting to Qualification',
			occurred_at: expect.any(String),
			metadata: { from: STAGE_ID, to: OTHER_STAGE_ID },
			org_id: ORG_ID,
			entity_type: 'deal',
			entity_id: DEAL_ID
		});
	});

	it('logs a system activity when a deal is reassigned, naming both members', async () => {
		const before = {
			id: DEAL_ID,
			stage_id: STAGE_ID,
			assigned_to: MEMBER_A,
			pipeline_stages: { name: 'Prospecting' }
		};
		const after = { id: DEAL_ID, stage_id: STAGE_ID, assigned_to: MEMBER_B };
		const profiles = [
			{ id: MEMBER_A, display_name: 'Alice', email: null },
			{ id: MEMBER_B, display_name: 'Bob', email: null }
		];
		const { supabase, builder } = supabaseMockSequence([
			{ data: before },
			{ data: after },
			{ data: profiles },
			{ data: { id: 'activity-1' } }
		]);

		await updateDeal(supabase, ORG_ID, DEAL_ID, { assigned_to: MEMBER_B });

		expect(builder.insert).toHaveBeenCalledWith({
			type: 'owner_changed',
			subject: 'Reassigned from Alice to Bob',
			occurred_at: expect.any(String),
			metadata: { from: MEMBER_A, to: MEMBER_B },
			org_id: ORG_ID,
			entity_type: 'deal',
			entity_id: DEAL_ID
		});
	});

	it('never logs a stage or owner activity that is never edited', async () => {
		const before = {
			id: DEAL_ID,
			stage_id: STAGE_ID,
			assigned_to: MEMBER_A,
			pipeline_stages: { name: 'Prospecting' }
		};
		const after = { id: DEAL_ID, stage_id: STAGE_ID, assigned_to: MEMBER_A };
		const { supabase, builder } = supabaseMockSequence([{ data: before }, { data: after }]);

		// stage_id is present but unchanged — still a tracked-column edit (the
		// caller re-posted the same value), but nothing to say about it.
		await updateDeal(supabase, ORG_ID, DEAL_ID, { stage_id: STAGE_ID });

		expect(builder.insert).not.toHaveBeenCalled();
	});

	it('writes the board with the stage when a card is dropped on one', async () => {
		// The board is never taken from the browser: the stage names it, which is
		// also what proves the stage is this org's — `listPipelines` reads through
		// RLS, so a forged id is simply not in the list.
		const boards = [
			{
				id: PIPELINE_ID,
				pipeline_stages: [{ id: STAGE_ID }, { id: 'other' }]
			}
		];
		const { supabase, builder } = supabaseMockSequence([
			{ data: boards },
			{ data: { id: DEAL_ID } }
		]);

		await moveDeal(supabase, ORG_ID, DEAL_ID, STAGE_ID);
		expect(builder.update).toHaveBeenCalledWith({
			pipeline_id: PIPELINE_ID,
			stage_id: STAGE_ID
		});
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', DEAL_ID);
	});

	it('refuses a stage that is on no board of this org, writing nothing', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: [{ id: PIPELINE_ID, pipeline_stages: [{ id: 'elsewhere' }] }] }
		]);

		await expect(dealPlacement(supabase, ORG_ID, STAGE_ID)).rejects.toThrow('not on any board');
		await expect(moveDeal(supabase, ORG_ID, DEAL_ID, STAGE_ID)).rejects.toThrow('not on any board');
		expect(builder.update).not.toHaveBeenCalled();
	});

	it('deletes scoped to org and id, with evidence, throwing on zero rows', async () => {
		const deleted = supabaseMock({ data: [{ id: DEAL_ID }] });
		await deleteDeal(deleted.supabase, ORG_ID, DEAL_ID);
		expect(deleted.builder.delete).toHaveBeenCalled();
		expect(deleted.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(deleted.builder.eq).toHaveBeenCalledWith('id', DEAL_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteDeal(filtered.supabase, ORG_ID, DEAL_ID)).rejects.toThrow(
			'Deal was not deleted'
		);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(listDeals(supabase, ORG_ID)).rejects.toThrow('boom');
	});
});
