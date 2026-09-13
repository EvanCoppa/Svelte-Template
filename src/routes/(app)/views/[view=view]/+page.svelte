<script lang="ts">
	import { createTable } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import { SegmentedControl } from '$lib/components/enhanced/segmented-control/index.js';
	import * as MapView from '$lib/components/map-view/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { featureTerms } from '$lib/features/terms';
	import { capitalize } from '$lib/utils.js';
	import { VIEW_LAYOUTS, type ViewLayout } from '$lib/views/types';
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

	let layout: ViewLayout = $state(data.view.defaultLayout);

	const layoutOptions = $derived(
		VIEW_LAYOUTS.filter((l) => data.view.layouts.includes(l)).map((value) => ({
			value,
			label: capitalize(value)
		}))
	);
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		<PageHeader.Actions>
			{#if data.view.layouts.length > 1}
				<SegmentedControl
					label="Layout"
					options={layoutOptions}
					value={layout}
					onValueChange={(value) => {
						if (value === 'table' || value === 'map') layout = value;
					}}
				/>
			{/if}
			{#if data.canCreate}
				<CreateRecord type={data.view.source} form={data.createForm} />
			{/if}
		</PageHeader.Actions>
	</PageHeader.Root>

	{#if layout === 'map'}
		{#if data.pins.length === 0}
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
				aria-label={`${terms.plural} on a map`}
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
