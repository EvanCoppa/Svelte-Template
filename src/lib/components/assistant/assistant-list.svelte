<script lang="ts">
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import TableIcon from '@lucide/svelte/icons/table';
	import { page } from '$app/state';
	import type { AssistantToolUIPart } from '$lib/ai/types';
	import * as DataTable from '$lib/components/data-table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { RECORD_KIND_META, recordListHref, recordTerms } from '$lib/crm/records';
	import { createListTable } from '$lib/lists/table';
	import Artifact from './assistant-artifact.svelte';

	/**
	 * A list the assistant composed, drawn as the list page draws one: the
	 * same `createListTable()` over the same spec and rows, with the one
	 * toolbar every list has — search over the searchable fields, a filter per
	 * filterable one, the column switcher — and a fixed page size, because a
	 * card in a thread has no viewport to fill (the `pageSize` rule). Nothing
	 * here knows a column: the server described the rows, and the industry's
	 * words for the kind come from `terms` as they do on the page.
	 *
	 * "Open list" leads to the kind's own page. The filter the assistant used
	 * is not carried there yet — that is the per-org saved view, the next
	 * phase docs/views.md names — so the card is where the filtered list
	 * lives for now.
	 */
	type Output = Extract<
		AssistantToolUIPart,
		{ type: 'tool-listRecords'; state: 'output-available' }
	>['output'];

	let { output }: { output: Output } = $props();

	/** How many rows the card shows a page — a thread is not a list page. */
	const PAGE_SIZE = 8;

	const feature = $derived(RECORD_KIND_META[output.kind].feature);
	/** The industry's words when the kind is on screen; the kind's own name otherwise. */
	const terms = $derived(
		page.data.terms?.[feature]
			? recordTerms(page.data.terms, output.kind)
			: { name: output.kind, noun: output.kind, plural: `${output.kind}s` }
	);
	const href = $derived(page.data.terms?.[feature] ? recordListHref(output.kind) : null);

	const table = createListTable(
		() => ({ spec: output.spec, rows: output.rows }),
		() => page.data.terms,
		() => page.data.vocabulary
	);

	const meta = $derived(
		output.rows.length < output.total
			? `${output.rows.length} of ${output.total}`
			: `${output.total} ${output.total === 1 ? terms.noun : terms.plural}`
	);
</script>

<Artifact icon={TableIcon} title={terms.name} {meta}>
	{#snippet actions()}
		{#if href}
			<Button variant="ghost" size="xs" {href}>
				Open list
				<ArrowUpRightIcon />
			</Button>
		{/if}
	{/snippet}

	<DataTable.Root {table} pageSize={PAGE_SIZE} class="gap-2">
		<DataTable.Toolbar>
			<DataTable.Search placeholder="Search {terms.plural}…" ariaLabel="Search {terms.plural}" />
			<DataTable.Filters />
			<DataTable.ViewOptions class="ms-auto" />
		</DataTable.Toolbar>
		<DataTable.Content emptyMessage="No {terms.plural} match." />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
</Artifact>
