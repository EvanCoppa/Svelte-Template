<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { FieldValue } from '$lib/server/crm/records';
	import DetailValue from './detail-value.svelte';

	/** One labelled field of a record: a `<dt>`/`<dd>` pair for the page's `<dl>`. */
	let {
		label,
		value,
		people,
		action
	}: {
		label: string;
		value: FieldValue;
		/** Who each user id is, for `person` values. */
		people?: ReadonlyMap<string, string>;
		/** What this field lets you do — an edit button, on the label's line. */
		action?: Snippet;
	} = $props();
</script>

<div data-slot="detail-field" class="min-w-0 space-y-1">
	<dt class="text-muted-foreground flex items-center gap-1 text-sm">
		{label}
		{#if action}{@render action()}{/if}
	</dt>
	<dd class="text-sm break-words">
		<DetailValue {value} {people} />
	</dd>
</div>
