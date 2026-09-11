<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from 'bits-ui';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { motionCollapse } from '$lib/motion.js';
	import { cn } from '$lib/utils.js';

	/** Opening is the slower half, the way every disclosure in the app moves. */
	const OPEN = { duration: 0.28, ease: [0.32, 0.72, 0, 1] } as const;
	const SHUT = { duration: 0.2, ease: [0.4, 0, 1, 1] } as const;

	/**
	 * What is under the heading. Force-mounted so the height transition is
	 * ours rather than a display toggle — the same way the tree view opens a
	 * branch — while bits-ui keeps the trigger and the panel wired together.
	 */
	let {
		ref = $bindable(null),
		class: className,
		layout = 'rows',
		children,
		...restProps
	}: CollapsiblePrimitive.ContentProps & {
		/**
		 * How the things under the heading sit. `rows` is a divided column —
		 * one record per line, the shape a list page wants. `grid` lays them
		 * out as cards, for the surfaces whose records are objects rather than
		 * lines (a note is a piece of paper, not a row).
		 */
		layout?: 'rows' | 'grid';
	} = $props();

	const LAYOUT = {
		rows: 'divide-border flex flex-col divide-y',
		grid: 'grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
	} as const;
</script>

<Collapsible.Content bind:ref data-slot="group-list-items" forceMount {...restProps}>
	{#snippet child({ props, open })}
		{#if open}
			<div
				{...props}
				class="overflow-hidden"
				in:motionCollapse={{ transition: OPEN }}
				out:motionCollapse={{ transition: SHUT }}
			>
				<div class={cn('border-t', LAYOUT[layout], className)}>
					{@render children?.()}
				</div>
			</div>
		{/if}
	{/snippet}
</Collapsible.Content>
