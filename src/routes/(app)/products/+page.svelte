<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import * as DataTable from '$lib/components/data-table/index.js';
	import type { BadgeTone } from '$lib/components/ui/badge/index.js';
	import type { ProductWithCategory } from '$lib/server/crm/products';

	let { data } = $props();

	const kindTone = {
		good: 'cyan',
		service: 'violet'
	} satisfies Record<ProductWithCategory['kind'], BadgeTone>;

	const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, ProductWithCategory>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' })
		}),
		columnHelper.accessor('kind', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Kind' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), kindTone[getValue()])
		}),
		columnHelper.accessor((row) => row.product_categories?.name ?? '—', {
			id: 'category',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Category' })
		}),
		columnHelper.accessor('sku', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'SKU' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('unit_price', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Price' }),
			cell: ({ getValue, row }) => {
				const unit = row.original.unit;
				return unit ? `${usd.format(getValue())} / ${unit}` : usd.format(getValue());
			}
		}),
		// Only goods carry stock, so a service reads as a dash rather than a
		// misleading zero.
		columnHelper.accessor('quantity_on_hand', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'On hand' }),
			cell: ({ getValue, row }) => (row.original.track_inventory ? String(getValue() ?? 0) : '—')
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.products;
		},
		columns,
		initialState: { pagination: { pageIndex: 0, pageSize: 10 } }
	});
</script>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Products</h1>
		<p class="text-muted-foreground">Everything you sell — goods and services in one catalog.</p>
	</div>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="product" />
	</DataTable.Root>
</div>
