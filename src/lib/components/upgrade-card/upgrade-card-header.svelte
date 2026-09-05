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

<!-- `Title` then `Description`, with `Badge` beside them: the same grid `ui/card`'s header uses for its action. -->
<div
	bind:this={ref}
	data-slot="upgrade-card-header"
	class={cn(
		'grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 pt-5 pb-5 has-data-[slot=upgrade-card-badge]:grid-cols-[1fr_auto]',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
