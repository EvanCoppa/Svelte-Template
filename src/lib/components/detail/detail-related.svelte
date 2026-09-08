<script lang="ts">
	import { StatusBadge } from '$lib/components/ui/badge/index.js';
	import type { RelatedRecord } from '$lib/server/crm/records';

	/** One record that points at the one on screen: a link, one line of context, its lifecycle. */
	let { record }: { record: RelatedRecord } = $props();
</script>

<li data-slot="detail-related" class="flex items-center justify-between gap-3 py-2.5">
	<div class="min-w-0">
		<a
			href={record.href}
			class="block truncate text-sm font-medium underline-offset-4 hover:underline"
		>
			{record.name}
		</a>
		{#if record.meta}
			<p class="text-muted-foreground truncate text-xs">{record.meta}</p>
		{/if}
	</div>
	{#if record.pill}
		<StatusBadge tone={record.pill.tone}>{record.pill.label}</StatusBadge>
	{/if}
</li>
