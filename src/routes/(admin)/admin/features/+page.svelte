<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { iconFor } from '$lib/features/icons';
	import type { AdminFeature } from '$lib/server/admin/catalog';
	import FeatureIconCell from './feature-icon-cell.svelte';

	let { data } = $props();

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, AdminFeature>();
	const columns = columnHelper.columns([
		columnHelper.accessor('icon', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Icon' }),
			// The slug as the sidebar would draw it, so a row whose icon never
			// made it into the one-per-file map shows the placeholder here too.
			cell: ({ getValue }) =>
				renderComponent(FeatureIconCell, { icon: iconFor(getValue()), slug: getValue() })
		}),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Feature' })
		}),
		columnHelper.accessor('id', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'ID' })
		}),
		columnHelper.accessor('route', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Route' })
		}),
		columnHelper.accessor('category', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Category' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('sortOrder', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Order' })
		}),
		columnHelper.accessor('plans', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Plans' })
		}),
		columnHelper.accessor('industries', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Industries' })
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.features;
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
		<DataTable.Pagination noun="feature" />
	</DataTable.Root>
</div>
