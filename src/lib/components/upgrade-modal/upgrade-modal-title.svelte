<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { cn } from '$lib/utils.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: ComponentProps<typeof Dialog.Title> = $props();
</script>

<!-- `ui/dialog`'s Title, so the dialog is labelled by it, sized for the card. -->
<Dialog.Title
	bind:ref
	data-slot="upgrade-modal-title"
	class={cn('text-lg leading-tight font-semibold tracking-tight', className)}
	{...restProps}
/>
