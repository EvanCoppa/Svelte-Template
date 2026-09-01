<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { Task } from '$lib/server/crm/tasks';

	let { data } = $props();

	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, Task>();
	const columns = columnHelper.columns([
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
		columns,
		initialState: { pagination: { pageIndex: 0, pageSize: 10 } }
	});
</script>

<svelte:head>
	<title>Tasks</title>
</svelte:head>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Tasks</h1>
		<p class="text-muted-foreground">Follow-ups and to-dos, with due dates and owners.</p>
	</div>

	<Card.Root>
		<Card.Content>
			<DataTable.Root {table}>
				<DataTable.Content />
				<DataTable.Pagination />
			</DataTable.Root>
		</Card.Content>
	</Card.Root>
</div>
