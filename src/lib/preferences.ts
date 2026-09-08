import { z } from 'zod';
import type { FeatureId } from '$lib/features/types';

/**
 * Account preferences — how one person works, everywhere they sign in.
 *
 * The middle of the three axes in docs/user-preferences.md: the organization
 * decides what exists (the feature registry), the device decides how it looks
 * on this machine (`$lib/theme.svelte`, the sidebar cookie), and this decides
 * how you work with it. Rows live in `user_preferences`, keyed by the registry
 * below, private to their owner.
 *
 * A registry rather than a column per switch, for the same reason
 * `FEATURE_IDS` is one: the app knows every key at build time, so a typo is a
 * `check` error instead of a preference that silently never loads — and
 * adding one is this file, with no migration and no backfill behind it.
 *
 * Client-safe: the `(app)` layout ships the resolved object as
 * `page.data.preferences`, and the settings page renders this registry.
 */

/**
 * How the settings page draws a preference. Declared, never inferred from the
 * value — the rule a record's fields follow too. One kind today; a select or a
 * text preference adds a kind here and a branch on the page.
 */
export type PreferenceKind = 'switch';

/** What one preference is: how to validate it, what it means unset, what to call it. */
export type PreferenceDefinition<T> = {
	kind: PreferenceKind;
	schema: z.ZodType<T>;
	/** What the app does when nobody has said otherwise. Never null. */
	fallback: T;
	/** The settings page's label for the switch. */
	label: string;
	/** One line under the label, saying what it actually does. */
	description: string;
	/**
	 * The feature this preference belongs to, when it belongs to one. The
	 * settings page offers it only while that feature is on screen for the
	 * active org — a switch for something the org turned off would sit there
	 * doing nothing.
	 */
	feature?: FeatureId;
};

export const PREFERENCES = {
	'notes.dock': {
		kind: 'switch',
		schema: z.boolean(),
		fallback: true,
		label: 'Notes rail',
		description:
			'Dock your notes to the right edge of every screen. Turning this off hides the rail only — the notes page, the sidebar entry and ⌥⌘L all keep working.',
		feature: 'notes'
	}
} as const satisfies Record<string, PreferenceDefinition<unknown>>;

export type PreferenceKey = keyof typeof PREFERENCES;

/** Every preference resolved for one session: a value for each key, always. */
export type Preferences = {
	[K in PreferenceKey]: z.infer<(typeof PREFERENCES)[K]['schema']>;
};

/** One stored row, as the table holds it. */
export type PreferenceRow = { key: string; value: unknown };

/** A value for some preference: the union of every kind the registry holds. */
export type PreferenceValue = Preferences[PreferenceKey];

/** Whether a string is a key this build knows — anything else is an old row. */
export function isPreferenceKey(key: string): key is PreferenceKey {
	return Object.hasOwn(PREFERENCES, key);
}

/** Every key, narrowed by the guard above rather than asserted. */
export const PREFERENCE_KEYS = Object.keys(PREFERENCES).filter(isPreferenceKey);

/** Every preference on its fallback: a session that has never set one. */
export function defaultPreferences(): Preferences {
	const entries = PREFERENCE_KEYS.map((key) => [key, PREFERENCES[key].fallback] as const);
	// SAFETY: built by mapping PREFERENCE_KEYS, so there is exactly one entry
	// per key and the object is a complete Preferences.
	return Object.fromEntries(entries) as Preferences;
}

/**
 * The stored rows folded over the fallbacks.
 *
 * Both halves of "parse at the boundary": a key this build does not know is
 * ignored (a preference removed in a later version leaves rows behind), and a
 * value that does not match its schema reads as the fallback rather than
 * poisoning every page that reads it — which is what a key whose type changed
 * looks like on the first load after the deploy.
 */
export function resolvePreferences(rows: readonly PreferenceRow[]): Preferences {
	const resolved = defaultPreferences();
	for (const row of rows) {
		if (!isPreferenceKey(row.key)) continue;
		const parsed = PREFERENCES[row.key].schema.safeParse(row.value);
		if (parsed.success) {
			// SAFETY: `parsed.data` came from the schema this key declares, which
			// is the type `Preferences[typeof row.key]` is inferred from.
			resolved[row.key] = parsed.data as Preferences[typeof row.key];
		}
	}
	return resolved;
}
