<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Kbd } from '$lib/components/ui/kbd/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { cn } from '$lib/utils.js';

	/**
	 * One control on the island: an icon that is either on or off. Used for the
	 * tools, for the two line weights and for the fill switch — everything on
	 * the toolbar whose whole state is "this one, or not".
	 *
	 * The icon is the button's face, so the name lives in the tooltip and in
	 * `sr-only` text rather than beside it, and `aria-pressed` is what says it
	 * is the one in effect.
	 */
	let {
		label,
		shortcut = null,
		active = false,
		onclick,
		children,
		class: className
	}: {
		/** What this does, read out and shown on hover. */
		label: string;
		/** The key that also does it, when there is one. */
		shortcut?: string | null;
		active?: boolean;
		onclick: () => void;
		children: Snippet;
		class?: string;
	} = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{onclick}
				variant={active ? 'secondary' : 'ghost'}
				size="icon"
				aria-pressed={active}
				data-slot="whiteboard-tool"
				class={cn('size-8', className)}
			>
				{@render children()}
				<span class="sr-only">{label}</span>
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content class="flex items-center gap-2">
		{label}
		{#if shortcut}
			<Kbd>{shortcut}</Kbd>
		{/if}
	</Tooltip.Content>
</Tooltip.Root>
