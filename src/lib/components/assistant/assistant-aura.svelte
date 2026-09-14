<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The pool of light behind the opening question. It is there before the
	 * first question and fades away once the conversation has started, so it
	 * greets an empty screen without sitting behind a wall of text.
	 *
	 * Positioned against its nearest positioned ancestor, which is the pane it
	 * belongs to — the page places it, so it is centred on the conversation
	 * rather than on whatever else shares the screen.
	 */
	let {
		ref = $bindable(null),
		class: className,
		faded = false,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children'> & {
		/** True once the thread has started, which is when it goes. */
		faded?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="assistant-aura"
	aria-hidden="true"
	class={cn(
		'aura pointer-events-none absolute top-1/3 left-1/2 z-0 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700 motion-reduce:transition-none',
		faded ? 'opacity-0' : 'opacity-100',
		className
	)}
	{...restProps}
></div>

<style>
	/* A small, faint pool of the brand colour behind the opening question —
	   not a wash across the screen. `color-mix` keeps it on the theme's own
	   primary, so it reads the same on a dark ground. */
	.aura {
		width: min(46vw, 460px);
		height: min(40vh, 340px);
		background: radial-gradient(
			ellipse 60% 55% at 50% 45%,
			color-mix(in oklch, var(--primary) 13%, transparent),
			color-mix(in oklch, var(--primary) 6%, transparent) 45%,
			transparent 72%
		);
		filter: blur(40px);
		border-radius: 9999px;
	}
</style>
