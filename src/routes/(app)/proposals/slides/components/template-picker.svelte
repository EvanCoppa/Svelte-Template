<script lang="ts">
	import { type ShownSlide, expandDeck } from '$lib/slides/present';
	import { type SlideTemplate, TEMPLATES, defaultContent } from '$lib/slides/registry';
	import type { Presentation } from '$lib/slides/types';
	import SlideFrame from '$lib/slides/frame.svelte';

	/** Every template as a thumbnail on its defaults; a click previews it before it is added. */
	let { presentation, onpick }: { presentation: Presentation; onpick: (id: string) => void } =
		$props();

	function preview(template: SlideTemplate): ShownSlide | null {
		const deck = {
			version: 1,
			slides: [
				{ id: `pick-${template.id}`, templateId: template.id, content: defaultContent(template) }
			]
		};
		return expandDeck(deck, presentation)[0] ?? null;
	}
</script>

<div class="grid grid-cols-1 gap-3 p-4">
	{#each TEMPLATES as template (template.id)}
		{@const shown = preview(template)}
		{#if shown}
			<button
				type="button"
				class="group flex flex-col gap-2 rounded-2xl text-left"
				onclick={() => onpick(template.id)}
			>
				<div
					class="overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow transition-transform group-hover:scale-[1.02] dark:border-gray-800 dark:bg-gray-900"
				>
					<SlideFrame {shown} {presentation} />
				</div>
				<div class="px-1">
					<p class="text-sm font-medium text-gray-800 dark:text-gray-200">{template.title}</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">{template.description}</p>
				</div>
			</button>
		{/if}
	{/each}
</div>
