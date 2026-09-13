<script lang="ts">
	import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import {
		edgeLabelFrom,
		neighbourhoodOf,
		type GraphEdge,
		type GraphNode,
		type Swatch
	} from '$lib/crm/graph';
	import { reducedMotion } from '$lib/motion.js';
	import { theme } from '$lib/theme.svelte';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The map: every node the page hands it, laid out by a force simulation
	 * (d3-force — the layout only; the drawing, the pointer and the keyboard
	 * are this file's) on a canvas the reader can pan, zoom, pull a node
	 * around on and rest the pointer on. A node is coloured by its kind's
	 * swatch, sized by how many edges it has, and named beneath itself once
	 * the reader is close enough for the names to be legible; resting on one
	 * lights up its neighbourhood — the records one step away, the edges
	 * between, and on each edge the words that read from the node under the
	 * pointer ("owns", "owned by"). A click opens the record through
	 * `onopen`, which the page turns into a navigation; the component never
	 * decides where a node leads.
	 *
	 * The colours come from the `app.css` tokens, re-read when the theme
	 * flips; a reader who asked for less motion gets the settled layout
	 * drawn once instead of watching it settle. The canvas is a picture to
	 * assistive technology, so the same nodes are listed beneath it as real
	 * links (the map's rule), and every node the map draws is reachable
	 * without a pointer.
	 *
	 * The positions survive a re-render: when the page filters a kind out
	 * and back in, a node lands where it was rather than starting over, so
	 * the map keeps its shape while the reader narrows it.
	 */
	let {
		ref = $bindable(null),
		class: className,
		nodes,
		edges,
		swatches,
		focus = null,
		onopen,
		...restProps
	}: WithElementRef<Omit<HTMLAttributes<HTMLDivElement>, 'children'>> & {
		nodes: readonly GraphNode[];
		edges: readonly GraphEdge[];
		/** The token each kind is drawn in, keyed by kind. */
		swatches: Readonly<Record<string, Swatch>>;
		/** A node to open the map on, lit and centred, or null for the whole map framed. */
		focus?: string | null;
		/** A node was clicked (or chosen from the keyboard list). */
		onopen?: (node: GraphNode) => void;
	} = $props();

	type SimNode = GraphNode & SimulationNodeDatum & { degree: number };
	type SimLink = SimulationLinkDatum<SimNode> &
		Pick<GraphEdge, 'id' | 'label' | 'inverseLabel' | 'ended'> & {
			source: SimNode;
			target: SimNode;
		};

	/** How far the pointer may move between down and up and still be a click, in screen pixels. */
	const CLICK_SLOP = 3;
	const MIN_ZOOM = 0.2;
	const MAX_ZOOM = 4;

	/** A node's radius in map units: a little for each edge, capped so a hub stays a dot. */
	const radiusOf = (node: SimNode) => 4 + Math.min(node.degree, 12) * 0.75;

	let hovered = $state<string | null>(null);
	const lit = $derived(hovered ?? focus);
	const neighbourhood = $derived(lit ? neighbourhoodOf(lit, edges) : null);

	/** A token's colour as the browser resolved it, so the map matches the chrome. */
	function token(name: string): string {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	}

	const graphAttachment: Attachment<HTMLDivElement> = (container) => {
		const canvas = document.createElement('canvas');
		canvas.className = 'block h-full w-full touch-none';
		container.prepend(canvas);
		const context2d = canvas.getContext('2d');
		if (!context2d) return;
		// Hoisted below into function declarations, which do not carry the
		// narrowing above; a typed alias does.
		const context: CanvasRenderingContext2D = context2d;

		let simulation: Simulation<SimNode, SimLink> | undefined;
		let simNodes: SimNode[] = [];
		let simLinks: SimLink[] = [];
		/** Where each node was last, so a node filtered out and back keeps its place. */
		// Plain records, not reactive collections: nothing renders from these,
		// and a simulation tick writing to reactive state would re-run the
		// effects that rebuild the simulation.
		const remembered: Record<string, { x: number; y: number }> = {};
		let width = 0;
		let height = 0;
		const view = { x: 0, y: 0, k: 1 };
		let framed = false;
		let frame = 0;
		let colours = readColours();
		let disposed = false;

		function readColours() {
			const kinds: Record<string, string> = {};
			for (const [kind, swatch] of Object.entries(swatches)) kinds[kind] = token(`--${swatch}`);
			return {
				surface: token('--background'),
				edge: token('--muted-foreground'),
				label: token('--foreground'),
				muted: token('--muted-foreground'),
				ring: token('--primary'),
				kinds
			};
		}

		/** Screen → map coordinates. */
		function toMap(sx: number, sy: number) {
			return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
		}

		function nodeAt(sx: number, sy: number): SimNode | null {
			const point = toMap(sx, sy);
			let best: SimNode | null = null;
			let bestDistance = Infinity;
			for (const node of simNodes) {
				const dx = (node.x ?? 0) - point.x;
				const dy = (node.y ?? 0) - point.y;
				const distance = Math.hypot(dx, dy);
				const reach = radiusOf(node) + 4 / view.k;
				if (distance <= reach && distance < bestDistance) {
					best = node;
					bestDistance = distance;
				}
			}
			return best;
		}

		/** Frame the whole map, or the focused node up close. */
		function frameView() {
			if (simNodes.length === 0 || width === 0) return;
			const focused = focus ? simNodes.find((node) => node.id === focus) : undefined;
			if (focused) {
				view.k = 1.6;
				view.x = width / 2 - (focused.x ?? 0) * view.k;
				view.y = height / 2 - (focused.y ?? 0) * view.k;
				return;
			}
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const node of simNodes) {
				minX = Math.min(minX, node.x ?? 0);
				minY = Math.min(minY, node.y ?? 0);
				maxX = Math.max(maxX, node.x ?? 0);
				maxY = Math.max(maxY, node.y ?? 0);
			}
			const padding = 48;
			const spanX = Math.max(maxX - minX, 1);
			const spanY = Math.max(maxY - minY, 1);
			view.k = Math.min(
				MAX_ZOOM,
				Math.max(
					MIN_ZOOM,
					Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY, 1.5)
				)
			);
			view.x = width / 2 - ((minX + maxX) / 2) * view.k;
			view.y = height / 2 - ((minY + maxY) / 2) * view.k;
		}

		function draw() {
			frame = 0;
			const dpr = window.devicePixelRatio || 1;
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, width, height);
			context.translate(view.x, view.y);
			context.scale(view.k, view.k);

			const scope = neighbourhood;
			// Names come in once the map is close enough to read them; the lit
			// neighbourhood is always named.
			const labelAlpha = Math.max(0, Math.min(1, (view.k - 0.55) / 0.5));
			const dim = scope ? 0.15 : 1;

			context.lineWidth = 1 / view.k;
			for (const link of simLinks) {
				const inScope = scope?.edges.has(link.id) ?? false;
				context.globalAlpha = (scope ? (inScope ? 0.9 : dim) : 0.45) * (link.ended ? 0.5 : 1);
				context.strokeStyle = colours.edge;
				context.setLineDash(link.ended ? [4 / view.k, 4 / view.k] : []);
				context.beginPath();
				context.moveTo(link.source.x ?? 0, link.source.y ?? 0);
				context.lineTo(link.target.x ?? 0, link.target.y ?? 0);
				context.stroke();
			}
			context.setLineDash([]);

			for (const node of simNodes) {
				const inScope = scope?.nodes.has(node.id) ?? true;
				context.globalAlpha = inScope ? 1 : dim;
				context.fillStyle = colours.kinds[node.kind] ?? colours.muted;
				context.beginPath();
				context.arc(node.x ?? 0, node.y ?? 0, radiusOf(node), 0, Math.PI * 2);
				context.fill();
				if (node.id === lit) {
					context.lineWidth = 2 / view.k;
					context.strokeStyle = colours.ring;
					context.stroke();
					context.lineWidth = 1 / view.k;
				}
			}

			// Labels are drawn in screen pixels whatever the zoom, so the map
			// gets closer while the type stays the size it is read at.
			context.font = `${12 / view.k}px ${getComputedStyle(container).fontFamily}`;
			context.textAlign = 'center';
			context.textBaseline = 'top';
			for (const node of simNodes) {
				const inScope = scope?.nodes.has(node.id) ?? false;
				const alpha = inScope ? 1 : labelAlpha * dim;
				if (alpha <= 0.02) continue;
				context.globalAlpha = alpha;
				context.fillStyle = colours.label;
				context.fillText(node.name, node.x ?? 0, (node.y ?? 0) + radiusOf(node) + 3 / view.k);
			}

			// The words on each lit edge, read from the node under the pointer.
			if (scope && lit) {
				context.font = `${11 / view.k}px ${getComputedStyle(container).fontFamily}`;
				context.textBaseline = 'middle';
				for (const link of simLinks) {
					if (!scope.edges.has(link.id)) continue;
					const words = edgeLabelFrom(
						{ ...link, source: link.source.id, target: link.target.id },
						lit
					);
					if (!words) continue;
					const mx = ((link.source.x ?? 0) + (link.target.x ?? 0)) / 2;
					const my = ((link.source.y ?? 0) + (link.target.y ?? 0)) / 2;
					const measured = context.measureText(words).width;
					const padX = 4 / view.k;
					const padY = 2 / view.k;
					context.globalAlpha = 0.92;
					context.fillStyle = colours.surface;
					context.fillRect(
						mx - measured / 2 - padX,
						my - 6 / view.k - padY,
						measured + padX * 2,
						12 / view.k + padY * 2
					);
					context.globalAlpha = 1;
					context.fillStyle = colours.muted;
					context.fillText(words, mx, my);
				}
			}
			context.globalAlpha = 1;
		}

		function requestDraw() {
			if (frame || disposed) return;
			frame = requestAnimationFrame(draw);
		}

		/** Size the canvas to its box at device resolution. */
		function resize() {
			const box = container.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			width = Math.round(box.width);
			height = Math.round(box.height);
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			if (!framed) frameView();
			requestDraw();
		}

		type ForceLib = typeof import('d3-force');
		let lib: ForceLib | undefined;

		/** (Re)build the simulation from the nodes and edges the page handed over. */
		function rebuild(lib: ForceLib) {
			simulation?.stop();
			const degree: Record<string, number> = {};
			for (const edge of edges) {
				degree[edge.source] = (degree[edge.source] ?? 0) + 1;
				degree[edge.target] = (degree[edge.target] ?? 0) + 1;
			}
			const byId: Record<string, SimNode> = {};
			simNodes = nodes.map((node) => {
				const was = remembered[node.id];
				const sim: SimNode = { ...node, degree: degree[node.id] ?? 0, ...was };
				byId[node.id] = sim;
				return sim;
			});
			simLinks = edges.flatMap((edge): SimLink[] => {
				const source = byId[edge.source];
				const target = byId[edge.target];
				if (!source || !target) return [];
				return [
					{
						id: edge.id,
						label: edge.label,
						inverseLabel: edge.inverseLabel,
						ended: edge.ended,
						source,
						target
					}
				];
			});

			simulation = lib
				.forceSimulation(simNodes)
				.force(
					'link',
					lib
						.forceLink<SimNode, SimLink>(simLinks)
						.distance((link) => 40 + radiusOf(link.source) + radiusOf(link.target))
						.strength(0.6)
				)
				.force('charge', lib.forceManyBody<SimNode>().strength(-160).distanceMax(400))
				.force(
					'collide',
					lib.forceCollide<SimNode>((node) => radiusOf(node) + 6)
				)
				.force('x', lib.forceX(0).strength(0.03))
				.force('y', lib.forceY(0).strength(0.03))
				.force('center', lib.forceCenter(0, 0).strength(0.05));

			const remember = () => {
				for (const node of simNodes) {
					remembered[node.id] = { x: node.x ?? 0, y: node.y ?? 0 };
				}
			};

			if (reducedMotion.current) {
				// The settled map, drawn once.
				simulation.stop();
				simulation.tick(300);
				remember();
				if (!framed) {
					frameView();
					framed = true;
				}
				requestDraw();
				return;
			}
			simulation.on('tick', () => {
				remember();
				// The first frame is taken once the map has stopped moving much;
				// until then the view follows the whole map so nothing settles
				// off screen.
				if (!framed) frameView();
				requestDraw();
			});
			simulation.on('end', () => {
				framed = true;
				requestDraw();
			});
			simulation.alpha(1).restart();
		}

		// ── Pointer: pan the map, pull a node, rest on one, click one ──
		let pointer: {
			id: number;
			startX: number;
			startY: number;
			node: SimNode | null;
			moved: boolean;
		} | null = null;

		function onPointerDown(event: PointerEvent) {
			if (event.button !== 0) return;
			const node = nodeAt(event.offsetX, event.offsetY);
			pointer = {
				id: event.pointerId,
				startX: event.offsetX,
				startY: event.offsetY,
				node,
				moved: false
			};
			canvas.setPointerCapture(event.pointerId);
			if (node && simulation) {
				node.fx = node.x;
				node.fy = node.y;
				if (!reducedMotion.current) simulation.alphaTarget(0.3).restart();
			}
		}

		function onPointerMove(event: PointerEvent) {
			if (!pointer || pointer.id !== event.pointerId) {
				const over = nodeAt(event.offsetX, event.offsetY);
				const id = over?.id ?? null;
				if (id !== hovered) {
					hovered = id;
					canvas.style.cursor = over ? 'pointer' : 'grab';
				}
				return;
			}
			const dx = event.offsetX - pointer.startX;
			const dy = event.offsetY - pointer.startY;
			if (!pointer.moved && Math.hypot(dx, dy) > CLICK_SLOP) pointer.moved = true;
			if (!pointer.moved) return;
			if (pointer.node) {
				const point = toMap(event.offsetX, event.offsetY);
				pointer.node.fx = point.x;
				pointer.node.fy = point.y;
				if (reducedMotion.current && simulation) {
					pointer.node.x = point.x;
					pointer.node.y = point.y;
					simulation.tick(2);
				}
				requestDraw();
			} else {
				view.x += event.movementX;
				view.y += event.movementY;
				canvas.style.cursor = 'grabbing';
				requestDraw();
			}
		}

		function onPointerUp(event: PointerEvent) {
			if (!pointer || pointer.id !== event.pointerId) return;
			const { node, moved } = pointer;
			pointer = null;
			canvas.releasePointerCapture(event.pointerId);
			canvas.style.cursor = node ? 'pointer' : 'grab';
			if (node) {
				// Let go: the node rejoins the simulation where it was dropped.
				node.fx = null;
				node.fy = null;
				if (!reducedMotion.current) simulation?.alphaTarget(0);
				if (!moved) onopen?.(node);
			}
			requestDraw();
		}

		function onPointerLeave() {
			if (hovered !== null) hovered = null;
		}

		function onWheel(event: WheelEvent) {
			event.preventDefault();
			const factor = Math.exp(-event.deltaY * 0.0015);
			const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * factor));
			const ratio = next / view.k;
			// Zoom about the pointer, so the map grows under the cursor rather than
			// sliding away from it.
			view.x = event.offsetX - (event.offsetX - view.x) * ratio;
			view.y = event.offsetY - (event.offsetY - view.y) * ratio;
			view.k = next;
			framed = true;
			requestDraw();
		}

		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointermove', onPointerMove);
		canvas.addEventListener('pointerup', onPointerUp);
		canvas.addEventListener('pointercancel', onPointerUp);
		canvas.addEventListener('pointerleave', onPointerLeave);
		canvas.addEventListener('wheel', onWheel, { passive: false });
		canvas.style.cursor = 'grab';

		const observer = new ResizeObserver(resize);
		observer.observe(container);

		(async () => {
			// Loaded here, not at the top: it lands in its own chunk and is paid
			// for only by the page that draws a map.
			lib = await import('d3-force');
			if (disposed) return;
			resize();
			rebuild(lib);
		})();

		// The page filtered the map: rebuild it around the nodes that remain.
		$effect(() => {
			void nodes;
			void edges;
			if (lib) rebuild(lib);
		});

		// The focus moved (a new `?focus=`): frame it.
		$effect(() => {
			void focus;
			if (lib && simNodes.length > 0) {
				frameView();
				requestDraw();
			}
		});

		// What lights up changed, or the theme flipped: redraw with the tokens as they are now.
		$effect(() => {
			void lit;
			void theme.current;
			colours = readColours();
			requestDraw();
		});

		return () => {
			disposed = true;
			if (frame) cancelAnimationFrame(frame);
			observer.disconnect();
			simulation?.stop();
			canvas.remove();
		};
	};
</script>

<div
	bind:this={ref}
	data-slot="relationship-graph"
	class={cn('bg-muted/40 relative min-h-64 w-full overflow-hidden rounded-lg border', className)}
	{...restProps}
	{@attach graphAttachment}
>
	<!-- The map is a canvas — nothing a keyboard or a screen reader can
	     reach. The same nodes as real, focusable links, so every record the
	     map draws is still reachable without a pointer. -->
	<ul class="sr-only">
		{#each nodes as node (node.id)}
			<li>
				{#if node.href}
					<a href={node.href}>{node.name}</a>
				{:else}
					{node.name}
				{/if}
			</li>
		{/each}
	</ul>
</div>
