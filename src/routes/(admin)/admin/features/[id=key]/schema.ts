import { z } from 'zod';
import { isIconName } from '$lib/features/icons';
import { NAV_CATEGORIES } from '$lib/navigation';

/**
 * A registry row's metadata — how it reads and where it sits.
 *
 * What is NOT here is the point: `id` and `route` are facts about the CODE.
 * The route prefix is what the feature gate matches a request against and
 * what the nav links to, so a route naming no page is a feature whose every
 * click 404s; the id is what migrations, grants and `FEATURE_IDS` point at.
 * Both change by migration, alongside the route they describe.
 *
 * Everything that IS here is already overridable per industry, which is what
 * makes it safe to edit: this row is only the default a vertical falls back
 * to.
 */

/**
 * Both pickers are validated against the app's own answer rather than a list
 * copied next to it: `isIconName()` is what `iconFor()` consults, and
 * NAV_CATEGORIES is what the sidebar groups by and what the
 * `features_category_check` constraint accepts. A slug this rejects is one
 * that would render the placeholder; a section it rejects is one the
 * database would refuse anyway.
 */
const isSection = (value: string) => NAV_CATEGORIES.some((category) => category.key === value);

export const updateFeatureSchema = z.object({
	name: z.string().trim().min(1, 'Name the feature.').max(60, 'Keep the name under 60 characters.'),
	/** The lower-case singular of one row of it — 'quote', 'patient'. Blank clears it. */
	noun: z.string().trim().max(60, 'Keep the noun under 60 characters.').optional(),
	description: z.string().trim().max(200, 'Keep the description under 200 characters.').optional(),
	icon: z.string().refine(isIconName, 'Pick an icon the app ships.'),
	category: z.string().refine(isSection, 'Pick a sidebar section.'),
	/**
	 * Position inside the section, by the multiples-of-100 convention. Posted
	 * as a string like every other input; the action parses it.
	 */
	sortOrder: z
		.string()
		.trim()
		.regex(/^\d{1,6}$/, 'Use a whole number.')
});
