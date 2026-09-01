<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import * as DataTable from '$lib/components/data-table/index.js';
	import type { BadgeTone } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { DealStage, DealWithClient } from '$lib/server/crm/deals';

	let { data } = $props();

	const tone = {
		lead: 'info',
		qualified: 'cyan',
		proposal: 'violet',
		negotiation: 'warning',
		won: 'success',
		lost: 'error'
	} satisfies Record<DealStage, BadgeTone>;

	const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, DealWithClient>();
	const columns = columnHelper.columns([
		columnHelper.accessor('title', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Deal' })
		}),
		columnHelper.accessor((row) => row.clients.name, {
			id: 'client',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Client' })
		}),
		columnHelper.accessor('stage', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Stage' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), tone[getValue()])
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
		columns,
		initialState: { pagination: { pageIndex: 0, pageSize: 10 } }
	});
</script>

<svelte:head>
	<title>Deals</title>
</svelte:head>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Deals</h1>
		<p class="text-muted-foreground">Pipeline of opportunities, by stage and value.</p>
	</div>

	<Card.Root>
		<Card.Content>
			<DataTable.Root {table}>
				<DataTable.Content />
				<DataTable.Pagination />
			</DataTable.Root>
		</Card.Content>
	</Card.Root>
</div>
