<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { recordHref, recordTerms } from '$lib/crm/records';
	import { PROPERTY_STATUS_TONE } from '$lib/crm/tones';
	import type { Property } from '$lib/server/crm/properties';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'property'));

	// Buildings and units are one table, so a unit says which building it is
	// in rather than the list pretending to be a tree — the tree is on the
	// building's own record page, where its units are related records.
	const buildingNames = $derived(new Map(data.properties.map((row) => [row.id, row.name])));

	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, Property>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), recordHref('property', row.original.id))
		}),
		columnHelper.accessor('parent_id', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Part of' }),
			cell: ({ getValue }) => {
				const parent = getValue();
				// A blank means this row IS the building — a duplex, or a
				// single-family that is its own unit.
				return parent ? (buildingNames.get(parent) ?? '—') : '—';
			}
		}),
		columnHelper.accessor('property_type', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Type' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('bedrooms', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Beds' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('bathrooms', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Baths' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('market_rent', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Market rent' }),
			cell: ({ getValue, row }) => {
				const value = getValue();
				return value === null ? '—' : money(value, row.original.currency);
			}
		}),
		columnHelper.accessor('status', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Status' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), PROPERTY_STATUS_TONE[getValue()])
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.properties;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="property" form={data.createForm} pickers={data.createPickers} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
</div>
