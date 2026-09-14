import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stringify } from 'devalue';
import type { Database } from '$lib/database.types';
import { ORG_ID, supabaseMockSequence } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions } from './+page.server';

/**
 * The assistant page's two artifact actions from the outside: a slot picked
 * on the pick-a-time card becomes a calendar event, and lines ticked on the
 * packing card become a box — each on the grant the same act takes on its
 * own page. The thread dialogs are covered by the conversations module.
 */

const USER_ID = '00000000-0000-0000-0000-000000000001';
const ORDER_ID = 'a1000000-0000-0000-0000-000000000001';
const LINE_ID = 'a2000000-0000-0000-0000-000000000001';
const SHIPMENT_ID = 'a3000000-0000-0000-0000-000000000001';

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([
		['calendar', 'read' as const],
		['orders', 'manage' as const],
		['shipments', 'read' as const]
	])
};

function localsFor(supabase: SupabaseClient<Database>, access: UserAccess): App.Locals {
	// SAFETY: the actions read `supabase`, `user`, `activeOrgId` and `org.access`;
	// the rest of App.Locals is never touched.
	return { supabase, user: { id: USER_ID }, activeOrgId: ORG_ID, org: { access } } as never;
}

/** A plain form post, the way the hidden slot form posts. */
function post(fields: [name: string, value: string][]) {
	const body = new FormData();
	for (const [name, value] of fields) body.append(name, value);
	return new Request('https://app.test/assistant', { method: 'POST', body });
}

/** The packing card's document, as the page posts it. */
type PackPost = { order_id: string; lines: { id: string; quantity: string }[] };

/** What `dataType: 'json'` posts: the whole document under one field, devalue-encoded. */
function postJson(data: PackPost) {
	const body = new FormData();
	body.set('__superform_json', stringify(data));
	return new Request('https://app.test/assistant', { method: 'POST', body });
}

function book(supabase: SupabaseClient<Database>, access: UserAccess, fields: [string, string][]) {
	// SAFETY: the action reads `request` and `locals` only.
	return actions.book({ request: post(fields), locals: localsFor(supabase, access) } as never);
}

function pack(supabase: SupabaseClient<Database>, access: UserAccess, data: PackPost) {
	// SAFETY: the action reads `request` and `locals` only.
	return actions.pack({ request: postJson(data), locals: localsFor(supabase, access) } as never);
}

const SLOT: [string, string][] = [
	['title', 'Site visit'],
	['starts_at', '2026-09-08T13:00:00.000Z'],
	['ends_at', '2026-09-08T14:00:00.000Z']
];

const line = { id: LINE_ID, order_id: ORDER_ID, quantity: 10, description: 'Cases of syrup' };

describe('the book action', () => {
	it('refuses a reader before writing anything', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);
		await expect(book(supabase, READER, SLOT)).rejects.toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});

	it('books the slot as a timed event in the default colour, for nobody in particular', async () => {
		const { supabase, from, builder } = supabaseMockSequence([{ data: { id: 'e1' } }]);

		const result = await book(supabase, OWNER, SLOT);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenCalledWith('calendar_events');
		expect(builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			title: 'Site visit',
			description: null,
			location: null,
			starts_at: '2026-09-08T13:00:00.000Z',
			ends_at: '2026-09-08T14:00:00.000Z',
			all_day: false,
			color: 'info',
			assigned_to: null,
			entity_type: null,
			entity_id: null
		});
	});

	it('refuses a slot that ends before it starts', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);
		const result = await book(supabase, OWNER, [
			['title', 'Backwards'],
			['starts_at', '2026-09-08T14:00:00.000Z'],
			['ends_at', '2026-09-08T13:00:00.000Z']
		]);
		expect(result).toMatchObject({ status: 400 });
		expect(from).not.toHaveBeenCalled();
	});
});

describe('the pack action', () => {
	it('refuses without the shipments grant, before reading the order', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);
		await expect(
			pack(supabase, READER, { order_id: ORDER_ID, lines: [{ id: LINE_ID, quantity: '10' }] })
		).rejects.toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});

	it('opens a preparing box and packs a whole line into it', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			// packableLines: the order's lines, then the ones already in a box.
			{ data: [line] },
			{ data: [] },
			// createShipment
			{ data: { id: SHIPMENT_ID } },
			// packLine
			{ data: { shipment_id: SHIPMENT_ID } }
		]);

		const result = await pack(supabase, OWNER, {
			order_id: ORDER_ID,
			lines: [{ id: LINE_ID, quantity: '10' }]
		});

		expect(result).toMatchObject({ shipmentId: SHIPMENT_ID });
		expect(from).toHaveBeenCalledTimes(4);
		expect(from).toHaveBeenNthCalledWith(3, 'shipments');
		expect(from).toHaveBeenNthCalledWith(4, 'shipment_line_items');
		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({ order_id: ORDER_ID, delivery_status: 'preparing' })
		);
		expect(builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			shipment_id: SHIPMENT_ID,
			order_line_item_id: LINE_ID
		});
	});

	it('splits a line that ships less than its quantity, so the rest stays on the order', async () => {
		const { supabase, from, builder } = supabaseMockSequence([
			{ data: [line] },
			{ data: [] },
			{ data: { id: SHIPMENT_ID } },
			// splitOrderLine: read the line, insert the remainder, update the original.
			{ data: line },
			{ data: { ...line, id: 'rest', quantity: 6 } },
			{ data: { ...line, quantity: 4 } },
			// packLine
			{ data: { shipment_id: SHIPMENT_ID } }
		]);

		const result = await pack(supabase, OWNER, {
			order_id: ORDER_ID,
			lines: [{ id: LINE_ID, quantity: '4' }]
		});

		expect(result).toMatchObject({ shipmentId: SHIPMENT_ID });
		// The box first, then the split's three writes, then the pack.
		expect(from).toHaveBeenCalledTimes(7);
		expect(from).toHaveBeenNthCalledWith(3, 'shipments');
		expect(from).toHaveBeenNthCalledWith(4, 'order_line_items');
		expect(from).toHaveBeenNthCalledWith(7, 'shipment_line_items');
		expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ quantity: 6 }));
		expect(builder.update).toHaveBeenCalledWith({ quantity: 4 });
	});

	it('refuses a line already in a box, and a quantity the line cannot give, before opening one', async () => {
		const taken = supabaseMockSequence([
			{ data: [line] },
			{ data: [{ order_line_item_id: LINE_ID }] }
		]);
		const refused = await pack(taken.supabase, OWNER, {
			order_id: ORDER_ID,
			lines: [{ id: LINE_ID, quantity: '10' }]
		});
		expect(refused).toMatchObject({ status: 400 });
		expect(refused).toHaveProperty(
			'data.form.message',
			expect.stringContaining('already in a box')
		);
		expect(taken.from).not.toHaveBeenCalledWith('shipments');

		const tooMany = supabaseMockSequence([{ data: [line] }, { data: [] }]);
		const result = await pack(tooMany.supabase, OWNER, {
			order_id: ORDER_ID,
			lines: [{ id: LINE_ID, quantity: '11' }]
		});
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty(
			'data.form.message',
			'Ship between 1 and 10 of “Cases of syrup”.'
		);
		expect(tooMany.from).not.toHaveBeenCalledWith('shipments');
	});
});
