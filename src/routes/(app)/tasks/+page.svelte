<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { recordHref, recordTerms } from '$lib/crm/records';
	import { PRIORITY_TONE, TASK_STATE_TONE, taskState } from '$lib/crm/tones';
	import type { Task } from '$lib/server/crm/tasks';
	import { capitalize } from '$lib/utils.js';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'task'));

	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, Task>();
	const columns = columnHelper.columns([
		DataTable.selectColumn(columnHelper),
		columnHelper.accessor('title', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: capitalize(terms.noun) }),
			cell: ({ getValue, row }) =>
				DataTable.linkCell(getValue(), recordHref('task', row.original.id))
		}),
		columnHelper.accessor('priority', {
			header: ({ column }) =>
				renderComponent(DataTable.ColumnHeader, { column, title: 'Priority' }),
			cell: ({ getValue }) => DataTable.statusCell(getValue(), PRIORITY_TONE[getValue()])
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
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="task" form={data.createForm} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<DataTable.Root {table}>
		<DataTable.Content />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
</div>
