import Legend from './relationship-graph-legend.svelte';
import Root from './relationship-graph.svelte';

/**
 * The relationship graph a page draws its records on:
 *
 *   <RelationshipGraph.Root nodes={shown.nodes} edges={shown.edges} {swatches} onopen={…} />
 *   <RelationshipGraph.Legend title={…} items={…} ontoggle={…} />
 *
 * The page owns the map (`GraphData`, described server-side by
 * `describeGraph()` in `$lib/server/crm/graph`), which of it is shown
 * (`filterGraph()` in `$lib/crm/graph`) and where a node leads; the root
 * lays the nodes out and draws them, the legend lists what can be shown.
 *
 * `namesAt()`, `placeLabels()` and `truncate()` are the decluttering pass —
 * which names the map has room for and where each one sits — and are the
 * pure half, tested on their own.
 */
export {
	namesAt,
	placeLabels,
	truncate,
	type Anchor,
	type Box,
	type LabelRequest,
	type Placement
} from './labels.js';

export {
	Root,
	Legend,
	//
	Root as RelationshipGraph,
	Legend as RelationshipGraphLegend
};
