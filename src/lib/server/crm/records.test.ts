import { describe, expect, it, vi } from 'vitest';
import type { CompanyWithContacts } from './companies';
import type { ContactWithCompany } from './contacts';
import type { CustomField } from './custom-fields';
import type { DealWithParties } from './deals';
import type { ProductWithCategory } from './products';
import {
	describeCompany,
	describeContact,
	describeCustomField,
	describeDeal,
	describeProduct,
	describeTask,
	describeTicket,
	getRecord,
	listRelatedRecords
} from './records';
import type { TaskWithParties } from './tasks';
import { ORG_ID, supabaseMock, supabaseTablesMock } from './test-support';
import type { TicketThread } from './tickets';

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const STAMPS = {
	created_at: '2026-09-01T09:00:00Z',
	updated_at: '2026-09-02T09:00:00Z',
	created_by: USER_ID
};

const openAll = () => true;
const openNone = () => false;

const wayne: CompanyWithContacts = {
	id: COMPANY_ID,
	org_id: ORG_ID,
	name: 'Wayne Enterprises',
	email: 'hello@wayne.example.com',
	phone: '+1 555 0100',
	website: 'wayne.example.com',
	status: 'active',
	relationship: 'customer',
	contacts: [],
	...STAMPS
};

const lucius: ContactWithCompany = {
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

const fixings: ProductWithCategory = {
	id: 'b2000000-0000-0000-0000-000000000001',
	org_id: ORG_ID,
	category_id: 'b1000000-0000-0000-0000-000000000002',
	kind: 'good',
	sku: 'FIX-SS-100',
	name: 'Stainless fixing pack (100)',
	description: 'Marine-grade, for coastal installs.',
	unit_price: 42.5,
	unit_cost: 21,
	currency: 'USD',
	unit: 'pack',
	is_active: true,
	track_inventory: true,
	quantity_on_hand: 120,
	product_categories: { id: 'b1000000-0000-0000-0000-000000000002', name: 'Fixings' },
	...STAMPS
};

const contract: DealWithParties = {
	id: '40000000-0000-0000-0000-000000000001',
	org_id: ORG_ID,
	company_id: COMPANY_ID,
	contact_id: CONTACT_ID,
	title: 'Annual support contract',
	amount: 24000,
	pipeline_id: 'p1',
	stage_id: 's1',
	expected_close_date: '2026-12-01',
	assigned_to: USER_ID,
	companies: { id: COMPANY_ID, name: 'Wayne Enterprises' },
	contacts: { id: CONTACT_ID, name: 'Lucius Fox' },
	pipeline_stages: { id: 's1', name: 'Proposal', outcome: 'open', sort_order: 3 },
	...STAMPS
};

const renewal: TaskWithParties = {
	id: '50000000-0000-0000-0000-000000000001',
	org_id: ORG_ID,
	company_id: COMPANY_ID,
	contact_id: null,
	title: 'Send renewal quote',
	details: null,
	due_at: '2026-09-15T09:00:00Z',
	completed_at: null,
	assigned_to: USER_ID,
	companies: { id: COMPANY_ID, name: 'Wayne Enterprises' },
	contacts: null,
	...STAMPS
};

const exportBug: TicketThread = {
	id: '70000000-0000-0000-0000-000000000001',
	org_id: ORG_ID,
	number: 1,
	company_id: COMPANY_ID,
	contact_id: CONTACT_ID,
	subject: 'Cannot export invoices',
	description: 'Export button returns a 500 since the last update.',
	status: 'open',
	priority: 'high',
	assigned_to: null,
	companies: { id: COMPANY_ID, name: 'Wayne Enterprises' },
	contacts: { id: CONTACT_ID, name: 'Lucius Fox' },
	ticket_comments: [
		{
			id: 'c1',
			org_id: ORG_ID,
			ticket_id: '70000000-0000-0000-0000-000000000001',
			author_id: USER_ID,
			body: 'Reproduced on staging.',
			is_internal: true,
			created_at: STAMPS.created_at,
			updated_at: STAMPS.updated_at
		}
	],
	...STAMPS
};

/** The value a describer gave one labelled field. */
function field(detail: { fields: { label: string; value: object }[] }, label: string) {
	const found = detail.fields.find((f) => f.label === label);
	if (!found) throw new Error(`no field labelled ${label}`);
	return found.value;
}

describe('describing a record', () => {
	it('describes a company: contact channels as links, lifecycle as pills', () => {
		const detail = describeCompany(wayne);

		expect(detail).toMatchObject({
			kind: 'company',
			id: COMPANY_ID,
			name: 'Wayne Enterprises',
			createdAt: STAMPS.created_at,
			updatedAt: STAMPS.updated_at,
			createdBy: USER_ID
		});
		expect(detail.pills).toEqual([
			{ label: 'Customer', tone: 'success' },
			{ label: 'Active', tone: 'success' }
		]);
		expect(field(detail, 'Email')).toEqual({
			type: 'link',
			value: 'hello@wayne.example.com',
			href: 'mailto:hello@wayne.example.com'
		});
		expect(field(detail, 'Phone')).toEqual({
			type: 'link',
			value: '+1 555 0100',
			href: 'tel:+15550100'
		});
		// A bare domain gets a scheme so it is actually a link.
		expect(field(detail, 'Website')).toEqual({
			type: 'link',
			value: 'wayne.example.com',
			href: 'https://wayne.example.com'
		});
	});

	it('leaves a blank column empty rather than inventing a value', () => {
		const detail = describeCompany({ ...wayne, email: null, phone: null, website: '  ' });

		expect(field(detail, 'Email')).toEqual({ type: 'empty' });
		expect(field(detail, 'Phone')).toEqual({ type: 'empty' });
		// Whitespace is blank too, for a link as much as for text.
		expect(field(detail, 'Website')).toEqual({ type: 'empty' });
		expect(describeContact({ ...lucius, title: '  ' }, openAll).fields).toContainEqual({
			label: 'Title',
			value: { type: 'empty' }
		});
	});

	it('links a contact to their company only when the reader may open companies', () => {
		expect(field(describeContact(lucius, openAll), 'Company')).toEqual({
			type: 'record',
			value: 'Wayne Enterprises',
			href: `/companies/${COMPANY_ID}`
		});
		expect(field(describeContact(lucius, openNone), 'Company')).toEqual({
			type: 'record',
			value: 'Wayne Enterprises',
			href: null
		});
		// A person who is the customer themselves belongs to no company.
		expect(field(describeContact({ ...lucius, companies: null }, openAll), 'Company')).toEqual({
			type: 'empty'
		});
		expect(field(describeContact(lucius, openAll), 'Primary contact')).toEqual({
			type: 'boolean',
			value: true
		});
	});

	it('prices a product in its own currency per unit, and only counts stock for goods', () => {
		const detail = describeProduct(fixings);

		expect(detail.pills).toEqual([{ label: 'Good', tone: 'cyan' }]);
		expect(field(detail, 'Unit price')).toEqual({
			type: 'money',
			value: 42.5,
			currency: 'USD',
			unit: 'pack'
		});
		expect(field(detail, 'Category')).toEqual({ type: 'text', value: 'Fixings' });
		expect(field(detail, 'On hand')).toEqual({ type: 'number', value: 120 });

		const service = describeProduct({
			...fixings,
			kind: 'service',
			track_inventory: false,
			quantity_on_hand: null,
			is_active: false,
			product_categories: null
		});
		expect(service.fields.map((f) => f.label)).not.toContain('On hand');
		expect(field(service, 'Category')).toEqual({ type: 'empty' });
		// Active is the normal state; only the exception earns a pill.
		expect(service.pills).toEqual([
			{ label: 'Service', tone: 'violet' },
			{ label: 'Inactive', tone: 'neutral' }
		]);
	});

	it('describes a deal by its stage, with the parties as records and the assignee as a person', () => {
		const detail = describeDeal(contract, openAll);

		expect(detail.name).toBe('Annual support contract');
		expect(detail.pills).toEqual([{ label: 'Proposal', tone: 'info' }]);
		expect(field(detail, 'Company')).toMatchObject({
			type: 'record',
			href: `/companies/${COMPANY_ID}`
		});
		expect(field(detail, 'Contact')).toMatchObject({
			type: 'record',
			href: `/contacts/${CONTACT_ID}`
		});
		expect(field(detail, 'Amount')).toEqual({
			type: 'money',
			value: 24000,
			currency: 'USD',
			unit: null
		});
		expect(field(detail, 'Expected close')).toEqual({ type: 'date', value: '2026-12-01' });
		expect(field(detail, 'Assigned to')).toEqual({ type: 'person', userId: USER_ID });
	});

	it('describes a task as open or done from completed_at', () => {
		const open = describeTask(renewal, openAll);
		expect(open.pills).toEqual([{ label: 'Open', tone: 'info' }]);
		expect(field(open, 'Due')).toEqual({ type: 'datetime', value: renewal.due_at });
		expect(field(open, 'Completed')).toEqual({ type: 'empty' });
		expect(field(open, 'Contact')).toEqual({ type: 'empty' });

		const done = describeTask({ ...renewal, completed_at: '2026-09-10T10:00:00Z' }, openAll);
		expect(done.pills).toEqual([{ label: 'Done', tone: 'success' }]);
	});

	it('describes a ticket by status and priority, counting its thread rather than showing it', () => {
		const detail = describeTicket(exportBug, openAll);

		expect(detail.name).toBe('Cannot export invoices');
		expect(detail.pills).toEqual([
			{ label: 'Open', tone: 'info' },
			{ label: 'High', tone: 'orange' }
		]);
		expect(field(detail, 'Number')).toEqual({ type: 'text', value: '#1' });
		expect(field(detail, 'Comments')).toEqual({ type: 'number', value: 1 });
		expect(field(detail, 'Assigned to')).toEqual({ type: 'empty' });
	});

	it('describes a custom field in the column its type uses, or empty when unfilled', () => {
		const definition = (
			value_type: CustomField['definition']['value_type']
		): CustomField['definition'] => ({
			id: 'd1',
			org_id: ORG_ID,
			entity_type: 'contact',
			key: 'preferred_channel',
			label: 'Preferred channel',
			value_type,
			allowed_values: ['email', 'phone'],
			created_at: STAMPS.created_at,
			updated_at: STAMPS.updated_at
		});
		const value: NonNullable<CustomField['value']> = {
			id: 'v1',
			org_id: ORG_ID,
			entity_type: 'contact',
			entity_id: CONTACT_ID,
			field_definition_id: 'd1',
			value_text: 'email',
			value_numeric: 7,
			value_boolean: false,
			created_at: STAMPS.created_at,
			updated_at: STAMPS.updated_at
		};
		const of = (value_type: CustomField['definition']['value_type'], filled: boolean) =>
			describeCustomField({ definition: definition(value_type), value: filled ? value : null });

		expect(of('select', true)).toEqual({
			key: 'preferred_channel',
			label: 'Preferred channel',
			value: { type: 'text', value: 'email' }
		});
		expect(of('numeric', true).value).toEqual({ type: 'number', value: 7 });
		expect(of('boolean', true).value).toEqual({ type: 'boolean', value: false });
		expect(of('text', false).value).toEqual({ type: 'empty' });
	});
});

describe('getRecord', () => {
	it('reads the table the kind lives in, scoped to the org and the id', async () => {
		const { supabase, from, builder } = supabaseMock({ data: fixings });

		const detail = await getRecord(supabase, ORG_ID, 'product', fixings.id, openAll);
		expect(from).toHaveBeenCalledWith('products');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', fixings.id);
		expect(detail?.name).toBe('Stainless fixing pack (100)');
	});

	it('dispatches every kind to its own table', async () => {
		const tables = {
			company: 'companies',
			contact: 'contacts',
			product: 'products',
			deal: 'deals',
			task: 'tasks',
			ticket: 'support_tickets'
		} as const;
		for (const [kind, table] of Object.entries(tables)) {
			const { supabase, from } = supabaseMock({ data: null });
			// SAFETY: the keys of `tables` are exactly the RecordKind union; Object.entries
			// widens them to string, and this puts the kind back.
			await expect(
				getRecord(supabase, ORG_ID, kind as keyof typeof tables, 'x', openAll)
			).resolves.toBeNull();
			expect(from).toHaveBeenCalledWith(table);
		}
	});

	it('throws the PostgREST message when the read fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(getRecord(supabase, ORG_ID, 'deal', 'x', openAll)).rejects.toThrow('boom');
	});
});

describe('listRelatedRecords', () => {
	it('lists the people, deals, tasks and tickets that name a company, in nav order', async () => {
		const { supabase, from, builders } = supabaseTablesMock({
			contacts: { data: [lucius] },
			deals: { data: [contract] },
			tasks: { data: [renewal] },
			support_tickets: { data: [exportBug] }
		});

		const groups = await listRelatedRecords(supabase, ORG_ID, 'company', COMPANY_ID, openAll);

		expect(groups.map((g) => g.kind)).toEqual(['contact', 'deal', 'task', 'ticket']);
		for (const table of ['contacts', 'deals', 'tasks', 'support_tickets']) {
			expect(from).toHaveBeenCalledWith(table);
			expect(builders[table].eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
		}
		expect(groups[0].records[0]).toEqual({
			id: CONTACT_ID,
			name: 'Lucius Fox',
			href: `/contacts/${CONTACT_ID}`,
			pill: { label: 'Active', tone: 'success' },
			meta: 'CEO'
		});
		expect(groups[1].records[0]).toMatchObject({
			href: `/deals/${contract.id}`,
			pill: { label: 'Proposal', tone: 'info' },
			meta: '$24,000.00'
		});
		expect(groups[2].records[0]).toMatchObject({
			pill: { label: 'Open', tone: 'info' },
			meta: 'Due Sep 15, 2026'
		});
		expect(groups[3].records[0]).toMatchObject({
			href: `/tickets/${exportBug.id}`,
			pill: { label: 'Open', tone: 'info' },
			meta: '#1 · high priority'
		});
	});

	it('never fetches a kind the reader may not open, and drops empty groups', async () => {
		const { supabase, from } = supabaseTablesMock({
			deals: { data: [contract] },
			tasks: { data: [] }
		});
		const canOpen = vi.fn((kind: string) => kind === 'deal' || kind === 'task');

		const groups = await listRelatedRecords(supabase, ORG_ID, 'contact', CONTACT_ID, canOpen);

		// A contact's page never lists contacts, so that kind is not even asked about.
		expect(canOpen).not.toHaveBeenCalledWith('contact');
		expect(from).not.toHaveBeenCalledWith('contacts');
		expect(from).not.toHaveBeenCalledWith('support_tickets');
		expect(from).toHaveBeenCalledWith('deals');
		// Fetched, empty, omitted.
		expect(from).toHaveBeenCalledWith('tasks');
		expect(groups.map((g) => g.kind)).toEqual(['deal']);
	});

	it('has nothing to list for a kind nothing points at', async () => {
		const { supabase, from } = supabaseMock({ data: [] });

		await expect(
			listRelatedRecords(supabase, ORG_ID, 'product', fixings.id, openAll)
		).resolves.toEqual([]);
		expect(from).not.toHaveBeenCalled();
	});
});
