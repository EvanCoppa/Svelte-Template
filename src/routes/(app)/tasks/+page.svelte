<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import type { Task } from '$lib/server/crm/tasks';

	let { data } = $props();

	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, Task>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('title', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Task' })
		}),
		columnHelper.accessor('due_at', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Due' }),
			cell: ({ getValue }) => {
				const value = getValue();
				return value ? date.format(new Date(value)) : '—';
			}
		}),
		columnHelper.accessor((row) => (row.completed_at ? 'done' : 'open'), {
			id: 'state',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'State' }),
			cell: ({ getValue }) =>
				DataTable.statusCell(getValue(), getValue() === 'done' ? 'success' : 'info')
		})
	]);

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.tasks;
		},
		columns
	});
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title>Tasks</PageHeader.Title>
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="task" form={data.createForm} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="task" />
	</DataTable.Root>
</div>
