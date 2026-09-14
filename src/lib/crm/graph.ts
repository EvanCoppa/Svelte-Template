import type { Enums } from '$lib/database.types';
import type { RecordKind } from './records';

/**
 * The relationship graph as a page draws it — the client-safe half of
 * `$lib/server/crm/graph`.
 *
 * A node is one record that stands in at least one relationship: a kind of
 * record (`RecordKind`, the kinds with a page) or a member (someone who
 * works here, keyed by their membership — a kind with a name and no page,
 * exactly as the Relationships card shows one). An edge is one
 * `relationships` row, stored once and read from the `from` side: its label
 * is the type's forward label, the inverse is carried so a screen can read
 * it from either end without reconstructing one.
 *
 * Every word here is the industry's. A kind's label comes from its
 * feature's terms ("Patients", "Merchants") and the member kind's from the
 * `graph_member` term; an edge's from its relationship type. Nothing in
 * this file names anything — it holds the shapes and the pure folds the
 * page runs on them (which kinds and types are shown, who is next to
 * whom), tested on their own.
 */

/** A kind of node: a kind of record with a page, or a member of the org. */
export type GraphNodeKind = RecordKind | 'member';

export type GraphNode = {
	/** `<kind>:<entity id>` — the entity link, spelled as one key. */
	id: string;
	kind: GraphNodeKind;
	name: string;
	/** The record page, or null for a member (the roster is where people are read). */
	href: string | null;
};

export type GraphEdge = {
	/**
	 * The `relationships` row id, or a synthetic id for an edge computed at
	 * read time from a column rather than a stored row (a proposal's
	 * presenter, responsible member or parent link — see `describeGraph()`).
	 */
	id: string;
	/** Node ids: the row's `from` and `to`. */
	source: string;
	target: string;
	/** The relationship type: the words on the edge, read from `source` ("owns") and from `target` ("owned by"). */
	typeId: string;
	label: string;
	inverseLabel: string;
	/** An ended relationship is history: drawn fainter, or not at all. */
	ended: boolean;
};

/** One kind of node on the map, named as the industry names it, with how many there are. */
export type GraphKind = {
	kind: GraphNodeKind;
	label: string;
	count: number;
};

/** One relationship type on the map, by its forward label, with how many edges it has. */
export type GraphEdgeType = {
	id: string;
	label: string;
	count: number;
};

/** What the graph page's load returns: the whole map, and the legend for it. */
export type GraphData = {
	nodes: GraphNode[];
	edges: GraphEdge[];
	kinds: GraphKind[];
	types: GraphEdgeType[];
};

/**
 * The node id for a record: the entity link as one key, the way the page
 * spells `?focus=`. Takes any entity type, because the server keys every
 * endpoint before it knows which ones become nodes.
 */
export function graphNodeId(kind: Enums<'crm_entity_type'>, entityId: string): string {
	return `${kind}:${entityId}`;
}

/**
 * The colour swatches the kinds are drawn in, as `app.css` token names
 * (`--chart-1` …), assigned in legend order. Eight hues; a ninth kind on
 * one map wraps around, which two alike colours far apart in the legend
 * read better than a ninth hue nobody can tell from the eighth.
 */
const SWATCHES = [
	'chart-1',
	'chart-2',
	'chart-3',
	'chart-4',
	'chart-5',
	'chart-6',
	'chart-7',
	'chart-8'
] as const;

export type Swatch = (typeof SWATCHES)[number];

/** The swatch for the kind at a legend position. */
export function swatchAt(index: number): Swatch {
	// SAFETY: the modulo keeps the index inside the tuple.
	return SWATCHES[index % SWATCHES.length] as Swatch;
}

export type GraphFilter = {
	/** The kinds shown; a node of any other kind, and every edge touching it, is off the map. */
	kinds: ReadonlySet<GraphNodeKind>;
	/** The relationship types shown. */
	types: ReadonlySet<string>;
	/** Whether ended relationships are drawn beside the open ones. */
	ended: boolean;
};

/**
 * The part of the map the filter keeps: the nodes of the kinds shown, and
 * the edges of the types shown whose both ends are still on the map. A node
 * whose every edge was filtered away stays — it is still a record of a kind
 * the reader asked to see — so switching a type off never makes a kind
 * vanish with it.
 */
export function filterGraph(
	data: Pick<GraphData, 'nodes' | 'edges'>,
	filter: GraphFilter
): Pick<GraphData, 'nodes' | 'edges'> {
	const nodes = data.nodes.filter((node) => filter.kinds.has(node.kind));
	const kept = new Set(nodes.map((node) => node.id));
	const edges = data.edges.filter(
		(edge) =>
			filter.types.has(edge.typeId) &&
			(filter.ended || !edge.ended) &&
			kept.has(edge.source) &&
			kept.has(edge.target)
	);
	return { nodes, edges };
}

/**
 * The nodes one step from a node, and the edges that take that step — what
 * lights up when the pointer rests on it. A node is its own neighbour, so
 * the highlighted set can be tested for membership in one place.
 */
export function neighbourhoodOf(nodeId: string, edges: readonly GraphEdge[]) {
	const nodes = new Set([nodeId]);
	const touched = new Set<string>();
	for (const edge of edges) {
		if (edge.source === nodeId) {
			nodes.add(edge.target);
			touched.add(edge.id);
		} else if (edge.target === nodeId) {
			nodes.add(edge.source);
			touched.add(edge.id);
		}
	}
	return { nodes, edges: touched };
}

/**
 * The map around ONE record: it, everything within `depth` hops of it, and
 * every edge among them — what a record's own page draws instead of the
 * whole org. The legend is recounted from what survived, keeping the labels
 * the server already resolved, so a neighbourhood reads in the industry's
 * words exactly as the whole map does.
 *
 * A record in no relationship yet comes back as the single dot it is, which
 * is the honest answer rather than an empty page. A node the map does not
 * hold comes back as nothing at all — the same rule `?focus=` follows.
 *
 * Breadth-first, so `depth` counts hops and not edges walked: at 1 the
 * reader sees who this record deals with, at 2 who those deal with in turn.
 */
export function egoGraph(data: GraphData, nodeId: string, depth: number): GraphData {
	const known = new Set(data.nodes.map((node) => node.id));
	if (!known.has(nodeId)) return { nodes: [], edges: [], kinds: [], types: [] };

	const reached = new Set([nodeId]);
	let frontier = [nodeId];
	for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
		const next: string[] = [];
		for (const edge of data.edges) {
			const from = frontier.includes(edge.source) ? edge.target : null;
			const to = frontier.includes(edge.target) ? edge.source : null;
			for (const other of [from, to]) {
				if (other === null || reached.has(other) || !known.has(other)) continue;
				reached.add(other);
				next.push(other);
			}
		}
		frontier = next;
	}

	const nodes = data.nodes.filter((node) => reached.has(node.id));
	// Every edge BETWEEN the records reached, not only the ones walked to get
	// here — the triangles are what makes a neighbourhood worth drawing.
	const edges = data.edges.filter((edge) => reached.has(edge.source) && reached.has(edge.target));
	return {
		nodes,
		edges,
		kinds: countKinds(data.kinds, nodes),
		types: countTypes(data.types, edges)
	};
}

/** The legend's kinds, in the order the whole map had them, recounted. */
function countKinds(kinds: readonly GraphKind[], nodes: readonly GraphNode[]): GraphKind[] {
	const counts = new Map<GraphNodeKind, number>();
	for (const node of nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
	return kinds.flatMap((kind) => {
		const count = counts.get(kind.kind);
		return count ? [{ ...kind, count }] : [];
	});
}

/** The legend's relationship types, in the order the whole map had them, recounted. */
function countTypes(types: readonly GraphEdgeType[], edges: readonly GraphEdge[]): GraphEdgeType[] {
	const counts = new Map<string, number>();
	for (const edge of edges) counts.set(edge.typeId, (counts.get(edge.typeId) ?? 0) + 1);
	return types.flatMap((type) => {
		const count = counts.get(type.id);
		return count ? [{ ...type, count }] : [];
	});
}

/**
 * The words on an edge as read from one of its nodes: "owns" from the
 * owner, "owned by" from the asset. Null when the node is not on the edge.
 */
export function edgeLabelFrom(
	edge: Pick<GraphEdge, 'source' | 'target' | 'label' | 'inverseLabel'>,
	nodeId: string
): string | null {
	if (edge.source === nodeId) return edge.label;
	if (edge.target === nodeId) return edge.inverseLabel;
	return null;
}
