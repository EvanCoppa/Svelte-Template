<script lang="ts">
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { recordTerms } from '$lib/crm/records';
	import { createListTable } from '$lib/lists/table';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'contact'));

	// The columns, the search and the filters are the list's fields as the
	// org's industry has them (docs/lists.md); the page only composes the parts.
	const table = createListTable(
		() => data.list,
		() => page.data.terms
	);
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="contact" form={data.createForm} />
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
