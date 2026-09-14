<script lang="ts">
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import DeleteRecord from '$lib/components/delete-record.svelte';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { recordTerms } from '$lib/crm/records';
	import { createListTable } from '$lib/lists/table';
	import { QUERY } from '$lib/queries';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'property'));

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
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="property" form={data.createForm} pickers={data.createPickers} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Toolbar>
			<DataTable.Search placeholder="Search {terms.plural}…" ariaLabel="Search {terms.plural}" />
			<DataTable.Filters />
			<DataTable.ViewOptions class="ms-auto" />
		</DataTable.Toolbar>
		<DataTable.Content emptyMessage="No {terms.plural} match." />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
</div>

<DeleteRecord type="property" form={data.deleteForm} query={QUERY.properties} bind:removing />
