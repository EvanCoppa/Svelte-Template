import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { FeatureMap } from '$lib/features/types';
import { ORG_ID, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { load } from './+page.server';

/**
 * The view page from the outside: a slug becomes a definition, the
 * definition becomes rows and pins, and what the reader may open decides
 * what links.
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['suppliers', 'read' as const]])
};

const STEEL = '20000000-0000-0000-0000-000000000003';

const features: FeatureMap = {
	suppliers: {
		mode: 'enabled',
		feature: {
			id: 'suppliers',
			name: 'Vendors',
			noun: 'vendor',
			description: null,
			route: '/views/suppliers',
			icon: 'truck',
			category: 'crm',
			sort_order: 12,
			created_at: ''
		}
	},
	companies: {
		mode: 'enabled',
		feature: {
			id: 'companies',
			name: 'Companies',
			noun: 'company',
			description: null,
			route: '/companies',
			icon: 'building-2',
			category: 'crm',
			sort_order: 10,
			created_at: ''
		}
	}
};

const suppliersRow = {
	id: 'suppliers',
	source: 'company',
	filter: { where: [{ field: 'relationship', op: 'in', values: ['supplier'] }] },
	columns: ['name', 'city'],
	layouts: ['table', 'map'],
	default_layout: 'table'
};

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the load reads `supabase`, `activeOrgId`, `org.features` and
	// `org.access`; the rest of App.Locals is never touched.
	return { supabase, activeOrgId: ORG_ID, org: { access, features } } as never;
}

function run(supabase: SupabaseClient<Database>, access: UserAccess, view: string) {
	// SAFETY: the load reads `locals`, `params` and calls `depends`; nothing else on the event.
	return load({ locals: localsFor(supabase, access), params: { view }, depends: vi.fn() } as never);
}

describe('the view page load', () => {
	it('runs the view and describes its rows and pins, pre-filling the create form', async () => {
		const { supabase, builders } = supabaseTablesMock({
			views: { data: [suppliersRow] },
			companies: { data: [{ id: STEEL, name: 'Gotham Steel Supply', relationship: 'supplier' }] },
			addresses: {
				data: [
					{
						id: 'a1',
						entity_id: STEEL,
						city: 'Jersey City',
						latitude: 40.7178,
						longitude: -74.0431
					}
				]
			}
		});

		const data = await run(supabase, OWNER, 'suppliers');
		if (!data) throw new Error('expected data');
		expect(data.view).toMatchObject({
			id: 'suppliers',
			source: 'company',
			columns: ['name', 'city']
		});
		expect(builders.companies?.in).toHaveBeenCalledWith('relationship', ['supplier']);
		expect(builders.addresses?.in).toHaveBeenCalledWith('entity_id', [STEEL]);
		expect(data.rows).toEqual([
			{
				id: STEEL,
				cells: [
					{ type: 'link', text: 'Gotham Steel Supply', href: `/companies/${STEEL}` },
					{ type: 'text', text: 'Jersey City' }
				]
			}
		]);
		expect(data.pins).toEqual([
			{
				id: 'a1',
				recordId: STEEL,
				label: 'Gotham Steel Supply',
				href: `/companies/${STEEL}`,
				latitude: 40.7178,
				longitude: -74.0431
			}
		]);
		expect(data.canCreate).toBe(true);
		expect(data.createForm.data.relationship).toBe('supplier');
		expect(data.createForm.valid).toBe(false);
		expect(data.createForm.errors).toEqual({});
	});

	it('shows plain names to a reader who may not open the source, and no Add button', async () => {
		const { supabase } = supabaseTablesMock({
			views: { data: [suppliersRow] },
			companies: { data: [{ id: STEEL, name: 'Gotham Steel Supply', relationship: 'supplier' }] },
			addresses: { data: [] }
		});

		const data = await run(supabase, READER, 'suppliers');
		if (!data) throw new Error('expected data');
		expect(data.rows[0]?.cells[0]).toEqual({
			type: 'link',
			text: 'Gotham Steel Supply',
			href: null
		});
		expect(data.canCreate).toBe(false);
	});

	it('404s a slug no row claims', async () => {
		const { supabase } = supabaseTablesMock({ views: { data: [suppliersRow] } });

		await expect(run(supabase, OWNER, 'nope')).rejects.toMatchObject({ status: 404 });
	});

	it('fails loudly on a row the app cannot read, naming the view', async () => {
		const { supabase } = supabaseTablesMock({
			views: { data: [{ ...suppliersRow, columns: ['name', 'sku'] }] }
		});

		await expect(run(supabase, OWNER, 'suppliers')).rejects.toThrow('View suppliers');
	});
});
