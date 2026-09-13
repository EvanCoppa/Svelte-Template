<script lang="ts">
	import type { Column, RowData } from '@tanstack/svelte-table';
	import { SvelteSet } from 'svelte/reactivity';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import type { FilterOption } from '$lib/lists/types';
	import { cn } from '$lib/utils.js';
	import { useDataTable } from './context.svelte.js';
	import type { DataTableFeatures } from './features.js';

	/**
	 * One column's filter: a multi-select of the values it may hold, and the
	 * rows narrow to the ones picked. The values are the column's own
	 * (`meta.filter.options` — an enum's, a select field's) or, when the
	 * column names none, every distinct value the rows on screen hold, so a
	 * free-text type or an org-defined category filters without anyone
	 * listing its values. The filter compares with `oneOf`, the one filter
	 * function every toolbar filter uses.
	 */
	let { column, class: className }: { column: Column<DataTableFeatures, RowData>; class?: string } =
		$props();

	const dataTable = useDataTable();

	const title = $derived(column.columnDef.meta?.title ?? column.id);
	const fixed = $derived(column.columnDef.meta?.filter?.options ?? null);

	/** The distinct readings of the column across every row, blank last as "Empty". */
	function facets(): FilterOption[] {
		const seen = new SvelteSet<string>();
		for (const row of dataTable.table.getCoreRowModel().rows) {
			seen.add(String(row.getValue(column.id) ?? ''));
		}
		const values = [...seen].filter((value) => value !== '').sort((a, b) => a.localeCompare(b));
		return [
			...values.map((value) => ({ value, label: value })),
			...(seen.has('') ? [{ value: '', label: 'Empty' }] : [])
		];
	}

	const options = $derived<ComboboxOption[]>(
		(fixed ?? facets()).map(({ value, label }) => ({ value, label }))
	);

	const selected = $derived.by(() => {
		const value = column.getFilterValue();
		return Array.isArray(value) ? value.map(String) : [];
	});
</script>

<Combobox
	multiple
	size="sm"
	clearable
	{options}
	{selected}
	onSelectionChange={(values) => column.setFilterValue(values.length > 0 ? values : undefined)}
	placeholder={title}
	ariaLabel={`Filter by ${title.toLowerCase()}`}
	emptyText="Nothing to filter by"
	class={cn('w-auto min-w-32', className)}
/>
