<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { TooltipStore, provideTooltipGroup } from './tooltip-store.svelte.js';

	export interface TooltipGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The triggers that share one delay. Any depth of nesting works — the group is a context, not a layout. */
		children?: Snippet;
		/** Milliseconds a cold pointer must rest on a trigger before its tooltip opens. */
		openDelay?: number;
		/** Grace period after the pointer leaves, so crossing a 2px seam between triggers does not blink. */
		closeDelay?: number;
		/** How long the group stays warm after the last tooltip closes. While warm, openDelay is zero. */
		skipDelay?: number;
		/** Fires once per transition between cold and warm. */
		onWarmChange?: (warm: boolean) => void;
	}

	let {
		class: className = '',
		children,
		openDelay = 200,
		closeDelay = 120,
		skipDelay = 400,
		onWarmChange,
		...restProps
	}: TooltipGroupProps = $props();

	// One seat for the whole group, holding live timing rather than the values it
	// was constructed with.
	const store = new TooltipStore(() => ({ openDelay, closeDelay, skipDelay }));
	provideTooltipGroup(store);

	onDestroy(() => store.dispose());

	let reported = false;
	$effect(() => {
		const warm = store.warm;
		if (warm === reported) return;
		reported = warm;
		untrack(() => onWarmChange?.(warm));
	});

	function onWindowBlur() {
		store.reset();
	}

	function onVisibilityChange() {
		if (document.hidden) store.reset();
	}
</script>

<svelte:window onblur={onWindowBlur} />
<svelte:document onvisibilitychange={onVisibilityChange} />

<div {...restProps} class={cn(className || 'contents')}>
	{@render children?.()}
</div>
