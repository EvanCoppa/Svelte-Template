<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { DiffRow } from '$lib/ai/snapshots';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * A change, field by field, before it lands: what the field is called,
	 * what it says now, what it would say. Drawn inside the approval card of
	 * an `updateRecord` call, so Approve is a decision about something the
	 * reader has seen rather than a JSON blob. The rows are `diffRows()`'s,
	 * read from the record as the thread last saw it — a field the thread
	 * never read shows only what would be written.
	 */
	let {
		ref = $bindable(null),
		class: className,
		rows,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { rows: readonly DiffRow[] } = $props();
</script>

<div
	bind:this={ref}
	data-slot="assistant-diff"
	class={cn('border-border overflow-hidden rounded-lg border', className)}
	{...restProps}
>
	<dl class="divide-border divide-y text-sm">
		{#each rows as row (row.name)}
			<div class="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-x-3 px-3 py-2">
				<dt class="text-muted-foreground truncate text-xs leading-5" title={row.label}>
					{row.label}
				</dt>
				<dd class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
					{#if row.before !== null}
						<span
							class="text-muted-foreground truncate line-through decoration-red-400/70 dark:decoration-red-400/70"
						>
							{row.before}
						</span>
						<ArrowRightIcon class="text-muted-foreground size-3 shrink-0" />
					{/if}
					{#if row.after !== null}
						<span class="truncate font-medium text-emerald-700 dark:text-emerald-400">
							{row.after}
						</span>
					{:else}
						<span class="text-muted-foreground italic">cleared</span>
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
</div>
