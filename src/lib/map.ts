/**
 * The map — where the style comes from, and therefore which origins the
 * Content-Security-Policy must admit.
 *
 * A MapLibre map is a style URL: the style names the tiles, glyphs and
 * sprite it draws with, so one URL (a second for dark mode) is the whole
 * configuration. Both are constants here — OpenFreeMap's Liberty and Dark
 * styles, which need no key and no account — so a clone draws a map with
 * nothing to configure. Change the style by editing these two lines; the
 * CSP follows, because `hooks.server.ts` derives its origins from the same
 * function rather than listing them (the one rule the Supabase URL already
 * follows there).
 *
 * Client-safe on purpose: the view page's load ships the config to the
 * component and the `/components` showcase reads it in the browser.
 */

/** The style the map draws with. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Used when the reader's theme is dark; null would mean one style for both. */
const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export interface MapConfig {
	styleUrl: string;
	/** Used when the reader's theme is dark; null means one style for both. */
	darkStyleUrl: string | null;
}

/** The map configuration — the styles this app draws with. */
export function mapConfig(): MapConfig {
	return { styleUrl: STYLE_URL, darkStyleUrl: DARK_STYLE_URL };
}

/** The distinct origins the style URLs are served from — what the CSP admits for the map. */
export function mapOrigins(config: MapConfig): string[] {
	const urls = [config.styleUrl, config.darkStyleUrl].filter((url) => url !== null);
	return [...new Set(urls.map((url) => new URL(url).origin))];
}
