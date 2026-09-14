<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type EditorJS from '@editorjs/editorjs';
	import { recordTerms, type RecordKind } from '$lib/crm/records';
	import type { DocumentBody } from '$lib/crm/documents';
	import { DOCUMENT_BODY_VERSION } from '$lib/crm/documents';
	import type { TermsMap } from '$lib/features/terms';
	import {
		caretIn,
		createMentionTool,
		insertMention,
		mentionQueryAt,
		type CaretPosition,
		type MentionQuery
	} from '$lib/editor/mentions';
	import { cn } from '$lib/utils.js';

	/**
	 * The page's body, as a block editor.
	 *
	 * Browser-only by construction: Editor.js touches `document` at
	 * construction time, so it is imported dynamically inside the attachment
	 * and nothing about it exists during SSR. The server renders the page's frame
	 * and the editor arrives with hydration, which is why this component has a
	 * placeholder rather than a spinner — an empty page that fills in reads
	 * better than a page that announces it is loading.
	 *
	 * **The page owns the data.** This component never saves: it hands a body
	 * back through `onchange` and the page decides what that means (it fills a
	 * hidden form and submits it — the calendar's drag-to-move road). That is
	 * what keeps the one write path in the form action rather than in here.
	 */

	type Props = {
		/** The body to open with. Read once, at mount: after that the editor owns it. */
		body: DocumentBody;
		/** The words for every kind, so the mention menu says "Patient", not "Contact". */
		terms: TermsMap | undefined;
		readonly?: boolean;
		/** Called after every change, with the whole body. */
		onchange: (body: DocumentBody) => void;
	};

	let { body, terms, readonly = false, onchange }: Props = $props();

	let holder: HTMLDivElement | null = null;
	let editor: EditorJS | null = null;
	let ready = $state(false);

	// --- the @ menu -------------------------------------------------------
	type Hit = { kind: RecordKind; id: string; label: string };

	let menuOpen = $state(false);
	let hits = $state<Hit[]>([]);
	let active = $state(0);
	let searching = $state(false);
	let anchorRect = $state<{ top: number; left: number } | null>(null);
	let found: MentionQuery | null = null;
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let searchToken = 0;

	/** A kind's word as the org's industry says it — never a constant here. */
	function kindLabel(kind: RecordKind): string {
		try {
			return recordTerms(terms, kind).noun;
		} catch {
			// A kind whose feature is not on screen has no word; the endpoint
			// already refuses to return one, so this is belt and braces.
			return '';
		}
	}

	function closeMenu() {
		menuOpen = false;
		hits = [];
		active = 0;
		found = null;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = null;
	}

	async function search(query: string) {
		const token = ++searchToken;
		searching = true;
		try {
			const response = await fetch(`/api/records/search?q=${encodeURIComponent(query)}`);
			if (!response.ok) throw new Error('search failed');
			const payload: { results?: Hit[] } = await response.json();
			// A stale response must never overwrite a newer one: the typist has
			// moved on, and a menu that flickers back to an older query is worse
			// than one that waits.
			if (token !== searchToken) return;
			hits = payload.results ?? [];
			active = 0;
		} catch {
			if (token === searchToken) hits = [];
		} finally {
			if (token === searchToken) searching = false;
		}
	}

	/** Where the caret is on screen, for the menu to sit under. */
	function caretRect(): { top: number; left: number } | null {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return null;
		const rect = selection.getRangeAt(0).getBoundingClientRect();
		if (rect.top === 0 && rect.left === 0) return null;
		return { top: rect.bottom + 6, left: rect.left };
	}

	function trackCaret() {
		if (readonly || !holder) return;
		const caret = caretIn(holder);
		if (!caret) return closeMenu();

		const query = mentionQueryAt(caret.node.textContent ?? '', caret.offset);
		if (!query) return closeMenu();

		found = query;
		menuOpen = true;
		anchorRect = caretRect();

		if (searchTimer) clearTimeout(searchTimer);
		if (query.query.length < 2) {
			hits = [];
			searching = false;
			return;
		}
		// Debounced, so a word typed quickly is one request rather than six.
		searchTimer = setTimeout(() => search(query.query), 150);
	}

	function pick(hit: Hit) {
		if (!holder || !found) return;
		const caret: CaretPosition | null = caretIn(holder);
		// The query is recomputed against the live caret rather than trusting
		// the one captured when the menu opened: the typist has been typing.
		const live = caret ? mentionQueryAt(caret.node.textContent ?? '', caret.offset) : null;
		if (!caret || !live) return closeMenu();

		insertMention(caret, live, { kind: hit.kind, id: hit.id }, hit.label);
		closeMenu();
		save();
	}

	function onkeydown(event: KeyboardEvent) {
		if (!menuOpen) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			closeMenu();
			return;
		}
		if (hits.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = (active + 1) % hits.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = (active - 1 + hits.length) % hits.length;
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			const hit = hits[active];
			if (!hit) return;
			event.preventDefault();
			// Stop Editor.js turning the Enter into a new block.
			event.stopPropagation();
			pick(hit);
		}
	}

	// --- saving -----------------------------------------------------------
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	/** Hands the whole body up. Debounced the way the note editor's autosave is. */
	function save() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			if (!editor) return;
			const output = await editor.save();
			onchange({ version: DOCUMENT_BODY_VERSION, blocks: output.blocks });
		}, 400);
	}

	/**
	 * Editor.js, for as long as the div is on the page.
	 *
	 * An attachment rather than `onMount` + `bind:this`, which is how every
	 * other library-backed component here is mounted (the map, the whiteboard,
	 * the graph): the node arrives as an argument and the teardown is the
	 * return value, so the editor cannot outlive the element it drew into.
	 */
	const editorAttachment: Attachment<HTMLDivElement> = (node) => {
		let disposed = false;
		holder = node;

		const boot = async () => {
			const [
				{ default: EditorConstructor },
				{ default: Header },
				{ default: List },
				{ default: Quote },
				{ default: Code },
				{ default: Delimiter },
				{ default: ImageTool },
				{ default: InlineCode }
			] = await Promise.all([
				import('@editorjs/editorjs'),
				import('@editorjs/header'),
				import('@editorjs/list'),
				import('@editorjs/quote'),
				import('@editorjs/code'),
				import('@editorjs/delimiter'),
				import('@editorjs/image'),
				import('@editorjs/inline-code')
			]);
			if (disposed) return;

			const instance = new EditorConstructor({
				holder: node,
				readOnly: readonly,
				autofocus: false,
				placeholder: 'Write something, or type @ to link a record',
				// `blocks` only: the stored envelope is ours, and `time`/`version`
				// are the library's business rather than the column's.
				data: { blocks: body.blocks },
				tools: {
					header: { class: Header, inlineToolbar: true },
					list: { class: List, inlineToolbar: true },
					quote: { class: Quote, inlineToolbar: true },
					code: { class: Code },
					delimiter: { class: Delimiter },
					// Pictures go to the org's own private bucket, and the body
					// keeps the app-relative URL that serves them back — never a
					// storage URL, which would expire, and never a data URI, which
					// would put a photograph inside the row.
					image: {
						class: ImageTool,
						config: {
							endpoints: { byFile: '/api/documents/images', byUrl: '' },
							field: 'image',
							types: 'image/png, image/jpeg, image/gif, image/webp',
							captionPlaceholder: 'Caption'
						}
					},
					inlineCode: { class: InlineCode },
					// Registered as an inline tool so its `sanitize` config is
					// what keeps a mention anchor alive through `save()`. Without
					// this the links look right and the index comes back empty.
					mention: { class: createMentionTool(() => trackCaret()) }
				},
				onChange: () => save()
			});

			await instance.isReady;
			if (disposed) {
				instance.destroy();
				return;
			}
			editor = instance;
			ready = true;
		};

		void boot();

		return () => {
			disposed = true;
			if (saveTimer) clearTimeout(saveTimer);
			if (searchTimer) clearTimeout(searchTimer);
			editor?.destroy();
			editor = null;
			holder = null;
		};
	};
</script>

<svelte:window onscroll={() => menuOpen && closeMenu()} />

<div class="relative">
	<div
		class={cn('document-editor min-h-64', !ready && 'opacity-0')}
		{@attach editorAttachment}
		onkeyup={trackCaret}
		{onkeydown}
		onclick={closeMenu}
		onblurcapture={() => setTimeout(closeMenu, 120)}
		role="textbox"
		tabindex="-1"
		aria-multiline="true"
		aria-label="Page body"
	></div>

	{#if !ready}
		<p class="text-muted-foreground absolute inset-x-0 top-0 text-sm">Opening…</p>
	{/if}
</div>

{#if menuOpen && anchorRect}
	<div
		class="bg-popover text-popover-foreground fixed z-50 w-72 overflow-hidden rounded-md border shadow-md"
		style="top: {anchorRect.top}px; left: {anchorRect.left}px"
		role="listbox"
		aria-label="Records"
		tabindex="-1"
	>
		{#if searching && hits.length === 0}
			<p class="text-muted-foreground px-3 py-2 text-sm">Searching…</p>
		{:else if hits.length === 0}
			<p class="text-muted-foreground px-3 py-2 text-sm">Keep typing to find a record to link.</p>
		{:else}
			<ul class="max-h-64 overflow-y-auto py-1">
				{#each hits as hit, index (hit.kind + hit.id)}
					{@const word = kindLabel(hit.kind)}
					<li>
						<button
							type="button"
							role="option"
							aria-selected={index === active}
							class={cn(
								'flex w-full items-baseline gap-2 px-3 py-1.5 text-start text-sm',
								index === active && 'bg-accent text-accent-foreground'
							)}
							onmousedown={(event) => {
								// `mousedown`, not `click`: the editor's blur would
								// close the menu before a click ever landed.
								event.preventDefault();
								pick(hit);
							}}
							onmouseenter={() => (active = index)}
						>
							<span class="truncate">{hit.label}</span>
							{#if word}
								<span class="text-muted-foreground ms-auto shrink-0 text-xs">{word}</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<style>
	/*
	 * Editor.js renders into a div of its own, so its content is outside this
	 * component's scope — hence `:global`. Everything here paints from the
	 * app's own tokens (src/app.css), so the editor follows the light/dark
	 * toggle with no extra wiring, the rule every `enhanced/` primitive follows.
	 */
	.document-editor :global(.ce-block__content),
	.document-editor :global(.ce-toolbar__content) {
		max-width: none;
	}

	.document-editor :global(.ce-paragraph),
	.document-editor :global(.cdx-block) {
		line-height: 1.7;
	}

	.document-editor :global(.ce-header) {
		font-weight: 600;
		line-height: 1.3;
	}

	.document-editor :global(.codex-editor__redactor) {
		padding-bottom: 8rem !important;
	}

	/* The popover chrome Editor.js draws for its own toolbars. */
	.document-editor :global(.ce-popover),
	.document-editor :global(.ce-inline-toolbar),
	.document-editor :global(.ce-conversion-toolbar) {
		background: var(--popover);
		color: var(--popover-foreground);
		border-color: var(--border);
	}

	.document-editor :global(.ce-popover-item__title),
	.document-editor :global(.ce-inline-tool) {
		color: var(--popover-foreground);
	}

	.document-editor :global(.ce-popover-item:hover),
	.document-editor :global(.ce-inline-tool:hover) {
		background: var(--accent);
	}

	/* A mention reads as a thing, not a sentence — the rail's chip rule. */
	.document-editor :global(a.doc-mention) {
		background: var(--accent);
		color: var(--accent-foreground);
		border-radius: calc(var(--radius) - 2px);
		padding: 0.05em 0.3em;
		font-weight: 500;
		white-space: nowrap;
		cursor: default;
	}

	.document-editor :global(a.doc-mention)::before {
		content: '@';
		opacity: 0.6;
	}
</style>
