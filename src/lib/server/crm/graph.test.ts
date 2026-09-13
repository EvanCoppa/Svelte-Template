import { describe, expect, it } from 'vitest';
import type { RecordKind } from '$lib/crm/records';
import type { TermsMap } from '$lib/features/terms';
import { describeGraph } from './graph';
import type { RelationshipWithType } from './relationships';
import { ORG_ID, supabaseTablesMock } from './test-support';

/**
 * The whole graph, folded: which records become nodes (every one of a kind
 * the reader may open, related or not, named as the record page would name
 * them), which rows become edges, and the legend — each kind in the
 * industry's words, each type by its label, with its count.
 */

const WAYNE_ID = '20000000-0000-0000-0000-000000000001';
const STARK_ID = '20000000-0000-0000-0000-000000000002';
const TRUCK_ID = 'f1000000-0000-0000-0000-000000000002';
const DEV_ID = '00000000-0000-0000-0000-000000000001';
const OWNS = 'f0000000-0000-0000-0000-000000000011';
const ASSIGNED_TO = 'f0000000-0000-0000-0000-000000000012';

const owns = {
	id: OWNS,
	org_id: null,
	key: 'owns',
	forward_label: 'owns',
	inverse_label: 'owned by',
	source_type: null,
	target_type: 'asset' as const,
	is_system: true,
	created_at: '2026-09-01T09:00:00Z',
	updated_at: '2026-09-01T09:00:00Z'
};
const assignedTo = {
	...owns,
	id: ASSIGNED_TO,
	key: 'assigned_to',
	forward_label: 'assigned to',
	inverse_label: 'holds',
	source_type: 'asset' as const,
	target_type: null
};

const wayneOwnsTruck: RelationshipWithType = {
	id: 'f2000000-0000-0000-0000-000000000002',
	org_id: ORG_ID,
	relationship_type_id: OWNS,
	from_type: 'company',
	from_id: WAYNE_ID,
	to_type: 'asset',
	to_id: TRUCK_ID,
	started_on: '2024-06-01',
	ended_on: null,
	notes: null,
	created_by: DEV_ID,
	created_at: '2026-09-01T09:00:00Z',
	updated_at: '2026-09-01T09:00:00Z',
	relationship_types: owns
};
const truckAssignedToDev: RelationshipWithType = {
	...wayneOwnsTruck,
	id: 'f2000000-0000-0000-0000-000000000001',
	relationship_type_id: ASSIGNED_TO,
	from_type: 'asset',
	from_id: TRUCK_ID,
	to_type: 'member',
	to_id: DEV_ID,
	ended_on: '2026-03-01',
	relationship_types: assignedTo
};

const wayneRow = {
	id: WAYNE_ID,
	name: 'Wayne Enterprises',
	status: 'active',
	relationship: 'customer',
	contacts: []
};
/** A company in no relationship at all: a dot of its own on the map. */
const starkRow = { ...wayneRow, id: STARK_ID, name: 'Stark Industries' };
const truckRow = {
	id: TRUCK_ID,
	org_id: ORG_ID,
	name: 'Box truck',
	asset_type: 'vehicle',
	identifier: 'FL-01',
	status: 'active',
	description: null,
	acquired_on: '2024-06-01',
	disposed_on: null,
	purchase_price: 48500,
	currency: 'USD',
	created_by: DEV_ID,
	created_at: '2026-09-01T09:00:00Z',
	updated_at: '2026-09-01T09:00:00Z'
};
const devRow = { id: DEV_ID, display_name: 'Dev User', email: 'dev@example.com' };

const vocabulary = {
	proposal_presenter: 'Presenter',
	proposal_responsible: 'Responsible',
	graph_member: 'Crew'
};
/** The industry's words, the way the (app) layout ships them. */
const terms: TermsMap = {
	companies: { name: 'Merchants', noun: 'merchant' },
	assets: { name: 'Terminals', noun: 'terminal' }
};

/** The two kinds this org's reader may open; the rest are never fetched. */
const canOpen = (kind: RecordKind) => kind === 'company' || kind === 'asset';

function mock() {
	return supabaseTablesMock({
		relationships: { data: [wayneOwnsTruck, truckAssignedToDev] },
		companies: { data: [wayneRow, starkRow] },
		assets: { data: [truckRow] },
		profiles: { data: [devRow] }
	});
}

describe('describeGraph', () => {
	it('draws every record of every kind the reader may open, related or not', async () => {
		const { supabase } = mock();

		const graph = await describeGraph(supabase, ORG_ID, canOpen, vocabulary, terms);

		// In the order the kinds are registered, members last; Stark stands in
		// no relationship and is on the map all the same.
		expect(graph.nodes).toEqual([
			{ id: `asset:${TRUCK_ID}`, kind: 'asset', name: 'Box truck', href: `/assets/${TRUCK_ID}` },
			{
				id: `company:${WAYNE_ID}`,
				kind: 'company',
				name: 'Wayne Enterprises',
				href: `/companies/${WAYNE_ID}`
			},
			{
				id: `company:${STARK_ID}`,
				kind: 'company',
				name: 'Stark Industries',
				href: `/companies/${STARK_ID}`
			},
			{ id: `member:${DEV_ID}`, kind: 'member', name: 'Dev User', href: null }
		]);
		expect(graph.edges).toEqual([
			{
				id: wayneOwnsTruck.id,
				source: `company:${WAYNE_ID}`,
				target: `asset:${TRUCK_ID}`,
				typeId: OWNS,
				label: 'owns',
				inverseLabel: 'owned by',
				ended: false
			},
			{
				id: truckAssignedToDev.id,
				source: `asset:${TRUCK_ID}`,
				target: `member:${DEV_ID}`,
				typeId: ASSIGNED_TO,
				label: 'assigned to',
				inverseLabel: 'holds',
				ended: true
			}
		]);
	});

	it("names the legend in the industry's words, by the record kinds' order with members last", async () => {
		const { supabase } = mock();

		const graph = await describeGraph(supabase, ORG_ID, canOpen, vocabulary, terms);

		expect(graph.kinds).toEqual([
			{ kind: 'asset', label: 'Terminals', count: 1 },
			{ kind: 'company', label: 'Merchants', count: 2 },
			{ kind: 'member', label: 'Crew', count: 1 }
		]);
		expect(graph.types).toEqual([
			{ id: ASSIGNED_TO, label: 'assigned to', count: 1 },
			{ id: OWNS, label: 'owns', count: 1 }
		]);
	});

	it('leaves a kind the reader may not open off the map, with every edge that touched it', async () => {
		const { supabase, from } = mock();

		const graph = await describeGraph(supabase, ORG_ID, (kind) => kind === 'company', vocabulary, {
			companies: terms.companies
		});

		expect(graph.nodes.map((node) => node.kind)).toEqual(['company', 'company', 'member']);
		expect(graph.edges).toEqual([]);
		expect(graph.kinds.map((kind) => kind.kind)).toEqual(['company', 'member']);
		expect(graph.types).toEqual([]);
		// Not fetched at all: nothing about the record reaches the reader.
		expect(from).not.toHaveBeenCalledWith('assets');
	});

	it('is an empty map for an org with no records', async () => {
		const { supabase } = supabaseTablesMock({
			relationships: { data: [] },
			companies: { data: [] },
			assets: { data: [] }
		});

		await expect(describeGraph(supabase, ORG_ID, canOpen, vocabulary, terms)).resolves.toEqual({
			nodes: [],
			edges: [],
			kinds: [],
			types: []
		});
	});
});
