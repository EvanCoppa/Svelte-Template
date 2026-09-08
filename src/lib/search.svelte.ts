/**
 * The ⌘K palette, as one call from anywhere in the app:
 *
 *   import { showSearch } from '$lib/search.svelte';
 *   showSearch();
 *
 * Module-level runes, like the upgrade prompt, so the sidebar's search button
 * and the keyboard shortcut open the same dialog — the one `SearchDialog` the
 * (app) layout mounts. The dialog owns the shortcut itself; nothing here knows
 * what is searchable.
 */
function createSearchPalette() {
	let open = $state(false);

	return {
		get open() {
			return open;
		},
		show() {
			open = true;
		},
		dismiss() {
			open = false;
		},
		toggle() {
			open = !open;
		}
	};
}

export const searchPalette = createSearchPalette();

/** Open the ⌘K palette. */
export function showSearch(): void {
	searchPalette.show();
}
