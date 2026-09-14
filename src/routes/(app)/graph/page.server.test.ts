import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GraphNode } from '$lib/crm/graph';
import type { Database } from '$lib/database.types';
import type { FeatureMap } from '$lib/features/types';
import { ORG_ID, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { load } from './+page.server';

/**
 * The graph page from the outside: what the load folds for whom, and how
 * `?focus=` is honoured only for a record that is on the map.
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };

const WAYNE_ID = '20000000-0000-0000-0000-000000000001';
const STARK_ID = '20000000-0000-0000-0000-000000000002';
const PARENT_OF = 'f0000000-0000-0000-0000-000000000005';

/** The term registry `loadVocabulary()` folds; the load only passes the words through. */
const TERMS = {
	data: [
		{ id: 'proposal_presenter', label: 'Presenter', industry_terms: [] },
		{ id: 'proposal_responsible', label: 'Responsible', industry_terms: [] },
		{ id: 'graph_member', label: 'Staff', industry_terms: [] }
	]
};

/** Companies enabled and named the industry's way, so the map has a kind to draw. */
const FEATURES: FeatureMap = {
	companies: {
		mode: 'enabled',
		// SAFETY: the gate reads `id` and `route`, the terms `name` and `noun`; the rest is never touched.
		feature: { id: 'companies', route: '/companies', name: 'Merchants', noun: 'merchant' } as never
	}
};

const parentOf = {
	id: PARENT_OF,
	org_id: null,
	key: 'parent_of',
	forward_label: 'parent company of',
	inverse_label: 'subsidiary of',
	source_type: 'company',
	target_type: 'company',
	is_system: true,
	created_at: '',
	updated_at: ''
};

const wayneOwnsStark = {
	id: 'f2000000-0000-0000-0000-000000000009',
	org_id: ORG_ID,
	relationship_type_id: PARENT_OF,
	from_type: 'company',
	from_id: WAYNE_ID,
	to_type: 'company',
	to_id: STARK_ID,
	started_on: null,
	ended_on: null,
	notes: null,
	created_by: null,
	created_at: '',
	updated_at: '',
	relationship_types: parentOf
};

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the load reads `supabase`, `activeOrgId`, `org.access`,
	// `org.features` and `org.activeOrg.industryId`; the rest of App.Locals is
	// never touched.
	return {
		supabase,
		activeOrgId: ORG_ID,
		org: { access, features: FEATURES, activeOrg: { industryId: 'crm' } }
	} as never;
}

async function runLoad(supabase: SupabaseClient<Database>, search = '') {
	// SAFETY: the load reads `locals` and `url`; nothing else on the event.
	const data = await load({
		locals: localsFor(supabase, OWNER),
		url: new URL(`https://app.test/graph${search}`)
	} as never);
	if (!data) throw new Error('expected data');
	return data;
}

const wayne = {
	id: WAYNE_ID,
	name: 'Wayne Enterprises',
	status: 'active',
	relationship: 'customer',
	contacts: []
};

/**
 * The org's records, the way each kind's list module reads them. Only
 * companies have any; every other table answers the empty list a real
 * select would, so the map is the two companies and the row between them.
 */
function mock() {
	return supabaseTablesMock({
		terms: TERMS,
		relationships: { data: [wayneOwnsStark] },
		companies: { data: [wayne, { ...wayne, id: STARK_ID, name: 'Stark Industries' }] },
		assets: { data: [] },
		billables: { data: [] },
		contacts: { data: [] },
		products: { data: [] },
		deals: { data: [] },
		proposals: { data: [] },
		relationship_types: { data: [] },
		invoices: { data: [] },
		tasks: { data: [] },
		support_tickets: { data: [] }
	});
}

describe('the graph load', () => {
	it("describes the map in the industry's words and opens on the whole of it", async () => {
		const data = await runLoad(mock().supabase);

		expect(data.graph.nodes.map((node: GraphNode) => node.id)).toEqual([
			`company:${WAYNE_ID}`,
			`company:${STARK_ID}`
		]);
		expect(data.graph.edges).toHaveLength(1);
		expect(data.graph.kinds).toEqual([{ kind: 'company', label: 'Merchants', count: 2 }]);
		expect(data.focus).toBeNull();
	});

	it('focuses a record that is on the map, and ignores one that is not', async () => {
		const found = await runLoad(mock().supabase, `?focus=company:${STARK_ID}`);
		expect(found.focus).toBe(`company:${STARK_ID}`);

		const missing = await runLoad(mock().supabase, '?focus=contact:nobody');
		expect(missing.focus).toBeNull();
	});
});
