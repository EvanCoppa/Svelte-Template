import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { ORG_ID, supabaseMockSequence } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { relationshipActions } from './record-relationships';

/**
 * The record page's Relationships card from the outside: the two actions
 * that draw and remove a relationship, refused before the database is
 * touched when the reader may not manage this record, and the app-level
 * duplicate check that keeps a symmetric type from being drawn twice.
 *
 * Driven through the factory the way a route spreads it — here as a page
 * that serves companies, which is what every record page does once its kind
 * is known.
 */

const actions = relationshipActions(() => 'company');

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['companies', 'read' as const]])
};

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const TYPE_ID = 'f0000000-0000-0000-0000-000000000001';
const RELATIONSHIP_ID = 'c0000000-0000-0000-0000-000000000001';

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the actions read `supabase`, `activeOrgId` and `org.access` only.
	return { supabase, activeOrgId: ORG_ID, org: { access, features: {} } } as never;
}

function post(fields: [name: string, value: string][]) {
	const body = new FormData();
	for (const [name, value] of fields) body.append(name, value);
	return new Request(`https://app.test/companies/${COMPANY_ID}`, { method: 'POST', body });
}

type ActionName = keyof typeof actions;

function run(
	name: ActionName,
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	fields: [string, string][]
) {
	// SAFETY: the actions read `request`, `locals` and `params` only.
	return actions[name]({
		request: post(fields),
		locals: localsFor(supabase, access),
		params: { id: COMPANY_ID }
	} as never);
}

const addFields: [string, string][] = [
	['typeId', TYPE_ID],
	['direction', 'forward'],
	['otherKind', 'contact'],
	['otherId', CONTACT_ID]
];

describe('addRelationship', () => {
	it('refuses a reader who may not manage the on-screen record', async () => {
		const { supabase } = supabaseMockSequence([]);
		await expect(run('addRelationship', supabase, READER, addFields)).rejects.toMatchObject({
			status: 403
		});
	});

	it('refuses an unrecognized kind of record', async () => {
		const { supabase } = supabaseMockSequence([{ data: [] }]);
		// A word that is not a kind at all, rather than a kind the app has not
		// built yet — the latter goes stale the day that kind ships.
		const fields = addFields.map(([name, value]): [string, string] =>
			name === 'otherKind' ? [name, 'not-a-kind'] : [name, value]
		);

		const result = await run('addRelationship', supabase, OWNER, fields);

		expect(result).toHaveProperty('data.form.message', 'Choose a kind of record.');
	});

	it('draws the relationship in the posted direction', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: [] }, // listRelationships: nothing existing yet
			{ data: { id: RELATIONSHIP_ID } } // createRelationship
		]);

		const result = await run('addRelationship', supabase, OWNER, addFields);

		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				relationship_type_id: TYPE_ID,
				from_type: 'company',
				from_id: COMPANY_ID,
				to_type: 'contact',
				to_id: CONTACT_ID
			})
		);
		expect(result).not.toHaveProperty('status', 400);
	});

	it('swaps from and to when the reader drew it from the other side', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: [] },
			{ data: { id: RELATIONSHIP_ID } }
		]);
		const fields = addFields.map(([name, value]): [string, string] =>
			name === 'direction' ? ['direction', 'inverse'] : [name, value]
		);

		await run('addRelationship', supabase, OWNER, fields);

		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				from_type: 'contact',
				from_id: CONTACT_ID,
				to_type: 'company',
				to_id: COMPANY_ID
			})
		);
	});

	it('refuses a relationship that already links these two records, from either direction', async () => {
		// The existing row runs the other way (contact -> company); orienting
		// it from the company still finds the same contact at the other end,
		// which is exactly the case a symmetric type must not draw twice.
		const existing = {
			id: 'c0000000-0000-0000-0000-000000000099',
			from_type: 'contact',
			from_id: CONTACT_ID,
			to_type: 'company',
			to_id: COMPANY_ID,
			ended_on: null,
			relationship_types: { forward_label: 'works at', inverse_label: 'employs' }
		};
		const { supabase } = supabaseMockSequence([{ data: [existing] }]);

		const result = await run('addRelationship', supabase, OWNER, addFields);

		expect(result).toHaveProperty('data.form.message', 'A relationship like this already exists.');
	});
});

describe('removeRelationship', () => {
	it('refuses a reader who may not manage the on-screen record', async () => {
		const { supabase } = supabaseMockSequence([]);
		await expect(
			run('removeRelationship', supabase, READER, [['id', RELATIONSHIP_ID]])
		).rejects.toMatchObject({ status: 403 });
	});

	it('removes the relationship by id', async () => {
		const { supabase, builder } = supabaseMockSequence([{ data: [{ id: RELATIONSHIP_ID }] }]);

		const result = await run('removeRelationship', supabase, OWNER, [['id', RELATIONSHIP_ID]]);

		expect(builder.delete).toHaveBeenCalled();
		expect(result).not.toHaveProperty('status', 400);
	});
});
