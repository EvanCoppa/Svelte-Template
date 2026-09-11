<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { recordHref, recordTerms } from '$lib/crm/records';
	import { ASSET_STATUS_TONE } from '$lib/crm/tones';
	import type { Asset } from '$lib/server/crm/assets';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'asset'));

	// An asset carries its own currency; format in it rather than assuming USD.
	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
	const mediumDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, Asset>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), recordHref('asset', row.original.id))
		}),
		columnHelper.accessor('asset_type', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Type' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('identifier', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Identifier' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('acquired_on', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Acquired' }),
			cell: ({ getValue }) => {
				const value = getValue();
				return value ? mediumDate.format(new Date(`${value}T00:00:00`)) : '—';
			}
		}),
		columnHelper.accessor('purchase_price', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Purchase price' }),
			cell: ({ getValue, row }) => {
				const value = getValue();
				return value === null ? '—' : money(value, row.original.currency);
			}
		}),
		columnHelper.accessor('status', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Status' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), ASSET_STATUS_TONE[getValue()])
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.assets;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="asset" form={data.createForm} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
</div>
