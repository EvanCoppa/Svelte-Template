import { z } from 'zod';

/**
 * The quick plans page's three forms. A bundle is a name and the billables
 * it holds, so its form is the one the generic record modal cannot render:
 * a multi-select. The `Combobox` posts one hidden `billable_ids` per pick —
 * and one blank one when nothing is picked, the way a native multi-select
 * posts nothing — so the array admits '' and the rule below reads past it.
 * The action drops the blank before writing.
 */

const billableIds = z
	.array(z.guid().or(z.literal('')))
	.refine((ids) => ids.some((id) => id !== ''), { error: 'Pick at least one to bundle.' });

const name = z
	.string()
	.trim()
	.min(1, 'Give the bundle a name.')
	.max(120, 'Keep the name under 120 characters.');

export const createQuickPlanSchema = z.object({ name, billable_ids: billableIds });

/** Ids are `z.guid()` for the reason the staff schema gives: seeded fixture ids. */
export const updateQuickPlanSchema = z.object({ id: z.guid(), name, billable_ids: billableIds });

export const deleteQuickPlanSchema = z.object({ id: z.guid() });

/** The picks that are real: the Combobox's blank placeholder dropped. */
export function pickedIds(ids: readonly string[]): string[] {
	return ids.filter((id) => id !== '');
}
