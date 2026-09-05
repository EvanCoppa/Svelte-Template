<script lang="ts">
	import { UntitledButton } from '$lib/components/enhanced/untitled-button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { cn } from '$lib/utils.js';
	import XIcon from '@lucide/svelte/icons/x';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		showCloseButton = true,
		children,
		...restProps
	}: ComponentProps<typeof Dialog.Content> = $props();
</script>

<!--
	The frame: `ui/dialog`'s portal, overlay, focus trap and open/close motion, with
	the padding handed to `Modal.Header` / `Modal.Body` / `Modal.Footer` so the footer
	can paint its own band edge to edge. The close button renders after `children`
	so the body's first field, not the X, is what receives focus on open.
-->
<Dialog.Content
	bind:ref
	showCloseButton={false}
	class={cn('gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg', className)}
	{...restProps}
>
	{@render children()}
	{#if showCloseButton}
		<Dialog.Close>
			{#snippet child({ props })}
				<UntitledButton
					color="tertiary"
					size="xs"
					aria-label="Close"
					class="absolute end-4 top-4.5"
					{...props}
				>
					{#snippet iconLeading()}<XIcon />{/snippet}
				</UntitledButton>
			{/snippet}
		</Dialog.Close>
	{/if}
</Dialog.Content>
