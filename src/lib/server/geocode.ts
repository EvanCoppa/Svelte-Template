/**
 * Geocoding — an address becomes the coordinates a map can pin.
 *
 * `geocode()` is the single way this app turns a postal address into a
 * latitude and longitude. Server code only (this file lives in
 * `src/lib/server/`): the address form action calls it when an address is
 * saved and stores the answer in `addresses.latitude` / `longitude`, which
 * is where the view page's map reads them from. The schema stores
 * coordinates; nothing else in the app knows a provider exists.
 *
 * Configuration is entirely env-driven, like email (`src/lib/server/email.ts`):
 *
 *   GEOCODER_URL         a URL template with `{query}` where the address goes
 *                        and, optionally, `{key}` where GEOCODER_API_KEY goes —
 *                        any provider answering Nominatim-style JSON
 *                        (`[{ "lat": "…", "lon": "…" }]`): Nominatim itself,
 *                        LocationIQ, Geoapify's nominatim-compatible endpoint.
 *   GEOCODER_API_KEY     optional, substituted into the template
 *   GEOCODER_USER_AGENT  optional; public Nominatim requires one that names the app
 *
 * When `GEOCODER_URL` is unset nothing is fetched: the call logs once and
 * reports failure, so an address still saves — with no coordinates — and
 * every flow stays exercisable without an account anywhere.
 *
 * `geocode()` never throws: every outcome is a `GeocodeResult`. The address
 * form treats failure as "no pin yet", never as a reason to refuse the save.
 */
import { z } from 'zod';
import { env } from '$env/dynamic/private';

export interface GeocoderConfig {
	/** The template, `{query}` (and `{key}`) still in it. */
	urlTemplate: string;
	apiKey: string | null;
	userAgent: string | null;
}

/**
 * The env vars the geocoder reads, injectable so tests can vary them. The
 * index signature is what lets the real `$env/dynamic/private` env satisfy
 * this — see `EmailEnv` for why.
 */
export interface GeocodeEnv {
	GEOCODER_URL?: string | undefined;
	GEOCODER_API_KEY?: string | undefined;
	GEOCODER_USER_AGENT?: string | undefined;
	[key: string]: string | undefined;
}

/** Resolve the geocoder, or `null` when geocoding is off. A template that never uses `{query}` is refused loudly. */
export function geocoderConfig(source: GeocodeEnv = env): GeocoderConfig | null {
	const urlTemplate = (source.GEOCODER_URL ?? '').trim();
	if (!urlTemplate) return null;
	if (!urlTemplate.includes('{query}')) {
		console.error('[geocode] GEOCODER_URL has no {query} placeholder — geocoding disabled.');
		return null;
	}
	const apiKey = (source.GEOCODER_API_KEY ?? '').trim();
	const userAgent = (source.GEOCODER_USER_AGENT ?? '').trim();
	return { urlTemplate, apiKey: apiKey || null, userAgent: userAgent || null };
}

export function isGeocodingEnabled(source: GeocodeEnv = env): boolean {
	return geocoderConfig(source) !== null;
}

/** The lines of a postal address, as the `addresses` table holds them. */
export interface PostalAddress {
	line1: string;
	line2: string | null;
	city: string | null;
	region: string | null;
	postal_code: string | null;
	country: string | null;
}

export type GeocodeResult =
	{ ok: true; latitude: number; longitude: number } | { ok: false; error: string };

export interface GeocodeDeps {
	/** Override the fetch used (tests). */
	fetch?: typeof fetch;
	/** Override the env source (tests). */
	envSource?: GeocodeEnv;
}

/** What a Nominatim-style provider answers: the best match first, coordinates as strings. */
const providerResponse = z
	.array(
		z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) })
	)
	.min(1);

/** One line, the way a person would type it into a map: the parts that are there, comma-separated. */
export function addressQuery(address: PostalAddress): string {
	return [
		address.line1,
		address.line2,
		address.city,
		address.region,
		address.postal_code,
		address.country
	]
		.map((part) => part?.trim() ?? '')
		.filter((part) => part !== '')
		.join(', ');
}

export async function geocode(
	address: PostalAddress,
	deps: GeocodeDeps = {}
): Promise<GeocodeResult> {
	const config = geocoderConfig(deps.envSource ?? env);
	const query = addressQuery(address);
	if (!config) {
		console.warn(`[geocode] Not configured (set GEOCODER_URL) — not geocoding "${query}".`);
		return { ok: false, error: 'Geocoding is not configured.' };
	}
	if (query === '') return { ok: false, error: 'Nothing to geocode.' };

	const url = config.urlTemplate
		.replace('{query}', encodeURIComponent(query))
		.replace('{key}', encodeURIComponent(config.apiKey ?? ''));
	const headers = new Headers({ accept: 'application/json' });
	if (config.userAgent) headers.set('user-agent', config.userAgent);

	try {
		const response = await (deps.fetch ?? fetch)(url, { headers });
		if (!response.ok) {
			return { ok: false, error: `Geocoder answered ${response.status}.` };
		}
		const parsed = providerResponse.safeParse(await response.json());
		if (!parsed.success) return { ok: false, error: 'Geocoder found no match.' };
		const [best] = parsed.data;
		if (!best) return { ok: false, error: 'Geocoder found no match.' };
		return { ok: true, latitude: best.lat, longitude: best.lon };
	} catch (cause) {
		return { ok: false, error: cause instanceof Error ? cause.message : 'Geocoder unreachable.' };
	}
}
