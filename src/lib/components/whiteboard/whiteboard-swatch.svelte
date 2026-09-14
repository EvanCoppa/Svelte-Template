<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import { INK_TOKENS, type Ink } from '$lib/whiteboard/scene';

	/**
	 * One ink on the palette. The dot is painted from the ink's own `app.css`
	 * token — the same one the canvas draws it in — so the palette and the
	 * board can never disagree about what a colour is, in either theme.
	 */
	let {
		ink,
		label,
		active = false,
		onclick
	}: {
		ink: Ink;
		/** The ink's name, read out — the dot itself says nothing. */
		label: string;
		active?: boolean;
		onclick: () => void;
	} = $props();
</script>

<Button
	{onclick}
	variant="ghost"
	size="icon"
	aria-pressed={active}
	data-slot="whiteboard-swatch"
	class={cn('size-8 rounded-full', active && 'ring-ring ring-2')}
>
	<span
		class="border-border size-4 rounded-full border"
		style:background-color="var({INK_TOKENS[ink]})"
	></span>
	<span class="sr-only">{label}</span>
</Button>
