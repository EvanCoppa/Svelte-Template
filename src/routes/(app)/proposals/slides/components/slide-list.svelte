<script lang="ts">
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button/index.js';
	import { type ShownSlide, expandDeck } from '$lib/slides/present';
	import type { Presentation, SlideDeck } from '$lib/slides/types';
	import SlideFrame from '$lib/slides/frame.svelte';

	/**
	 * The deck in order, one thumbnail per authored slide. Drag a row to
	 * reorder (native HTML drag and drop, as the source did), click to select,
	 * hover for delete.
	 */
	let {
		deck,
		presentation,
		selectedId,
		onselect,
		ondelete,
		onreorder
	}: {
		deck: SlideDeck;
		presentation: Presentation;
		selectedId: string | null;
		onselect: (id: string) => void;
		ondelete: (id: string) => void;
		onreorder: (from: number, to: number) => void;
	} = $props();

	// One thumbnail per authored slide: a per-option slide previews over the
	// sample's first option rather than once per option.
	const rows = $derived(
		deck.slides.flatMap((slide): ShownSlide[] => {
			const shown = expandDeck({ ...deck, slides: [slide] }, presentation)[0];
			return shown ? [shown] : [];
		})
	);

	let dragIndex = $state<number | null>(null);
	let overIndex = $state<number | null>(null);

	function drop(index: number) {
		if (dragIndex !== null && dragIndex !== index) onreorder(dragIndex, index);
		dragIndex = null;
		overIndex = null;
	}
</script>

<div class="flex flex-col gap-1.5 p-3">
	{#each rows as row, i (row.slide.id)}
		{@const selected = row.slide.id === selectedId}
		<div
			role="button"
			tabindex="0"
			draggable="true"
			class="group w-full cursor-pointer rounded-lg border text-left transition-all
				{selected
				? 'border-blue-200 bg-blue-50 shadow-sm dark:border-blue-900 dark:bg-blue-950/40'
				: 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700'}
				{dragIndex === i ? 'opacity-40' : ''}
				{overIndex === i && dragIndex !== i ? 'ring-2 ring-blue-400 ring-offset-1' : ''}"
			onclick={() => onselect(row.slide.id)}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					onselect(row.slide.id);
				}
			}}
			ondragstart={(event) => {
				dragIndex = i;
				if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
			}}
			ondragover={(event) => {
				event.preventDefault();
				if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
				overIndex = i;
			}}
			ondrop={(event) => {
				event.preventDefault();
				drop(i);
			}}
			ondragend={() => {
				dragIndex = null;
				overIndex = null;
			}}
		>
			<div class="flex items-center gap-2 px-2.5 py-2">
				<span
					class="shrink-0 cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing dark:text-gray-500 dark:hover:text-gray-300"
				>
					<GripVerticalIcon class="size-4" />
				</span>
				<span class="w-5 shrink-0 text-xs font-medium text-gray-400 dark:text-gray-500">
					{i + 1}
				</span>
				<div class="min-w-0 flex-1">
					<p
						class="truncate text-sm font-medium {selected
							? 'text-blue-900 dark:text-blue-200'
							: 'text-gray-800 dark:text-gray-200'}"
					>
						{row.template.title}
					</p>
					{#if row.slide.content.text.heading}
						<p
							class="truncate text-xs {selected
								? 'text-blue-600 dark:text-blue-300'
								: 'text-gray-500 dark:text-gray-400'}"
						>
							{row.slide.content.text.heading}
						</p>
					{/if}
				</div>
				<Button
					variant="ghost"
					size="icon"
					class="size-6 shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
					aria-label="Delete slide"
					onclick={(event) => {
						event.stopPropagation();
						ondelete(row.slide.id);
					}}
				>
					<Trash2Icon class="size-3.5" />
				</Button>
			</div>
			<div
				class="mx-2 mb-2 overflow-hidden rounded border {selected
					? 'border-blue-200 dark:border-blue-900'
					: 'border-gray-100 dark:border-gray-800'}"
			>
				<SlideFrame shown={row} {presentation} />
			</div>
		</div>
	{:else}
		<p class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
			No slides yet. Add one from Templates.
		</p>
	{/each}
</div>
