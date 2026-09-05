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

<!-- A leading icon is a plain child: `<Modal.Title><MegaphoneIcon /> Create campaign</Modal.Title>`. -->
<Dialog.Title
	bind:ref
	class={cn(
		'flex items-center gap-2.5 text-xl leading-7 [&>svg]:size-5 [&>svg]:shrink-0',
		className
	)}
	{...restProps}
/>
