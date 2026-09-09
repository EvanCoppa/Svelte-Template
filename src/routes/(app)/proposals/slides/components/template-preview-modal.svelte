<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { expandDeck } from '$lib/slides/present';
	import { type SlideTemplate, defaultContent } from '$lib/slides/registry';
	import type { Presentation, SlideContent, SlideInstance } from '$lib/slides/types';
	import Editor from './editor.svelte';
	import SlideFrame from '$lib/slides/frame.svelte';

	/**
	 * A template at full size before it joins the deck, with the same editor
	 * beside it: customise, then add it exactly as shown. A bare `ui/dialog`
	 * rather than `Modal` because this frame is the whole viewport, not a card
	 * on a tray. The draft is thrown away on close.
	 */
	let {
		template,
		presentation,
		onadd,
		onclose
	}: {
		template: SlideTemplate | null;
		presentation: Presentation;
		onadd: (slide: SlideInstance) => void;
		onclose: () => void;
	} = $props();

	// A fresh draft each time a template is opened; edits overwrite it until
	// the next template comes along.
	let draft = $derived<SlideInstance | null>(
		template
			? { id: crypto.randomUUID(), templateId: template.id, content: defaultContent(template) }
			: null
	);

	const shown = $derived(
		draft ? (expandDeck({ version: 1, slides: [draft] }, presentation)[0] ?? null) : null
	);

	function update(_id: string, content: SlideContent) {
		if (draft) draft = { ...draft, content };
	}
</script>

<Dialog.Root open={template !== null} onOpenChange={(open) => !open && onclose()}>
	<Dialog.Content
		class="flex h-[92vh] max-w-[1500px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1500px,calc(100%-2rem))]"
		showCloseButton={false}
	>
		{#if template && draft && shown}
			<div
				class="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800"
			>
				<div class="flex items-center gap-2">
					<Dialog.Title class="text-base font-semibold text-neutral-800 dark:text-neutral-100">
						{template.title}
					</Dialog.Title>
					<span
						class="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
					>
						Preview
					</span>
				</div>
				<div class="flex items-center gap-2">
					<Button
						class="bg-blue-600 text-white hover:bg-blue-700"
						onclick={() => draft && onadd(draft)}
					>
						<PlusIcon />
						Add to slideshow
					</Button>
					<Button variant="ghost" onclick={onclose}>Cancel</Button>
				</div>
			</div>
			<Dialog.Description class="sr-only">
				Customise the slide, then add it to the deck exactly as shown.
			</Dialog.Description>
			<div class="flex min-h-0 flex-1">
				<div
					class="flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-neutral-100 p-6 dark:bg-neutral-900"
				>
					<div class="w-full max-w-[1200px] overflow-hidden rounded-lg shadow-lg">
						<SlideFrame {shown} {presentation} />
					</div>
				</div>
				<aside
					class="flex h-full w-[275px] shrink-0 flex-col border-l border-neutral-200 dark:border-neutral-800"
				>
					<div class="shrink-0 border-b border-neutral-100 px-3 py-2.5 dark:border-neutral-800">
						<p class="text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">
							Customize
						</p>
						<p class="text-[11px] text-neutral-400 dark:text-neutral-500">
							Edit, then add it exactly as you see it.
						</p>
					</div>
					<div class="min-h-0 flex-1 overflow-hidden">
						<Editor slide={draft} onchange={update} />
					</div>
				</aside>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
