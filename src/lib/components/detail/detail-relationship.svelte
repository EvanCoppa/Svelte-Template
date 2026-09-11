<script lang="ts">
	import { StatusBadge } from '$lib/components/ui/badge/index.js';
	import type { RelationshipView } from '$lib/server/crm/relationships';

	/**
	 * One relationship, read from the record on screen: the label that reads
	 * from this side ("owned by"), the record at the other end — linked when
	 * the reader may open it, a plain name for a member — and when it held.
	 */
	let { relationship }: { relationship: RelationshipView } = $props();

	// A `date` column has no time zone: read it as the day it names, not
	// shifted into the viewer's zone (the same formatter as Detail.Value).
	const mediumDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
	const day = (value: string) => mediumDate.format(new Date(value));

	const period = $derived.by(() => {
		const { startedOn, endedOn } = relationship;
		if (startedOn && endedOn) return `${day(startedOn)} – ${day(endedOn)}`;
		if (startedOn) return `Since ${day(startedOn)}`;
		if (endedOn) return `Until ${day(endedOn)}`;
		return null;
	});
</script>

<li data-slot="detail-relationship" class="flex items-center justify-between gap-3 py-2.5">
	<div class="min-w-0">
		<p class="truncate text-sm">
			<span class="text-muted-foreground">{relationship.label}</span>
			{#if relationship.other.href}
				<a href={relationship.other.href} class="font-medium underline-offset-4 hover:underline">
					{relationship.other.name}
				</a>
			{:else}
				<span class="font-medium">{relationship.other.name}</span>
			{/if}
		</p>
		{#if period || relationship.notes}
			<p class="text-muted-foreground truncate text-xs">
				{[period, relationship.notes].filter(Boolean).join(' · ')}
			</p>
		{/if}
	</div>
	{#if relationship.endedOn}
		<StatusBadge tone="neutral">ended</StatusBadge>
	{/if}
</li>
