<script lang="ts">
	import { UntitledButton } from '$lib/components/enhanced/untitled-button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
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
	}: ComponentProps<typeof Card.Root> & {
		/** The X in the top corner. Off only when the modal must not be dismissed from here. */
		showCloseButton?: boolean;
	} = $props();
</script>

<!--
	The white card inside the tray: `ui/card` holding `Modal.Header` and
	`Modal.Body`, which bring their own padding. The close button renders after
	`children` so the body's first field, not the X, receives focus on open.
-->
<Card.Root
	bind:ref
	data-slot="modal-card"
	class={cn('relative gap-0 py-0', className)}
	{...restProps}
>
	{@render children?.()}
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
</Card.Root>
