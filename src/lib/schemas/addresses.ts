import { z } from 'zod';

/**
 * The address form — the record page's action validates with it and
 * `Detail.Addresses` renders it, which is why it lives here rather than
 * beside the page. An address is the one thing every party record edits in
 * place, and it is what puts the record on a map: the action geocodes what
 * is posted here and stores the coordinates with it.
 *
 * `id` is blank on create and the address's id on edit — one form, one
 * action, the way the quick plans page's update form carries its id. Ids
 * are `z.guid()` for the reason the staff schema gives: seeded fixture ids.
 */

const optionalText = z.string().trim().max(200, 'Must be 200 characters or fewer.').default('');

export const ADDRESS_KINDS = ['primary', 'billing', 'shipping', 'service', 'other'] as const;

export const addressSchema = z.object({
	id: z.guid().or(z.literal('')).default(''),
	kind: z.enum(ADDRESS_KINDS).default('primary'),
	label: optionalText,
	line1: z
		.string()
		.trim()
		.min(1, 'The street address is required.')
		.max(200, 'Must be 200 characters or fewer.'),
	line2: optionalText,
	city: optionalText,
	region: optionalText,
	postal_code: z.string().trim().max(20, 'Must be 20 characters or fewer.').default(''),
	/** ISO 3166-1 alpha-2, the way the column checks it; blank for unknown. */
	country: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^$|^[A-Z]{2}$/, 'Use the two-letter country code, like US.')
		.default(''),
	is_primary: z.boolean().default(false)
});

export const removeAddressSchema = z.object({ id: z.guid() });
