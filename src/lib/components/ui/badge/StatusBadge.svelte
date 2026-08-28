<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';
	import { BADGE_TONE_CLASSES, BADGE_TONE_DOT_CLASSES, type BadgeTone } from './badge-tones.js';

	let {
		ref = $bindable(null),
		class: className,
		tone = 'neutral',
		dot = true,
		size = 'default',
		children,
		...restProps
	}: HTMLAttributes<HTMLSpanElement> & {
		ref?: HTMLSpanElement | null;
		tone?: BadgeTone;
		dot?: boolean;
		size?: 'sm' | 'default';
		children?: Snippet;
	} = $props();
</script>

<span
	bind:this={ref}
	data-slot="status-badge"
	class={cn(
		'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap',
		size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
		BADGE_TONE_CLASSES[tone],
		className
	)}
	{...restProps}
>
	{#if dot}
		<span
			class={cn(
				'rounded-full',
				size === 'sm' ? 'h-1 w-1' : 'h-1.5 w-1.5',
				BADGE_TONE_DOT_CLASSES[tone]
			)}
		></span>
	{/if}
	{@render children?.()}
</span>
