<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	/** Open another one. A link for the same reason a tab is. */
	let {
		ref = $bindable(null),
		class: className,
		label,
		...restProps
	}: Omit<ComponentProps<typeof Button>, 'children'> & {
		/** What it opens — "New conversation". */
		label: string;
	} = $props();
</script>

<Button
	bind:ref
	data-slot="tab-strip-add"
	variant="ghost"
	size="icon"
	class={cn(
		'text-muted-foreground hover:text-foreground ml-0.5 size-7 shrink-0 rounded-md',
		className
	)}
	{...restProps}
>
	<PlusIcon class="size-4" />
	<span class="sr-only">{label}</span>
</Button>
