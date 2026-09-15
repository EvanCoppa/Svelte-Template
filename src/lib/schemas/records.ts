import { z } from 'zod';
import type { FeatureId } from '$lib/features/types';
import { parseFix } from '$lib/crm/visits';
import { QUERY } from '$lib/queries';

/**
 * The create-a-record registry — one table describing every kind of object a
 * list page can add, and the single generic form that adds it.
 *
 * A record type says three things: what it is called, which feature owns it
 * (the permission the writer needs, and the query key its list depends on),
 * and the fields the form asks for. `CreateRecord` renders those fields,
 * `$lib/server/records.ts` validates the post against the same schema and
 * hands the values to the matching `$lib/server/crm/*` module. Adding a kind
 * of record = a schema, a `RECORD_FORMS` entry, and one `case` in that
 * module's insert switch — no new form, action or modal.
 *
 * **Every field posts a string.** One component renders one input per field
 * and nothing needs a per-type binding, which is what makes the form generic;
 * the server turns the strings into columns (blank → null, an amount into a
 * number, a picked instant into an ISO timestamp) inside that one switch.
 * Client-safe like every schema module — no `$lib/server` imports.
 *
 * The fields are the record's own columns, plus the ones that point it at
 * another row: a `company`, `contact` or `property` field is a picker whose
 * options `loadCreateRecord()` reads per request (an invoice is a bill to
 * someone and a lease is over something, so neither can be created without
 * one). Still one form — the picker is a field type, not a second modal.
 *
 * A proposal is not here on purpose: it is a title plus one to five priced
 * options made of catalog lines — more than one row of strings — so it has
 * the builder page at `src/routes/(app)/proposals/new/` instead, the one
 * kind whose creation is a screen rather than this modal. A task is listed
 * but created elsewhere too: the tasks page's own modal writes the row and
 * its `assigned_to` relationships in one post (docs/tasks.md), and its entry
 * here is what the record page EDITS a task with.
 */

/** Kinds of record the generic form can create. */
export const RECORD_TYPES = [
	'company',
	'contact',
	'deal',
	'product',
	'billable',
	'asset',
	'property',
	'lease',
	'invoice',
	'coupon',
	'order',
	'purchase',
	'rma',
	'task',
	'ticket',
	'visit'
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

/**
 * Whether a kind of record has a form in this registry — which is to say
 * whether it can be created at all. A kind with a page but no form here
 * (a proposal, a shipment) is one whose creation is a screen or an act on
 * another record, and says so where it lives.
 */
export function isRecordType(kind: string): kind is RecordType {
	return RECORD_TYPES.some((type) => type === kind);
}

/** What every record form's values look like: one string per field. */
export type RecordFormValues = Record<string, string>;

export type RecordFieldOption = { value: string; label: string; sublabel?: string };

/**
 * The kinds of row a record form can point at — each a picker whose options
 * are the org's own rows rather than a vocabulary the registry can hold: the
 * two parties, the stage a deal sits in (its board is `pipelines` rows, so
 * the choices differ per org and per industry), and the property a lease is
 * over (a unit is a row like any other).
 */
export const RECORD_PICKER_KINDS = [
	'company',
	'contact',
	'stage',
	'property',
	/**
	 * Who a visit was to, across every kind you can go and see — one picker
	 * rather than "pick a kind, then pick a record", because that is two
	 * questions for one answer. Its values are `<kind>:<id>` (the ledger's
	 * `company:<id>` account key, generalised), and `writeRecord()` is the one
	 * place that splits the pair back into the entity link's two columns.
	 */
	'subject',
	/** An org's own `visit_outcomes` rows, like a deal's stage. */
	'outcome',
	/** The org's own catalog tree — a product is filed under one of its nodes. */
	'category',
	/**
	 * Someone who works here, from the org's roster — who a record that
	 * carries an `assigned_to` column belongs to. A membership is not a
	 * record kind, so this picker's rows are the staff list rather than
	 * anything `findRecords` can reach.
	 *
	 * **Assigning is not linking**, and a record often does both: the
	 * assignee is the colleague who will do the work, while `company` and
	 * `contact` are the party it is FOR. A task's assignees are neither —
	 * they are `assigned_to` relationships, several per task and ended
	 * rather than deleted (docs/tasks.md), which is why the task modal
	 * writes them and no form field can.
	 */
	'member'
] as const;

export type RecordPickerKind = (typeof RECORD_PICKER_KINDS)[number];

/** The options behind each picker on a form, loaded per request by `loadCreateRecord()`. */
export type RecordPickers = Partial<Record<RecordPickerKind, readonly RecordFieldOption[]>>;

/**
 * How one field is rendered. `select` is a fixed vocabulary this app owns (an
 * enum column) and renders as a `Combobox`; `number` is money or a measure
 * and `integer` a count (days of terms); `datetime` is a wall-clock pick the
 * browser converts to an instant before posting; the picker kinds
 * (`RECORD_PICKER_KINDS`) are choices from the org's own rows, whose options
 * arrive with the form rather than sitting in the registry.
 */
export type RecordField = {
	name: string;
	label: string;
	type:
		| 'text'
		| 'email'
		| 'tel'
		| 'url'
		| 'number'
		| 'integer'
		| 'date'
		| 'datetime'
		| 'textarea'
		| 'select'
		/**
		 * A point the device reported, as one string (`$lib/crm/visits`'
		 * `formatFix()`): a latitude and a longitude are not two fields,
		 * because neither half is separately typeable or separately
		 * meaningful. Read-only to the keyboard — it is captured, not typed.
		 */
		| 'geo'
		| RecordPickerKind;
	placeholder?: string;
	/** Required for `type: 'select'`, meaningless otherwise. */
	options?: readonly RecordFieldOption[];
	/** Span both columns of the form grid — long text, mostly. */
	wide?: boolean;
};

export type RecordForm = {
	/**
	 * The feature that owns the record: `manage` on it is what creating needs,
	 * and its terms are what the button, the modal and the toast call the
	 * record ("Add quote") — see `recordTerms()` in `$lib/crm/records`.
	 */
	feature: FeatureId;
	/** The list this creates a row in, so the page refreshes and nothing else does. */
	query: string;
	fields: readonly RecordField[];
};

// --- Field building blocks ---------------------------------------------------
//
// Zod messages are user-facing copy, so they are written as sentences. Blank
// is the empty string rather than undefined throughout: an HTML form posts
// "not filled in" as '', and the server is the one place that turns it into a
// null column.

const email = z.email();

/**
 * A field that must be filled in. The message is spelled for BOTH ways it can
 * be missing — left blank on a form, and absent altogether from a writer that
 * is not a form (`insertRecord()`, the assistant's) — so a required field
 * reads the same sentence whoever left it out.
 */
const requiredText = (label: string) =>
	z
		.string({ error: `${label} is required.` })
		.trim()
		.min(1, `${label} is required.`)
		.max(200, `${label} must be 200 characters or fewer.`);

const optionalText = z.string().trim().max(200, 'Must be 200 characters or fewer.').default('');

const optionalEmail = z
	.string()
	.trim()
	.max(200, 'Must be 200 characters or fewer.')
	.refine((value) => value === '' || email.safeParse(value).success, {
		error: 'Enter a valid email address.'
	})
	.default('');

const optionalLongText = z
	.string()
	.trim()
	.max(2000, 'Must be 2000 characters or fewer.')
	.default('');

/** Money as typed: blank, or digits with up to two decimals. */
const optionalAmount = z
	.string()
	.trim()
	.regex(/^$|^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount like 1200 or 1200.50')
	.default('');

/** A whole number as typed, or blank: days of terms, a count. */
const optionalInteger = z
	.string()
	.trim()
	.regex(/^$|^\d{1,4}$/, 'Enter a whole number.')
	.default('');

/**
 * A tally that can run past a few thousand — how many people reviewed a
 * product. `optionalInteger` caps at four digits because the things it counts
 * (days of terms, bedrooms) genuinely are small; a review count is not.
 */
const optionalCount = z
	.string()
	.trim()
	.regex(/^$|^\d{1,7}$/, 'Enter a whole number.')
	.default('');

/** A star rating out of five, or blank for unrated. */
const optionalRating = z
	.string()
	.trim()
	.regex(/^$|^[0-5](\.\d{1,2})?$/, 'Enter a rating from 0 to 5, like 4.8')
	.default('');

/**
 * A full URL, or blank. Longer than `optionalText` allows because a CDN path
 * with a signature on it routinely runs past 200 characters.
 */
const optionalUrl = z
	.string()
	.trim()
	.max(2000, 'Must be 2000 characters or fewer.')
	.refine((value) => value === '' || z.url().safeParse(value).success, {
		error: 'Enter a full URL, starting with https://'
	})
	.default('');

/** A row picked from a party picker, or blank for none. */
const optionalPick = z.guid().or(z.literal('')).default('');

/** What `<input type="date">` posts. */
const optionalDate = z
	.string()
	.trim()
	.regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Choose a date.')
	.default('');

/**
 * A wall-clock pick, or the instant the browser turned it into. The client
 * converts `2026-09-10T17:00` to an ISO string with the viewer's offset before
 * posting, so both shapes are legal here — and without JavaScript the naive
 * form still arrives and is read as UTC.
 *
 * Exported because a record's date is picked in more than one place — the
 * create form, and the task board's cards — and two spellings of "what a date
 * input posts" is how one of them starts rejecting what the other sends.
 */
export const optionalInstant = z
	.string()
	.trim()
	.regex(/^$|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/, {
		error: 'Choose a date and time.'
	})
	.default('');

// --- The schemas -------------------------------------------------------------
//
// Each one mirrors the columns its `$lib/server/crm/*` module accepts on
// insert. They stay exported so the server can re-parse the validated values
// and get the enum unions back — the generic form erases them to strings.

export const companyRecordSchema = z.object({
	name: requiredText('Name'),
	relationship: z.enum(['customer', 'supplier', 'partner', 'other']).default('customer'),
	status: z.enum(['lead', 'prospect', 'active', 'inactive']).default('lead'),
	email: optionalEmail,
	phone: optionalText,
	website: optionalText
});

export const contactRecordSchema = z.object({
	name: requiredText('Name'),
	title: optionalText,
	email: optionalEmail,
	phone: optionalText,
	status: z.enum(['lead', 'prospect', 'active', 'inactive']).default('lead')
});

export const dealRecordSchema = z.object({
	title: requiredText('Title'),
	/**
	 * Who the deal is with. Both may be blank — an opportunity nobody is
	 * attached to yet is a legitimate row (crm/deals.ts) — and both may be
	 * set: a buyer at a company is a person AND an account.
	 */
	company_id: optionalPick,
	contact_id: optionalPick,
	/**
	 * Whose deal it is: one person who works here, pinned to the membership
	 * by a composite key, so leaving it blank clears it. A column rather than
	 * a relationship because a deal has exactly one owner (docs/relationships.md).
	 */
	assigned_to: optionalPick,
	/**
	 * Where the deal sits on a board. Blank on create means "the org's default
	 * board, first stage" (`crm/deals.ts` places it); blank on edit means the
	 * same, which is why nothing here is required — a deal always has a stage,
	 * but the form never has to know which one.
	 */
	stage_id: optionalPick,
	amount: optionalAmount,
	expected_close_date: optionalDate
});

/**
 * The catalog row, and the storefront copy that hangs off it.
 *
 * The fields below `long_description` are the `metadata` bag — everything a
 * public shop shows that does not warrant a column of its own (the storefront
 * fields migration says why). They are flat strings here like every other
 * field, and `writeRecord()` folds them into the jsonb.
 *
 * **The form holds the whole bag.** An edit rewrites `metadata` from these
 * fields rather than merging into what was there, because merging would mean
 * a badge you deleted quietly staying put — the rule every other field on
 * every other form follows. The cost is that a key a storefront starts
 * reading has to become a field here in the same change, or the first edit
 * after that drops it.
 */
export const productRecordSchema = z.object({
	name: requiredText('Name'),
	kind: z.enum(['good', 'service']).default('good'),
	category_id: optionalPick,
	sku: optionalText,
	unit_price: optionalAmount,
	unit_cost: optionalAmount,
	unit: optionalText,
	/**
	 * The list price struck through beside `unit_price` when the shop runs a
	 * promotion. The column is the one home for that fact; the storefront
	 * reads it as `metadata.compareAtCents`, which `writeRecord()` derives —
	 * so there is still one field to edit and one place it is typed.
	 */
	msrp: optionalAmount,
	/** Still sold. A shop shows active products and nothing else. */
	is_active: z.enum(['true', 'false']).default('true'),
	description: optionalLongText,
	long_description: optionalLongText,
	image_url: optionalUrl,
	/** The shop's URL for this product — and, being that, its publish switch. */
	slug: optionalText,
	tagline: optionalText,
	/** Which illustration the shop draws. The storefront owns that vocabulary. */
	art: optionalText,
	accent: optionalText,
	/** Comma-separated, like a billable's unit choices. */
	badges: optionalText,
	rating: optionalRating,
	review_count: optionalCount,
	ingredients: optionalLongText,
	/** One step per line. */
	usage: optionalLongText,
	/** One `Label: value` per line; a line with no colon is a value on its own. */
	specs: optionalLongText,
	featured: z.enum(['true', 'false']).default('false'),
	best_seller: z.enum(['true', 'false']).default('false')
});

export type ProductRecordValues = z.infer<typeof productRecordSchema>;

/**
 * The storefront bag as it is stored, for reading one back into the form.
 *
 * `metadata` is jsonb: this app writes it, but Postgres does not type it and a
 * row can have been edited by hand or by an older version of this form. So it
 * is parsed rather than trusted, and every key falls back instead of throwing
 * — the rule a user preference follows (docs/user-preferences.md). A bag that
 * is not an object at all reads as a product with no storefront copy.
 *
 * `writeRecord()` is what fills it; the keys here are exactly the fields
 * `productRecordSchema` holds, which is what keeps an edit from dropping one.
 */
const storefrontBag = z.object({
	slug: z.string().catch(''),
	tagline: z.string().catch(''),
	art: z.string().catch(''),
	accent: z.string().catch(''),
	badges: z.array(z.string()).catch([]),
	rating: z.number().nullable().catch(null),
	reviewCount: z.number().nullable().catch(null),
	ingredients: z.string().catch(''),
	usage: z.array(z.string()).catch([]),
	specs: z.array(z.object({ label: z.string().catch(''), value: z.string() })).catch([]),
	featured: z.boolean().catch(false),
	bestSeller: z.boolean().catch(false)
});

/** A product with no storefront copy — what an absent or unreadable bag reads as. */
const noStorefront = (): z.infer<typeof storefrontBag> => ({
	slug: '',
	tagline: '',
	art: '',
	accent: '',
	badges: [],
	rating: null,
	reviewCount: null,
	ingredients: '',
	usage: [],
	specs: [],
	featured: false,
	bestSeller: false
});

export const storefrontMetadataSchema = storefrontBag.catch(noStorefront);

export const billableRecordSchema = z.object({
	name: requiredText('Name'),
	code: optionalText,
	unit_price: optionalAmount,
	unit: optionalText,
	/** Comma-separated; the server splits it into the array the column holds. */
	unit_choices: optionalText,
	is_featured: z.enum(['true', 'false']).default('false'),
	description: optionalLongText
});

export const assetRecordSchema = z.object({
	name: requiredText('Name'),
	asset_type: optionalText,
	identifier: optionalText,
	status: z.enum(['active', 'inactive', 'retired']).default('active'),
	acquired_on: optionalDate,
	purchase_price: optionalAmount,
	description: optionalLongText
});

/**
 * A building, or a unit inside one — one form, because they are one table.
 * Leaving `parent_id` blank makes a building (or a single-family, which is
 * its own unit); picking one makes a unit inside it. The database refuses a
 * unit of a unit, so the picker cannot be used to build a deeper tree.
 */
export const propertyRecordSchema = z.object({
	name: requiredText('Name'),
	parent_id: optionalPick,
	property_type: optionalText,
	identifier: optionalText,
	status: z.enum(['active', 'inactive', 'sold']).default('active'),
	bedrooms: optionalInteger,
	// Not `optionalInteger`: half baths are the whole reason this field exists.
	bathrooms: optionalAmount,
	square_feet: optionalInteger,
	market_rent: optionalAmount,
	acquired_on: optionalDate,
	purchase_price: optionalAmount,
	description: optionalLongText
});

/**
 * A tenancy. The property and a tenant are both required — a lease over
 * nothing, or to nobody, is what the table's own checks refuse — and a blank
 * end date is month-to-month rather than missing, which is why it is not
 * required here.
 */
export const leaseRecordSchema = z
	.object({
		property_id: z.guid('Pick the property being rented.'),
		company_id: optionalPick,
		contact_id: optionalPick,
		starts_on: z
			.string()
			.trim()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date the lease starts.'),
		ends_on: optionalDate,
		rent_amount: z
			.string()
			.trim()
			.regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter a rent like 1200 or 1200.50'),
		rent_due_day: optionalInteger,
		security_deposit: optionalAmount,
		notes: optionalLongText
	})
	.refine((data) => data.company_id !== '' || data.contact_id !== '', {
		error: 'Pick a person or a company as the tenant.',
		path: ['contact_id']
	})
	.refine((data) => data.ends_on === '' || data.ends_on >= data.starts_on, {
		error: 'The lease cannot end before it starts.',
		path: ['ends_on']
	})
	.refine(
		(data) =>
			data.rent_due_day === '' ||
			(Number(data.rent_due_day) >= 1 && Number(data.rent_due_day) <= 31),
		{ error: 'Rent is due on a day of the month, 1 to 31.', path: ['rent_due_day'] }
	);

/**
 * A draft: who it bills and on what terms. The lines come after, on the
 * invoice's own page, and issuing it is a separate act — a bill to nobody
 * is refused here, exactly as the table's check refuses it.
 */
export const invoiceRecordSchema = z
	.object({
		company_id: optionalPick,
		contact_id: optionalPick,
		payment_terms_days: optionalInteger,
		due_date: optionalDate,
		billing_email: optionalEmail,
		memo: optionalLongText
	})
	.refine((data) => data.company_id !== '' || data.contact_id !== '', {
		error: 'Pick a company or a person to bill.',
		path: ['company_id']
	});

/**
 * The offer: a code, what it takes off, and how long for. No redemption
 * limit — nothing counts one yet, and the coupons migration says why a limit
 * nothing counts against is worse than none.
 */
export const couponRecordSchema = z
	.object({
		code: z
			.string()
			.trim()
			.min(2, 'A code is at least 2 characters.')
			.max(40, 'A code is 40 characters or fewer.')
			.regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, dashes and underscores only.'),
		discount_type: z.enum(['percent', 'amount']).default('percent'),
		discount_value: optionalAmount,
		starts_on: optionalDate,
		ends_on: optionalDate,
		is_active: z.enum(['true', 'false']).default('true'),
		description: optionalLongText
	})
	// The table's own check, said in the form so it lands on the field rather
	// than coming back as a database message.
	.refine((data) => data.discount_type !== 'percent' || Number(data.discount_value || 0) <= 100, {
		error: 'A percentage cannot be over 100.',
		path: ['discount_value']
	})
	.refine(
		(data) => data.starts_on === '' || data.ends_on === '' || data.ends_on >= data.starts_on,
		{
			error: 'The end date is before the start date.',
			path: ['ends_on']
		}
	);

/**
 * A customer order's header: who asked, their own reference for it, when it
 * is expected to leave and what rides on top of the lines. The LINES are not
 * here — they are added on the order's own page, the way an invoice's are —
 * and neither is either status: confirming and cancelling are acts on that
 * page, and how much has shipped is folded from the lines.
 */
export const orderRecordSchema = z.object({
	// Not optional: `orders.company_id` is NOT NULL. The CONTACT is, by the
	// party model — an order can be taken from a company rather than a person.
	company_id: z.guid({ error: 'Pick the customer this order is for.' }),
	contact_id: optionalPick,
	customer_po: optionalText,
	estimated_ship_date: optionalDate,
	shipping: optionalAmount,
	discount: optionalAmount,
	notes: optionalLongText
});

/**
 * A purchase order's header: who it is placed with, what it is called, when
 * it is wanted and what rides on top of the lines. The LINES are not here —
 * they are added on the purchase's own page, the way an invoice's are — and
 * neither is the status: placing and cancelling are acts on that page, and
 * everything between is derived from what has arrived.
 */
export const purchaseRecordSchema = z.object({
	// Not optional: `purchases.company_id` is NOT NULL — you buy FROM someone.
	company_id: z.guid({ error: 'Pick the vendor this order goes to.' }),
	reference: optionalText,
	expected_at: optionalInstant,
	due_date: optionalDate,
	freight: optionalAmount,
	tax: optionalAmount,
	notes: optionalLongText
});

/**
 * A return: who it is from, why, how far along, and what was decided. The
 * number is the database's, and which units are coming back waits for
 * inventory movement (the rmas migration).
 */
export const rmaRecordSchema = z
	.object({
		company_id: optionalPick,
		contact_id: optionalPick,
		status: z
			.enum(['requested', 'approved', 'received', 'closed', 'rejected'])
			.default('requested'),
		requested_on: optionalDate,
		reason: optionalLongText,
		resolution: optionalLongText
	})
	.refine((data) => data.company_id !== '' || data.contact_id !== '', {
		error: 'Pick the company or the person the return is from.',
		path: ['company_id']
	});

/**
 * Who a visit was to: a kind you can go and see, and one of them. Mirrors
 * `visits_subject_is_visitable` and the entity link's not-null pair — a visit
 * to nobody is refused here as well as by the database.
 */
const visitSubject = z
	.string()
	.trim()
	.regex(
		/^(company|contact|deal|property|asset):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		'Choose who was visited.'
	);

/** A fix as the geo field posts it: blank, or a point with an optional radius. */
const optionalFix = z
	.string()
	.trim()
	.refine((value) => value === '' || parseFix(value) !== null, {
		error: 'That location could not be read.'
	})
	.default('');

/**
 * A visit. The subject and the timings; who attended is a relationship and
 * what the vertical asks is a custom field, so neither is a form field here
 * (the visits migration says why).
 */
export const visitRecordSchema = z
	.object({
		subject: visitSubject,
		status: z.enum(['planned', 'completed', 'missed']).default('completed'),
		scheduled_for: optionalInstant,
		occurred_at: optionalInstant,
		ended_at: optionalInstant,
		outcome_id: optionalPick,
		location: optionalFix,
		notes: optionalLongText
	})
	// The database's `visits_planned_is_scheduled`, said in words: you can only
	// miss something that was on the plan.
	.refine((data) => data.status === 'completed' || data.scheduled_for !== '', {
		error: 'A visit that has not happened needs the date it is planned for.',
		path: ['scheduled_for']
	})
	.refine((data) => data.ended_at === '' || data.occurred_at !== '', {
		error: 'A visit cannot have ended before it says it happened.',
		path: ['ended_at']
	});

/**
 * A task as the record page edits it. Who the task is FOR is here — a
 * company, a person, both or neither — and who is ON it deliberately is not:
 * assignment is a relationship, several per task and ended rather than
 * deleted, so the Relationships card owns it (docs/tasks.md).
 */
export const taskRecordSchema = z.object({
	title: requiredText('Title'),
	priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
	company_id: optionalPick,
	contact_id: optionalPick,
	due_at: optionalInstant,
	details: optionalLongText
});

/** A ticket: who raised it (the party), and who is handling it (a colleague). */
export const ticketRecordSchema = z.object({
	subject: requiredText('Subject'),
	priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
	company_id: optionalPick,
	contact_id: optionalPick,
	assigned_to: optionalPick,
	description: optionalLongText
});

/**
 * Every list page's row menu: the id of the record to delete. One schema for
 * every kind — deleting needs nothing about the record but which row it is.
 */
export const deleteRecordSchema = z.object({ id: z.guid() });

/**
 * The schema behind each record type, as the generic form and its action use
 * it: widened to "an object of strings", because neither knows which type it
 * is handling at compile time. The concrete schemas above are how the server
 * narrows back to the enum unions the columns want.
 */
type RecordSchemas = { [K in RecordType]: z.ZodType<RecordFormValues> };

export const RECORD_SCHEMAS: RecordSchemas = {
	company: companyRecordSchema,
	contact: contactRecordSchema,
	deal: dealRecordSchema,
	product: productRecordSchema,
	billable: billableRecordSchema,
	asset: assetRecordSchema,
	property: propertyRecordSchema,
	lease: leaseRecordSchema,
	invoice: invoiceRecordSchema,
	coupon: couponRecordSchema,
	order: orderRecordSchema,
	purchase: purchaseRecordSchema,
	rma: rmaRecordSchema,
	task: taskRecordSchema,
	ticket: ticketRecordSchema,
	visit: visitRecordSchema
};

/** One vocabulary, shared by tasks and tickets (the `priority` enum). */
export const PRIORITY_OPTIONS = [
	{ value: 'low', label: 'Low' },
	{ value: 'normal', label: 'Normal' },
	{ value: 'high', label: 'High' },
	{ value: 'urgent', label: 'Urgent' }
] as const;

const PARTY_STATUS_OPTIONS = [
	{ value: 'lead', label: 'Lead' },
	{ value: 'prospect', label: 'Prospect' },
	{ value: 'active', label: 'Active' },
	{ value: 'inactive', label: 'Inactive' }
] as const;

type RecordFormRegistry = { [K in RecordType]: RecordForm };

export const RECORD_FORMS: RecordFormRegistry = {
	company: {
		feature: 'companies',
		query: QUERY.companies,
		fields: [
			{ name: 'name', label: 'Name', type: 'text', placeholder: 'Acme Corporation' },
			{
				name: 'relationship',
				label: 'Relationship',
				type: 'select',
				options: [
					{ value: 'customer', label: 'Customer' },
					{ value: 'supplier', label: 'Supplier' },
					{ value: 'partner', label: 'Partner' },
					{ value: 'other', label: 'Other' }
				]
			},
			{ name: 'status', label: 'Status', type: 'select', options: PARTY_STATUS_OPTIONS },
			{ name: 'email', label: 'Email', type: 'email', placeholder: 'hello@acme.com' },
			{ name: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 555 010 0100' },
			{ name: 'website', label: 'Website', type: 'text', placeholder: 'acme.com' }
		]
	},
	contact: {
		feature: 'contacts',
		query: QUERY.contacts,
		fields: [
			{ name: 'name', label: 'Name', type: 'text', placeholder: 'Dana Reyes' },
			{ name: 'title', label: 'Job title', type: 'text', placeholder: 'Head of Operations' },
			{ name: 'email', label: 'Email', type: 'email', placeholder: 'dana@acme.com' },
			{ name: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 555 010 0100' },
			{ name: 'status', label: 'Status', type: 'select', options: PARTY_STATUS_OPTIONS }
		]
	},
	deal: {
		feature: 'deals',
		query: QUERY.deals,
		// Stage is second because moving one is the commonest edit a deal ever
		// gets — the funnel is the reason the record exists. Then who it is
		// with, then whose it is: the party and the assignee are two different
		// questions, and the labels say which is which.
		fields: [
			{ name: 'title', label: 'Title', type: 'text', placeholder: 'Annual renewal' },
			{ name: 'stage_id', label: 'Stage', type: 'stage' },
			{ name: 'company_id', label: 'Company', type: 'company' },
			{ name: 'contact_id', label: 'Contact', type: 'contact' },
			{ name: 'assigned_to', label: 'Assigned to', type: 'member' },
			{ name: 'amount', label: 'Amount', type: 'number', placeholder: '12000' },
			{ name: 'expected_close_date', label: 'Expected close', type: 'date' }
		]
	},
	// The longest form in the registry, and deliberately so: a product an org
	// sells to the public is the one record that is also a page on a website,
	// so it carries the shop's copy as well as the catalog's numbers. Keeping
	// both here is what stops a storefront's words being editable only in SQL.
	// Catalog first, then everything a shop reads.
	product: {
		feature: 'products',
		query: QUERY.products,
		fields: [
			{ name: 'name', label: 'Name', type: 'text', placeholder: 'Standard installation' },
			{
				name: 'kind',
				label: 'Kind',
				type: 'select',
				options: [
					{ value: 'good', label: 'Good' },
					{ value: 'service', label: 'Service' }
				]
			},
			{ name: 'category_id', label: 'Category', type: 'category' },
			{ name: 'sku', label: 'SKU', type: 'text', placeholder: 'INST-001' },
			{ name: 'unit_price', label: 'Unit price', type: 'number', placeholder: '499.00' },
			{ name: 'unit_cost', label: 'Unit cost', type: 'number', placeholder: '250.00' },
			{ name: 'unit', label: 'Unit', type: 'text', placeholder: 'each' },
			{ name: 'msrp', label: 'Compare-at price', type: 'number', placeholder: '119.00' },
			{
				name: 'is_active',
				label: 'Status',
				type: 'select',
				options: [
					{ value: 'true', label: 'Active' },
					{ value: 'false', label: 'Inactive' }
				]
			},
			{ name: 'description', label: 'Description', type: 'textarea', wide: true },
			{ name: 'image_url', label: 'Image URL', type: 'url', wide: true },
			{
				name: 'slug',
				label: 'Storefront slug',
				type: 'text',
				placeholder: 'enamel-guard-toothpaste — blank keeps it out of the shop'
			},
			{ name: 'tagline', label: 'Tagline', type: 'text', placeholder: 'One line under the name' },
			{ name: 'art', label: 'Artwork', type: 'text', placeholder: 'tube, brush, floss, kit…' },
			{ name: 'accent', label: 'Accent colour', type: 'text', placeholder: '#1668d9' },
			{ name: 'badges', label: 'Badges', type: 'text', placeholder: 'Best seller, Enamel safe' },
			{ name: 'rating', label: 'Rating', type: 'number', placeholder: '4.8' },
			{ name: 'review_count', label: 'Reviews', type: 'integer', placeholder: '2417' },
			{
				name: 'long_description',
				label: 'Storefront body',
				type: 'textarea',
				placeholder: 'Blank lines separate paragraphs.',
				wide: true
			},
			{
				name: 'specs',
				label: 'Specs',
				type: 'textarea',
				placeholder: 'One per line — Size: 4.0 oz / 113 g',
				wide: true
			},
			{
				name: 'usage',
				label: 'How to use',
				type: 'textarea',
				placeholder: 'One step per line.',
				wide: true
			},
			{ name: 'ingredients', label: 'Ingredients', type: 'textarea', wide: true },
			{
				name: 'featured',
				label: 'Featured',
				type: 'select',
				options: [
					{ value: 'false', label: 'Not featured' },
					{ value: 'true', label: 'Featured on the home page' }
				]
			},
			{
				name: 'best_seller',
				label: 'Best seller',
				type: 'select',
				options: [
					{ value: 'false', label: 'No' },
					{ value: 'true', label: 'Yes' }
				]
			}
		]
	},
	billable: {
		feature: 'billables',
		query: QUERY.billables,
		fields: [
			{ name: 'name', label: 'Name', type: 'text', placeholder: 'Porcelain crown' },
			{ name: 'code', label: 'Code', type: 'text', placeholder: 'D2740' },
			{ name: 'unit_price', label: 'Unit price', type: 'number', placeholder: '1450.00' },
			{ name: 'unit', label: 'Unit', type: 'text', placeholder: 'tooth' },
			{
				name: 'unit_choices',
				label: 'Unit choices',
				type: 'text',
				placeholder: 'UR, UL, BR, BL — blank to type units in',
				wide: true
			},
			{
				name: 'is_featured',
				label: 'Featured',
				type: 'select',
				options: [
					{ value: 'false', label: 'Found by search' },
					{ value: 'true', label: 'Shown on every option' }
				]
			},
			{ name: 'description', label: 'Description', type: 'textarea', wide: true }
		]
	},
	asset: {
		feature: 'assets',
		query: QUERY.assets,
		// Who owns or holds it is deliberately not a field: that is a
		// relationship, drawn on the record once it exists.
		fields: [
			{ name: 'name', label: 'Name', type: 'text', placeholder: 'MacBook Pro 16"' },
			{ name: 'asset_type', label: 'Type', type: 'text', placeholder: 'device' },
			{ name: 'identifier', label: 'Identifier', type: 'text', placeholder: 'IT-001' },
			{
				name: 'status',
				label: 'Status',
				type: 'select',
				options: [
					{ value: 'active', label: 'Active' },
					{ value: 'inactive', label: 'Inactive' },
					{ value: 'retired', label: 'Retired' }
				]
			},
			{ name: 'acquired_on', label: 'Acquired', type: 'date' },
			{ name: 'purchase_price', label: 'Purchase price', type: 'number', placeholder: '2399.00' },
			{ name: 'description', label: 'Description', type: 'textarea', wide: true }
		]
	},
	property: {
		feature: 'properties',
		query: QUERY.properties,
		// Who owns it, who manages it and which trade services it are
		// deliberately not fields: those are relationships, drawn on the record
		// once it exists.
		fields: [
			{ name: 'name', label: 'Name', type: 'text', placeholder: 'Rowan Street — Unit 1' },
			// Blank makes a building (or a single-family, which is its own
			// unit); picking one makes a unit inside it. The database refuses a
			// unit of a unit, so this cannot build a deeper tree.
			{ name: 'parent_id', label: 'Part of', type: 'property' },
			{ name: 'property_type', label: 'Type', type: 'text', placeholder: 'duplex' },
			{ name: 'identifier', label: 'Identifier', type: 'text', placeholder: 'ROWAN-1' },
			{
				name: 'status',
				label: 'Status',
				type: 'select',
				options: [
					{ value: 'active', label: 'Active' },
					{ value: 'inactive', label: 'Inactive' },
					{ value: 'sold', label: 'Sold' }
				]
			},
			{ name: 'bedrooms', label: 'Bedrooms', type: 'integer', placeholder: '2' },
			{ name: 'bathrooms', label: 'Bathrooms', type: 'number', placeholder: '1.5' },
			{ name: 'square_feet', label: 'Square feet', type: 'integer', placeholder: '940' },
			{ name: 'market_rent', label: 'Market rent', type: 'number', placeholder: '1200.00' },
			{ name: 'acquired_on', label: 'Acquired', type: 'date' },
			{ name: 'purchase_price', label: 'Purchase price', type: 'number', placeholder: '268000.00' },
			{ name: 'description', label: 'Description', type: 'textarea', wide: true }
		]
	},
	lease: {
		feature: 'leases',
		query: QUERY.leases,
		fields: [
			{ name: 'property_id', label: 'Property', type: 'property' },
			{ name: 'contact_id', label: 'Tenant', type: 'contact' },
			// A shop or a corporate let names the company instead — the party
			// model, same as an invoice's customer.
			{ name: 'company_id', label: 'Tenant company', type: 'company' },
			{ name: 'starts_on', label: 'Starts', type: 'date' },
			// Blank is month-to-month, not missing.
			{ name: 'ends_on', label: 'Ends', type: 'date' },
			{ name: 'rent_amount', label: 'Rent', type: 'number', placeholder: '1200.00' },
			{ name: 'rent_due_day', label: 'Rent due on', type: 'integer', placeholder: '1' },
			{
				name: 'security_deposit',
				label: 'Security deposit',
				type: 'number',
				placeholder: '1200.00'
			},
			{ name: 'notes', label: 'Notes', type: 'textarea', wide: true }
		]
	},
	invoice: {
		feature: 'invoices',
		query: QUERY.invoices,
		fields: [
			{ name: 'company_id', label: 'Company', type: 'company' },
			{ name: 'contact_id', label: 'Contact', type: 'contact' },
			{ name: 'payment_terms_days', label: 'Terms (days)', type: 'integer', placeholder: '30' },
			{ name: 'due_date', label: 'Due', type: 'date' },
			{ name: 'billing_email', label: 'Billing email', type: 'email', placeholder: 'ap@acme.com' },
			{
				name: 'memo',
				label: 'Memo',
				type: 'textarea',
				placeholder: 'Shown on the invoice',
				wide: true
			}
		]
	},
	coupon: {
		feature: 'coupons',
		query: QUERY.coupons,
		fields: [
			{ name: 'code', label: 'Code', type: 'text', placeholder: 'SPRING20' },
			{
				name: 'discount_type',
				label: 'Type',
				type: 'select',
				options: [
					{ value: 'percent', label: 'Percent off' },
					{ value: 'amount', label: 'Amount off' }
				]
			},
			{ name: 'discount_value', label: 'Discount', type: 'number', placeholder: '20' },
			{ name: 'starts_on', label: 'Starts', type: 'date' },
			{ name: 'ends_on', label: 'Ends', type: 'date' },
			{
				name: 'is_active',
				label: 'Status',
				type: 'select',
				options: [
					{ value: 'true', label: 'Active' },
					{ value: 'false', label: 'Inactive' }
				]
			},
			{ name: 'description', label: 'Description', type: 'textarea', wide: true }
		]
	},
	order: {
		feature: 'orders',
		query: QUERY.orders,
		// No status field, and no fulfillment either: `draft` is where every
		// order starts, confirming and cancelling are acts on the record page,
		// and how much has shipped is the lines' to say.
		fields: [
			{ name: 'company_id', label: 'Customer', type: 'company' },
			{ name: 'contact_id', label: 'Contact', type: 'contact' },
			{ name: 'customer_po', label: 'Customer PO', type: 'text', placeholder: 'PO-4471' },
			{ name: 'estimated_ship_date', label: 'Est. ship', type: 'date' },
			{ name: 'shipping', label: 'Shipping', type: 'number', placeholder: '25.00' },
			{ name: 'discount', label: 'Discount', type: 'number', placeholder: '0.00' },
			{ name: 'notes', label: 'Notes', type: 'textarea', wide: true }
		]
	},
	purchase: {
		feature: 'purchases',
		query: QUERY.purchases,
		// No status field: `draft` is where every purchase starts, and moving
		// it is an act on the record page, never a picked value.
		fields: [
			{ name: 'company_id', label: 'Vendor', type: 'company' },
			{ name: 'reference', label: 'Reference', type: 'text', placeholder: 'Spring restock' },
			{ name: 'expected_at', label: 'Expected', type: 'datetime' },
			{ name: 'due_date', label: 'Payment due', type: 'date' },
			{ name: 'freight', label: 'Freight', type: 'number', placeholder: '120.00' },
			{ name: 'tax', label: 'Tax', type: 'number', placeholder: '0.00' },
			{ name: 'notes', label: 'Notes', type: 'textarea', wide: true }
		]
	},
	visit: {
		feature: 'visits',
		query: QUERY.visits,
		fields: [
			{ name: 'subject', label: 'Visited', type: 'subject' },
			{
				name: 'status',
				label: 'Status',
				type: 'select',
				options: [
					{ value: 'completed', label: 'Happened' },
					{ value: 'planned', label: 'Planned' },
					{ value: 'missed', label: 'Missed' }
				]
			},
			{ name: 'outcome_id', label: 'Outcome', type: 'outcome' },
			{ name: 'scheduled_for', label: 'Scheduled for', type: 'datetime' },
			{ name: 'occurred_at', label: 'Arrived', type: 'datetime' },
			{ name: 'ended_at', label: 'Left', type: 'datetime' },
			{ name: 'location', label: 'Location', type: 'geo', wide: true },
			{ name: 'notes', label: 'Notes', type: 'textarea', wide: true }
		]
	},
	rma: {
		feature: 'rmas',
		query: QUERY.rmas,
		// The order the goods came off is deliberately not a field: nothing can
		// pick an order until the Orders feature has a page (the rmas migration).
		fields: [
			{ name: 'company_id', label: 'Company', type: 'company' },
			{ name: 'contact_id', label: 'Contact', type: 'contact' },
			{
				name: 'status',
				label: 'Status',
				type: 'select',
				options: [
					{ value: 'requested', label: 'Requested' },
					{ value: 'approved', label: 'Approved' },
					{ value: 'received', label: 'Received' },
					{ value: 'closed', label: 'Closed' },
					{ value: 'rejected', label: 'Rejected' }
				]
			},
			{ name: 'requested_on', label: 'Requested', type: 'date' },
			{ name: 'reason', label: 'Reason', type: 'textarea', wide: true },
			{ name: 'resolution', label: 'Resolution', type: 'textarea', wide: true }
		]
	},
	task: {
		feature: 'tasks',
		query: QUERY.tasks,
		// No assignee field: who is on a task is a relationship, drawn by the
		// Relationships card and written by the task modal (docs/tasks.md).
		// The company and the contact are who it is FOR, which is a different
		// question and a column apiece.
		fields: [
			{ name: 'title', label: 'Title', type: 'text', placeholder: 'Call back about the quote' },
			{ name: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS },
			{ name: 'company_id', label: 'Company', type: 'company' },
			{ name: 'contact_id', label: 'Contact', type: 'contact' },
			{ name: 'due_at', label: 'Due', type: 'datetime' },
			{ name: 'details', label: 'Details', type: 'textarea', wide: true }
		]
	},
	ticket: {
		feature: 'tickets',
		query: QUERY.tickets,
		fields: [
			{ name: 'subject', label: 'Subject', type: 'text', placeholder: 'Panel is offline' },
			{ name: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS },
			{ name: 'company_id', label: 'Company', type: 'company' },
			{ name: 'contact_id', label: 'Contact', type: 'contact' },
			{ name: 'assigned_to', label: 'Assigned to', type: 'member' },
			{ name: 'description', label: 'Description', type: 'textarea', wide: true }
		]
	}
};
