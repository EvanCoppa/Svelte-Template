import { describe, expect, it } from 'vitest';
import type { ViewDefinition } from '$lib/views/resolve';
import type { Address } from './addresses';
import type { Company } from './companies';
import { ORG_ID, supabaseMockSequence, supabaseTablesMock } from './test-support';
import { resultIds } from './lists';
import { pinsFor, runView } from './views';

const STEEL = '20000000-0000-0000-0000-000000000003';
const WAYNE = '20000000-0000-0000-0000-000000000001';

const suppliers: ViewDefinition = {
	id: 'suppliers',
	href: '/views/suppliers',
	source: 'company',
	filter: { where: [{ field: 'relationship', op: 'in', values: ['supplier'] }] },
	layouts: ['table', 'map'],
	defaultLayout: 'table'
};

const steel: Company = {
	id: STEEL,
	org_id: ORG_ID,
	name: 'Gotham Steel Supply',
	relationship: 'supplier',
	status: 'active',
	email: null,
	phone: ' +1 555 0180 ',
	website: null,
	vendor_account_number: null,
	payment_terms_days: null,
	distribution_fee_pct: null,
	created_by: null,
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-01T00:00:00Z'
};

const address = (overrides: Partial<Address>): Address =>
	({
		id: 'a1',
		org_id: ORG_ID,
		entity_type: 'company',
		entity_id: STEEL,
		kind: 'primary',
		label: null,
		line1: '1 Dock Rd',
		line2: null,
		city: 'Jersey City',
		region: 'NJ',
		postal_code: null,
		country: 'US',
		latitude: 40.7178,
		longitude: -74.0431,
		is_primary: true,
		created_at: '',
		updated_at: '',
		...overrides
	}) satisfies Address;

describe('runView', () => {
	it('compiles own-column conditions and the sort into the list module', async () => {
		const { supabase, from, builders } = supabaseTablesMock({ companies: { data: [steel] } });

		const result = await runView(supabase, ORG_ID, {
			...suppliers,
			filter: {
				where: [
					{ field: 'relationship', op: 'in', values: ['supplier'] },
					{ field: 'status', op: 'not_in', values: ['inactive'] },
					{ field: 'name', op: 'ilike', value: 'steel' }
				],
				sort: { field: 'created_at', direction: 'desc' }
			}
		});
		expect(result).toEqual({ kind: 'company', rows: [steel] });
		expect(from).toHaveBeenCalledTimes(1);
		const companies = builders.companies;
		expect(companies?.in).toHaveBeenCalledWith('relationship', ['supplier']);
		expect(companies?.not).toHaveBeenCalledWith('status', 'in', '(inactive)');
		expect(companies?.ilike).toHaveBeenCalledWith('name', '%steel%');
		expect(companies?.order).toHaveBeenCalledWith('created_at', { ascending: false });
		expect(resultIds(result)).toEqual([STEEL]);
	});

	it('resolves a tag to an id list first, and stops when nothing carries it', async () => {
		const tagged = supabaseMockSequence([{ data: [{ entity_id: STEEL }] }, { data: [steel] }]);
		await runView(tagged.supabase, ORG_ID, {
			...suppliers,
			filter: { where: [{ field: 'tag', op: 'has', value: 'preferred' }] }
		});
		expect(tagged.from).toHaveBeenNthCalledWith(1, 'taggings');
		expect(tagged.builder.ilike).toHaveBeenCalledWith('tags.name', 'preferred');
		expect(tagged.from).toHaveBeenNthCalledWith(2, 'companies');
		expect(tagged.builder.in).toHaveBeenCalledWith('id', [STEEL]);

		const untagged = supabaseMockSequence([{ data: [] }]);
		await expect(
			runView(untagged.supabase, ORG_ID, {
				...suppliers,
				filter: { where: [{ field: 'tag', op: 'has', value: 'preferred' }] }
			})
		).resolves.toEqual({ kind: 'company', rows: [] });
		expect(untagged.from).toHaveBeenCalledTimes(1);
	});

	it('hops from a contact view through the companies of a relationship', async () => {
		const view: ViewDefinition = {
			id: 'partner-contacts',
			href: '/views/partner-contacts',
			source: 'contact',
			filter: {
				where: [
					{ field: 'company.relationship', op: 'in', values: ['partner'] },
					{ field: 'has_company', op: 'eq', value: true }
				]
			},
			layouts: ['table'],
			defaultLayout: 'table'
		};
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: [{ id: WAYNE }] },
			{ data: [] }
		]);
		await runView(supabase, ORG_ID, view);
		expect(from).toHaveBeenNthCalledWith(1, 'companies');
		expect(builder.in).toHaveBeenCalledWith('relationship', ['partner']);
		expect(from).toHaveBeenNthCalledWith(2, 'contacts');
		expect(builder.in).toHaveBeenCalledWith('company_id', [WAYNE]);
		expect(builder.not).toHaveBeenCalledWith('company_id', 'is', null);

		const none = supabaseMockSequence([{ data: [] }]);
		await expect(runView(none.supabase, ORG_ID, view)).resolves.toEqual({
			kind: 'contact',
			rows: []
		});
		expect(none.from).toHaveBeenCalledTimes(1);
	});
});

describe('pinsFor', () => {
	it('pins every address with coordinates, named after its record, and skips the rest', () => {
		const pins = pinsFor({ kind: 'company', rows: [steel] }, () => true, [
			address({}),
			address({ id: 'a2', latitude: null }),
			address({ id: 'a3', entity_id: WAYNE })
		]);
		expect(pins).toEqual([
			{
				id: 'a1',
				recordId: STEEL,
				label: 'Gotham Steel Supply',
				href: `/companies/${STEEL}`,
				latitude: 40.7178,
				longitude: -74.0431
			}
		]);
		expect(
			pinsFor({ kind: 'company', rows: [steel] }, () => false, [address({})])[0]?.href
		).toBeNull();
	});
});
