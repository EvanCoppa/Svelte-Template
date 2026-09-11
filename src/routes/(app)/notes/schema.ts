import { z } from 'zod';
import { BADGE_TONES } from '$lib/components/ui/badge/badge-tones.js';

/**
 * The three things you can do to a shelf on this page.
 *
 * A note itself is still written through `/api/notes` — the dock floats over
 * every screen, which is why that exception exists — but a category is edited
 * from the one page it appears on, out of a form, so it is a form action like
 * everything else in the app.
 *
 * Ids are `z.guid()` rather than `z.uuid()` for the reason the staff schema
 * gives: seeded fixture ids do not carry RFC 4122 version bits.
 */

/** Mirrors the `note_categories_name_length` check constraint. */
export const CATEGORY_NAME_MAX = 80;

const name = z
	.string()
	.trim()
	.min(1, 'A category needs a name.')
	.max(CATEGORY_NAME_MAX, `A name is at most ${String(CATEGORY_NAME_MAX)} characters.`);

/** The ten tones the app owns, which is exactly what the column holds. */
const color = z.enum(BADGE_TONES);

export const createCategorySchema = z.object({
	name,
	color: color.default('neutral')
});

export const updateCategorySchema = z.object({
	id: z.guid(),
	name,
	color
});

export const deleteCategorySchema = z.object({ id: z.guid() });
