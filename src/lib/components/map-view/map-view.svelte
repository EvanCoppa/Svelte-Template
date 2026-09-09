<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { GeoJSONSource, Map as MapLibreMap, Popup } from 'maplibre-gl';
	import { mount, unmount } from 'svelte';
	import { z } from 'zod';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { reducedMotion } from '$lib/motion.js';
	import { theme } from '$lib/theme.svelte';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import MapViewPopup from './map-view-popup.svelte';
	import { boundsOf, toFeatureCollection, type MapPin } from './pins.js';

	/**
	 * A map of pins — MapLibre GL, drawn as one clustered layer so a few
	 * thousand records stay cheap, framed to the pins it is given and
	 * re-framed when they change. A click on a cluster zooms into it; a click
	 * on a pin opens a popup naming the record, as a link when the reader may
	 * open it. The style follows the theme (`darkStyleUrl` when there is one),
	 * the colours come from the `app.css` tokens, and a reader who asked for
	 * less motion gets a still map.
	 *
	 * The library is loaded inside the attachment — it reaches for `window`
	 * on import, so a top-level import would break the server render — and
	 * lands in its own chunk, paid for only by a page that shows a map.
	 */
	let {
		ref = $bindable(null),
		class: className,
		pins,
		styleUrl,
		darkStyleUrl = null,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		pins: readonly MapPin[];
		/** A MapLibre style URL (`mapConfig()` in `$lib/map`). */
		styleUrl: string;
		/** The style for a dark theme; the light one serves both when null. */
		darkStyleUrl?: string | null;
	} = $props();

	const SOURCE = 'pins';

	// What MapLibre hands back from a click is a bag of feature properties:
	// parsed at that boundary, never sniffed.
	const clusterProperties = z.object({ cluster_id: z.number() });
	const pinProperties = z.object({ label: z.string(), href: z.string().nullable() });
	const activeStyle = $derived(theme.current === 'dark' && darkStyleUrl ? darkStyleUrl : styleUrl);

	/** A token's colour as the browser resolved it, so the pins match the chrome. */
	function token(name: string): string {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	}

	/** Frame the pins, still or animated as the reader prefers. */
	function frame(map: MapLibreMap) {
		const bounds = boundsOf(pins);
		if (!bounds) return;
		map.fitBounds(bounds, { padding: 48, maxZoom: 14, animate: !reducedMotion.current });
	}

	const mapAttachment: Attachment<HTMLDivElement> = (node) => {
		let map: MapLibreMap | undefined;
		let popup: Popup | undefined;
		let disposed = false;

		// The source and its layers go with the style, so they are (re)drawn on
		// every `style.load` — the first, and each theme swap after it.
		function draw(map: MapLibreMap, lib: typeof import('maplibre-gl')) {
			const primary = token('--primary');
			const onPrimary = token('--primary-foreground');
			const surface = token('--background');
			map.addSource(SOURCE, {
				type: 'geojson',
				data: toFeatureCollection(pins),
				cluster: true,
				clusterMaxZoom: 14,
				clusterRadius: 48
			});
			map.addLayer({
				id: 'clusters',
				type: 'circle',
				source: SOURCE,
				filter: ['has', 'point_count'],
				paint: {
					'circle-color': primary,
					'circle-opacity': 0.9,
					'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
					'circle-stroke-width': 2,
					'circle-stroke-color': surface
				}
			});
			map.addLayer({
				id: 'cluster-count',
				type: 'symbol',
				source: SOURCE,
				filter: ['has', 'point_count'],
				layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
				paint: { 'text-color': onPrimary }
			});
			map.addLayer({
				id: 'pin',
				type: 'circle',
				source: SOURCE,
				filter: ['!', ['has', 'point_count']],
				paint: {
					'circle-color': primary,
					'circle-radius': 7,
					'circle-stroke-width': 2,
					'circle-stroke-color': surface
				}
			});

			map.on('click', 'clusters', async (event) => {
				const [feature] = map.queryRenderedFeatures(event.point, { layers: ['clusters'] });
				const source = map.getSource<GeoJSONSource>(SOURCE);
				const cluster = clusterProperties.safeParse(feature?.properties);
				if (!source || !feature || !cluster.success || feature.geometry.type !== 'Point') return;
				const zoom = await source.getClusterExpansionZoom(cluster.data.cluster_id);
				const [lng, lat] = feature.geometry.coordinates;
				if (lng === undefined || lat === undefined) return;
				map.easeTo({ center: [lng, lat], zoom, animate: !reducedMotion.current });
			});
			map.on('click', 'pin', (event) => {
				const [feature] = event.features ?? [];
				if (!feature || feature.geometry.type !== 'Point') return;
				const [lng, lat] = feature.geometry.coordinates;
				if (lng === undefined || lat === undefined) return;
				const pin = pinProperties.safeParse(feature.properties);
				if (!pin.success) return;
				const target = document.createElement('div');
				const content = mount(MapViewPopup, { target, props: pin.data });
				popup?.remove();
				popup = new lib.Popup({ offset: 12 })
					.setLngLat([lng, lat])
					.setDOMContent(target)
					.addTo(map);
				popup.on('close', () => unmount(content));
				// Opened by a click, but still has to work without one: land
				// focus on the link (or the popup itself, when there is nowhere
				// to go) so Tab reaches the close button and Escape dismisses it.
				target.tabIndex = -1;
				target.addEventListener('keydown', (keyEvent) => {
					if (keyEvent.key === 'Escape') popup?.remove();
				});
				(target.querySelector<HTMLAnchorElement>('a') ?? target).focus();
			});
			for (const layer of ['clusters', 'pin']) {
				map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
				map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
			}
		}

		(async () => {
			const lib = await import('maplibre-gl');
			if (disposed) return;
			map = new lib.Map({
				container: node,
				style: activeStyle,
				attributionControl: { compact: true },
				// A still map for a reader who asked for one; MapLibre's own
				// gestures honour it too.
				fadeDuration: reducedMotion.current ? 0 : 300
			});
			map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
			map.on('style.load', () => {
				if (!map) return;
				draw(map, lib);
				frame(map);
			});
		})();

		// The pins changed underneath: feed the source and re-frame.
		$effect(() => {
			const data = toFeatureCollection(pins);
			const source = map?.getSource<GeoJSONSource>(SOURCE);
			if (!map || !source) return;
			source.setData(data);
			frame(map);
		});

		// The theme flipped: swap the style; `style.load` redraws the pins.
		$effect(() => {
			const style = activeStyle;
			if (!map || map.getStyle()?.name === undefined) return;
			map.setStyle(style);
		});

		return () => {
			disposed = true;
			popup?.remove();
			map?.remove();
			map = undefined;
		};
	};
</script>

<div
	bind:this={ref}
	data-slot="map-view"
	class={cn('bg-muted relative min-h-64 w-full overflow-hidden rounded-lg border', className)}
	{...restProps}
	{@attach mapAttachment}
>
	<!-- Pins are a canvas layer — nothing a keyboard or screen reader can
	     reach. This list is the same data as real, focusable links, so every
	     pin the map draws is still reachable without a pointer. -->
	<ul class="sr-only">
		{#each pins as pin (pin.id)}
			<li>
				{#if pin.href}
					<a href={pin.href}>{pin.label}</a>
				{:else}
					{pin.label}
				{/if}
			</li>
		{/each}
	</ul>
</div>
