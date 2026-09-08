<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import * as DataTable from '$lib/components/data-table/index.js';
	import { recordHref } from '$lib/crm/records';
	import { PARTY_STATUS_TONE } from '$lib/crm/tones';
	import type { ContactWithCompany } from '$lib/server/crm/contacts';

	let { data } = $props();

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
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Contacts</h1>
		<p class="text-muted-foreground">
			Everyone you know — the people at your accounts, and the ones who are the account.
		</p>
	</div>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="contact" />
	</DataTable.Root>
</div>
