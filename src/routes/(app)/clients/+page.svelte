<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import * as DataTable from '$lib/components/data-table/index.js';
	import type { BadgeTone } from '$lib/components/ui/badge/index.js';
	import type { Client } from '$lib/server/crm/clients';

	let { data } = $props();

	const tone = {
		lead: 'info',
		prospect: 'violet',
		active: 'success',
		inactive: 'neutral'
	} satisfies Record<Client['status'], BadgeTone>;

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, Client>();
	const columns = columnHelper.columns([
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' })
		}),
		columnHelper.accessor('company', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Company' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('email', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Email' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('status', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Status' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), tone[getValue()])
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.clients;
		},
		columns,
		initialState: { pagination: { pageIndex: 0, pageSize: 10 } }
	});
</script>

<svelte:head>
	<title>Clients</title>
</svelte:head>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Clients</h1>
		<p class="text-muted-foreground">The companies and people you work with.</p>
	</div>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="client" />
	</DataTable.Root>
</div>
