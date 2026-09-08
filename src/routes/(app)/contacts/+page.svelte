<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { recordHref, recordTerms } from '$lib/crm/records';
	import { PARTY_STATUS_TONE } from '$lib/crm/tones';
	import type { ContactWithCompany } from '$lib/server/crm/contacts';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'contact'));

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, ContactWithCompany>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), recordHref('contact', row.original.id))
		}),
		// Blank, not an error: a patient or a homeowner is the customer
		// themselves and belongs to no company.
		columnHelper.accessor((row) => row.companies?.name ?? '—', {
			id: 'company',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Company' })
		}),
		columnHelper.accessor('title', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Title' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('email', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Email' }),
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
			return data.contacts;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="contact" form={data.createForm} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
</div>
