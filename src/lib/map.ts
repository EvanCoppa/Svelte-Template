import { env } from '$env/dynamic/public';

/**
 * The map — where the style comes from, and therefore which origins the
 * Content-Security-Policy must admit.
 *
 * A MapLibre map is a style URL: the style names the tiles, glyphs and
 * sprite it draws with, so one URL (a second for dark mode) is the whole
 * configuration. It is env-only and optional (`PUBLIC_MAP_STYLE_URL`,
 * `PUBLIC_MAP_STYLE_URL_DARK` — see `.env.example`), read through
 * `$env/dynamic/public` because a static public var that is unset fails
 * the build, and a template with no map yet must still build. When unset,
 * `mapConfig()` is null: the map layout says so and nothing is fetched.
 *
 * Client-safe on purpose: the view page's load ships the config to the
 * component, the `/components` showcase reads it in the browser, and
 * `hooks.server.ts` derives the CSP origins from the same function — the
 * one rule the Supabase URL already follows there.
 */

export interface MapConfig {
	styleUrl: string;
	/** Used when the reader's theme is dark; null means one style for both. */
	darkStyleUrl: string | null;
}

/**
 * The env vars the map reads, injectable so tests can vary them. The index
 * signature is what lets the real env satisfy this — see `EmailEnv`.
 */
export interface MapEnv {
	PUBLIC_MAP_STYLE_URL?: string | undefined;
	PUBLIC_MAP_STYLE_URL_DARK?: string | undefined;
	[key: string]: string | undefined;
}

/** Resolve the map configuration, or `null` when there is no map. A URL that is not one is refused loudly. */
export function mapConfig(source: MapEnv = env): MapConfig | null {
	const styleUrl = absoluteUrl(source.PUBLIC_MAP_STYLE_URL, 'PUBLIC_MAP_STYLE_URL');
	if (!styleUrl) return null;
	const darkStyleUrl = absoluteUrl(source.PUBLIC_MAP_STYLE_URL_DARK, 'PUBLIC_MAP_STYLE_URL_DARK');
	return { styleUrl, darkStyleUrl };
}

/** The distinct origins the style URLs are served from — what the CSP admits for the map. */
export function mapOrigins(config: MapConfig | null): string[] {
	if (!config) return [];
	const urls = [config.styleUrl, config.darkStyleUrl].filter((url) => url !== null);
	return [...new Set(urls.map((url) => new URL(url).origin))];
}

function absoluteUrl(value: string | undefined, name: string): string | null {
	const trimmed = (value ?? '').trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('not http');
		return url.href;
	} catch {
		console.error(`[map] ${name} is not an absolute http(s) URL — map disabled.`);
		return null;
	}
}
