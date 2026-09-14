<script lang="ts">
	import type { ChatStatus } from 'ai';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { AssistantUIMessage } from '$lib/ai/types';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The scrolling column of messages. It follows the conversation: whenever
	 * a message or a streamed part arrives it scrolls to the bottom, so the
	 * newest text is always in view without the page managing scroll state.
	 *
	 * Its foot fades out rather than ending on a hard edge, because the
	 * composer floats over it — the thread reads as running under the prompt
	 * box instead of being cut off by it.
	 */
	let {
		ref = $bindable(null),
		class: className,
		messages,
		status,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** Read for their shape only, to know when to scroll. */
		messages: AssistantUIMessage[];
		status: ChatStatus;
	} = $props();

	let viewport = $state<HTMLElement | null>(null);

	/**
	 * A fingerprint of what is on screen: part counts plus the length of the
	 * text being streamed. Reading it inside the effect is what makes a new
	 * delta re-run the scroll.
	 */
	const extent = $derived.by(() => {
		let total = 0;
		for (const message of messages) {
			for (const part of message.parts) {
				total += part.type === 'text' || part.type === 'reasoning' ? part.text.length + 1 : 1;
			}
		}
		return `${messages.length}:${total}:${status}`;
	});

	$effect(() => {
		void extent;
		if (viewport) viewport.scrollTop = viewport.scrollHeight;
	});
</script>

<div
	bind:this={ref}
	data-slot="assistant-thread"
	class={cn('thread-fade flex min-h-0 flex-1 flex-col', className)}
	{...restProps}
>
	<ScrollArea bind:viewportRef={viewport} class="min-h-0 flex-1">
		<div
			class="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pt-14 pb-64 md:gap-12 xl:max-w-4xl"
		>
			{@render children?.()}
		</div>
	</ScrollArea>
</div>

<style>
	/* The composer floats over the foot of the thread, so the last inch of it
	   dissolves instead of sliding under a hard edge. */
	.thread-fade {
		-webkit-mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 95%);
		mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 95%);
	}
</style>
