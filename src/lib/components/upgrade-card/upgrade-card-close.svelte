<script lang="ts">
	import {
		UntitledButton,
		type UntitledButtonProps
	} from '$lib/components/enhanced/untitled-button/index.js';
	import { cn } from '$lib/utils.js';
	import XIcon from '@lucide/svelte/icons/x';

	let {
		class: className,
		...restProps
	}: Omit<UntitledButtonProps, 'color' | 'size' | 'children' | 'iconLeading' | 'iconTrailing'> =
		$props();
</script>

<!--
	The X pinned to the card's corner, over the hero. It only looks like the
	modal's close button: the page decides what dismissing means — `href="/"`
	back to the dashboard, or an `onclick`. Place it last inside `Root` so the
	pitch's own buttons come first in the tab order.
-->
<UntitledButton
	data-slot="upgrade-card-close"
	color="tertiary"
	size="xs"
	aria-label="Close"
	class={cn('absolute end-3 top-3', className)}
	{...restProps}
>
	{#snippet iconLeading()}<XIcon />{/snippet}
</UntitledButton>
