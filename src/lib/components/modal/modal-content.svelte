<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { cn } from '$lib/utils.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: Omit<ComponentProps<typeof Dialog.Content>, 'showCloseButton'> = $props();
</script>

<!--
	The tray: `ui/dialog`'s portal, overlay, focus trap and open/close motion,
	painted as the muted surface the white `Modal.Card` sits in and the footer
	buttons sit on. Dark mode drops it below the card's own tone so the card
	still reads as the raised panel. The close button belongs to the card.
-->
<Dialog.Content
	bind:ref
	showCloseButton={false}
	class={cn('bg-muted dark:bg-background gap-0 rounded-2xl p-1 shadow-xl sm:max-w-lg', className)}
	{...restProps}
>
	{@render children()}
</Dialog.Content>
