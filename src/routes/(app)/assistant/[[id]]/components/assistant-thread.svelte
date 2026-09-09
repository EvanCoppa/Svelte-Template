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
	class={cn('flex min-h-0 flex-1 flex-col', className)}
	{...restProps}
>
	<ScrollArea bind:viewportRef={viewport} class="min-h-0 flex-1">
		<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-1 py-4">
			{@render children?.()}
		</div>
	</ScrollArea>
</div>
