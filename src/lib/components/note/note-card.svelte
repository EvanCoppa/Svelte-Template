<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
	import { noteSurface } from '$lib/notes';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		color,
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { color: BadgeTone } = $props();
</script>

<!--
	The paper a note is written on, in whichever of the app's ten tones the note
	carries. Structural: the page composes the editor, the palette and whatever
	actions that surface offers inside it.
-->
<div
	bind:this={ref}
	data-slot="note-card"
	data-color={color}
	class={cn(
		'flex min-h-0 flex-col gap-2 rounded-xl border p-3 shadow-sm',
		noteSurface(color),
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
