import { z } from 'zod';

/**
 * The categories pages' forms. A category is a name, an optional description,
 * where it sits in the tree and where it sits among its siblings — four
 * fields, but the third is a picker over the org's own rows that must exclude
 * the category's own subtree, so it is not the generic record form's job (a
 * category is not a record kind at all; see the categories migration).
 *
 * `parent_id` is the empty string for a root, the way every picker in this app
 * posts "nothing": the action turns it into null.
 */

const name = z
	.string()
	.trim()
	.min(1, 'Give the category a name.')
	.max(120, 'Keep the name under 120 characters.');

const description = z.string().trim().max(2000, 'Must be 2000 characters or fewer.').default('');

/** A category picked as the parent, or blank for a root of the tree. */
const parentId = z.guid().or(z.literal('')).default('');

/** Where it sits among its siblings; blank is the end of the list. */
const sortOrder = z
	.string()
	.trim()
	.regex(/^$|^\d{1,6}$/, 'Enter a whole number.')
	.default('');

export const createCategorySchema = z.object({
	name,
	description,
	parent_id: parentId,
	sort_order: sortOrder
});

/** Ids are `z.guid()` for the reason the staff schema gives: seeded fixture ids. */
export const updateCategorySchema = z.object({
	id: z.guid(),
	name,
	description,
	parent_id: parentId,
	sort_order: sortOrder
});

export const deleteCategorySchema = z.object({ id: z.guid() });

/** A blank picker is no parent — a root — never the empty string the form posted. */
export function parentOf(value: string): string | null {
	return value === '' ? null : value;
}

/** A blank position is the end of the list, which is what the column defaults to. */
export function sortOrderOf(value: string): number {
	return value === '' ? 0 : Number(value);
}
