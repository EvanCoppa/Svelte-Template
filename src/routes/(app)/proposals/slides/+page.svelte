<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { beforeNavigate } from '$app/navigation';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { slideBuilderSchema } from '$lib/schemas/decks';
	import { type SlideTemplate, templateFor } from '$lib/slides/registry';
	import type { SlideContent, SlideInstance } from '$lib/slides/types';
	import Editor from './editor.svelte';
	import Preview from './preview.svelte';
	import SlideList from './slide-list.svelte';
	import TemplatePicker from './template-picker.svelte';
	import TemplatePreviewModal from './template-preview-modal.svelte';

	/**
	 * The slide builder — Yes Smile's three panes on the org's one deck:
	 * slides and templates on the left, the deck at reading size in the
	 * middle, the selected slide's controls on the right. The deck lives in
	 * the form (`$form.deck`) and every edit writes to it, so Save posts
	 * exactly what is on screen and nothing is mirrored into a second state.
	 */
	let { data } = $props();

	const { form, message, submitting, tainted, isTainted, enhance } = superForm(data.form, {
		dataType: 'json',
		validators: zod4Client(slideBuilderSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form: updated }) {
			if (updated.valid && updated.message === 'Saved') toast.success('Slides saved');
		}
	});

	const dirty = $derived(isTainted($tainted));

	let selectedId = $state<string | null>(null);
	let picked = $state<SlideTemplate | null>(null);

	const selected = $derived($form.deck.slides.find((slide) => slide.id === selectedId) ?? null);

	beforeNavigate((navigation) => {
		if (!dirty) return;
		if (navigation.type === 'leave') {
			navigation.cancel();
			return;
		}
		if (!confirm('You have unsaved slide changes. Leave without saving?')) navigation.cancel();
	});

	function addSlide(slide: SlideInstance) {
		$form.deck.slides = [...$form.deck.slides, slide];
		selectedId = slide.id;
		picked = null;
	}

	function deleteSlide(id: string) {
		$form.deck.slides = $form.deck.slides.filter((slide) => slide.id !== id);
		if (selectedId === id) selectedId = $form.deck.slides[0]?.id ?? null;
	}

	function reorder(from: number, to: number) {
		const slides = [...$form.deck.slides];
		const [moved] = slides.splice(from, 1);
		if (moved) slides.splice(to, 0, moved);
		$form.deck.slides = slides;
	}

	function updateSlide(id: string, content: SlideContent) {
		$form.deck.slides = $form.deck.slides.map((slide) =>
			slide.id === id ? { ...slide, content } : slide
		);
	}
</script>

<div class="flex h-[calc(100vh-7.5rem)] min-h-0 flex-col overflow-hidden">
	<form method="POST" action="?/save" use:enhance class="contents">
		<PageHeader.Root>
			<PageHeader.Title />
			<PageHeader.Actions>
				{#if dirty && !$submitting}
					<span class="text-xs font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span
					>
				{/if}
				<Button
					type="submit"
					disabled={$submitting}
					class="bg-blue-600 text-white hover:bg-blue-700"
				>
					{$submitting ? 'Saving…' : 'Save'}
				</Button>
			</PageHeader.Actions>
		</PageHeader.Root>
		{#if $message && $message !== 'Saved'}
			<FormAlert message={$message} />
		{/if}
	</form>

	<main
		class="mt-4 flex min-h-0 flex-1 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
	>
		<section class="h-full w-[275px] shrink-0 overflow-hidden bg-white dark:bg-gray-950">
			<Tabs.Root value="slides" class="flex h-full min-h-0 flex-col gap-0">
				<Tabs.List class="mx-3 mt-2 w-auto shrink-0">
					<Tabs.Trigger value="slides">Slides</Tabs.Trigger>
					<Tabs.Trigger value="templates">Templates</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="slides" class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
					<SlideList
						deck={$form.deck}
						presentation={data.sample}
						{selectedId}
						onselect={(id) => (selectedId = id)}
						ondelete={deleteSlide}
						onreorder={reorder}
					/>
				</Tabs.Content>
				<Tabs.Content value="templates" class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
					<TemplatePicker presentation={data.sample} onpick={(id) => (picked = templateFor(id))} />
				</Tabs.Content>
			</Tabs.Root>
		</section>

		<section class="h-full min-w-0 flex-1 overflow-hidden">
			<Preview
				deck={$form.deck}
				presentation={data.sample}
				{selectedId}
				onselect={(id) => (selectedId = id)}
			/>
		</section>

		<section class="h-full w-[275px] shrink-0 overflow-hidden">
			<Editor slide={selected} onchange={updateSlide} />
		</section>
	</main>
</div>

<TemplatePreviewModal
	template={picked}
	presentation={data.sample}
	onadd={addSlide}
	onclose={() => (picked = null)}
/>
