import { describe, expect, it } from 'vitest';
import type { OrgContext } from '$lib/server/org-context';
import { supabaseTablesMock } from '$lib/server/crm/test-support';
import type { AssistantToolContext } from '../context';
import { orgContext, ORG_ID, USER_ID } from '../test-support';
import { findOpenSlots } from './find-open-slots';
import { listRecords } from './list-records';
import { packableLines } from './packable-lines';

/**
 * The artifact tools: each answers with what a component in the thread draws
 * — a list page's spec and rows, the free slots of a window, what is left
 * to ship on an order — through the same modules the pages read, and says
 * whether the caller may act on the card.
 */

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const ORDER_ID = 'a1000000-0000-0000-0000-000000000001';
const LINE_ID = 'a2000000-0000-0000-0000-000000000001';
const PACKED_LINE_ID = 'a2000000-0000-0000-0000-000000000002';

const options = (context: AssistantToolContext) => ({
	toolCallId: 'call-1',
	messages: [],
	abortSignal: new AbortController().signal,
	context
});

/** A tool's result. None of these tools stream, so the SDK's iterable form never arrives. */
function settled<T>(result: T | AsyncIterable<T>): T {
	// SAFETY: every tool here returns its object from `execute`; the streaming form is never used.
	return result as T;
}

/** A tool context over the multi-table double, for tools that read several tables in one call. */
function tablesContext(
	org: OrgContext,
	results: Parameters<typeof supabaseTablesMock>[0]
): AssistantToolContext & { db: ReturnType<typeof supabaseTablesMock> } {
	const db = supabaseTablesMock(results);
	return { supabase: db.supabase, orgId: ORG_ID, userId: USER_ID, org, db };
}

/** The companies list's columns, as the list_fields migration keys them. */
const companyFields = ['name', 'status'].map((field, index) => ({
	feature_id: 'companies',
	field,
	label: null,
	shown: true,
	searchable: field === 'name',
	filterable: field === 'status',
	sort_order: (index + 1) * 100
}));

const registry = {
	list_fields: { data: companyFields },
	industry_list_fields: { data: [] },
	custom_field_definitions: { data: [] }
};

const wayne = {
	id: COMPANY_ID,
	name: 'Wayne Enterprises',
	status: 'active',
	relationship: 'customer'
};

describe('listRecords', () => {
	it('describes the kind’s rows for its feature’s list, capped, with the true count', async () => {
		const context = tablesContext(orgContext(), {
			...registry,
			companies: { data: [wayne, { ...wayne, id: 'x', name: 'Stark Industries', status: 'lead' }] }
		});

		const result = settled(
			await listRecords.execute!({ kind: 'company', limit: 1 }, options(context))
		);

		expect(context.db.builders.companies?.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(result.total).toBe(2);
		expect(result.spec.kind).toBe('company');
		expect(result.spec.fields.map((field) => field.key)).toEqual(['name', 'status']);
		expect(result.rows).toEqual([
			{
				id: COMPANY_ID,
				cells: [
					{ type: 'link', text: 'Wayne Enterprises', href: `/companies/${COMPANY_ID}` },
					{ type: 'status', text: 'active', tone: 'success' }
				]
			}
		]);

		// The model reads the visible cells as text, not the typed cells.
		expect(
			await listRecords.toModelOutput!({
				toolCallId: 'call-1',
				input: { kind: 'company', limit: 1 },
				output: result
			})
		).toEqual({
			type: 'json',
			value: {
				kind: 'company',
				total: 2,
				shown: 1,
				columns: ['name', 'status'],
				rows: [{ id: COMPANY_ID, cells: ['Wayne Enterprises', 'active'] }]
			}
		});
	});

	it('compiles a party filter through the view runner', async () => {
		const context = tablesContext(orgContext(), { ...registry, companies: { data: [] } });

		await listRecords.execute!(
			{
				kind: 'company',
				filter: { where: [{ field: 'relationship', op: 'in', values: ['supplier'] }] },
				limit: 50
			},
			options(context)
		);

		expect(context.db.builders.companies?.in).toHaveBeenCalledWith('relationship', ['supplier']);
	});

	it('refuses a filter on a kind that takes none, and a condition the kind lacks', async () => {
		const context = tablesContext(orgContext(), registry);

		await expect(
			listRecords.execute!(
				{
					kind: 'deal',
					filter: { where: [{ field: 'status', op: 'in', values: ['active'] }] },
					limit: 50
				},
				options(context)
			)
		).rejects.toThrow(/companies and contacts only/);
		await expect(
			listRecords.execute!(
				{
					kind: 'contact',
					filter: { where: [{ field: 'relationship', op: 'in', values: ['supplier'] }] },
					limit: 50
				},
				options(context)
			)
		).rejects.toThrow(/does not fit contact/);
		expect(context.db.from).not.toHaveBeenCalled();
	});

	it('refuses a kind the caller may not read before touching the database', async () => {
		const context = tablesContext(
			orgContext({ role: 'member', grants: { tasks: 'read' } }),
			registry
		);

		await expect(
			listRecords.execute!({ kind: 'company', limit: 50 }, options(context))
		).rejects.toThrow(/does not allow "read" on companies/);
		expect(context.db.from).not.toHaveBeenCalled();
	});
});

describe('findOpenSlots', () => {
	// Tue 8 Sep 2026, New York: one event 10:00–12:00 EDT.
	const window = { from: '2026-09-08T04:00:00-00:00', to: '2026-09-09T04:00:00-00:00' };
	const busy = {
		id: 'e1',
		assigned_to: USER_ID,
		starts_at: '2026-09-08T14:00:00Z',
		ends_at: '2026-09-08T16:00:00Z'
	};
	const search = {
		...window,
		timeZone: 'America/New_York',
		title: 'Site visit',
		durationMinutes: 60,
		dayStartHour: 9,
		dayEndHour: 12,
		weekdaysOnly: true
	};

	it('offers the working day around what is booked, and says whether the caller may book', async () => {
		const context = tablesContext(orgContext(), { calendar_events: { data: [busy] } });

		const result = settled(await findOpenSlots.execute!(search, options(context)));

		expect(context.db.builders.calendar_events?.lt).toHaveBeenCalledWith('starts_at', window.to);
		expect(result.busy).toBe(1);
		expect(result.canBook).toBe(true);
		// 9:00 fits before the 10:00 booking; 9:30 would run into it.
		expect(result.slots.map((slot) => slot.startsAt)).toEqual(['2026-09-08T13:00:00.000Z']);
	});

	it('counts only one member’s events as busy when asked, and a reader may not book', async () => {
		const context = tablesContext(orgContext({ role: 'member', grants: { calendar: 'read' } }), {
			calendar_events: { data: [busy] }
		});

		const result = settled(
			await findOpenSlots.execute!(
				{ ...search, assignedTo: '00000000-0000-0000-0000-000000000009' },
				options(context)
			)
		);

		expect(result.busy).toBe(0);
		expect(result.canBook).toBe(false);
		expect(result.slots).toHaveLength(5);
	});

	it('refuses a working day that closes before it opens', async () => {
		const context = tablesContext(orgContext(), { calendar_events: { data: [] } });

		await expect(
			findOpenSlots.execute!({ ...search, dayStartHour: 12, dayEndHour: 9 }, options(context))
		).rejects.toThrow(/close after it opens/);
		expect(context.db.from).not.toHaveBeenCalled();
	});
});

describe('packableLines', () => {
	const line = {
		id: LINE_ID,
		order_id: ORDER_ID,
		description: 'Cases of syrup',
		product_sku_snapshot: 'SYR-12',
		quantity: 10,
		unit_price: 42,
		fulfillment_status: 'pending'
	};
	const packed = { ...line, id: PACKED_LINE_ID, description: 'Pumps' };
	const order = {
		id: ORDER_ID,
		number: 'SO-1001',
		status: 'confirmed',
		companies: { id: COMPANY_ID, name: 'Wayne Enterprises' },
		contacts: null,
		order_line_items: [line, packed]
	};

	it('lists the lines in no box yet, with the order they belong to', async () => {
		const context = tablesContext(orgContext(), {
			orders: { data: order },
			order_line_items: { data: [line, packed] },
			shipment_line_items: { data: [{ order_line_item_id: PACKED_LINE_ID }] }
		});

		const result = await packableLines.execute!({ orderId: ORDER_ID }, options(context));

		expect(result).toEqual({
			found: true,
			order: {
				id: ORDER_ID,
				number: 'SO-1001',
				status: 'confirmed',
				customer: 'Wayne Enterprises'
			},
			lines: [
				{
					id: LINE_ID,
					description: 'Cases of syrup',
					sku: 'SYR-12',
					quantity: 10,
					unitPrice: 42,
					status: 'pending'
				}
			],
			packed: 1,
			canPack: true
		});
	});

	it('answers not found for an order RLS hides', async () => {
		const context = tablesContext(orgContext(), { orders: { data: null } });

		expect(await packableLines.execute!({ orderId: ORDER_ID }, options(context))).toEqual({
			found: false,
			lines: [],
			packed: 0,
			canPack: true
		});
	});

	it('takes the shipments grant, and reports when the order cannot be split', async () => {
		const reader = tablesContext(
			orgContext({ role: 'member', grants: { orders: 'manage', shipments: 'read' } }),
			{}
		);
		await expect(packableLines.execute!({ orderId: ORDER_ID }, options(reader))).rejects.toThrow(
			/does not allow "manage" on shipments/
		);

		const shipper = tablesContext(
			orgContext({ role: 'member', grants: { orders: 'read', shipments: 'manage' } }),
			{
				orders: { data: order },
				order_line_items: { data: [line] },
				shipment_line_items: { data: [] }
			}
		);
		const result = settled(await packableLines.execute!({ orderId: ORDER_ID }, options(shipper)));
		expect(result.canPack).toBe(false);
	});
});
