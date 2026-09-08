<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import * as DataTable from '$lib/components/data-table/index.js';
	import { recordHref } from '$lib/crm/records';
	import { COMPANY_RELATIONSHIP_TONE, PARTY_STATUS_TONE } from '$lib/crm/tones';
	import type { Company } from '$lib/server/crm/companies';

	let { data } = $props();

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, Company>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), recordHref('company', row.original.id))
		}),
		columnHelper.accessor('relationship', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Relationship' }),
			cell: ({ getValue }) =>
				DataTable.statusCell(getValue(), COMPANY_RELATIONSHIP_TONE[getValue()])
		}),
		columnHelper.accessor('email', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Email' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('website', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Website' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('status', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Status' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), PARTY_STATUS_TONE[getValue()])
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.companies;
		},
		columns
	});
</script>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Companies</h1>
		<p class="text-muted-foreground">
			The organizations you work with — customers, suppliers and partners.
		</p>
	</div>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="company" nounPlural="companies" />
	</DataTable.Root>
</div>
