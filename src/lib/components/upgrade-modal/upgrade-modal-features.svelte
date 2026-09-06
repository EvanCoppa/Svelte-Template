<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLUListElement>> = $props();
</script>

<!--
	What the plan adds: the page loops over an `each` block rendering one
	`Feature` per row. The rows stagger in behind the dialog's own motion;
	each row carries its animation, this list only spaces the starts.
-->
<ul
	bind:this={ref}
	data-slot="upgrade-modal-features"
	class={cn('flex flex-col gap-4 px-6 pb-5', className)}
	{...restProps}
>
	{@render children?.()}
</ul>

<style>
	@media (prefers-reduced-motion: no-preference) {
		ul > :global(:nth-child(2)) {
			animation-delay: 220ms;
		}
		ul > :global(:nth-child(3)) {
			animation-delay: 290ms;
		}
		ul > :global(:nth-child(4)) {
			animation-delay: 360ms;
		}
		ul > :global(:nth-child(n + 5)) {
			animation-delay: 430ms;
		}
	}
</style>
