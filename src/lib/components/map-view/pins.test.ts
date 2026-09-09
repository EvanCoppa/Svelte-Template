import { describe, expect, it } from 'vitest';
import { boundsOf, toFeatureCollection, type MapPin } from './pins';

const pin = (id: string, latitude: number, longitude: number): MapPin => ({
	id,
	label: id,
	href: null,
	latitude,
	longitude
});

describe('boundsOf', () => {
	it('frames every pin, and nothing when there are none', () => {
		expect(boundsOf([])).toBeNull();
		expect(boundsOf([pin('a', 40.5, -74.2)])).toEqual([
			[-74.2, 40.5],
			[-74.2, 40.5]
		]);
		expect(
			boundsOf([pin('a', 40.5, -74.2), pin('b', 39.7, -105.0), pin('c', 41.0, -73.9)])
		).toEqual([
			[-105.0, 39.7],
			[-73.9, 41.0]
		]);
	});
});

describe('toFeatureCollection', () => {
	it('turns pins into point features carrying what the popup shows', () => {
		expect(
			toFeatureCollection([{ ...pin('a', 40.5, -74.2), label: 'Acme', href: '/companies/a' }])
		).toEqual({
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					id: 'a',
					properties: { id: 'a', label: 'Acme', href: '/companies/a' },
					geometry: { type: 'Point', coordinates: [-74.2, 40.5] }
				}
			]
		});
	});
});
