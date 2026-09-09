import { z } from 'zod';
import type { ViewSource } from './types';

/**
 * The filter a view stores — the JSON shape of `views.filter`, one schema per
 * source, validated on every load so a bad row fails loudly instead of
 * listing everything.
 *
 * A filter is a list of conditions, all of which must hold, plus an optional
 * sort. Each condition names one FIELD, and the field decides the operator
 * and the value shape — a discriminated union keyed by `field`, so every
 * filterable column appears exactly once per source and adding one is one
 * line. The operators are deliberately few:
 *
 *   in / not_in   an enum column against a list ("eq" is `in` with one value)
 *   ilike         a text column contains the value (stored WITHOUT `%`; the
 *                 module wraps it)
 *   eq            a boolean question ("has a company")
 *   has           the record carries a tag of that name
 *
 * Two conditions reach past the record's own table — a contact's company's
 * relationship, and the tag on any record. Those resolve to an id list first
 * (`runView()` in `$lib/server/crm/views`); the rest compile straight into the
 * list module's query (`conditions` on `listCompanies()` / `listContacts()`).
 *
 * The same shape will serve per-org saved views when they arrive: a row a
 * member writes instead of a migration, parsed by these same schemas.
 */

const relationship = z.enum(['customer', 'supplier', 'partner', 'other']);
const partyStatus = z.enum(['lead', 'prospect', 'active', 'inactive']);
const membership = z.enum(['in', 'not_in']);
const contains = z.string().trim().min(1).max(200);
const tagName = z.string().trim().min(1).max(100);

const companyCondition = z.discriminatedUnion('field', [
	z.object({
		field: z.literal('relationship'),
		op: membership,
		values: relationship.array().min(1)
	}),
	z.object({ field: z.literal('status'), op: membership, values: partyStatus.array().min(1) }),
	z.object({ field: z.literal('name'), op: z.literal('ilike'), value: contains }),
	z.object({ field: z.literal('email'), op: z.literal('ilike'), value: contains }),
	z.object({ field: z.literal('website'), op: z.literal('ilike'), value: contains }),
	z.object({ field: z.literal('tag'), op: z.literal('has'), value: tagName })
]);

const contactCondition = z.discriminatedUnion('field', [
	z.object({ field: z.literal('status'), op: membership, values: partyStatus.array().min(1) }),
	/** The people at particular companies — "everyone related to company X". */
	z.object({ field: z.literal('company_id'), op: membership, values: z.guid().array().min(1) }),
	/** Whether the person belongs to a company at all: a patient or a homeowner does not. */
	z.object({ field: z.literal('has_company'), op: z.literal('eq'), value: z.boolean() }),
	z.object({ field: z.literal('name'), op: z.literal('ilike'), value: contains }),
	z.object({ field: z.literal('email'), op: z.literal('ilike'), value: contains }),
	z.object({ field: z.literal('title'), op: z.literal('ilike'), value: contains }),
	/** One hop: the people at companies of that relationship. */
	z.object({
		field: z.literal('company.relationship'),
		op: membership,
		values: relationship.array().min(1)
	}),
	z.object({ field: z.literal('tag'), op: z.literal('has'), value: tagName })
]);

/** The columns a view may order by; every source has all three. */
export const viewSortSchema = z.object({
	field: z.enum(['name', 'status', 'created_at']),
	direction: z.enum(['asc', 'desc']).default('asc')
});

export type ViewSort = z.infer<typeof viewSortSchema>;

export const companyFilterSchema = z.object({
	where: companyCondition.array().default([]),
	sort: viewSortSchema.optional()
});

export const contactFilterSchema = z.object({
	where: contactCondition.array().default([]),
	sort: viewSortSchema.optional()
});

export type CompanyCondition = z.infer<typeof companyCondition>;
export type ContactCondition = z.infer<typeof contactCondition>;
export type CompanyFilter = z.infer<typeof companyFilterSchema>;
export type ContactFilter = z.infer<typeof contactFilterSchema>;

/**
 * The conditions a list module applies itself — the record's own columns.
 * The others need another table first; see the module comment.
 */
export type CompanyOwnCondition = Exclude<CompanyCondition, { field: 'tag' }>;
export type ContactOwnCondition = Exclude<
	ContactCondition,
	{ field: 'tag' } | { field: 'company.relationship' }
>;

export const VIEW_FILTER_SCHEMAS = {
	company: companyFilterSchema,
	contact: contactFilterSchema
} satisfies Record<ViewSource, z.ZodType>;
