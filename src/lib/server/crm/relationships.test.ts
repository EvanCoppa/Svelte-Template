import { describe, expect, it } from 'vitest';
import {
	createRelationship,
	getRelationships,
	listRelationshipTypes,
	listRelationships,
	listRelationshipsFrom,
	orientRelationship,
	removeRelationship,
	updateRelationship,
	type RelationshipWithType
} from './relationships';
import { ORG_ID, supabaseMock, supabaseTablesMock } from './test-support';

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const ASSET_ID = 'f1000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000001';
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

/** Wayne Enterprises owns the laptop; the laptop is assigned to a member. */
const wayneOwnsLaptop: RelationshipWithType = {
	id: 'f2000000-0000-0000-0000-000000000001',
	org_id: ORG_ID,
	relationship_type_id: OWNS,
	from_type: 'company',
	from_id: COMPANY_ID,
	to_type: 'asset',
	to_id: ASSET_ID,
	started_on: '2026-01-15',
	ended_on: null,
	notes: null,
	created_by: USER_ID,
	created_at: '2026-09-01T09:00:00Z',
	updated_at: '2026-09-01T09:00:00Z',
	relationship_types: owns
};

const laptopAssignedToDev: RelationshipWithType = {
	...wayneOwnsLaptop,
	id: 'f2000000-0000-0000-0000-000000000002',
	relationship_type_id: ASSIGNED_TO,
	from_type: 'asset',
	from_id: ASSET_ID,
	to_type: 'member',
	to_id: USER_ID,
	started_on: null,
	relationship_types: assignedTo
};

const laptop = { entityType: 'asset', entityId: ASSET_ID } as const;
const wayne = { entityType: 'company', entityId: COMPANY_ID } as const;

/** Enough of a company row for `getRecord()` to describe one. */
const wayneRow = {
	id: COMPANY_ID,
	name: 'Wayne Enterprises',
	status: 'active',
	relationship: 'customer',
	contacts: []
};

const openAll = () => true;
const vocabulary = { proposal_presenter: 'Presenter', proposal_responsible: 'Responsible' };

describe('listRelationshipTypes', () => {
	it('reads the system types and the org’s own, by forward label', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [owns] });

		await expect(listRelationshipTypes(supabase, ORG_ID)).resolves.toEqual([owns]);
		expect(from).toHaveBeenCalledWith('relationship_types');
		expect(builder.or).toHaveBeenCalledWith(`org_id.is.null,org_id.eq.${ORG_ID}`);
		expect(builder.order).toHaveBeenCalledWith('forward_label');
	});
});

describe('listRelationships', () => {
	it('reads a record’s rows from either side, with the type embedded, newest first', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [wayneOwnsLaptop] });

		await expect(listRelationships(supabase, ORG_ID, laptop)).resolves.toEqual([wayneOwnsLaptop]);
		expect(from).toHaveBeenCalledWith('relationships');
		expect(builder.select).toHaveBeenCalledWith('*, relationship_types(*)');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.or).toHaveBeenCalledWith(
			`and(from_type.eq.asset,from_id.eq.${ASSET_ID}),and(to_type.eq.asset,to_id.eq.${ASSET_ID})`
		);
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
		expect(builder.is).not.toHaveBeenCalled();
	});

	it('narrows to one type, and to the open ones, only when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listRelationships(supabase, ORG_ID, laptop, { typeId: OWNS, openOnly: true });
		expect(builder.eq).toHaveBeenCalledWith('relationship_type_id', OWNS);
		expect(builder.is).toHaveBeenCalledWith('ended_on', null);
	});
});

describe('listRelationshipsFrom', () => {
	it('reads a page of records\u2019 rows in one query, from side only', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [wayneOwnsLaptop] });

		await expect(
			listRelationshipsFrom(supabase, ORG_ID, 'asset', [ASSET_ID], { typeId: OWNS, openOnly: true })
		).resolves.toEqual([wayneOwnsLaptop]);
		expect(from).toHaveBeenCalledWith('relationships');
		expect(builder.eq).toHaveBeenCalledWith('from_type', 'asset');
		expect(builder.in).toHaveBeenCalledWith('from_id', [ASSET_ID]);
		expect(builder.eq).toHaveBeenCalledWith('relationship_type_id', OWNS);
		expect(builder.is).toHaveBeenCalledWith('ended_on', null);
		// No `or`: this side is known, which is what makes one query enough.
		expect(builder.or).not.toHaveBeenCalled();
	});

	it('de-duplicates the ids, and asks nothing when there are none', async () => {
		const repeated = supabaseMock({ data: [] });
		await listRelationshipsFrom(repeated.supabase, ORG_ID, 'asset', [ASSET_ID, ASSET_ID]);
		expect(repeated.builder.in).toHaveBeenCalledWith('from_id', [ASSET_ID]);

		const empty = supabaseMock({ data: [] });
		await expect(listRelationshipsFrom(empty.supabase, ORG_ID, 'asset', [])).resolves.toEqual([]);
		expect(empty.builder.select).not.toHaveBeenCalled();
	});
});

describe('orientRelationship', () => {
	it('reads the forward label from the from side and the inverse from the to side', () => {
		expect(orientRelationship(wayneOwnsLaptop, wayne)).toEqual({
			direction: 'forward',
			label: 'owns',
			other: laptop
		});
		expect(orientRelationship(wayneOwnsLaptop, laptop)).toEqual({
			direction: 'inverse',
			label: 'owned by',
			other: wayne
		});
	});

	it('reads a row from a record to itself forward', () => {
		const self: RelationshipWithType = {
			...wayneOwnsLaptop,
			to_type: 'company',
			to_id: COMPANY_ID
		};
		expect(orientRelationship(self, wayne).direction).toBe('forward');
	});
});

describe('getRelationships', () => {
	it('names and links the other record, and names a member without a link', async () => {
		const { supabase } = supabaseTablesMock({
			relationships: { data: [wayneOwnsLaptop, laptopAssignedToDev] },
			companies: { data: wayneRow },
			profiles: { data: [{ id: USER_ID, display_name: 'Dev User', email: 'dev@example.com' }] }
		});

		await expect(getRelationships(supabase, ORG_ID, laptop, openAll, vocabulary)).resolves.toEqual([
			{
				id: wayneOwnsLaptop.id,
				type: { id: OWNS, key: 'owns' },
				direction: 'inverse',
				label: 'owned by',
				other: {
					entityType: 'company',
					entityId: COMPANY_ID,
					name: 'Wayne Enterprises',
					href: `/companies/${COMPANY_ID}`
				},
				startedOn: '2026-01-15',
				endedOn: null,
				notes: null,
				createdAt: wayneOwnsLaptop.created_at
			},
			{
				id: laptopAssignedToDev.id,
				type: { id: ASSIGNED_TO, key: 'assigned_to' },
				direction: 'forward',
				label: 'assigned to',
				other: { entityType: 'member', entityId: USER_ID, name: 'Dev User', href: null },
				startedOn: null,
				endedOn: null,
				notes: null,
				createdAt: laptopAssignedToDev.created_at
			}
		]);
	});

	it('leaves out a relationship whose other end the reader may not open, or that is gone', async () => {
		const { supabase, from } = supabaseTablesMock({
			relationships: { data: [wayneOwnsLaptop, laptopAssignedToDev] },
			companies: { data: null },
			profiles: { data: [] }
		});

		// Companies closed to this reader: not even fetched. The member has
		// left: no profile, so no row.
		await expect(
			getRelationships(supabase, ORG_ID, laptop, (kind) => kind !== 'company', vocabulary)
		).resolves.toEqual([]);
		expect(from).not.toHaveBeenCalledWith('companies');

		// Companies open, but the company itself is gone (or RLS hides it).
		await expect(getRelationships(supabase, ORG_ID, laptop, openAll, vocabulary)).resolves.toEqual(
			[]
		);
	});

	it('asks nothing of anyone when a record stands in no relationship', async () => {
		const { supabase, from } = supabaseTablesMock({ relationships: { data: [] } });

		await expect(getRelationships(supabase, ORG_ID, laptop, openAll, vocabulary)).resolves.toEqual(
			[]
		);
		expect(from).toHaveBeenCalledTimes(1);
	});
});

describe('writing relationships', () => {
	it('draws a relationship in the org from the two records the labels read between', async () => {
		const { supabase, from, builder } = supabaseMock({ data: wayneOwnsLaptop });

		await createRelationship(supabase, ORG_ID, {
			typeId: OWNS,
			from: wayne,
			to: laptop,
			started_on: '2026-01-15'
		});
		expect(from).toHaveBeenCalledWith('relationships');
		expect(builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			relationship_type_id: OWNS,
			from_type: 'company',
			from_id: COMPANY_ID,
			to_type: 'asset',
			to_id: ASSET_ID,
			started_on: '2026-01-15'
		});
		expect(builder.single).toHaveBeenCalled();
	});

	it('corrects the dates and the note scoped to org and id', async () => {
		const { supabase, builder } = supabaseMock({ data: wayneOwnsLaptop });

		await updateRelationship(supabase, ORG_ID, wayneOwnsLaptop.id, { ended_on: '2026-09-01' });
		expect(builder.update).toHaveBeenCalledWith({ ended_on: '2026-09-01' });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', wayneOwnsLaptop.id);
	});

	it('removes with evidence, and throws when nothing was removed', async () => {
		const removed = supabaseMock({ data: [{ id: wayneOwnsLaptop.id }] });
		await removeRelationship(removed.supabase, ORG_ID, wayneOwnsLaptop.id);
		expect(removed.builder.delete).toHaveBeenCalled();
		expect(removed.builder.select).toHaveBeenCalledWith('id');

		const missing = supabaseMock({ data: [] });
		await expect(removeRelationship(missing.supabase, ORG_ID, wayneOwnsLaptop.id)).rejects.toThrow(
			'Relationship was not deleted'
		);
	});
});
