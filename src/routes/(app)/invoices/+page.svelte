<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { localDate } from '$lib/crm/ledger';
	import { recordHref, recordTerms } from '$lib/crm/records';
	import { INVOICE_STATUS_TONE, PAYMENT_STATE_TONE } from '$lib/crm/tones';
	import type { Enums } from '$lib/database.types';
	import type { InvoiceWithParties } from '$lib/server/crm/invoices';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'invoice'));

	// `due_date` is a calendar date; read as the day it names, in no zone.
	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
	// An invoice carries its own currency; format in it rather than assuming USD.
	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
	// The viewer's own date: "overdue" is a wall-clock word, so it is asked
	// here rather than stored (the invoicing migration's decision 4).
	const today = localDate(new Date());

	/** The account the bill is on: the company, or the person when there is none. */
	function customer(row: InvoiceWithParties): string {
		return row.companies?.name ?? row.contacts?.name ?? '—';
	}

	/**
	 * The money state as one word: the payment state for an issued invoice,
	 * "overdue" when it is past due and still owed, nothing for a draft or a
	 * void one — those have no money state to speak of.
	 */
	function paymentState(row: InvoiceWithParties): '' | 'overdue' | Enums<'payment_state'> {
		if (row.status !== 'issued') return '';
		const owed = (row.balance_due ?? 0) > 0;
		if (owed && row.due_date !== null && row.due_date < today) return 'overdue';
		return row.payment_status;
	}

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, InvoiceWithParties>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('number', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Number' }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), recordHref('invoice', row.original.id))
		}),
		columnHelper.accessor(customer, {
			id: 'customer',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Customer' })
		}),
		columnHelper.accessor('status', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Status' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), INVOICE_STATUS_TONE[getValue()])
		}),
		columnHelper.accessor(paymentState, {
			id: 'payment',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Payment' }),
			cell: ({ getValue }) => {
				const state = getValue();
				if (state === '') return '—';
				if (state === 'overdue') return DataTable.statusCell(state, 'error');
				return DataTable.statusCell(state, PAYMENT_STATE_TONE[state]);
			}
		}),
		columnHelper.accessor((row) => row.total ?? 0, {
			id: 'total',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Total' }),
			cell: ({ getValue, row }) => money(getValue(), row.original.currency)
		}),
		columnHelper.accessor((row) => (row.status === 'issued' ? (row.balance_due ?? 0) : 0), {
			id: 'balance',
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Balance due' }),
			cell: ({ getValue, row }) =>
				row.original.status === 'issued' ? money(getValue(), row.original.currency) : '—'
		}),
		columnHelper.accessor('due_date', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Due' }),
			cell: ({ getValue }) => {
				const value = getValue();
				return value ? date.format(new Date(value)) : '—';
			}
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.invoices;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="invoice" form={data.createForm} pickers={data.createPickers} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content emptyMessage="No {terms.plural} yet." />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
</div>
