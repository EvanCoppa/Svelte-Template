<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import type { BadgeTone } from '$lib/components/ui/badge/index.js';
	import type { ContactWithCompany } from '$lib/server/crm/contacts';

	let { data } = $props();

	const statusTone = {
		lead: 'info',
		prospect: 'violet',
		active: 'success',
		inactive: 'neutral'
	} satisfies Record<ContactWithCompany['status'], BadgeTone>;

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, ContactWithCompany>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' })
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
			cell: ({ getValue }) => DataTable.statusCell(getValue(), statusTone[getValue()])
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
		<PageHeader.Title>Contacts</PageHeader.Title>
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="contact" form={data.createForm} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="contact" />
	</DataTable.Root>
</div>
