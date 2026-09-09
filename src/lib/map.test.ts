import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapConfig, mapOrigins } from './map';

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('mapConfig', () => {
	it('is off by default and with a blank URL', () => {
		expect(mapConfig({})).toBeNull();
		expect(mapConfig({ PUBLIC_MAP_STYLE_URL: '  ' })).toBeNull();
	});

	it('reads the style URLs', () => {
		expect(mapConfig({ PUBLIC_MAP_STYLE_URL: 'https://tiles.test/styles/liberty' })).toEqual({
			styleUrl: 'https://tiles.test/styles/liberty',
			darkStyleUrl: null
		});
		expect(
			mapConfig({
				PUBLIC_MAP_STYLE_URL: 'https://tiles.test/styles/liberty',
				PUBLIC_MAP_STYLE_URL_DARK: 'https://dark.test/style.json'
			})
		).toEqual({
			styleUrl: 'https://tiles.test/styles/liberty',
			darkStyleUrl: 'https://dark.test/style.json'
		});
	});

	it('refuses (loudly) a URL that is not an absolute http(s) one', () => {
		expect(mapConfig({ PUBLIC_MAP_STYLE_URL: '/style.json' })).toBeNull();
		expect(mapConfig({ PUBLIC_MAP_STYLE_URL: 'ftp://tiles.test/style.json' })).toBeNull();
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('PUBLIC_MAP_STYLE_URL'));
	});
});

describe('mapOrigins', () => {
	it('lists each origin once, and none without a map', () => {
		expect(mapOrigins(null)).toEqual([]);
		expect(
			mapOrigins({
				styleUrl: 'https://tiles.test/styles/liberty',
				darkStyleUrl: 'https://tiles.test/styles/dark'
			})
		).toEqual(['https://tiles.test']);
		expect(
			mapOrigins({
				styleUrl: 'https://tiles.test/styles/liberty',
				darkStyleUrl: 'https://dark.test/style.json'
			})
		).toEqual(['https://tiles.test', 'https://dark.test']);
	});
});
