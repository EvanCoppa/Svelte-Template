import Popup from './map-view-popup.svelte';
import Root from './map-view.svelte';

/**
 * The map a view draws its records on:
 *
 *   <MapView.Root pins={data.pins} styleUrl={data.map.styleUrl} darkStyleUrl={data.map.darkStyleUrl} />
 *
 * The page owns the pins (`MapPin[]`, made server-side by `pinsFor()` in
 * `$lib/server/crm/views`) and the style (`mapConfig()` in `$lib/map`); the
 * root draws them clustered and opens `Popup` on a pin. `boundsOf()` and
 * `toFeatureCollection()` are the pure halves, tested on their own.
 */
export { boundsOf, toFeatureCollection, type Bounds, type MapPin } from './pins.js';

export {
	Root,
	Popup,
	//
	Root as MapView,
	Popup as MapViewPopup
};
