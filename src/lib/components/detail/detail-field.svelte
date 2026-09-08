<script lang="ts">
	import type { FieldValue } from '$lib/server/crm/records';
	import DetailValue from './detail-value.svelte';

	/** One labelled field of a record: a `<dt>`/`<dd>` pair for the page's `<dl>`. */
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

<div data-slot="detail-field" class="min-w-0 space-y-1">
	<dt class="text-muted-foreground text-sm">{label}</dt>
	<dd class="text-sm break-words">
		<DetailValue {value} {people} />
	</dd>
</div>
