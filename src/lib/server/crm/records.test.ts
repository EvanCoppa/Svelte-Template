import { describe, expect, it, vi } from 'vitest';
import type { Asset } from './assets';
import type { Billable } from './billables';
import type { CompanyWithContacts } from './companies';
import type { ContactWithCompany } from './contacts';
import type { CustomField } from './custom-fields';
import type { DealWithParties } from './deals';
import type { InvoiceWithDetails } from './invoices';
import type { ProductWithCategory } from './products';
import type { ProposalWithOptions } from './proposals';
import {
	describeAsset,
	describeBillable,
	describeCompany,
	describeContact,
	describeCustomField,
	describeDeal,
	describeInvoice,
	describeProduct,
	describeProposal,
	describeTask,
	describeTicket,
	getRecord,
	listRelatedRecords
} from './records';
import type { TaskWithParties } from './tasks';
import { ORG_ID, supabaseMock, supabaseMockSequence, supabaseTablesMock } from './test-support';
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
/** A dental practice's words for the two people on a proposal. */
const VOCABULARY = { proposal_presenter: 'Presenter', proposal_responsible: 'Provider' };

const wayne: CompanyWithContacts = {
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

const PROPOSAL_ID = 'a1000000-0000-0000-0000-000000000001';

const options: ProposalWithOptions = {
	id: PROPOSAL_ID,
	org_id: ORG_ID,
	entity_type: 'deal',
	entity_id: contract.id,
	title: 'Annual support contract — options',
	base_config: {},
	status: 'sent',
	default_fee: 250,
	tax_rate: 8.25,
	valid_until: '2026-10-01T09:00:00Z',
	selected_option_id: null,
	deck_id: null,
	presenter_id: USER_ID,
	responsible_id: null,
	proposal_options: [
		{
			id: 'o2',
			label: 'Standard',
			sort_order: 1,
			is_recommended: true,
			computed_total: 25000,
			currency: 'USD'
		},
		{
			id: 'o1',
			label: 'Basic',
			sort_order: 0,
			is_recommended: false,
			computed_total: 12000,
			currency: 'USD'
		}
	],
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
	status: 'todo',
	priority: 'high',
	companies: { id: COMPANY_ID, name: 'Wayne Enterprises' },
	contacts: null,
	...STAMPS
};

const INVOICE_ID = 'e5000000-0000-0000-0000-000000000001';

/** Net-30, issued, part paid and past due — the row the seed ships as INV-00001. */
const siteWork: InvoiceWithDetails = {
	id: INVOICE_ID,
	org_id: ORG_ID,
	company_id: COMPANY_ID,
	contact_id: CONTACT_ID,
	order_id: null,
	number: 'INV-00001',
	status: 'issued',
	payment_status: 'partial',
	currency: 'USD',
	subtotal: 1800,
	tax: 148.5,
	shipping: 0,
	discount: 0,
	amount_paid: 1000,
	total: 1948.5,
	balance_due: 948.5,
	payment_terms_days: 30,
	due_date: '2026-09-01',
	issued_at: '2026-08-02T09:00:00Z',
	paid_at: null,
	voided_at: null,
	billing_email: 'ap@wayne.example.com',
	memo: 'Site work, August.',
	notes: null,
	companies: { id: COMPANY_ID, name: 'Wayne Enterprises' },
	contacts: { id: CONTACT_ID, name: 'Lucius Fox' },
	invoice_line_items: [],
	payments: [],
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

	it('describes a proposal by its status, steering to the recommended option and its total', () => {
		const parent = { kind: 'deal' as const, id: contract.id, name: contract.title };
		const detail = describeProposal(options, parent, openAll, VOCABULARY);

		expect(detail.name).toBe('Annual support contract — options');
		expect(detail.pills).toEqual([{ label: 'Sent', tone: 'info' }]);
		expect(field(detail, 'For')).toEqual({
			type: 'record',
			value: 'Annual support contract',
			href: `/deals/${contract.id}`
		});
		// The two people, labelled as the industry labels them.
		expect(field(detail, 'Presenter')).toEqual({ type: 'person', userId: USER_ID });
		expect(field(detail, 'Provider')).toEqual({ type: 'empty' });
		expect(field(detail, 'Options')).toEqual({ type: 'number', value: 2 });
		expect(field(detail, 'Recommended option')).toEqual({ type: 'text', value: 'Standard' });
		expect(field(detail, 'Recommended total')).toEqual({
			type: 'money',
			value: 25000,
			currency: 'USD',
			unit: null
		});
		expect(field(detail, 'Selected option')).toEqual({ type: 'empty' });
		expect(field(detail, 'Valid until')).toEqual({ type: 'datetime', value: options.valid_until });
		expect(field(detail, 'Default fee')).toEqual({
			type: 'money',
			value: 250,
			currency: 'USD',
			unit: null
		});
		expect(field(detail, 'Tax rate')).toEqual({ type: 'text', value: '8.25%' });
	});

	it('links the record a proposal hangs off only when the reader may open it, and copes without one', () => {
		const parent = { kind: 'deal' as const, id: contract.id, name: contract.title };
		expect(field(describeProposal(options, parent, openNone, VOCABULARY), 'For')).toEqual({
			type: 'record',
			value: 'Annual support contract',
			href: null
		});

		// An unattached draft: nothing recommended, nothing priced, no parent.
		const draft = describeProposal(
			{
				...options,
				entity_type: null,
				entity_id: null,
				status: 'draft',
				tax_rate: null,
				default_fee: null,
				proposal_options: [
					{
						id: 'o1',
						label: 'Basic',
						sort_order: 0,
						is_recommended: false,
						computed_total: null,
						currency: 'USD'
					}
				]
			},
			null,
			openAll,
			VOCABULARY
		);
		expect(draft.pills).toEqual([{ label: 'Draft', tone: 'neutral' }]);
		expect(field(draft, 'For')).toEqual({ type: 'empty' });
		expect(field(draft, 'Recommended option')).toEqual({ type: 'empty' });
		expect(field(draft, 'Recommended total')).toEqual({ type: 'empty' });
		expect(field(draft, 'Tax rate')).toEqual({ type: 'empty' });

		const accepted = describeProposal(
			{ ...options, status: 'accepted', selected_option_id: 'o1' },
			parent,
			openAll,
			VOCABULARY
		);
		expect(field(accepted, 'Selected option')).toEqual({ type: 'text', value: 'Basic' });
	});

	it('describes a task by the column it is in and how much it is asking for', () => {
		const open = describeTask(renewal, openAll);
		expect(open.pills).toEqual([
			{ label: 'To do', tone: 'neutral' },
			{ label: 'High', tone: 'orange' }
		]);
		expect(field(open, 'Due')).toEqual({ type: 'datetime', value: renewal.due_at });
		expect(field(open, 'Completed')).toEqual({ type: 'empty' });
		expect(field(open, 'Contact')).toEqual({ type: 'empty' });

		// The status is the pill, not the timestamp: the two are held in step by
		// the task board migration's trigger, so a done row carries both.
		const done = describeTask(
			{ ...renewal, status: 'done', completed_at: '2026-09-10T10:00:00Z' },
			openAll
		);
		expect(done.pills).toEqual([
			{ label: 'Done', tone: 'success' },
			{ label: 'High', tone: 'orange' }
		]);

		const moving = describeTask({ ...renewal, status: 'in_progress' }, openAll);
		expect(moving.pills[0]).toEqual({ label: 'In progress', tone: 'info' });
	});

	it('leaves a task assignee to the relationships card rather than a field', () => {
		const detail = describeTask(renewal, openAll);
		expect(detail.fields.some((entry) => entry.label === 'Assigned to')).toBe(false);
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
			list_shown: false,
			list_searchable: false,
			list_filterable: false,
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

describe('describeInvoice', () => {
	it('names the bill by its number and reads it by its money, the customer as records', () => {
		const detail = describeInvoice(siteWork, openAll);
		expect(detail.kind).toBe('invoice');
		expect(detail.name).toBe('INV-00001');
		expect(detail.pills).toEqual([
			{ label: 'Issued', tone: 'info' },
			{ label: 'Partial', tone: 'info' }
		]);
		expect(field(detail, 'Company')).toEqual({
			type: 'record',
			value: 'Wayne Enterprises',
			href: `/companies/${COMPANY_ID}`
		});
		expect(field(detail, 'Contact')).toEqual({
			type: 'record',
			value: 'Lucius Fox',
			href: `/contacts/${CONTACT_ID}`
		});
		expect(field(detail, 'Terms')).toEqual({ type: 'text', value: 'Net 30' });
		expect(field(detail, 'Due')).toEqual({ type: 'date', value: '2026-09-01' });
		expect(field(detail, 'Total')).toEqual({
			type: 'money',
			value: 1948.5,
			currency: 'USD',
			unit: null
		});
		expect(field(detail, 'Balance due')).toEqual({
			type: 'money',
			value: 948.5,
			currency: 'USD',
			unit: null
		});
		expect(field(detail, 'Billing email')).toEqual({
			type: 'link',
			value: 'ap@wayne.example.com',
			href: 'mailto:ap@wayne.example.com'
		});
		expect(field(detail, 'Voided')).toEqual({ type: 'empty' });
	});

	it('gives a draft one pill and a bill to a person no company', () => {
		const draft = describeInvoice(
			{ ...siteWork, status: 'draft', payment_status: 'unpaid', company_id: null, companies: null },
			openNone
		);
		expect(draft.pills).toEqual([{ label: 'Draft', tone: 'neutral' }]);
		expect(field(draft, 'Company')).toEqual({ type: 'empty' });
		// Named, but not linked: the reader may not open contacts.
		expect(field(draft, 'Contact')).toEqual({ type: 'record', value: 'Lucius Fox', href: null });
	});
});

describe('describeAsset', () => {
	const laptop: Asset = {
		id: 'f1000000-0000-0000-0000-000000000001',
		org_id: ORG_ID,
		name: 'MacBook Pro',
		asset_type: 'device',
		identifier: 'IT-001',
		status: 'active',
		description: null,
		acquired_on: '2026-01-15',
		disposed_on: null,
		purchase_price: 2399,
		currency: 'USD',
		...STAMPS
	};

	it('pills the status and shows the universal columns only — who holds it is a relationship', () => {
		const detail = describeAsset(laptop);
		expect(detail.kind).toBe('asset');
		expect(detail.name).toBe('MacBook Pro');
		expect(detail.pills).toEqual([{ label: 'Active', tone: 'success' }]);
		expect(field(detail, 'Type')).toEqual({ type: 'text', value: 'device' });
		expect(field(detail, 'Identifier')).toEqual({ type: 'text', value: 'IT-001' });
		expect(field(detail, 'Acquired')).toEqual({ type: 'date', value: '2026-01-15' });
		expect(field(detail, 'Disposed')).toEqual({ type: 'empty' });
		expect(field(detail, 'Purchase price')).toEqual({
			type: 'money',
			value: 2399,
			currency: 'USD',
			unit: null
		});
		expect(detail.fields.map((f) => f.label)).not.toContain('Owner');
	});
});

describe('describeBillable', () => {
	const crown: Billable = {
		id: 'c1000000-0000-0000-0000-000000000001',
		org_id: ORG_ID,
		code: 'D2740',
		name: 'Porcelain crown',
		description: 'Full-coverage porcelain restoration.',
		unit_price: 1450,
		currency: 'USD',
		unit: 'tooth',
		unit_choices: null,
		is_featured: true,
		is_active: true,
		sort_order: 0,
		...STAMPS
	};

	it('shows the code, the price per unit and how its units are picked', () => {
		const detail = describeBillable(crown);
		expect(detail.kind).toBe('billable');
		expect(detail.name).toBe('Porcelain crown');
		expect(detail.pills).toEqual([{ label: 'Featured', tone: 'info' }]);
		expect(field(detail, 'Code')).toEqual({ type: 'text', value: 'D2740' });
		expect(field(detail, 'Unit price')).toEqual({
			type: 'money',
			value: 1450,
			currency: 'USD',
			unit: 'tooth'
		});
		expect(field(detail, 'Unit choices')).toEqual({ type: 'empty' });

		const quadrants = describeBillable({
			...crown,
			is_featured: false,
			is_active: false,
			unit_choices: ['UR', 'UL', 'BR', 'BL']
		});
		expect(quadrants.pills).toEqual([{ label: 'Inactive', tone: 'neutral' }]);
		expect(field(quadrants, 'Unit choices')).toEqual({ type: 'text', value: 'UR, UL, BR, BL' });
	});
});

describe('getRecord', () => {
	it('reads the table the kind lives in, scoped to the org and the id', async () => {
		const { supabase, from, builder } = supabaseMock({ data: fixings });

		const detail = await getRecord(supabase, ORG_ID, 'product', fixings.id, openAll, VOCABULARY);
		expect(from).toHaveBeenCalledWith('products');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', fixings.id);
		expect(detail?.name).toBe('Stainless fixing pack (100)');
	});

	it('dispatches every kind to its own table', async () => {
		const tables = {
			billable: 'billables',
			company: 'companies',
			contact: 'contacts',
			product: 'products',
			deal: 'deals',
			proposal: 'proposals',
			invoice: 'invoices',
			task: 'tasks',
			ticket: 'support_tickets'
		} as const;
		for (const [kind, table] of Object.entries(tables)) {
			const { supabase, from } = supabaseMock({ data: null });
			// SAFETY: the keys of `tables` are exactly the RecordKind union; Object.entries
			// widens them to string, and this puts the kind back.
			await expect(
				getRecord(supabase, ORG_ID, kind as keyof typeof tables, 'x', openAll, VOCABULARY)
			).resolves.toBeNull();
			expect(from).toHaveBeenCalledWith(table);
		}
	});

	it("reads the record a proposal hangs off through that kind's own table", async () => {
		const { supabase, from } = supabaseMockSequence([{ data: options }, { data: contract }]);

		const detail = await getRecord(supabase, ORG_ID, 'proposal', PROPOSAL_ID, openAll, VOCABULARY);
		expect(from).toHaveBeenNthCalledWith(1, 'proposals');
		expect(from).toHaveBeenNthCalledWith(2, 'deals');
		expect(detail && field(detail, 'For')).toEqual({
			type: 'record',
			value: 'Annual support contract',
			href: `/deals/${contract.id}`
		});

		// Unattached: one read, no parent to look for.
		const draft = supabaseMockSequence([
			{ data: { ...options, entity_type: null, entity_id: null } }
		]);
		const described = await getRecord(
			draft.supabase,
			ORG_ID,
			'proposal',
			PROPOSAL_ID,
			openAll,
			VOCABULARY
		);
		expect(draft.from).toHaveBeenCalledTimes(1);
		expect(described && field(described, 'For')).toEqual({ type: 'empty' });
	});

	it('throws the PostgREST message when the read fails', async () => {
		const { supabase } = supabaseMock({ error: { message: 'boom' } });

		await expect(getRecord(supabase, ORG_ID, 'deal', 'x', openAll, VOCABULARY)).rejects.toThrow(
			'boom'
		);
	});
});

describe('listRelatedRecords', () => {
	it('lists the people, deals, proposals, invoices, tasks and tickets that name a company, in nav order', async () => {
		const { supabase, from, builders } = supabaseTablesMock({
			contacts: { data: [lucius] },
			deals: { data: [contract] },
			proposals: { data: [{ ...options, entity_type: 'company', entity_id: COMPANY_ID }] },
			invoices: { data: [siteWork] },
			tasks: { data: [renewal] },
			support_tickets: { data: [exportBug] }
		});

		const groups = await listRelatedRecords(supabase, ORG_ID, 'company', COMPANY_ID, openAll);

		expect(groups.map((g) => g.kind)).toEqual([
			'contact',
			'deal',
			'proposal',
			'invoice',
			'task',
			'ticket'
		]);
		for (const table of ['contacts', 'deals', 'invoices', 'tasks', 'support_tickets']) {
			expect(from).toHaveBeenCalledWith(table);
			expect(builders[table].eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
		}
		// A proposal names its parent through the shared entity link.
		expect(builders.proposals.eq).toHaveBeenCalledWith('entity_type', 'company');
		expect(builders.proposals.eq).toHaveBeenCalledWith('entity_id', COMPANY_ID);
		expect(groups[2].records[0]).toEqual({
			id: PROPOSAL_ID,
			name: 'Annual support contract — options',
			href: `/proposals/${PROPOSAL_ID}`,
			pill: { label: 'Sent', tone: 'info' },
			meta: '$25,000.00'
		});
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
		// A bill on the account: what it asked for, and what is still owed on it.
		expect(groups[3].records[0]).toEqual({
			id: INVOICE_ID,
			name: 'INV-00001',
			href: `/invoices/${INVOICE_ID}`,
			pill: { label: 'Partial', tone: 'info' },
			meta: '$1,948.50 · $948.50 due'
		});
		expect(groups[4].records[0]).toMatchObject({
			pill: { label: 'To do', tone: 'neutral' },
			meta: 'Due Sep 15, 2026'
		});
		expect(groups[5].records[0]).toMatchObject({
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
		expect(from).not.toHaveBeenCalledWith('proposals');
		expect(from).not.toHaveBeenCalledWith('invoices');
		expect(from).not.toHaveBeenCalledWith('support_tickets');
		expect(from).toHaveBeenCalledWith('deals');
		// Fetched, empty, omitted.
		expect(from).toHaveBeenCalledWith('tasks');
		expect(groups.map((g) => g.kind)).toEqual(['deal']);
	});

	it('lists the proposals hanging off a deal, and nothing else, counting unpriced options', async () => {
		const unpriced = {
			...options,
			status: 'draft' as const,
			proposal_options: [
				{
					id: 'o1',
					label: 'Basic',
					sort_order: 0,
					is_recommended: false,
					computed_total: 12000,
					currency: 'USD'
				}
			]
		};
		const { supabase, from, builders } = supabaseTablesMock({ proposals: { data: [unpriced] } });

		const groups = await listRelatedRecords(supabase, ORG_ID, 'deal', contract.id, openAll);

		expect(groups.map((g) => g.kind)).toEqual(['proposal']);
		expect(from).toHaveBeenCalledTimes(1);
		expect(builders.proposals.eq).toHaveBeenCalledWith('entity_type', 'deal');
		expect(builders.proposals.eq).toHaveBeenCalledWith('entity_id', contract.id);
		// Nothing recommended: the meta says how many there are to choose from.
		expect(groups[0].records[0]).toMatchObject({
			pill: { label: 'Draft', tone: 'neutral' },
			meta: '1 option'
		});
	});

	it('has nothing to list for a kind nothing points at', async () => {
		const { supabase, from } = supabaseMock({ data: [] });

		await expect(
			listRelatedRecords(supabase, ORG_ID, 'product', fixings.id, openAll)
		).resolves.toEqual([]);
		expect(from).not.toHaveBeenCalled();
	});
});
