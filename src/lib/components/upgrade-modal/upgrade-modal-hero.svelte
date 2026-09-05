<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<!--
	The band across the top: a primary-tinted halftone that dissolves into the
	card, with whatever the page puts here (an icon, usually) floating in the
	middle and popping in a beat after the dialog. Everything paints from
	`--primary`, so it follows the theme.
-->
<div
	bind:this={ref}
	data-slot="upgrade-modal-hero"
	class={cn(
		'from-primary/15 to-primary/5 relative flex h-40 items-center justify-center bg-linear-to-b',
		className
	)}
	{...restProps}
>
	<div
		aria-hidden="true"
		class="text-primary/40 absolute inset-0 bg-[radial-gradient(circle,currentColor_1.25px,transparent_1.75px)] [mask-image:linear-gradient(to_bottom,black_10%,transparent_85%)] bg-[size:8px_8px]"
	></div>
	<div
		class="text-primary motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:fill-mode-backwards [&>svg]:fill-primary/20 relative drop-shadow-lg motion-safe:delay-100 motion-safe:duration-500 motion-safe:ease-out [&>svg]:size-14 [&>svg]:stroke-[1.5px]"
	>
		{@render children?.()}
	</div>
</div>
