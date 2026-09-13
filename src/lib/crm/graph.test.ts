import { describe, expect, it } from 'vitest';
import {
	edgeLabelFrom,
	filterGraph,
	graphNodeId,
	neighbourhoodOf,
	swatchAt,
	type GraphEdge,
	type GraphNode
} from './graph';

/**
 * The pure half of the graph page: the folds it runs on the map the server
 * described — which kinds and types are shown, what lights up under the
 * pointer, and the words on an edge read from either end.
 */

const wayne: GraphNode = {
	id: 'company:1',
	kind: 'company',
	name: 'Wayne Enterprises',
	href: '/companies/1'
};
const truck: GraphNode = { id: 'asset:2', kind: 'asset', name: 'Box truck', href: '/assets/2' };
const dev: GraphNode = { id: 'member:3', kind: 'member', name: 'Dev User', href: null };
const lucius: GraphNode = {
	id: 'contact:4',
	kind: 'contact',
	name: 'Lucius Fox',
	href: '/contacts/4'
};

const owns: GraphEdge = {
	id: 'e1',
	source: wayne.id,
	target: truck.id,
	typeId: 'owns',
	label: 'owns',
	inverseLabel: 'owned by',
	ended: false
};
const holds: GraphEdge = {
	id: 'e2',
	source: truck.id,
	target: dev.id,
	typeId: 'assigned_to',
	label: 'assigned to',
	inverseLabel: 'holds',
	ended: false
};
const workedAt: GraphEdge = {
	id: 'e3',
	source: lucius.id,
	target: wayne.id,
	typeId: 'works_at',
	label: 'works at',
	inverseLabel: 'employs',
	ended: true
};

const data = { nodes: [wayne, truck, dev, lucius], edges: [owns, holds, workedAt] };
const everything = {
	kinds: new Set(['company', 'asset', 'member', 'contact'] as const),
	types: new Set(['owns', 'assigned_to', 'works_at']),
	ended: true
};

describe('graphNodeId', () => {
	it('spells the entity link as one key', () => {
		expect(graphNodeId('contact', 'abc')).toBe('contact:abc');
	});
});

describe('swatchAt', () => {
	it('hands out the chart tokens in order and wraps around', () => {
		expect(swatchAt(0)).toBe('chart-1');
		expect(swatchAt(7)).toBe('chart-8');
		expect(swatchAt(8)).toBe('chart-1');
	});
});

describe('filterGraph', () => {
	it('keeps everything when everything is shown', () => {
		expect(filterGraph(data, everything)).toEqual(data);
	});

	it('drops a kind and every edge touching it, keeping the nodes on the other end', () => {
		const shown = filterGraph(data, {
			...everything,
			kinds: new Set(['company', 'asset', 'contact'] as const)
		});
		expect(shown.nodes).toEqual([wayne, truck, lucius]);
		expect(shown.edges).toEqual([owns, workedAt]);
	});

	it('drops a type without dropping the kinds its edges joined', () => {
		const shown = filterGraph(data, { ...everything, types: new Set(['owns']) });
		expect(shown.nodes).toEqual(data.nodes);
		expect(shown.edges).toEqual([owns]);
	});

	it('hides ended relationships when asked', () => {
		const shown = filterGraph(data, { ...everything, ended: false });
		expect(shown.edges).toEqual([owns, holds]);
		expect(shown.nodes).toContain(lucius);
	});
});

describe('neighbourhoodOf', () => {
	it('names the node, the nodes one step away and the edges between', () => {
		expect(neighbourhoodOf(truck.id, data.edges)).toEqual({
			nodes: new Set([truck.id, wayne.id, dev.id]),
			edges: new Set([owns.id, holds.id])
		});
	});

	it('is just the node when nothing joins it', () => {
		expect(neighbourhoodOf('nobody', data.edges)).toEqual({
			nodes: new Set(['nobody']),
			edges: new Set()
		});
	});
});

describe('edgeLabelFrom', () => {
	it('reads the forward label from the source and the inverse from the target', () => {
		expect(edgeLabelFrom(owns, wayne.id)).toBe('owns');
		expect(edgeLabelFrom(owns, truck.id)).toBe('owned by');
		expect(edgeLabelFrom(owns, dev.id)).toBeNull();
	});
});
