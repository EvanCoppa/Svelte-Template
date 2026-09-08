<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { recommendedOption } from '$lib/crm/proposals';
	import { recordHref, recordTerms } from '$lib/crm/records';
	import { PROPOSAL_STATUS_TONE } from '$lib/crm/tones';
	import type { ProposalWithOptions } from '$lib/server/crm/proposals';
	import { capitalize } from '$lib/utils.js';

	let { data } = $props();

	// The kind's words, as the org's industry says them: "quote" in a roofer,
	// "treatment plan" in a dental practice.
	const terms = $derived(recordTerms(page.data.terms, 'proposal'));

	// Both are instants (`timestamptz`), so they read in the viewer's zone.
	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
	// An option carries its own currency; format in it rather than assuming USD.
	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, ProposalWithOptions>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('title', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: capitalize(terms.noun) }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), recordHref('proposal', row.original.id))
		}),
		columnHelper.accessor('status', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Status' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), PROPOSAL_STATUS_TONE[getValue()])
		}),
		columnHelper.accessor((row) => row.proposal_options.length, {
			id: 'options',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Options' })
		}),
		// The figure a client is steered to; a proposal with no recommended
		// option (or one not yet priced) shows nothing rather than a guess.
		columnHelper.accessor(
			(row) => recommendedOption(row.proposal_options)?.computed_total ?? null,
			{
				id: 'recommended',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Recommended' }),
				cell: ({ getValue, row }) => {
					const total = getValue();
					const option = recommendedOption(row.original.proposal_options);
					return total === null || option === null ? '—' : money(total, option.currency);
				}
			}
		),
		columnHelper.accessor('valid_until', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Valid until' }),
			cell: ({ getValue }) => {
				const value = getValue();
				return value ? date.format(new Date(value)) : '—';
			}
		}),
		columnHelper.accessor('created_at', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Created' }),
			cell: ({ getValue }) => date.format(new Date(getValue()))
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.proposals;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="proposal" form={data.createForm} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
</div>
