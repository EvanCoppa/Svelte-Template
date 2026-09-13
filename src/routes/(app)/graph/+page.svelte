<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import * as RelationshipGraph from '$lib/components/relationship-graph/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import {
		filterGraph,
		swatchAt,
		type GraphNode,
		type GraphNodeKind,
		type Swatch
	} from '$lib/crm/graph';

	let { data } = $props();

	// What the reader has switched off, rather than what is on: a map that
	// arrives with a new kind on it (another org, a first relationship of that
	// kind) shows it without the page having to notice.
	const hiddenKinds = new SvelteSet<GraphNodeKind>();
	const hiddenTypes = new SvelteSet<string>();
	let showEnded = $state(true);

	/** Each kind's colour, in legend order — the same swatch on the map and beside the checkbox. */
	const swatches = $derived<Record<string, Swatch>>(
		Object.fromEntries(data.graph.kinds.map((kind, index) => [kind.kind, swatchAt(index)]))
	);

	const shown = $derived(
		filterGraph(data.graph, {
			kinds: new Set(data.graph.kinds.flatMap((k) => (hiddenKinds.has(k.kind) ? [] : [k.kind]))),
			types: new Set(data.graph.types.flatMap((t) => (hiddenTypes.has(t.id) ? [] : [t.id]))),
			ended: showEnded
		})
	);

	const kindItems = $derived(
		data.graph.kinds.map((kind) => ({
			id: kind.kind,
			label: kind.label,
			count: kind.count,
			checked: !hiddenKinds.has(kind.kind),
			swatch: swatches[kind.kind]
		}))
	);
	const typeItems = $derived(
		data.graph.types.map((type) => ({
			id: type.id,
			label: type.label,
			count: type.count,
			checked: !hiddenTypes.has(type.id)
		}))
	);

	function toggleKind(id: string) {
		const kind = data.graph.kinds.find((k) => k.kind === id)?.kind;
		if (!kind) return;
		if (hiddenKinds.has(kind)) hiddenKinds.delete(kind);
		else hiddenKinds.add(kind);
	}

	function toggleType(id: string) {
		if (hiddenTypes.has(id)) hiddenTypes.delete(id);
		else hiddenTypes.add(id);
	}

	/** A node is the record: open it. A member has no page, so a click on one is a no-op. */
	function open(node: GraphNode) {
		if (node.href) goto(node.href);
	}
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.graph.nodes.length > 0}
			<PageHeader.Actions>
				<div class="flex items-center gap-2">
					<Switch id="show-ended" bind:checked={showEnded} />
					<Label for="show-ended" class="font-normal">Show ended</Label>
				</div>
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	{#if data.graph.nodes.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Title>Nothing to draw yet</Empty.Title>
				<Empty.Description>
					Every record appears here as soon as there is one, joined to the records it relates to.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
			<RelationshipGraph.Root
				nodes={shown.nodes}
				edges={shown.edges}
				{swatches}
				focus={data.focus}
				onopen={open}
				class="h-[70vh]"
				aria-label="Relationship graph"
			/>
			<Card.Root class="h-fit">
				<Card.Header>
					<Card.Title>On the map</Card.Title>
					<Card.Description>
						{shown.nodes.length} of {data.graph.nodes.length} records, {shown.edges.length} of
						{data.graph.edges.length} relationships.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-5">
					<RelationshipGraph.Legend title="Records" items={kindItems} ontoggle={toggleKind} />
					{#if typeItems.length > 0}
						<RelationshipGraph.Legend
							title="Relationships"
							items={typeItems}
							ontoggle={toggleType}
						/>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	{/if}
</div>
