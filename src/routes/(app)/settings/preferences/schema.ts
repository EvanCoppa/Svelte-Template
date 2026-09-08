import { z } from 'zod';

/**
 * What the preferences page posts: one value per key it offered.
 *
 * The values are `unknown` on purpose — the registry decides what each key
 * accepts and `savePreference()` parses each one against its own schema, which
 * is the only place that can. Keys are strings rather than the key union so a
 * page that offered fewer switches (a feature the org turned off) still posts
 * a valid form; the action ignores anything it does not recognise.
 */
export const preferencesSchema = z.object({
	values: z.record(z.string(), z.unknown()).default({})
});
