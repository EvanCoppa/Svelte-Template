<script lang="ts">
	import { createTable } from '@tanstack/svelte-table';
	import MapIcon from '@lucide/svelte/icons/map';
	import TableIcon from '@lucide/svelte/icons/table';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as MapView from '$lib/components/map-view/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { featureTerms } from '$lib/features/terms';
	import { viewColumns } from '$lib/views/table';

	let { data } = $props();

	// What one row is called, as the org's industry says it — the view's own
	// feature words it ("3 vendors"), not the source's.
	const terms = $derived(featureTerms(page.data.terms, data.view.id));

	// The definition is fixed for the page's lifetime: a navigation to another
	// view is another page.
	const columns = viewColumns(data.view, page.data.terms);
	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.rows;
		},
		columns
	});

	let layout = $state(data.view.defaultLayout);
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		<PageHeader.Actions>
			{#if data.view.layouts.length > 1}
				<Tabs.Root bind:value={layout}>
					<Tabs.List aria-label="Layout">
						<Tabs.Trigger value="table"><TableIcon /> Table</Tabs.Trigger>
						<Tabs.Trigger value="map"><MapIcon /> Map</Tabs.Trigger>
					</Tabs.List>
				</Tabs.Root>
			{/if}
			{#if data.canCreate}
				<CreateRecord type={data.view.source} form={data.createForm} />
			{/if}
		</PageHeader.Actions>
	</PageHeader.Root>

	{#if layout === 'map'}
		{#if data.map === null}
			<Empty.Root class="border">
				<Empty.Header>
					<Empty.Title>The map is not configured</Empty.Title>
					<Empty.Description>
						Set PUBLIC_MAP_STYLE_URL to a MapLibre style and the {terms.plural} with an address will be
						drawn here.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else if data.pins.length === 0}
			<Empty.Root class="border">
				<Empty.Header>
					<Empty.Title>No addresses to map yet</Empty.Title>
					<Empty.Description>
						Add an address to a {terms.noun} and it will appear here.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<MapView.Root
				pins={data.pins}
				styleUrl={data.map.styleUrl}
				darkStyleUrl={data.map.darkStyleUrl}
				class="h-[65vh]"
			/>
		{/if}
	{:else}
		<DataTable.Root {table}>
			<DataTable.Content emptyMessage={`No ${terms.plural} yet.`} />
			<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
		</DataTable.Root>
	{/if}
</div>
