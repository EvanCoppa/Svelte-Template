/**
 * What the map draws: a pin is a place with a name, linking to the record
 * it belongs to when the reader may open it. The view page's load makes
 * these from addresses (`pinsFor()` in `$lib/server/crm/views`); anything
 * else with coordinates can make them too.
 */
export type MapPin = {
	id: string;
	label: string;
	/** Null when there is nowhere to go — the reader may not open the record. */
	href: string | null;
	latitude: number;
	longitude: number;
};

/** `[[west, south], [east, north]]` — MapLibre's bounds shape. */
export type Bounds = [[number, number], [number, number]];

/** The box every pin sits in, or null when there is nothing to frame. */
export function boundsOf(pins: readonly MapPin[]): Bounds | null {
	const [first, ...rest] = pins;
	if (!first) return null;
	let west = first.longitude;
	let east = first.longitude;
	let south = first.latitude;
	let north = first.latitude;
	for (const pin of rest) {
		west = Math.min(west, pin.longitude);
		east = Math.max(east, pin.longitude);
		south = Math.min(south, pin.latitude);
		north = Math.max(north, pin.latitude);
	}
	return [
		[west, south],
		[east, north]
	];
}

/** One GeoJSON feature per pin, the shape a clustered source takes. */
export function toFeatureCollection(pins: readonly MapPin[]) {
	return {
		type: 'FeatureCollection' as const,
		features: pins.map((pin) => ({
			type: 'Feature' as const,
			id: pin.id,
			properties: { id: pin.id, label: pin.label, href: pin.href },
			geometry: { type: 'Point' as const, coordinates: [pin.longitude, pin.latitude] }
		}))
	};
}
