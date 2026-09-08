<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { recordHref, recordTerms } from '$lib/crm/records';
	import type { Billable } from '$lib/server/crm/billables';

	let { data } = $props();

	// "Procedures" in a practice, "Services" on a roof.
	const terms = $derived(recordTerms(page.data.terms, 'billable'));

	// A billable carries its own currency; format in it rather than assuming USD.
	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, Billable>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), recordHref('billable', row.original.id))
		}),
		columnHelper.accessor('code', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Code' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('unit_price', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Unit price' }),
			cell: ({ getValue, row }) => {
				const price = money(getValue(), row.original.currency);
				return row.original.unit ? `${price} / ${row.original.unit}` : price;
			}
		}),
		// The chips the builder offers; blank means the units are typed in.
		columnHelper.accessor((row) => row.unit_choices?.join(', ') ?? '—', {
			id: 'unit_choices',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Units' }),
			enableSorting: false
		}),
		columnHelper.accessor('is_featured', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Featured' }),
			cell: ({ getValue }) => (getValue() ? 'Yes' : '—')
		}),
		columnHelper.accessor((row) => (row.is_active ? 'active' : 'inactive'), {
			id: 'status',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Status' }),
			cell: ({ getValue }) =>
				DataTable.statusCell(getValue(), getValue() === 'active' ? 'success' : 'neutral')
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.billables;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="billable" form={data.createForm} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
</div>
