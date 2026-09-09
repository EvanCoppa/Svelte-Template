<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

	/** Where the placeholder blocks sit, per column: a plausible week, so the swap to the real grid is quiet. */
	const COLUMNS: { top: number; height: number }[][] = [
		[{ top: 18, height: 10 }],
		[
			{ top: 24, height: 14 },
			{ top: 52, height: 8 }
		],
		[{ top: 30, height: 12 }],
		[{ top: 20, height: 18 }],
		[{ top: 40, height: 10 }],
		[{ top: 26, height: 8 }],
		[]
	];
</script>

<!--
	What the server renders in the grid's place. A calendar is a wall-clock
	instrument and the server does not know the viewer's clock, so the real
	grid is drawn once the browser is in charge; this holds its height until
	then, in the same proportions, so nothing jumps.
-->
<div
	bind:this={ref}
	data-slot="calendar-placeholder"
	aria-hidden="true"
	class={cn('flex min-h-0 flex-1 flex-col', className)}
	{...restProps}
>
	<div class="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b">
		<div></div>
		{#each COLUMNS.keys() as i (i)}
			<div class="flex flex-col items-center gap-1.5 py-2">
				<Skeleton class="h-2.5 w-7" />
				<Skeleton class="size-7 rounded-full" />
			</div>
		{/each}
	</div>
	<div class="relative grid min-h-0 flex-1 grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
		{#each COLUMNS as blocks, i (i)}
			<div class={cn('relative border-l', i === 0 && 'col-start-2')}>
				{#each blocks as block (block.top)}
					<Skeleton
						class="absolute inset-x-1.5 rounded-lg opacity-70"
						style="top: {block.top}%; height: {block.height}%"
					/>
				{/each}
			</div>
		{/each}
	</div>
</div>
