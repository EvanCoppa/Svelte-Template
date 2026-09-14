import { describe, expect, it } from 'vitest';
import { mapConfig, mapOrigins } from './map';

describe('mapConfig', () => {
	it('is a pair of absolute https style URLs', () => {
		const { styleUrl, darkStyleUrl } = mapConfig();
		expect(new URL(styleUrl).protocol).toBe('https:');
		expect(darkStyleUrl).not.toBeNull();
		if (darkStyleUrl !== null) expect(new URL(darkStyleUrl).protocol).toBe('https:');
	});
});

describe('mapOrigins', () => {
	it('lists each origin once', () => {
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

	it('covers the configured styles', () => {
		expect(mapOrigins(mapConfig())).toEqual(['https://tiles.openfreemap.org']);
	});
});
