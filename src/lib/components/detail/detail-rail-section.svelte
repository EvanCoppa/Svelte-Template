<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { cn } from '$lib/utils.js';

	let {
		title,
		open = $bindable(true),
		class: className,
		actions,
		children
	}: {
		title: string;
		/** Folded away or not — this view's own business, nothing worth a preference. */
		open?: boolean;
		class?: string;
		/** What sits beside the heading — the record's Edit button, say. */
		actions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<Collapsible.Root bind:open data-slot="detail-rail-section" class={cn('space-y-3', className)}>
	<div class="flex items-center justify-between gap-2">
		<Collapsible.Trigger
			class="text-foreground -ml-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-semibold"
		>
			<ChevronDownIcon
				class="text-muted-foreground size-4 transition-transform duration-200 {open
					? ''
					: '-rotate-90'}"
			/>
			{title}
		</Collapsible.Trigger>
		{@render actions?.()}
	</div>

	<Collapsible.Content class="space-y-5">
		{@render children()}
	</Collapsible.Content>
</Collapsible.Root>
