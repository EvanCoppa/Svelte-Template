<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLLIElement>> = $props();
</script>

<!-- One row: a check in a tile, then `FeatureTitle` and `FeatureDescription` stacked beside it. -->
<li
	bind:this={ref}
	data-slot="upgrade-modal-feature"
	class={cn(
		'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards flex items-center gap-3 motion-safe:delay-150 motion-safe:duration-300',
		className
	)}
	{...restProps}
>
	<span
		aria-hidden="true"
		class="bg-muted flex size-7 shrink-0 items-center justify-center rounded-lg border"
	>
		<CheckIcon class="size-3.5" />
	</span>
	<div class="flex min-w-0 flex-col gap-0.5">
		{@render children?.()}
	</div>
</li>
