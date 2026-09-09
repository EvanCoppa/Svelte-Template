import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { ORG_ID, supabaseMockSequence } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions } from './+page.server';

/**
 * The record page's address actions from the outside: who may post them,
 * how a post becomes a row, and that a geocoder that is off leaves the
 * coordinates empty rather than the address unsaved. (`GEOCODER_URL` is
 * unset in tests, so `geocode()` takes its unconfigured branch.)
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['contacts', 'read' as const]])
};
const MANAGER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['contacts', 'manage' as const]])
};

const CONTACT_ID = '30000000-0000-0000-0000-000000000003';
const ADDRESS_ID = '32000000-0000-0000-0000-000000000002';

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the actions read `supabase`, `activeOrgId` and `org.access`; the
	// rest of App.Locals is never touched.
	return { supabase, activeOrgId: ORG_ID, org: { access } } as never;
}

function post(fields: [name: string, value: string][]) {
	const body = new FormData();
	for (const [name, value] of fields) body.append(name, value);
	return new Request(`https://app.test/contacts/${CONTACT_ID}`, { method: 'POST', body });
}

type ActionName = keyof typeof actions;

function run(
	name: ActionName,
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	fields: [string, string][],
	kind = 'contacts'
) {
	// SAFETY: the actions read `request`, `locals` and `params` only.
	return actions[name]({
		request: post(fields),
		locals: localsFor(supabase, access),
		params: { kind, id: CONTACT_ID }
	} as never);
}

const posted: [string, string][] = [
	['id', ''],
	['kind', 'billing'],
	['line1', '1007 Mountain Drive'],
	['city', 'Gotham'],
	['region', 'NJ'],
	['postal_code', '07001'],
	['country', 'us'],
	['is_primary', 'on']
];

beforeEach(() => {
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('the address actions', () => {
	it('refuses a reader, and a kind that has no addresses, before writing anything', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(run('saveAddress', supabase, READER, posted)).rejects.toMatchObject({
			status: 403
		});
		await expect(run('saveAddress', supabase, OWNER, posted, 'products')).rejects.toMatchObject({
			status: 400
		});
		await expect(
			run('removeAddress', supabase, READER, [['id', ADDRESS_ID]])
		).rejects.toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});

	it('creates an address on the record, demoting the old primary, with no coordinates when geocoding is off', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: null },
			{ data: { id: ADDRESS_ID } }
		]);

		const result = await run('saveAddress', supabase, MANAGER, posted);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenNthCalledWith(1, 'addresses');
		expect(builder.update).toHaveBeenCalledWith({ is_primary: false });
		expect(builder.insert).toHaveBeenCalledWith({
			line1: '1007 Mountain Drive',
			line2: null,
			city: 'Gotham',
			region: 'NJ',
			postal_code: '07001',
			country: 'US',
			kind: 'billing',
			label: null,
			is_primary: true,
			latitude: null,
			longitude: null,
			org_id: ORG_ID,
			entity_type: 'contact',
			entity_id: CONTACT_ID
		});
		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('not configured'));
	});

	it('updates the address the post names', async () => {
		const { supabase, builder } = supabaseMockSequence([{ data: { id: ADDRESS_ID } }]);

		const result = await run('saveAddress', supabase, OWNER, [
			['id', ADDRESS_ID],
			['kind', 'primary'],
			['line1', '1 Main St'],
			['country', '']
		]);
		expect(result).toHaveProperty('form.valid', true);
		expect(builder.update).toHaveBeenCalledWith(
			expect.objectContaining({ line1: '1 Main St', country: null, is_primary: false })
		);
		expect(builder.eq).toHaveBeenCalledWith('id', ADDRESS_ID);
	});

	it('echoes a bad post back inline', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await run('saveAddress', supabase, OWNER, [
			['line1', ''],
			['country', 'USA']
		]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.errors.line1', ['The street address is required.']);
		expect(result).toHaveProperty('data.form.errors.country', [
			'Use the two-letter country code, like US.'
		]);
		expect(from).not.toHaveBeenCalled();
	});

	it('removes an address, and says so when nothing was removed', async () => {
		const removed = supabaseMockSequence([{ data: [{ id: ADDRESS_ID }] }]);
		await expect(
			run('removeAddress', removed.supabase, OWNER, [['id', ADDRESS_ID]])
		).resolves.toHaveProperty('form.valid', true);
		expect(removed.builder.delete).toHaveBeenCalled();

		const missing = supabaseMockSequence([{ data: [] }]);
		const result = await run('removeAddress', missing.supabase, OWNER, [['id', ADDRESS_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty(
			'data.form.message',
			expect.stringContaining('Address was not deleted')
		);
	});
});
