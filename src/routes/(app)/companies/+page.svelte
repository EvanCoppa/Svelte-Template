<script lang="ts">
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import DeleteRecord from '$lib/components/delete-record.svelte';
	import { SegmentedControl } from '$lib/components/enhanced/segmented-control/index.js';
	import * as MapView from '$lib/components/map-view/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { recordTerms } from '$lib/crm/records';
	import { createListTable } from '$lib/lists/table';
	import { QUERY } from '$lib/queries';
	import { capitalize } from '$lib/utils.js';
	import { VIEW_LAYOUTS, type ViewLayout } from '$lib/views/types';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'company'));

	/** The row menu's Delete — the record page's own way in is `recordHref()`, so this needs no href of its own. */
	let removing = $state<{ id: string; name: string } | null>(null);

	// The columns, the search and the filters are the list's fields as the
	// org's industry has them (docs/lists.md); the page only composes the parts.
	const table = createListTable(
		() => data.list,
		() => page.data.terms,
		undefined,
		() => (data.canDelete ? { canDelete: true, onDelete: (row) => (removing = row) } : undefined)
	);

	// A company is a party, so this list can also draw as pins on a map — the
	// same table/map toggle a view offers (docs/views.md), on the one page
	// every industry's Companies/Merchants/Vendors nav entry already has.
	let layout: ViewLayout = $state('table');
	const layoutOptions = VIEW_LAYOUTS.map((value) => ({ value, label: capitalize(value) }));
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		<PageHeader.Actions>
			<SegmentedControl
				label="Layout"
				options={layoutOptions}
				value={layout}
				onValueChange={(value) => {
					if (value === 'table' || value === 'map') layout = value;
				}}
			/>
			{#if data.canCreate}
				<CreateRecord type="company" form={data.createForm} />
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
			<DataTable.Toolbar>
				<DataTable.Search placeholder="Search {terms.plural}…" ariaLabel="Search {terms.plural}" />
				<DataTable.Filters />
				<DataTable.ViewOptions class="ms-auto" />
			</DataTable.Toolbar>
			<DataTable.Content emptyMessage="No {terms.plural} match." />
			<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
		</DataTable.Root>
	{/if}
</div>

<DeleteRecord type="company" form={data.deleteForm} query={QUERY.companies} bind:removing />
