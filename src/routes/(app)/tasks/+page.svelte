<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import * as DataTable from '$lib/components/data-table/index.js';
	import { recordHref } from '$lib/crm/records';
	import { TASK_STATE_TONE, taskState } from '$lib/crm/tones';
	import type { Task } from '$lib/server/crm/tasks';

	let { data } = $props();

	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, Task>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('title', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Task' }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), recordHref('task', row.original.id))
		}),
		columnHelper.accessor('due_at', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Due' }),
			cell: ({ getValue }) => {
				const value = getValue();
				return value ? date.format(new Date(value)) : '—';
			}
		}),
		columnHelper.accessor((row) => taskState(row), {
			id: 'state',
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'State' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), TASK_STATE_TONE[getValue()])
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
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Tasks</h1>
		<p class="text-muted-foreground">Follow-ups and to-dos, with due dates and owners.</p>
	</div>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun="task" />
	</DataTable.Root>
</div>
