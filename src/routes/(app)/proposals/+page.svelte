<script lang="ts">
	import { page } from '$app/state';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as DataTable from '$lib/components/data-table/index.js';
	import DeleteRecord from '$lib/components/delete-record.svelte';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { recordTerms } from '$lib/crm/records';
	import { createListTable } from '$lib/lists/table';
	import { QUERY } from '$lib/queries';

	let { data } = $props();

	// The kind's words, as the org's industry says them: "quote" in a roofer,
	// "treatment plan" in a dental practice.
	const terms = $derived(recordTerms(page.data.terms, 'proposal'));

	let removing = $state<{ id: string; name: string } | null>(null);

	// The columns, the search and the filters are the list's fields as the
	// org's industry has them (docs/lists.md); the page only composes the parts.
	// The owner / presenter columns are labelled from the vocabulary, not a
	// constant, so the industry's own words ("Project manager", "Estimator")
	// show up here too.
	const table = createListTable(
		() => data.list,
		() => page.data.terms,
		() => page.data.vocabulary,
		() => (data.canDelete ? { canDelete: true, onDelete: (row) => (removing = row) } : undefined)
	);
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<!-- The builder page, not the generic modal: see +page.server.ts. -->
				<Button href="/proposals/new">
					<PlusIcon />
					Add {terms.noun}
				</Button>
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

<DeleteRecord type="proposal" form={data.deleteForm} query={QUERY.proposals} bind:removing />
