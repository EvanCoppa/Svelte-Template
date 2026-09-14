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
	import { namesAt, placeLabels, truncate, type LabelRequest } from './labels.js';

	/**
	 * The map: every node the page hands it, laid out by a force simulation
	 * (d3-force — the layout only; the drawing, the pointer and the keyboard
	 * are this file's) on a canvas the reader can pan, zoom, pull a node
	 * around on and rest the pointer on. A node is coloured by its kind's
	 * swatch and sized by how many edges it has; resting on one lights up its
	 * neighbourhood — the records one step away, the edges between, and on
	 * each edge the words that read from the node under the pointer ("owns",
	 * "owned by"). A click opens the record through `onopen`, which the page
	 * turns into a navigation; the component never decides where a node leads.
	 *
	 * **The names are the hard part**, and they follow the rule every dense
	 * map settles on rather than being drawn all at once (`labels.ts`): a
	 * record earns its name from zoom and standing together, so the map
	 * prints its hubs from across the room and the rest as the reader comes
	 * in; a name is then drawn only where one fits whole, trying each side of
	 * its dot before it is left off; it is cut to a width no name may exceed;
	 * and it is drawn over a halo of the map's own backdrop so a name that
	 * crosses a line is still a name. Resting on a node narrows that to its
	 * neighbourhood alone — the rest of the map goes quiet rather than fading
	 * to a grey mush behind it. All of it is measured in screen pixels
	 * whatever the zoom, because overlapping is something that happens on the
	 * reader's screen.
	 *
	 * The layout is the other half of legibility: a node's pull on its
	 * neighbours and the length of its links both grow with how many it has
	 * (the degree-scaled repulsion a force layout needs to keep a hub's
	 * spokes apart), so a record with two hundred relationships opens into a
	 * ring you can read into instead of collapsing into a disc.
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
	const MIN_ZOOM = 0.08;
	const MAX_ZOOM = 6;

	/** A record's name, and the line it takes, in screen pixels. */
	const NAME_SIZE = 12;
	const NAME_LINE = 15;
	/** The words on an edge, read from the node under the pointer. */
	const EDGE_SIZE = 11;
	/**
	 * The widest a name may be drawn. A practice with nine words in its name
	 * would otherwise take a box a third of the map wide and crowd out
	 * everything it passes over; cut, it says as much as any other name.
	 */
	const NAME_MAX_WIDTH = 148;

	/**
	 * How much of a line the map spends on a relationship at rest. A line's
	 * job when nothing is lit is to say *there is one here* — the
	 * neighbourhood pass says what it is — so it is drawn as a light dash
	 * rather than a solid hairline. Dashing spends about half the ink of a
	 * solid line at the same alpha, and the two together put a resting line
	 * at well under a third of the weight a solid hairline was laying down.
	 * Grey felt is the state a dense map stops being readable in, and it is
	 * the lines, not the dots, that get it there.
	 */
	const EDGE_REST_ALPHA = 0.22;
	/** The dash, in screen pixels — constant at every zoom, as the names are. */
	const EDGE_DASH = 3;
	/** An edge outside the lit neighbourhood: present, and nothing more. */
	const EDGE_QUIET_ALPHA = 0.06;
	/** An edge inside it, which is where a relationship is actually read. */
	const EDGE_LIT_ALPHA = 0.95;

	/**
	 * A node's radius in map units: the square root of its degree, so the
	 * dot's area is its standing. This is the room the **layout** reserves
	 * for a record — uncapped, because a hub genuinely needs it for its
	 * spokes — and deliberately not the size the dot is drawn at.
	 */
	const radiusOf = (node: SimNode) => 5 + Math.sqrt(node.degree) * 2;

	/**
	 * The dot as it is **drawn**, in screen pixels — the one place the map
	 * reconciles its two coordinate systems, and what decides whether it
	 * reads as words or as bubbles.
	 *
	 * A dot is laid out in map units and so scales with the zoom; a name is
	 * drawn at a fixed size in screen pixels and does not. Multiply the one
	 * straight by the other and a record sits right beside its own name at
	 * exactly one zoom: from across the room the dots are specks with type
	 * scattered between them, and coming in they swell into discs a name is
	 * lost against — a hub with two hundred relationships reaching a disc
	 * several names wide. So the zoom is damped, and the result held to a
	 * band either side of a name's own line: a record reads as a word with a
	 * dot on it at every zoom, which is the whole job.
	 */
	const DOT_MIN_RADIUS = 13;
	const DOT_MAX_RADIUS = 33;
	const screenRadiusOf = (node: SimNode, zoom: number) =>
		Math.min(DOT_MAX_RADIUS, Math.max(DOT_MIN_RADIUS, radiusOf(node) * Math.sqrt(zoom)));

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
				// The halo behind a name and the hairline around a dot are both
				// "the colour of whatever is behind this", so they have to be the
				// map's real backdrop rather than a token that resembles it — a
				// near-miss reads as a patch around every name, which is the one
				// place a halo exists to be invisible. Hence the opaque `bg-card`
				// on the container below: a tint over the page (`bg-muted/40`)
				// has no colour of its own to hand back here.
				surface: token('--card'),
				edge: token('--muted-foreground'),
				label: token('--foreground'),
				muted: token('--muted-foreground'),
				ring: token('--primary'),
				kinds
			};
		}

		// ── Type: read once, measured once ──

		/** The page's own family, so the map's names are the app's type. */
		let family = '';
		const fontOf = (size: number) => {
			if (!family) family = getComputedStyle(container).fontFamily || 'system-ui, sans-serif';
			return `${size}px ${family}`;
		};

		/**
		 * `measureText` is the hot call in the name pass — every name, every
		 * frame — so each string is measured once per size and kept. Nothing
		 * that changes a measurement changes without the component being torn
		 * down, so the cache never needs clearing.
		 *
		 * A bare object without a prototype, like `remembered` above and for
		 * the same reason: nothing renders from it, so a reactive collection
		 * would only cost. Keyed by text a record supplied, so no prototype —
		 * a company called "toString" is a key like any other.
		 */
		const measured: Record<string, number> = Object.create(null);
		function widthOf(size: number, text: string): number {
			const key = `${size}:${text}`;
			const hit = measured[key];
			if (hit !== undefined) return hit;
			context.font = fontOf(size);
			const width = context.measureText(text).width;
			measured[key] = width;
			return width;
		}

		/** A name cut to the width a name may take, kept so the cut is paid for once. */
		const shortened: Record<string, string> = Object.create(null);
		function nameOf(text: string): string {
			const hit = shortened[text];
			if (hit !== undefined) return hit;
			const short = truncate(text, NAME_MAX_WIDTH, (candidate) => widthOf(NAME_SIZE, candidate));
			shortened[text] = short;
			return short;
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
				// The dot as it is drawn plus a little slack, back in map units,
				// so what the pointer catches is what the reader can see.
				const reach = (screenRadiusOf(node, view.k) + 4) / view.k;
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

		/**
		 * One line between two records, at the weight its standing in the
		 * scope earns it. Lit, it is solid — and dashed only when the
		 * relationship has ended, which is where that distinction is worth the
		 * ink, because the reader is looking straight at it. At rest every
		 * line is a light dash instead: ongoing-or-ended is unreadable at that
		 * weight anyway, and a solid hairline per relationship is what turns
		 * the map into felt.
		 */
		function strokeLink(link: SimLink, alpha: number, solid: boolean) {
			context.globalAlpha = alpha * (link.ended ? 0.55 : 1);
			context.strokeStyle = colours.edge;
			const dash = EDGE_DASH / view.k;
			context.setLineDash(solid && !link.ended ? [] : [dash, dash]);
			context.beginPath();
			context.moveTo(link.source.x ?? 0, link.source.y ?? 0);
			context.lineTo(link.target.x ?? 0, link.target.y ?? 0);
			context.stroke();
		}

		/**
		 * The names, in screen pixels: which have been earned at this zoom,
		 * cut to width, laid out so none touches another, and drawn over a
		 * halo of the page's own background. Resting on a node narrows the
		 * whole pass to its neighbourhood.
		 */
		function drawNames(scope: ReturnType<typeof neighbourhoodOf> | null) {
			const requests: LabelRequest[] = [];
			const drawn: Record<string, { text: string; size: number; fill: string }> =
				Object.create(null);

			for (const node of simNodes) {
				// Under the pointer, the map names the neighbourhood and nothing
				// else; otherwise a name is earned by zoom and degree together.
				if (scope ? !scope.nodes.has(node.id) : !namesAt(view.k, node.degree)) continue;
				const x = (node.x ?? 0) * view.k + view.x;
				const y = (node.y ?? 0) * view.k + view.y;
				// Off the canvas: nothing to place, and nothing to measure.
				if (x < -NAME_MAX_WIDTH || x > width + NAME_MAX_WIDTH) continue;
				if (y < -NAME_LINE * 2 || y > height + NAME_LINE * 2) continue;
				const text = nameOf(node.name);
				drawn[node.id] = { text, size: NAME_SIZE, fill: colours.label };
				requests.push({
					id: node.id,
					x,
					y,
					radius: screenRadiusOf(node, view.k),
					width: widthOf(NAME_SIZE, text),
					height: NAME_LINE,
					priority: node.degree,
					// The record the reader is pointing at is never the one left off.
					required: node.id === lit
				});
			}

			// The words on each lit edge, read from the node under the pointer.
			// They queue behind every name: which records these are matters
			// more than what joins them, and a hub's two hundred lines would
			// otherwise spell one word across the whole map.
			if (scope && lit) {
				for (const link of simLinks) {
					if (!scope.edges.has(link.id)) continue;
					const words = edgeLabelFrom(
						{ ...link, source: link.source.id, target: link.target.id },
						lit
					);
					if (!words) continue;
					const id = `edge:${link.id}`;
					drawn[id] = { text: words, size: EDGE_SIZE, fill: colours.muted };
					requests.push({
						id,
						x: (((link.source.x ?? 0) + (link.target.x ?? 0)) / 2) * view.k + view.x,
						y: (((link.source.y ?? 0) + (link.target.y ?? 0)) / 2) * view.k + view.y,
						radius: 0,
						width: widthOf(EDGE_SIZE, words),
						height: EDGE_SIZE + 3,
						priority: -1
					});
				}
			}

			context.globalAlpha = 1;
			context.textAlign = 'left';
			context.textBaseline = 'middle';
			context.lineJoin = 'round';
			context.lineWidth = 3;
			context.setLineDash([]);
			for (const placement of placeLabels(requests, { width, height })) {
				const item = drawn[placement.id];
				if (!item) continue;
				context.font = fontOf(item.size);
				// The halo first: a name that crosses a line is still a name.
				context.strokeStyle = colours.surface;
				context.strokeText(item.text, placement.x, placement.y);
				context.fillStyle = item.fill;
				context.fillText(item.text, placement.x, placement.y);
			}
		}

		function draw() {
			frame = 0;
			const dpr = window.devicePixelRatio || 1;
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, width, height);
			context.save();
			context.translate(view.x, view.y);
			context.scale(view.k, view.k);

			const scope = neighbourhood;
			// A record outside the lit neighbourhood stays a legible dot; a line
			// outside it goes quieter still, because lines are the thing there
			// are hundreds of.
			const dimNode = scope ? 0.12 : 1;

			// The lit lines are drawn last so they sit on top of the rest.
			const litLinks: SimLink[] = [];
			context.lineWidth = 1 / view.k;
			for (const link of simLinks) {
				if (scope?.edges.has(link.id)) litLinks.push(link);
				else strokeLink(link, scope ? EDGE_QUIET_ALPHA : EDGE_REST_ALPHA, false);
			}
			for (const link of litLinks) strokeLink(link, EDGE_LIT_ALPHA, true);
			context.setLineDash([]);

			for (const node of simNodes) {
				const inScope = scope?.nodes.has(node.id) ?? true;
				context.globalAlpha = inScope ? 1 : dimNode;
				context.beginPath();
				context.arc(
					node.x ?? 0,
					node.y ?? 0,
					screenRadiusOf(node, view.k) / view.k,
					0,
					Math.PI * 2
				);
				context.fillStyle = colours.kinds[node.kind] ?? colours.muted;
				context.fill();
				// A hairline in the map's own backdrop: where the layout packs a
				// hub's neighbours together, two dots that touch still read as two.
				const isLit = node.id === lit;
				context.lineWidth = (isLit ? 2.5 : 1.25) / view.k;
				context.strokeStyle = isLit ? colours.ring : colours.surface;
				context.stroke();
			}

			context.restore();
			drawNames(scope);
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

			// Both the push and the length of a link grow with how many
			// relationships the records on it have. A record everything points
			// at otherwise pulls its neighbours into a disc the width of one
			// link, which is the state a map is unreadable in; given room in
			// proportion to what it holds, the same record opens into a ring.
			// The caps keep a very large hub from throwing the rest of the map
			// off the canvas.
			simulation = lib
				.forceSimulation(simNodes)
				.force(
					'link',
					lib
						.forceLink<SimNode, SimLink>(simLinks)
						.distance((link) => {
							const crowd = Math.max(link.source.degree, link.target.degree);
							return (
								32 + radiusOf(link.source) + radiusOf(link.target) + Math.min(crowd, 220) * 1.1
							);
						})
						.strength(0.55)
				)
				.force(
					'charge',
					lib
						.forceManyBody<SimNode>()
						.strength((node) => -100 - Math.min(node.degree, 120) * 5)
						.distanceMax(500)
				)
				.force('collide', lib.forceCollide<SimNode>((node) => radiusOf(node) + 8).strength(0.9))
				.force('x', lib.forceX(0).strength(0.05))
				.force('y', lib.forceY(0).strength(0.05))
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
	class={cn('bg-card relative min-h-64 w-full overflow-hidden rounded-lg border', className)}
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
