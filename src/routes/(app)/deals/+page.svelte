<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import * as DataTable from '$lib/components/data-table/index.js';
	import type { BadgeTone } from '$lib/components/ui/badge/index.js';
	import type { DealWithParties } from '$lib/server/crm/deals';

	let { data } = $props();

	// Stages are org-defined rows now, so their names are not a union to key a
	// palette off. The outcome is: every board has open, won and lost columns
	// whatever an org calls them.
	const tone = {
		open: 'info',
		won: 'success',
		lost: 'error'
	} satisfies Record<DealWithParties['pipeline_stages']['outcome'], BadgeTone>;

	const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, DealWithParties>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('title', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Deal' })
		}),
		// A deal names a company, a person, or neither — an opportunity nobody is
		// attached to yet is a legitimate row.
		columnHelper.accessor((row) => row.companies?.name ?? row.contacts?.name ?? '—', {
			id: 'party',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'With' })
		}),
		columnHelper.accessor((row) => row.pipeline_stages.name, {
			id: 'stage',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Stage' }),
			cell: ({ row, getValue }) =>
				DataTable.statusCell(getValue(), tone[row.original.pipeline_stages.outcome])
		}),
		columnHelper.accessor('amount', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Amount' }),
			cell: ({ getValue }) => {
				const amount = getValue();
				return amount === null ? '—' : usd.format(amount);
			}
		}),
		columnHelper.accessor('expected_close_date', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Expected close' }),
			cell: ({ getValue }) => {
				const value = getValue();
				return value ? date.format(new Date(value)) : '—';
			}
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.deals;
		},
		columns
	});
</script>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Deals</h1>
		<p class="text-muted-foreground">Pipeline of opportunities, by stage and value.</p>
	</div>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="deal" />
	</DataTable.Root>
</div>
