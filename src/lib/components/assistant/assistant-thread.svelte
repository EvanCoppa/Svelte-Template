<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { AssistantUIMessage } from '$lib/ai/types';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The scrolling column of messages, and the two different ways it follows
	 * the conversation — because a message arriving and a message growing are
	 * not the same event.
	 *
	 * Sending is a request to be at the foot, so a **new message** re-arms the
	 * follow whatever the reader was doing and travels there smoothly. An
	 * answer being **written** grows the thread continuously — a word at a time
	 * as text streams, then in a jump when a block opens — so it is pinned to
	 * the foot instantly instead: a smooth scroll restarted on every frame of a
	 * growing element never catches up with itself.
	 *
	 * Scrolling up to re-read releases the pin, and scrolling back to the foot
	 * re-arms it, which is why there is no "jump to latest" button to build.
	 *
	 * Its foot fades out rather than ending on a hard edge, because the
	 * composer floats over it — the thread reads as running under the prompt
	 * box instead of being cut off by it.
	 */
	let {
		ref = $bindable(null),
		class: className,
		messages,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** Read for its length only, to know when a turn has been added. */
		messages: AssistantUIMessage[];
	} = $props();

	/**
	 * How close to the foot still counts as following: wide enough to survive a
	 * trackpad's overscroll bounce, narrow enough that scrolling up to re-read a
	 * paragraph lets go at once.
	 */
	const STICK_THRESHOLD = 120;

	let viewport = $state<HTMLElement | null>(null);
	let content = $state<HTMLElement | null>(null);

	/**
	 * Whether the reader is still at the foot. Deliberately a plain variable
	 * rather than `$state`: it is written on every scroll event and read only
	 * inside the callbacks below, so making it reactive would re-render the
	 * whole thread on every pixel scrolled and buy nothing.
	 */
	let following = true;
	/** The message count the smooth jump below has already accounted for. */
	let counted = 0;

	$effect(() => {
		const el = viewport;
		const body = content;
		if (!el || !body) return;

		let frame = 0;

		const onScroll = () => {
			following = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
		};

		const pin = () => {
			if (!following) return;
			// One write per frame, after layout has settled, however many times
			// the observers fired in between.
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				el.scrollTop = el.scrollHeight;
			});
		};

		el.addEventListener('scroll', onScroll, { passive: true });

		// Two observers because there are two causes. The resize catches the
		// thread growing a line at a time as words arrive; the mutation catches
		// a whole block being inserted and — through `style` — each frame of its
		// height animation, so the foot stays in view *while* a block opens
		// rather than only once it has finished.
		const resize = new ResizeObserver(pin);
		resize.observe(body);
		const mutate = new MutationObserver(pin);
		mutate.observe(body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['style']
		});

		// Land at the foot on arrival, before anything has had a chance to grow.
		el.scrollTop = el.scrollHeight;

		return () => {
			el.removeEventListener('scroll', onScroll);
			resize.disconnect();
			mutate.disconnect();
			cancelAnimationFrame(frame);
		};
	});

	$effect(() => {
		const count = messages.length;
		const el = viewport;
		if (!el || count === counted) return;

		const first = counted === 0;
		counted = count;
		following = true;
		// The effect above has already put the thread at its foot on arrival;
		// travelling there as well would animate over a settled view.
		if (first) return;
		el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
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
			bind:this={content}
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
