<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { checklistItem, toggleChecklistItem } from '$lib/editor/checklist';
	import { computeNote } from '$lib/editor/compute';
	import { AUTOSAVE_DELAY, type NotePatch } from '$lib/notes';
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
	 *
	 * A note is also paper you can do arithmetic on (docs/antinote-in-notes.md).
	 * `computeNote()` answers every line and the answers are drawn in a layer
	 * behind the textarea — **never written into the body**, which is what keeps
	 * `noteLabel()`, `noteMatches()` and the Markdown export reading the text
	 * somebody actually typed. The one exception is ticking a checklist box,
	 * which rewrites a single character.
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
		/** How much room the body gets on this surface. Sits on the wrapper. */
		bodyClass?: string;
		onsave: (patch: NotePatch) => void;
	} = $props();

	let title = $state(note.title ?? '');
	let body = $state(note.body);
	let bodyRef = $state<HTMLElement | null>(null);
	/** The overlay is a separate box, so it has to be scrolled by hand. */
	let scrollTop = $state(0);
	/**
	 * The field's content width, measured rather than assumed. `inset-0` would
	 * make the overlay a scrollbar wider than the text it is shadowing, and a
	 * long line would then wrap in one box and not the other — which shows up
	 * as answers drifting down the note.
	 */
	let fieldWidth = $state(0);

	const lines = $derived(body.split('\n'));
	// One entry per line, in step with `lines` — `computeNote` splits the same way.
	const results = $derived(computeNote(body));
	// Most notes are prose. Those pay nothing: no overlay is rendered at all.
	const hasAnswers = $derived(results.some(Boolean));

	$effect(() => {
		const field = bodyRef;
		if (!field) return;
		const observer = new ResizeObserver(() => (fieldWidth = field.clientWidth));
		observer.observe(field);
		return () => observer.disconnect();
	});

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

	/**
	 * Clicking the `- [ ]` at the head of a checklist line ticks it.
	 *
	 * The caret is the hit test: the browser has already worked out which
	 * character was clicked, so there is no geometry to redo and it lands on
	 * the right line however the text wrapped. A click anywhere else on the
	 * line just places the caret, and the box stays editable as text — which
	 * is the keyboard path, since the body is plain text all the way down.
	 */
	async function toggleChecklist(event: MouseEvent & { currentTarget: HTMLTextAreaElement }) {
		const field = event.currentTarget;
		const caret = field.selectionStart;
		if (caret === null || caret !== field.selectionEnd) return;

		const start = body.lastIndexOf('\n', caret - 1) + 1;
		const index = body.slice(0, start).split('\n').length - 1;
		const line = lines[index];
		if (line === undefined || !checklistItem(line)) return;

		// The marker itself is the target: from the bullet through the bracket.
		const from = line.search(/[-*]/);
		const to = line.indexOf(']');
		const column = caret - start;
		if (column < from || column > to + 1) return;

		const next = toggleChecklistItem(body, index);
		if (next === body) return;

		body = next;
		queue({ body });
		// Setting the value moves the caret to the end; one character changed,
		// so where it was is still where it belongs.
		await tick();
		field.setSelectionRange(caret, caret);
	}
</script>

{#snippet answers(transparent: boolean)}
	{#each lines as line, index (index)}
		<!-- `break-words` is not cosmetic: a textarea breaks a long unbroken word
		     and a plain div does not, so without it one URL pushes every answer
		     below it up by a row. -->
		<div class="relative break-words whitespace-pre-wrap">
			<!-- Only there to take up exactly the room the real line takes up, so
			     the answer lands beside it however the text wrapped. The zero-width
			     space keeps a blank line one row tall. -->
			<span
				class={transparent ? 'text-transparent' : undefined}
				aria-hidden={transparent || undefined}>{line}&ZeroWidthSpace;</span
			>
			{#if results[index]}
				<span class="absolute right-0 bottom-0 pl-3 tabular-nums opacity-55">
					<span class="sr-only">equals </span>{results[index].text}
				</span>
			{/if}
		</div>
	{/each}
{/snippet}

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
		class="h-auto border-0 bg-transparent px-0 py-0 text-sm font-semibold shadow-none placeholder:font-normal placeholder:opacity-55 focus-visible:ring-0 dark:bg-transparent"
	/>
	<div class={cn('relative min-h-0', bodyClass)}>
		{#if hasAnswers}
			<div
				class="pointer-events-none absolute inset-y-0 left-0 overflow-hidden text-sm leading-relaxed"
				style:width="{fieldWidth}px"
			>
				<div style:transform="translateY({-scrollTop}px)">
					{@render answers(true)}
				</div>
			</div>
		{/if}
		<Textarea
			bind:ref={bodyRef}
			value={body}
			oninput={(event) => {
				body = event.currentTarget.value;
				queue({ body });
			}}
			onclick={toggleChecklist}
			onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
			onblur={flush}
			maxlength={NOTE_BODY_MAX}
			placeholder="Write it down…"
			aria-label="Note"
			class="relative field-sizing-fixed h-full min-h-0 w-full resize-none border-0 bg-transparent px-0 py-0 text-sm leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
		/>
	</div>
{:else}
	<!-- Only a real title gets a line of its own: an untitled note is named by
	     its first line (`noteLabel`), and printing that above the body would
	     say the same words twice. -->
	{#if note.title?.trim()}
		<p class="text-sm font-semibold">{note.title}</p>
	{/if}
	{#if hasAnswers}
		<div class={cn('overflow-y-auto text-sm leading-relaxed', bodyClass)}>
			{@render answers(false)}
		</div>
	{:else}
		<p class={cn('overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap', bodyClass)}>
			{note.body}
		</p>
	{/if}
{/if}
