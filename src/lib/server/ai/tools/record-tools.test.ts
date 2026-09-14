import { describe, expect, it } from 'vitest';
import type { OrgContext } from '$lib/server/org-context';
import { supabaseMockSequence, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { RelationshipWithType } from '$lib/server/crm/relationships';
import type { AssistantToolContext } from '../context';
import { orgContext, toolContext, ORG_ID, USER_ID } from '../test-support';
import { exploreGraph, walkFrom } from './explore-graph';
import { findRecords } from './find-records';
import { getRecord } from './get-record';
import { linkRecords } from './link-records';
import { listEvents } from './list-events';
import { listRelationshipTypes } from './list-relationship-types';
import { updateRecord } from './update-record';

/**
 * The kind-addressed tools: one door for every kind of record, through the
 * generic record layer, checking the kind each call names. The fixture org
 * has companies, contacts, deals, tasks and tickets (plus the calendar and
 * the graph); an asset is a kind it does not have, which is what the
 * refusals below are about.
 */

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const ASSET_ID = 'f1000000-0000-0000-0000-000000000001';
const WORKS_AT = 'f0000000-0000-0000-0000-000000000001';
const OWNS = 'f0000000-0000-0000-0000-000000000011';
const ASSIGNED_TO = 'f0000000-0000-0000-0000-000000000012';

const options = (context: AssistantToolContext) => ({
	toolCallId: 'call-1',
	messages: [],
	abortSignal: new AbortController().signal,
	context
});

/** A tool context over the multi-table double, for tools that read several tables in one call. */
function tablesContext(
	org: OrgContext,
	results: Parameters<typeof supabaseTablesMock>[0]
): AssistantToolContext & { db: ReturnType<typeof supabaseTablesMock> } {
	const db = supabaseTablesMock(results);
	return { supabase: db.supabase, orgId: ORG_ID, userId: USER_ID, org, db };
}

/** A tool context over the sequence double, for tools that read then write. */
function sequenceContext(
	org: OrgContext,
	results: Parameters<typeof supabaseMockSequence>[0]
): AssistantToolContext & { db: ReturnType<typeof supabaseMockSequence> } {
	const db = supabaseMockSequence(results);
	return { supabase: db.supabase, orgId: ORG_ID, userId: USER_ID, org, db };
}

const STAMPS = {
	created_at: '2026-09-01T09:00:00Z',
	updated_at: '2026-09-02T09:00:00Z',
	created_by: USER_ID
};

const wayne = {
	id: COMPANY_ID,
	org_id: ORG_ID,
	name: 'Wayne Enterprises',
	email: 'hello@wayne.example.com',
	phone: '+1 555 0100',
	website: 'wayne.example.com',
	status: 'active',
	relationship: 'customer',
	vendor_account_number: null,
	payment_terms_days: null,
	distribution_fee_pct: null,
	contacts: [],
	...STAMPS
};

const lucius = {
	id: CONTACT_ID,
	org_id: ORG_ID,
	company_id: COMPANY_ID,
	name: 'Lucius Fox',
	email: 'lucius@wayne.example.com',
	phone: null,
	title: 'CEO',
	is_primary: true,
	status: 'active',
	companies: { id: COMPANY_ID, name: 'Wayne Enterprises' },
	...STAMPS
};

/** The three term rows `loadVocabulary()` insists on. */
const terms = ['proposal_presenter', 'proposal_responsible', 'graph_member'].map((id) => ({
	id,
	label: id,
	industry_terms: []
}));

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

const worksAt = {
	...owns,
	id: WORKS_AT,
	key: 'works_at',
	forward_label: 'works at',
	inverse_label: 'employs',
	source_type: 'contact' as const,
	target_type: 'company' as const
};

const assignedTo = {
	...owns,
	id: ASSIGNED_TO,
	key: 'assigned_to',
	forward_label: 'assigned to',
	inverse_label: 'holds',
	source_type: null,
	target_type: null
};

const luciusWorksAtWayne: RelationshipWithType = {
	id: 'f2000000-0000-0000-0000-000000000001',
	org_id: ORG_ID,
	relationship_type_id: WORKS_AT,
	from_type: 'contact',
	from_id: CONTACT_ID,
	to_type: 'company',
	to_id: COMPANY_ID,
	started_on: '2026-01-15',
	ended_on: null,
	notes: null,
	created_by: USER_ID,
	created_at: '2026-09-01T09:00:00Z',
	updated_at: '2026-09-01T09:00:00Z',
	relationship_types: worksAt
};

const wayneOwnsLaptop: RelationshipWithType = {
	...luciusWorksAtWayne,
	id: 'f2000000-0000-0000-0000-000000000002',
	relationship_type_id: OWNS,
	from_type: 'company',
	from_id: COMPANY_ID,
	to_type: 'asset',
	to_id: ASSET_ID,
	relationship_types: owns
};

const laptopAssignedToDev: RelationshipWithType = {
	...luciusWorksAtWayne,
	id: 'f2000000-0000-0000-0000-000000000003',
	relationship_type_id: ASSIGNED_TO,
	from_type: 'asset',
	from_id: ASSET_ID,
	to_type: 'member',
	to_id: USER_ID,
	relationship_types: assignedTo
};

const wayneAssignedToDev: RelationshipWithType = {
	...laptopAssignedToDev,
	id: 'f2000000-0000-0000-0000-000000000004',
	from_type: 'company',
	from_id: COMPANY_ID
};

describe('findRecords', () => {
	it('names the kind’s records through its own list module and filters by name', async () => {
		const context = toolContext(orgContext(), {
			data: [wayne, { ...wayne, id: 'x', name: 'Stark Industries' }]
		});

		const result = await findRecords.execute!(
			{ kind: 'company', query: 'stark', limit: 20 },
			options(context)
		);

		expect(context.mock.from).toHaveBeenCalledWith('companies');
		expect(context.mock.builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(result).toEqual({
			kind: 'company',
			records: [{ id: 'x', name: 'Stark Industries' }],
			total: 1
		});
	});

	it('refuses a kind the org does not have before touching the database', async () => {
		const context = toolContext(orgContext());

		await expect(
			findRecords.execute!({ kind: 'asset', limit: 20 }, options(context))
		).rejects.toThrow(/does not allow "read" on assets/);
		expect(context.mock.from).not.toHaveBeenCalled();
	});

	it('refuses a kind the caller may not read', async () => {
		const context = toolContext(orgContext({ role: 'member', grants: { tasks: 'read' } }));

		await expect(
			findRecords.execute!({ kind: 'company', limit: 20 }, options(context))
		).rejects.toThrow(/does not allow "read" on companies/);
	});
});

describe('getRecord', () => {
	const activity = {
		id: 'a0000000-0000-0000-0000-000000000001',
		org_id: ORG_ID,
		entity_type: 'company',
		entity_id: COMPANY_ID,
		type: 'note',
		direction: null,
		subject: null,
		body: 'Renewal due in October.',
		occurred_at: '2026-09-03T10:00:00Z',
		duration_minutes: null,
		author_id: USER_ID,
		created_at: '2026-09-03T10:00:00Z',
		updated_at: '2026-09-03T10:00:00Z'
	};
	const tables = {
		companies: { data: wayne },
		custom_field_definitions: { data: [] },
		custom_field_values: { data: [] },
		taggings: { data: [{ tags: { id: 't1', org_id: ORG_ID, name: 'vip', ...STAMPS } }] },
		contacts: { data: [lucius] },
		deals: { data: [] },
		tasks: { data: [] },
		support_tickets: { data: [] },
		relationships: { data: [wayneAssignedToDev] },
		activities: { data: [activity] },
		profiles: { data: [{ id: USER_ID, display_name: 'Dev Example', email: 'dev@example.com' }] },
		terms: { data: terms }
	};

	it('describes the record with its connections: fields, tags, related records, relationships, activity', async () => {
		const context = tablesContext(orgContext(), tables);

		const result = await getRecord.execute!({ kind: 'company', id: COMPANY_ID }, options(context));

		expect(result).toMatchObject({
			found: true,
			record: {
				kind: 'company',
				id: COMPANY_ID,
				name: 'Wayne Enterprises',
				status: ['Customer', 'Active'],
				fields: [
					{ label: 'Email', value: 'hello@wayne.example.com' },
					{ label: 'Phone', value: '+1 555 0100' },
					{ label: 'Website', value: 'wayne.example.com' }
				],
				customFields: [],
				tags: ['vip'],
				createdAt: STAMPS.created_at,
				updatedAt: STAMPS.updated_at
			},
			related: [{ kind: 'contact', records: [{ id: CONTACT_ID, name: 'Lucius Fox' }] }],
			relationships: [
				{
					id: wayneAssignedToDev.id,
					typeId: ASSIGNED_TO,
					label: 'assigned to',
					direction: 'forward',
					other: { kind: 'member', id: USER_ID, name: 'Dev Example' }
				}
			],
			activities: [
				{
					id: activity.id,
					type: 'note',
					body: 'Renewal due in October.',
					occurredAt: activity.occurred_at,
					by: 'Dev Example'
				}
			]
		});
		// A related group is fetched only for a kind the org has: no leases,
		// invoices, proposals or RMAs were asked for.
		const asked = context.db.from.mock.calls.map(([table]) => table);
		expect(asked).not.toContain('invoices');
		expect(asked).not.toContain('leases');
	});

	it('tells a writer which fields updateRecord accepts, with a select’s options', async () => {
		const context = tablesContext(orgContext(), tables);

		const result = await getRecord.execute!({ kind: 'company', id: COMPANY_ID }, options(context));

		expect(result).toMatchObject({
			record: {
				editableFields: [
					{ name: 'name', type: 'text' },
					{
						name: 'relationship',
						label: 'Relationship',
						type: 'select',
						options: [
							{ value: 'customer', label: 'Customer' },
							{ value: 'supplier', label: 'Supplier' },
							{ value: 'partner', label: 'Partner' },
							{ value: 'other', label: 'Other' }
						]
					},
					{ name: 'status', type: 'select' },
					{ name: 'email', type: 'email' },
					{ name: 'phone', type: 'tel' },
					{ name: 'website', type: 'text' }
				]
			}
		});
	});

	it('offers a reader no editable fields, and names a related kind only when they may open it', async () => {
		const reader = orgContext({ role: 'member', grants: { companies: 'read' } });
		const context = tablesContext(reader, tables);

		const result = await getRecord.execute!({ kind: 'company', id: COMPANY_ID }, options(context));

		expect(result).not.toHaveProperty('record.editableFields');
		// The reader may not open contacts, so the company’s people are not fetched.
		expect(result).toMatchObject({ related: [] });
		expect(context.db.from.mock.calls.map(([table]) => table)).not.toContain('contacts');
	});

	it('answers not found for a record RLS hides', async () => {
		const context = tablesContext(orgContext(), { ...tables, companies: { data: null } });

		await expect(
			getRecord.execute!({ kind: 'company', id: COMPANY_ID }, options(context))
		).resolves.toEqual({ found: false, related: [], relationships: [], activities: [] });
	});
});

describe('updateRecord', () => {
	it('merges the change into what the record says and writes through the same switch as the form', async () => {
		const context = sequenceContext(orgContext(), [
			{ data: wayne },
			{ data: { id: COMPANY_ID } },
			{ data: terms },
			{ data: wayne }
		]);

		const result = await updateRecord.execute!(
			{ kind: 'company', id: COMPANY_ID, changes: { status: 'inactive', website: '' } },
			options(context)
		);

		expect(context.db.builder.update).toHaveBeenCalledWith({
			name: 'Wayne Enterprises',
			relationship: 'customer',
			status: 'inactive',
			email: 'hello@wayne.example.com',
			phone: '+1 555 0100',
			website: null
		});
		expect(context.db.builder.eq).toHaveBeenCalledWith('id', COMPANY_ID);
		expect(result).toEqual({
			saved: true,
			issues: [],
			record: { kind: 'company', id: COMPANY_ID, name: 'Wayne Enterprises' }
		});
	});

	it('returns the schema’s complaint rather than writing a value the form would refuse', async () => {
		const context = sequenceContext(orgContext(), [{ data: wayne }]);

		const result = await updateRecord.execute!(
			{ kind: 'company', id: COMPANY_ID, changes: { email: 'not an address' } },
			options(context)
		);

		expect(result).toMatchObject({ saved: false, issues: [expect.stringMatching(/^email:/)] });
		expect(context.db.builder.update).not.toHaveBeenCalled();
	});

	it('refuses a field the kind does not have, naming the ones it has', async () => {
		const context = sequenceContext(orgContext(), [{ data: wayne }]);

		await expect(
			updateRecord.execute!(
				{ kind: 'company', id: COMPANY_ID, changes: { colour: 'blue' } },
				options(context)
			)
		).rejects.toThrow(/no field named colour.*name, relationship, status/);
	});

	it('refuses before touching the database when the caller only reads the kind', async () => {
		const context = toolContext(orgContext({ role: 'member', grants: { companies: 'read' } }));

		await expect(
			updateRecord.execute!(
				{ kind: 'company', id: COMPANY_ID, changes: { status: 'inactive' } },
				options(context)
			)
		).rejects.toThrow(/does not allow "manage" on companies/);
		expect(context.mock.from).not.toHaveBeenCalled();
	});
});

describe('walkFrom', () => {
	const rows = [luciusWorksAtWayne, wayneOwnsLaptop, laptopAssignedToDev];
	const start = { entityType: 'company', entityId: COMPANY_ID } as const;
	const enterAll = () => true;

	it('reaches what is within depth, in hops, and keeps the rows between reached nodes', () => {
		const one = walkFrom(rows, start, 1, enterAll);
		expect(one.visited.map((node) => [node.id, node.depth])).toEqual([
			[`company:${COMPANY_ID}`, 0],
			[`contact:${CONTACT_ID}`, 1],
			[`asset:${ASSET_ID}`, 1]
		]);
		expect(one.rows.map((row) => row.id)).toEqual([luciusWorksAtWayne.id, wayneOwnsLaptop.id]);

		const two = walkFrom(rows, start, 2, enterAll);
		expect(two.visited.map((node) => node.id)).toContain(`member:${USER_ID}`);
		expect(two.rows).toHaveLength(3);
		expect(two.truncated).toBe(false);
	});

	it('never steps onto a kind it may not enter, nor past it', () => {
		const walk = walkFrom(rows, start, 3, (kind) => kind !== 'asset');
		expect(walk.visited.map((node) => node.id)).toEqual([
			`company:${COMPANY_ID}`,
			`contact:${CONTACT_ID}`
		]);
		expect(walk.rows.map((row) => row.id)).toEqual([luciusWorksAtWayne.id]);
	});

	it('stops at the node cap and says so', () => {
		const fan = Array.from({ length: 60 }, (_, index) => ({
			...wayneOwnsLaptop,
			id: `f3000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
			to_id: `f1000000-0000-0000-0000-${String(index).padStart(12, '0')}`
		}));
		const walk = walkFrom(fan, start, 1, enterAll);
		expect(walk.visited).toHaveLength(40);
		expect(walk.truncated).toBe(true);
	});
});

describe('exploreGraph', () => {
	it('walks the org’s relationships from a record, naming each end the way its page does', async () => {
		const context = tablesContext(orgContext(), {
			relationships: { data: [luciusWorksAtWayne, wayneOwnsLaptop, laptopAssignedToDev] },
			companies: { data: [wayne] },
			contacts: { data: [lucius] }
		});

		const result = await exploreGraph.execute!(
			{ kind: 'company', id: COMPANY_ID, depth: 2, includeEnded: false },
			options(context)
		);

		// The fixture org has no assets, so the laptop is never entered and the
		// member beyond it is never reached — and nothing about either leaks.
		expect(result).toEqual({
			found: true,
			nodes: [
				{
					id: `company:${COMPANY_ID}`,
					kind: 'company',
					recordId: COMPANY_ID,
					name: 'Wayne Enterprises',
					depth: 0
				},
				{
					id: `contact:${CONTACT_ID}`,
					kind: 'contact',
					recordId: CONTACT_ID,
					name: 'Lucius Fox',
					depth: 1
				}
			],
			edges: [
				{
					id: luciusWorksAtWayne.id,
					from: `contact:${CONTACT_ID}`,
					to: `company:${COMPANY_ID}`,
					label: 'works at',
					inverseLabel: 'employs',
					typeId: WORKS_AT,
					ended: false
				}
			],
			truncated: false
		});
		expect(context.db.builders.relationships.is).toHaveBeenCalledWith('ended_on', null);
		expect(context.db.from).not.toHaveBeenCalledWith('assets');
		expect(context.db.from).not.toHaveBeenCalledWith('profiles');
	});

	it('names a member it reaches directly through the roster', async () => {
		const context = tablesContext(orgContext(), {
			relationships: { data: [wayneAssignedToDev] },
			companies: { data: [wayne] },
			profiles: { data: [{ id: USER_ID, display_name: 'Dev Example', email: null }] }
		});

		const result = await exploreGraph.execute!(
			{ kind: 'company', id: COMPANY_ID, depth: 1, includeEnded: true },
			options(context)
		);

		expect(result).toMatchObject({
			nodes: expect.arrayContaining([
				{
					id: `member:${USER_ID}`,
					kind: 'member',
					recordId: USER_ID,
					name: 'Dev Example',
					depth: 1
				}
			])
		});
		expect(context.db.builders.relationships.is).not.toHaveBeenCalled();
	});

	it('answers not found for a record that is not there', async () => {
		const context = tablesContext(orgContext(), {
			relationships: { data: [] },
			companies: { data: [] }
		});

		await expect(
			exploreGraph.execute!(
				{ kind: 'company', id: COMPANY_ID, depth: 2, includeEnded: false },
				options(context)
			)
		).resolves.toEqual({ found: false, nodes: [], edges: [], truncated: false });
	});

	it('needs the graph feature as well as the starting kind', async () => {
		const noGraph = toolContext(orgContext({ modes: { graph: 'disabled' } }));
		await expect(
			exploreGraph.execute!(
				{ kind: 'company', id: COMPANY_ID, depth: 2, includeEnded: false },
				options(noGraph)
			)
		).rejects.toThrow(/does not allow "read" on graph/);

		const noAssets = toolContext(orgContext());
		await expect(
			exploreGraph.execute!(
				{ kind: 'asset', id: ASSET_ID, depth: 2, includeEnded: false },
				options(noAssets)
			)
		).rejects.toThrow(/does not allow "read" on assets/);
	});
});

describe('listRelationshipTypes', () => {
	it('reads the types with both labels and the kinds each end must be', async () => {
		const context = toolContext(orgContext(), { data: [owns, worksAt] });

		const result = await listRelationshipTypes.execute!({}, options(context));

		expect(context.mock.from).toHaveBeenCalledWith('relationship_types');
		expect(result).toEqual({
			types: [
				{
					id: OWNS,
					key: 'owns',
					forwardLabel: 'owns',
					inverseLabel: 'owned by',
					fromKind: null,
					toKind: 'asset'
				},
				{
					id: WORKS_AT,
					key: 'works_at',
					forwardLabel: 'works at',
					inverseLabel: 'employs',
					fromKind: 'contact',
					toKind: 'company'
				}
			]
		});
	});
});

describe('linkRecords', () => {
	const link = {
		typeId: WORKS_AT,
		from: { kind: 'contact' as const, id: CONTACT_ID },
		to: { kind: 'company' as const, id: COMPANY_ID }
	};

	it('checks for an open duplicate, then draws the row from the from end to the to end', async () => {
		const context = sequenceContext(orgContext(), [{ data: [] }, { data: { id: 'r1' } }]);

		const result = await linkRecords.execute!({ ...link, notes: 'Since 2024' }, options(context));

		expect(context.db.builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			relationship_type_id: WORKS_AT,
			from_type: 'contact',
			from_id: CONTACT_ID,
			to_type: 'company',
			to_id: COMPANY_ID,
			notes: 'Since 2024'
		});
		expect(result).toEqual({ relationshipId: 'r1', typeId: WORKS_AT });
	});

	it('refuses a second open relationship of the same type between the same two', async () => {
		const context = sequenceContext(orgContext(), [{ data: [luciusWorksAtWayne] }]);

		await expect(linkRecords.execute!(link, options(context))).rejects.toThrow(
			'A relationship like this already exists.'
		);
		expect(context.db.builder.insert).not.toHaveBeenCalled();
	});

	it('takes manage on the from record’s kind, and read on the other end’s', async () => {
		const reader = toolContext(
			orgContext({ role: 'member', grants: { contacts: 'read', companies: 'read' } })
		);
		await expect(linkRecords.execute!(link, options(reader))).rejects.toThrow(
			/does not allow "manage" on contacts/
		);

		const blind = toolContext(orgContext({ role: 'member', grants: { contacts: 'manage' } }));
		await expect(linkRecords.execute!(link, options(blind))).rejects.toThrow(
			/does not allow "read" on company/
		);
		expect(blind.mock.from).not.toHaveBeenCalled();
	});
});

describe('listEvents', () => {
	const event = {
		id: 'e0000000-0000-0000-0000-000000000001',
		org_id: ORG_ID,
		title: 'Renewal call',
		description: null,
		location: 'Zoom',
		starts_at: '2026-09-08T14:00:00Z',
		ends_at: '2026-09-08T14:30:00Z',
		all_day: false,
		color: 'info',
		entity_type: 'company',
		entity_id: COMPANY_ID,
		assigned_to: USER_ID,
		created_by: USER_ID,
		created_at: '2026-09-01T09:00:00Z',
		updated_at: '2026-09-01T09:00:00Z'
	};

	it('reads the window and names the record each event is about and the member it is for', async () => {
		const context = tablesContext(orgContext(), {
			calendar_events: { data: [event] },
			companies: { data: wayne },
			profiles: { data: [{ id: USER_ID, display_name: 'Dev Example', email: null }] },
			terms: { data: terms }
		});

		const result = await listEvents.execute!(
			{ from: '2026-09-07T00:00:00+02:00', to: '2026-09-14T00:00:00+02:00' },
			options(context)
		);

		expect(context.db.builders.calendar_events.lt).toHaveBeenCalledWith(
			'starts_at',
			'2026-09-14T00:00:00+02:00'
		);
		expect(result).toEqual({
			events: [
				{
					id: event.id,
					title: 'Renewal call',
					startsAt: event.starts_at,
					endsAt: event.ends_at,
					allDay: false,
					location: 'Zoom',
					description: null,
					assignedTo: 'Dev Example',
					about: { kind: 'company', id: COMPANY_ID, name: 'Wayne Enterprises' }
				}
			],
			total: 1
		});
	});

	it('is the calendar feature’s tool', async () => {
		const context = toolContext(orgContext({ modes: { calendar: 'hidden' } }));
		await expect(
			listEvents.execute!(
				{ from: '2026-09-07T00:00:00Z', to: '2026-09-14T00:00:00Z' },
				options(context)
			)
		).rejects.toThrow(/does not allow "read" on calendar/);
	});
});
