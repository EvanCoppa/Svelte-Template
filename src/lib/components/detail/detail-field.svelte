<script lang="ts">
	import type { FieldValue } from '$lib/server/crm/records';
	import DetailValue from './detail-value.svelte';

	/**
	 * One labelled field of a record: a `<dt>`/`<dd>` pair for the page's `<dl>`.
	 *
	 * The label sits in a fixed column and the value beside it, so a column of
	 * fields lines up down the record rail however long a label runs — a label
	 * that outgrows its column is truncated rather than wrapping the row.
	 */
	let {
		label,
		value,
		people
	}: {
		label: string;
		value: FieldValue;
		/** Who each user id is, for `person` values. */
		people?: ReadonlyMap<string, string>;
	} = $props();
</script>

<div
	data-slot="detail-field"
	class="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-start gap-3"
>
	<dt class="text-muted-foreground truncate text-sm" title={label}>{label}</dt>
	<dd class="text-sm break-words">
		<DetailValue {value} {people} />
	</dd>
</div>
