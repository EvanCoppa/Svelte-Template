<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { AUTOSAVE_DELAY, noteLabel, type NotePatch } from '$lib/notes';
	import { NOTE_BODY_MAX, NOTE_TITLE_MAX } from '$lib/schemas/notes';
	import type { Note } from '$lib/server/crm/notes';
	import { cn } from '$lib/utils.js';

	/**
	 * The note itself: a title line and the body, saving themselves.
	 *
	 * Typing settles into one patch and the patch goes out `AUTOSAVE_DELAY`
	 * after the last keystroke — the behaviour the whole surface is built
	 * around, so it lives here rather than in each screen that shows a note.
	 * The page still owns the write: `onsave` hands it the fields that changed
	 * and it decides what that means (`noteCommands.save`, usually).
	 *
	 * The values are seeded from the note ONCE. A save echoes the row back and
	 * the shell reloads its notes, and re-seeding on that would yank the caret
	 * out of the sentence being typed — so a surface showing a different note
	 * in the same place keys this component on `note.id` and gets a fresh one.
	 */
	let {
		note,
		editable = true,
		autofocus = false,
		bodyClass,
		onsave
	}: {
		note: Note;
		/** False renders the note as text — a reader without `manage` on notes. */
		editable?: boolean;
		/** Put the caret in the body on mount: a note made to be typed into. */
		autofocus?: boolean;
		/** How much room the body gets on this surface. */
		bodyClass?: string;
		onsave: (patch: NotePatch) => void;
	} = $props();

	let title = $state(note.title ?? '');
	let body = $state(note.body);
	let bodyRef = $state<HTMLElement | null>(null);

	// Everything typed since the last save, so editing the title and then the
	// body inside one delay sends both rather than only the last one.
	let pending = $state<NotePatch>({});
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (autofocus) bodyRef?.focus();
	});

	function queue(patch: NotePatch) {
		pending = { ...pending, ...patch };
		clearTimeout(timer);
		timer = setTimeout(flush, AUTOSAVE_DELAY);
	}

	/** Sends whatever is waiting, now — on blur, and when the note closes. */
	function flush() {
		clearTimeout(timer);
		if (Object.keys(pending).length === 0) return;
		const patch = pending;
		pending = {};
		onsave(patch);
	}

	onDestroy(flush);
</script>

{#if editable}
	<Input
		value={title}
		oninput={(event) => {
			title = event.currentTarget.value;
			queue({ title });
		}}
		onblur={flush}
		maxlength={NOTE_TITLE_MAX}
		placeholder="Title"
		aria-label="Note title"
		class="h-auto border-0 bg-transparent px-0 py-0 text-sm font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent"
	/>
	<Textarea
		bind:ref={bodyRef}
		value={body}
		oninput={(event) => {
			body = event.currentTarget.value;
			queue({ body });
		}}
		onblur={flush}
		maxlength={NOTE_BODY_MAX}
		placeholder="Write it down…"
		aria-label="Note"
		class={cn(
			'min-h-0 resize-none border-0 bg-transparent px-0 py-0 text-sm leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent',
			bodyClass
		)}
	/>
{:else}
	<p class="text-sm font-semibold">{noteLabel(note)}</p>
	<p class={cn('overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap', bodyClass)}>
		{note.body}
	</p>
{/if}
