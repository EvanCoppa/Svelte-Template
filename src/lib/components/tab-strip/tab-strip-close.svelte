<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	/** The × on a tab. Named for what it closes, so the label reads in a screen reader. */
	let {
		ref = $bindable(null),
		class: className,
		label,
		...restProps
	}: Omit<ComponentProps<typeof Button>, 'children'> & {
		/** What this closes — "Close Overdue work at Acme". */
		label: string;
	} = $props();
</script>

<Button
	bind:ref
	data-slot="tab-strip-close"
	variant="ghost"
	size="icon"
	class={cn(
		'text-muted-foreground hover:bg-background/70 hover:text-foreground -my-1 size-6 shrink-0 rounded',
		className
	)}
	{...restProps}
>
	<XIcon class="size-3" />
	<span class="sr-only">Close {label}</span>
</Button>
