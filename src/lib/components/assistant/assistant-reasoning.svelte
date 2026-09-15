<script lang="ts">
	import BrainIcon from '@lucide/svelte/icons/brain';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The model's thinking, while it is thinking.
	 *
	 * It opens itself as the first thought arrives, streams underneath a
	 * shimmering label, and once the thinking settles the label goes to the
	 * past tense and the block tidies itself away a beat later — leaving one
	 * line that still opens. The dwell is what makes it readable: collapsing
	 * the moment it finished would take the trace away exactly as it became
	 * worth reading.
	 *
	 * A thread read back from storage was never watched being written, so it
	 * arrives closed and simply says "Reasoning".
	 *
	 * Nothing here waits on a timer that stands in for the model: `streaming`
	 * is the SDK's own part state, so the block's clock only ever measures what
	 * actually happened.
	 */
	let {
		ref = $bindable(null),
		class: className,
		text,
		streaming = false,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children'> & {
		text: string;
		/** Whether this thinking is still being written. False for a stored thread. */
		streaming?: boolean;
	} = $props();

	/** How long a settled trace stays open before tidying itself away. */
	const DWELL_MS = 2600;

	/** Whether this block was ever watched being written, which is what earns it a duration. */
	let started = $state(false);
	let collapsed = $state(false);
	let startedAt = $state<number | null>(null);
	let endedAt = $state<number | null>(null);
	/** Ticks only while streaming, so the duration counts up rather than appearing. */
	let now = $state(0);

	// Two effects rather than one: each writes state it does not itself read,
	// so neither can re-trigger itself.
	$effect(() => {
		if (!streaming) return;
		started = true;
		startedAt ??= Date.now();
		endedAt = null;
		const id = setInterval(() => (now = Date.now()), 100);
		return () => clearInterval(id);
	});

	$effect(() => {
		if (streaming) {
			collapsed = false;
			return;
		}
		if (!started) return;
		endedAt ??= Date.now();
		const id = setTimeout(() => (collapsed = true), DWELL_MS);
		return () => clearTimeout(id);
	});

	const seconds = $derived.by(() => {
		if (startedAt === null) return null;
		const until = endedAt ?? now;
		return Math.max(1, Math.round((until - startedAt) / 1000));
	});

	const label = $derived.by(() => {
		if (streaming) return 'Thinking';
		if (seconds === null) return 'Reasoning';
		return `Thought for ${seconds} second${seconds === 1 ? '' : 's'}`;
	});

	const autoOpen = $derived(started && !collapsed);
	/**
	 * A reader's own answer, which once given is never overruled — `??` on
	 * null, so the first click toggles whatever is on screen and the dwell
	 * above can no longer close it underneath them.
	 */
	let manualOpen = $state<boolean | null>(null);
	const open = $derived(manualOpen ?? autoOpen);
</script>

{#if text.trim() || streaming}
	<div bind:this={ref} data-slot="assistant-reasoning" class={cn(className)} {...restProps}>
		<button
			type="button"
			aria-expanded={open}
			onclick={() => (manualOpen = !open)}
			class="text-muted-foreground hover:text-foreground -mx-1.5 flex w-fit items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors duration-150"
		>
			<BrainIcon
				class={cn(
					'size-3.5 shrink-0 transition-colors duration-200',
					streaming && 'text-foreground/70'
				)}
			/>
			<!-- The shimmer IS the status: no spinner beside a label that is
			     already saying it. Both labels are nowrap, so the swap from the
			     present to the past tense never reflows the row. -->
			{#if streaming}
				<span class="shimmer-text text-sm font-medium">{label}</span>
			{:else}
				<span class="animate-in fade-in text-sm font-medium whitespace-nowrap duration-[350ms]">
					{label}
				</span>
			{/if}
			<ChevronDownIcon
				class={cn('size-3.5 shrink-0 transition-transform duration-300', open && 'rotate-180')}
			/>
		</button>

		<!--
			The disclosure is `grid-template-rows: 0fr → 1fr` over an
			`overflow-hidden` child rather than an animated height: there is no
			`auto` anywhere in it to be uninterpolable, so nothing has to be
			measured and nothing snaps. Opacity rides the same transition so the
			last line fades out instead of being guillotined at the clip edge.
		-->
		<div
			class="ease-out-strong grid transition-[grid-template-rows,opacity] duration-[400ms]"
			style="grid-template-rows: {open ? '1fr' : '0fr'}; opacity: {open ? 1 : 0};"
		>
			<div class="min-h-0 overflow-hidden">
				<p
					class="text-muted-foreground border-border mt-1 border-l-2 pl-3 text-sm leading-relaxed whitespace-pre-wrap"
				>
					{text}
				</p>
			</div>
		</div>
	</div>
{/if}
