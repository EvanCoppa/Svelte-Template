<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { cn } from '$lib/utils.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: ComponentProps<typeof Card.Root> = $props();
</script>

<!--
	`ui/card` with its padding and gap handed down to the parts, so the hero
	band runs edge to edge under the rounded corners. `relative` anchors the
	optional `UpgradeCard.Close` to the card's corner wherever the page puts it.
-->
<Card.Root
	bind:ref
	data-slot="upgrade-card"
	class={cn('relative gap-0 overflow-hidden rounded-2xl py-0 shadow-lg', className)}
	{...restProps}
>
	{@render children?.()}
</Card.Root>
