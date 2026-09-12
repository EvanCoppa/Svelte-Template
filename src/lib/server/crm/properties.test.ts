import { describe, expect, it } from 'vitest';
import {
	buildingIdOf,
	createProperty,
	deleteProperty,
	getProperty,
	isUnit,
	listProperties,
	listUnits,
	updateProperty
} from './properties';
import { ORG_ID, supabaseMock } from './test-support';

const BUILDING_ID = 'c1000000-0000-0000-0000-000000000001';
const UNIT_ID = 'c1000000-0000-0000-0000-000000000011';

describe('the property tree', () => {
	// The depth cap is enforced in the database; this is the pure half of it,
	// and it is what every report groups by instead of a recursive query.
	it('rolls a unit up to its building and a building up to itself', () => {
		expect(buildingIdOf({ id: UNIT_ID, parent_id: BUILDING_ID })).toBe(BUILDING_ID);
		expect(buildingIdOf({ id: BUILDING_ID, parent_id: null })).toBe(BUILDING_ID);
	});

	it('calls a row with a parent a unit, and a single-family neither', () => {
		expect(isUnit({ parent_id: BUILDING_ID })).toBe(true);
		// A single-family is its own rentable unit, and it has no parent — so
		// it reads as a building here, which is what the list and the pill say.
		expect(isUnit({ parent_id: null })).toBe(false);
	});
});

describe('properties data access', () => {
	it('lists the portfolio in service first, then by name', async () => {
		const rows = [{ id: BUILDING_ID, name: 'Rowan Street Duplex' }];
		const { supabase, from, builder } = supabaseMock({ data: rows });

		await expect(listProperties(supabase, ORG_ID)).resolves.toEqual(rows);
		expect(from).toHaveBeenCalledWith('properties');
		expect(builder.select).toHaveBeenCalledWith('*');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenNthCalledWith(1, 'status');
		expect(builder.order).toHaveBeenNthCalledWith(2, 'name');
	});

	// `null` is a real filter — "the buildings" — and a falsiness check would
	// silently drop it, which is the bug this test exists to stop.
	it('tells "the buildings" apart from "no parent filter"', async () => {
		const roots = supabaseMock({ data: [] });
		await listProperties(roots.supabase, ORG_ID, { parentId: null });
		expect(roots.builder.is).toHaveBeenCalledWith('parent_id', null);

		const all = supabaseMock({ data: [] });
		await listProperties(all.supabase, ORG_ID);
		expect(all.builder.is).not.toHaveBeenCalled();
		expect(all.builder.eq).toHaveBeenCalledTimes(1);
	});

	it('lists the units inside one building', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listUnits(supabase, ORG_ID, BUILDING_ID);
		expect(builder.eq).toHaveBeenCalledWith('parent_id', BUILDING_ID);
	});

	it('narrows to one status only when asked', async () => {
		const { supabase, builder } = supabaseMock({ data: [] });

		await listProperties(supabase, ORG_ID, { status: 'sold' });
		expect(builder.eq).toHaveBeenCalledWith('status', 'sold');
	});

	it('fetches one property, tolerating absence', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(getProperty(supabase, ORG_ID, UNIT_ID)).resolves.toBeNull();
		expect(builder.eq).toHaveBeenCalledWith('id', UNIT_ID);
		expect(builder.maybeSingle).toHaveBeenCalled();
	});

	it('creates a property in the org, leaving authorship to the database', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: UNIT_ID } });

		await createProperty(supabase, ORG_ID, {
			parent_id: BUILDING_ID,
			name: 'Rowan Street — Unit 1',
			property_type: 'apartment',
			identifier: 'ROWAN-1',
			status: 'active',
			description: null,
			bedrooms: 2,
			bathrooms: 1,
			square_feet: 940,
			market_rent: 2200,
			acquired_on: null,
			disposed_on: null,
			purchase_price: null,
			currency: 'USD'
		});
		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ org_id: ORG_ID, parent_id: BUILDING_ID })
		);
		// created_by is the column default, never sent from here.
		expect(builder.insert.mock.calls[0][0]).not.toHaveProperty('created_by');
	});

	it('updates a property within its org', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: UNIT_ID } });

		await updateProperty(supabase, ORG_ID, UNIT_ID, { market_rent: 2400 });
		expect(builder.update).toHaveBeenCalledWith({ market_rent: 2400 });
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', UNIT_ID);
	});

	it('throws when a delete removes nothing — RLS refused it', async () => {
		const { supabase } = supabaseMock({ data: [] });

		await expect(deleteProperty(supabase, ORG_ID, UNIT_ID)).rejects.toThrow(/Property/);
	});
});
