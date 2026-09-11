<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import type { AdminTier } from '$lib/server/admin/catalog';

	let { data } = $props();

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, AdminTier>();
	const columns = columnHelper.columns([
		columnHelper.accessor('id', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'ID' }),
			cell: ({ getValue }) => getValue()
		}),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' })
		}),
		columnHelper.accessor('organizations', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Organizations' })
		}),
		columnHelper.accessor('features', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Features' })
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.tiers;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="tier" />
	</DataTable.Root>
</div>
