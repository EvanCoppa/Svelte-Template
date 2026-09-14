<script lang="ts">
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import WaypointsIcon from '@lucide/svelte/icons/waypoints';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { AssistantToolUIPart } from '$lib/ai/types';
	import * as RelationshipGraph from '$lib/components/relationship-graph/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { swatchAt, type GraphEdge, type GraphNode, type Swatch } from '$lib/crm/graph';
	import { RECORD_KIND_META, recordHref, recordTerms } from '$lib/crm/records';
	import { term } from '$lib/features/vocabulary';
	import Artifact from './assistant-artifact.svelte';

	/**
	 * The neighbourhood `exploreGraph` walked, drawn rather than narrated —
	 * the same force-directed map the graph page draws, opened on the record
	 * the walk started from so its own connections are lit and the rest of
	 * the walk stands quietly around them. A node is a door when this session
	 * may open its kind (`terms` carries the feature exactly then), and a
	 * member is a name with no page, as on every screen. The legend beneath
	 * names each kind in the industry's words.
	 */
	type Output = Extract<
		AssistantToolUIPart,
		{ type: 'tool-exploreGraph'; state: 'output-available' }
	>['output'];

	let {
		output,
		focus
	}: {
		output: Output;
		/** The node id the walk started from — `<kind>:<id>`. */
		focus: string;
	} = $props();

	/** What a kind is called here, or null when this session may not open it. */
	function labelFor(kind: GraphNode['kind']): string | null {
		if (kind === 'member') return term(page.data.vocabulary, 'graph_member');
		const feature = RECORD_KIND_META[kind].feature;
		return page.data.terms?.[feature] ? recordTerms(page.data.terms, kind).name : null;
	}

	const nodes = $derived<GraphNode[]>(
		output.nodes.map((node) => ({
			id: node.id,
			kind: node.kind,
			name: node.name,
			href:
				node.kind !== 'member' && labelFor(node.kind) ? recordHref(node.kind, node.recordId) : null
		}))
	);
	const edges = $derived<GraphEdge[]>(
		output.edges.map((edge) => ({
			id: edge.id,
			source: edge.from,
			target: edge.to,
			typeId: edge.typeId,
			label: edge.label,
			inverseLabel: edge.inverseLabel,
			ended: edge.ended
		}))
	);

	/** The kinds on this map in the order met, each with its swatch and its count. */
	const kinds = $derived.by(() => {
		const counts = new SvelteMap<GraphNode['kind'], number>();
		for (const node of nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
		return [...counts].map(([kind, count], index) => ({
			kind,
			count,
			label: labelFor(kind) ?? kind,
			swatch: swatchAt(index)
		}));
	});
	const swatches = $derived<Record<string, Swatch>>(
		Object.fromEntries(kinds.map((entry) => [entry.kind, entry.swatch]))
	);

	const start = $derived(nodes.find((node) => node.id === focus));
	const meta = $derived(
		`${nodes.length} ${nodes.length === 1 ? 'record' : 'records'} · ${edges.length} ${
			edges.length === 1 ? 'relationship' : 'relationships'
		}${output.truncated ? ' · trimmed' : ''}`
	);

	/** A node is the record: open it. A member has no page, so a click on one is a no-op. */
	function open(node: GraphNode) {
		if (node.href) goto(node.href);
	}
</script>

<Artifact icon={WaypointsIcon} title={start ? `Around ${start.name}` : 'Connections'} {meta}>
	{#snippet actions()}
		{#if start?.href}
			<Button variant="ghost" size="xs" href={start.href}>
				Open
				<ArrowUpRightIcon />
			</Button>
		{/if}
	{/snippet}

	<RelationshipGraph.Root
		{nodes}
		{edges}
		{swatches}
		{focus}
		onopen={open}
		class="h-72 rounded-lg"
		aria-label={start ? `Relationships around ${start.name}` : 'Relationships'}
	/>
	<ul class="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
		{#each kinds as entry (entry.kind)}
			<li class="flex items-center gap-1.5">
				<span
					aria-hidden="true"
					class="size-2 shrink-0 rounded-full"
					style:background-color={`var(--${entry.swatch})`}
				></span>
				{entry.label}
				<span class="tabular-nums">{entry.count}</span>
			</li>
		{/each}
	</ul>
</Artifact>
