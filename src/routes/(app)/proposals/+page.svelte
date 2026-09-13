<script lang="ts">
	import { page } from '$app/state';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PresentationIcon from '@lucide/svelte/icons/presentation';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { recordTerms } from '$lib/crm/records';
	import { createListTable } from '$lib/lists/table';

	let { data } = $props();

	// The kind's words, as the org's industry says them: "quote" in a roofer,
	// "treatment plan" in a dental practice.
	const terms = $derived(recordTerms(page.data.terms, 'proposal'));

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
				<!-- The org's one deck — how every {terms.noun} is presented. -->
				<Button href="/proposals/slides" variant="outline">
					<PresentationIcon />
					Slides
				</Button>
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
