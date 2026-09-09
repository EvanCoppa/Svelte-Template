<script lang="ts">
	import { type ShownSlide, expandDeck } from '$lib/slides/present';
	import type { Presentation, SlideDeck } from '$lib/slides/types';
	import SlideFrame from '$lib/slides/frame.svelte';

	/** The deck as a scrolling stack of slides at reading size; click one to edit it. */
	let {
		deck,
		presentation,
		selectedId,
		onselect
	}: {
		deck: SlideDeck;
		presentation: Presentation;
		selectedId: string | null;
		onselect: (id: string) => void;
	} = $props();

	const rows = $derived(
		deck.slides.flatMap((slide): ShownSlide[] => {
			const shown = expandDeck({ ...deck, slides: [slide] }, presentation)[0];
			return shown ? [shown] : [];
		})
	);
</script>

<div
	class="flex h-full min-h-0 w-full flex-col items-center overflow-y-auto overscroll-y-contain pt-6"
>
	{#if rows.length === 0}
		<div class="flex h-full items-center justify-center">
			<p class="text-lg text-slate-400 dark:text-slate-500">
				No slides yet. Add one to get started.
			</p>
		</div>
	{:else}
		<div class="w-full max-w-4xl space-y-6 px-4 pb-6">
			{#each rows as row (row.slide.id)}
				{@const selected = row.slide.id === selectedId}
				<button
					type="button"
					class="group relative w-full cursor-pointer overflow-hidden rounded-lg border-2 transition-all duration-200 outline-none
						{selected
						? 'border-blue-500 ring-2 ring-blue-500'
						: 'border-slate-300 hover:border-blue-400 dark:border-slate-700'}"
					onclick={() => onselect(row.slide.id)}
				>
					<SlideFrame shown={row} {presentation} />
				</button>
			{/each}
		</div>
	{/if}
</div>
