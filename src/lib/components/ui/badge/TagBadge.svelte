<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';
	import { BADGE_TONE_CLASSES, type BadgeTone } from './badge-tones.js';

	let {
		ref = $bindable(null),
		class: className,
		tone = 'neutral',
		size = 'default',
		children,
		...restProps
	}: HTMLAttributes<HTMLSpanElement> & {
		ref?: HTMLSpanElement | null;
		tone?: BadgeTone;
		size?: 'sm' | 'default';
		children?: Snippet;
	} = $props();
</script>

<span
	bind:this={ref}
	data-slot="tag-badge"
	class={cn(
		'inline-flex w-fit shrink-0 items-center rounded-md border font-medium whitespace-nowrap',
		size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
		BADGE_TONE_CLASSES[tone],
		className
	)}
	{...restProps}
>
	{@render children?.()}
</span>
