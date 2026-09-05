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
	The card is the dialog panel itself: `ui/dialog`'s portal, overlay, focus
	trap and open/close motion, with its padding handed down to the parts so
	the hero band runs edge to edge under the rounded corners. The close
	button is `UpgradeModal.Close`, pinned over the hero, so the default is off.
-->
<Dialog.Content
	bind:ref
	showCloseButton={false}
	data-slot="upgrade-modal-content"
	class={cn('gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-sm', className)}
	{...restProps}
>
	{@render children()}
</Dialog.Content>
