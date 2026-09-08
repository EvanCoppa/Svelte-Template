<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import type { BadgeTone } from '$lib/components/ui/badge/index.js';
	import type { Company } from '$lib/server/crm/companies';

	let { data } = $props();

	const statusTone = {
		lead: 'info',
		prospect: 'violet',
		active: 'success',
		inactive: 'neutral'
	} satisfies Record<Company['status'], BadgeTone>;

	const relationshipTone = {
		customer: 'success',
		supplier: 'cyan',
		partner: 'indigo',
		other: 'neutral'
	} satisfies Record<Company['relationship'], BadgeTone>;

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, Company>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('name', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Name' })
		}),
		columnHelper.accessor('relationship', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Relationship' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), relationshipTone[getValue()])
		}),
		columnHelper.accessor('email', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Email' }),
			cell: ({ getValue }) => getValue() ?? '—'
		}),
		columnHelper.accessor('website', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Website' }),
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
			return data.companies;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title>Companies</PageHeader.Title>
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="company" form={data.createForm} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="company" nounPlural="companies" />
	</DataTable.Root>
</div>
