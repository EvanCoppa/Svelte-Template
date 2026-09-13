<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { localDate } from '$lib/crm/ledger';
	import { leaseStateOn } from '$lib/crm/leases';
	import { recordHref, recordTerms } from '$lib/crm/records';
	import { LEASE_STATE_TONE } from '$lib/crm/tones';
	import type { LeaseWithParties } from '$lib/server/crm/leases';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'lease'));

	// "Is this lease running" is a question about today, and today is a
	// wall-clock word — so it is answered here, with the viewer's own date,
	// the way the task board buckets and the ledger decides overdue. The
	// server sent dates and nothing else.
	const today = localDate(new Date());

	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
	// A `date` column has no time zone: read it as the day it names.
	const mediumDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
	const day = (value: string) => mediumDate.format(new Date(value));

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, LeaseWithParties>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor((row) => row.properties?.name ?? '—', {
			id: 'property',
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Property' }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), recordHref('lease', row.original.id))
		}),
		columnHelper.accessor((row) => row.contacts?.name ?? row.companies?.name ?? '—', {
			id: 'tenant',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Tenant' }),
			cell: ({ getValue }) => getValue()
		}),
		columnHelper.accessor('starts_on', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Starts' }),
			cell: ({ getValue }) => day(getValue())
		}),
		columnHelper.accessor('ends_on', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Ends' }),
			// Null is month-to-month, which the status column already says.
			cell: ({ getValue }) => {
				const value = getValue();
				return value ? day(value) : '—';
			}
		}),
		columnHelper.accessor('rent_amount', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Rent' }),
			cell: ({ getValue, row }) => money(getValue(), row.original.currency)
		}),
		columnHelper.accessor((row) => leaseStateOn(row, today), {
			id: 'state',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Status' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), LEASE_STATE_TONE[getValue()])
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.leases;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="lease" form={data.createForm} pickers={data.createPickers} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
</div>
