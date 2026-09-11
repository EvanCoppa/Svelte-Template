import { browser } from '$app/environment';

/**
 * How a page is laid out on THIS machine — a board or a list — remembered in
 * `localStorage`.
 *
 * The third of the three axes in docs/user-preferences.md, and the device is
 * the right one: a board wants a wide screen and a list reads better on a
 * narrow one, so the same person genuinely wants a different answer on a
 * laptop than on a desktop. Nothing is lost if it is forgotten — a cleared
 * store reads as "no value" and the page opens on its documented default.
 *
 * `$lib/theme.svelte.ts` is the pattern; this is the same thing for a page
 * that has more than one way to draw the rows it already has.
 */
export function createViewPreference<T extends string>(key: string, views: readonly [T, ...T[]]) {
	const fallback = views[0];
	let current = $state<T>(fallback);

	if (browser) {
		const stored = localStorage.getItem(key);
		// SAFETY: `includes` needs the wider element type to accept an arbitrary
		// string; the check is what narrows, and nothing is asserted about
		// `stored` here.
		if (stored !== null && (views as readonly string[]).includes(stored)) {
			// SAFETY: `stored` passed the check above, so it is one of `views` —
			// which is to say a `T`. Anything else (a private window, a key left
			// by an older build) leaves `current` on the fallback.
			current = stored as T;
		}
	}

	return {
		get current() {
			return current;
		},
		set current(view: T) {
			current = view;
			if (browser) localStorage.setItem(key, view);
		}
	};
}
