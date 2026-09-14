import { z } from 'zod';

/**
 * The featured groups page's three forms. A group is a name and the products
 * it shelves, so its form is the one the generic record modal cannot render:
 * a multi-select. The `Combobox` posts one hidden `product_ids` per pick —
 * and one blank one when nothing is picked, the way a native multi-select
 * posts nothing — so the array admits '' and the rule below reads past it.
 * The action drops the blank before writing. Copied from the quick plans
 * page, which has the same shape and the same reason.
 */

const productIds = z
	.array(z.guid().or(z.literal('')))
	.refine((ids) => ids.some((id) => id !== ''), { error: 'Pick at least one product to feature.' });

const name = z
	.string()
	.trim()
	.min(1, 'Give the group a name.')
	.max(120, 'Keep the name under 120 characters.');

const description = z.string().trim().max(2000, 'Must be 2000 characters or fewer.').default('');

/** The switch that takes a seasonal group off the shelf without deleting it. */
const isActive = z.enum(['true', 'false']).default('true');

export const createFeaturedGroupSchema = z.object({
	name,
	description,
	is_active: isActive,
	product_ids: productIds
});

/** Ids are `z.guid()` for the reason the staff schema gives: seeded fixture ids. */
export const updateFeaturedGroupSchema = z.object({
	id: z.guid(),
	name,
	description,
	is_active: isActive,
	product_ids: productIds
});

export const deleteFeaturedGroupSchema = z.object({ id: z.guid() });

/** The picks that are real: the Combobox's blank placeholder dropped. */
export function pickedIds(ids: readonly string[]): string[] {
	return ids.filter((id) => id !== '');
}
