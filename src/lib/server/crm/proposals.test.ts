import { describe, expect, it } from 'vitest';
import {
	createProposal,
	deleteProposal,
	getProposal,
	listProposals,
	proposalParentKind,
	updateProposal
} from './proposals';
import { ORG_ID, supabaseMock } from './test-support';

const PROPOSAL_ID = 'a1000000-0000-0000-0000-000000000001';
const DEAL_ID = '40000000-0000-0000-0000-000000000001';
const OPTIONS =
	'*, proposal_options!proposal_options_proposal_id_org_id_fkey(id, label, sort_order, is_recommended, computed_total, currency)';

describe('proposals data access', () => {
	it('lists proposals with their options, newest first, options in their own order', async () => {
		const rows = [{ id: PROPOSAL_ID, title: 'Annual support contract — options' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listProposals(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('proposals');
		// The embed names its foreign key: two keys run between the tables.
		expect(builder.select).toHaveBeenCalledWith(OPTIONS);
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
		expect(builder.order).toHaveBeenCalledWith('sort_order', {
			referencedTable: 'proposal_options'
		});
	});

	it('filters by the record a proposal hangs off, and by status, only when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listProposals(supabase, ORG_ID, {
			entity: { entityType: 'deal', entityId: DEAL_ID },
			status: 'sent'
		});
		expect(builder.eq).toHaveBeenCalledWith('entity_type', 'deal');
		expect(builder.eq).toHaveBeenCalledWith('entity_id', DEAL_ID);
		expect(builder.eq).toHaveBeenCalledWith('status', 'sent');

		const bare = supabaseMock({ data: [] });
		await listProposals(bare.supabase, ORG_ID);
		expect(bare.builder.eq).toHaveBeenCalledTimes(1);
	});

	it('fetches one proposal with its options, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getProposal(supabase, ORG_ID, PROPOSAL_ID)).resolves.toBeNull();
		expect(builder.select).toHaveBeenCalledWith(OPTIONS);
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', PROPOSAL_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a proposal in the org, attached or not', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: PROPOSAL_ID } });

		await createProposal(supabase, ORG_ID, { title: 'Crown and whitening', valid_until: null });
		expect(builder.insert).toHaveBeenCalledWith({
			title: 'Crown and whitening',
			valid_until: null,
			org_id: ORG_ID
		});
		expect(builder.single).toHaveBeenCalled();
	});

	it('updates scoped to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: PROPOSAL_ID } });

		await updateProposal(supabase, ORG_ID, PROPOSAL_ID, { status: 'sent' });
		expect(builder.update).toHaveBeenCalledWith({ status: 'sent' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', PROPOSAL_ID);
	});

	it('deletes scoped to org and id, with evidence, throwing on zero rows', async () => {
		const deleted = supabaseMock({ data: [{ id: PROPOSAL_ID }] });
		await deleteProposal(deleted.supabase, ORG_ID, PROPOSAL_ID);
		expect(deleted.builder.delete).toHaveBeenCalled();
		expect(deleted.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(deleted.builder.eq).toHaveBeenCalledWith('id', PROPOSAL_ID);
		expect(deleted.builder.select).toHaveBeenCalledWith('id');

		const filtered = supabaseMock({ data: [] });
		await expect(deleteProposal(filtered.supabase, ORG_ID, PROPOSAL_ID)).rejects.toThrow(
			'Proposal was not deleted'
		);
	});

	it('throws the PostgREST message when a query fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(listProposals(supabase, ORG_ID)).rejects.toThrow('boom');
	});
});

describe('proposalParentKind', () => {
	it('narrows the shared entity type to the kinds a proposal may hang off', () => {
		expect(proposalParentKind('company')).toBe('company');
		expect(proposalParentKind('contact')).toBe('contact');
		expect(proposalParentKind('deal')).toBe('deal');
	});

	it('refuses every other kind, and nothing at all', () => {
		expect(proposalParentKind('product')).toBeNull();
		expect(proposalParentKind('proposal_option')).toBeNull();
		expect(proposalParentKind(null)).toBeNull();
	});
});
