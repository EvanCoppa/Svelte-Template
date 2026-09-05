<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { cn } from '$lib/utils.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: ComponentProps<typeof Badge> = $props();
</script>

<!-- The pill beside the title — the plan being pitched, or a promotion. `Header` makes room for it when present. -->
<Badge
	bind:ref
	data-slot="upgrade-card-badge"
	class={cn(
		'col-start-2 row-span-2 row-start-1 self-start justify-self-end rounded-full px-2.5',
		className
	)}
	{...restProps}
/>
