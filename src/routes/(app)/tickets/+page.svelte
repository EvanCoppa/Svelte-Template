<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { recordHref } from '$lib/crm/records';
	import { TICKET_PRIORITY_TONE, TICKET_STATUS_TONE } from '$lib/crm/tones';
	import type { TicketWithParties } from '$lib/server/crm/tickets';

	let { data } = $props();

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, TicketWithParties>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('number', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: '#' })
		}),
		columnHelper.accessor('subject', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Subject' }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), recordHref('ticket', row.original.id))
		}),
		columnHelper.accessor((row) => row.companies?.name ?? row.contacts?.name ?? '—', {
			id: 'party',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'For' })
		}),
		columnHelper.accessor('status', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Status' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), TICKET_STATUS_TONE[getValue()])
		}),
		columnHelper.accessor('priority', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Priority' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), TICKET_PRIORITY_TONE[getValue()])
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.tickets;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title>Tickets</PageHeader.Title>
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="ticket" form={data.createForm} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="ticket" />
	</DataTable.Root>
</div>
