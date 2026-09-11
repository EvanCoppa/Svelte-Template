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
		children,
		...restProps
	}: CollapsiblePrimitive.ContentProps = $props();
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
				<div class={cn('divide-border flex flex-col divide-y border-t', className)}>
					{@render children?.()}
				</div>
			</div>
		{/if}
	{/snippet}
</Collapsible.Content>
