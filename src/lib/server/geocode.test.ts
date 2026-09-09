import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	addressQuery,
	geocode,
	geocoderConfig,
	isGeocodingEnabled,
	type GeocodeEnv,
	type PostalAddress
} from './geocode';

const configured: GeocodeEnv = {
	GEOCODER_URL: 'https://geo.test/search?q={query}&key={key}',
	GEOCODER_API_KEY: 'k1',
	GEOCODER_USER_AGENT: 'svelte-template/1.0'
};

const address: PostalAddress = {
	line1: '1007 Mountain Drive',
	line2: null,
	city: 'Gotham',
	region: 'NJ',
	postal_code: '07001',
	country: 'US'
};

function fetchAnswering(status: number, body: string) {
	return vi.fn<typeof fetch>(async () => new Response(body, { status }));
}

beforeEach(() => {
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('geocoderConfig', () => {
	it('is disabled by default, and with a template that has nowhere to put the address', () => {
		expect(geocoderConfig({})).toBeNull();
		expect(isGeocodingEnabled({})).toBe(false);
		expect(geocoderConfig({ GEOCODER_URL: 'https://geo.test/search' })).toBeNull();
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('{query}'));
	});

	it('reads the template, the key and the user agent', () => {
		expect(geocoderConfig(configured)).toEqual({
			urlTemplate: 'https://geo.test/search?q={query}&key={key}',
			apiKey: 'k1',
			userAgent: 'svelte-template/1.0'
		});
		expect(geocoderConfig({ GEOCODER_URL: 'https://geo.test/?q={query}' })).toMatchObject({
			apiKey: null,
			userAgent: null
		});
	});
});

describe('addressQuery', () => {
	it('joins the parts that are there', () => {
		expect(addressQuery(address)).toBe('1007 Mountain Drive, Gotham, NJ, 07001, US');
		expect(addressQuery({ ...address, city: ' ', region: null, postal_code: null })).toBe(
			'1007 Mountain Drive, US'
		);
	});
});

describe('geocode', () => {
	it('reports failure without fetching when unconfigured', async () => {
		const fetchSpy = fetchAnswering(200, '[]');
		await expect(geocode(address, { fetch: fetchSpy, envSource: {} })).resolves.toEqual({
			ok: false,
			error: 'Geocoding is not configured.'
		});
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Not configured'));
	});

	it('fills the template, sends the user agent and reads the best match', async () => {
		const fetchSpy = fetchAnswering(
			200,
			'[{"lat":"40.5806","lon":"-74.2854"},{"lat":"0","lon":"0"}]'
		);
		await expect(geocode(address, { fetch: fetchSpy, envSource: configured })).resolves.toEqual({
			ok: true,
			latitude: 40.5806,
			longitude: -74.2854
		});
		const [url, init] = fetchSpy.mock.calls[0] ?? [];
		expect(url).toBe(
			'https://geo.test/search?q=1007%20Mountain%20Drive%2C%20Gotham%2C%20NJ%2C%2007001%2C%20US&key=k1'
		);
		expect(new Headers(init?.headers).get('user-agent')).toBe('svelte-template/1.0');
	});

	it('reports a provider error, an empty answer and a malformed one without throwing', async () => {
		await expect(
			geocode(address, { fetch: fetchAnswering(429, ''), envSource: configured })
		).resolves.toEqual({ ok: false, error: 'Geocoder answered 429.' });
		await expect(
			geocode(address, { fetch: fetchAnswering(200, '[]'), envSource: configured })
		).resolves.toEqual({ ok: false, error: 'Geocoder found no match.' });
		await expect(
			geocode(address, { fetch: fetchAnswering(200, '{"lat":1}'), envSource: configured })
		).resolves.toEqual({ ok: false, error: 'Geocoder found no match.' });
		const down = vi.fn<typeof fetch>(async () => {
			throw new Error('ECONNREFUSED');
		});
		await expect(geocode(address, { fetch: down, envSource: configured })).resolves.toEqual({
			ok: false,
			error: 'ECONNREFUSED'
		});
	});
});
