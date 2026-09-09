<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import StickyNoteIcon from '@lucide/svelte/icons/sticky-note';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { breadcrumbs } from '$lib/breadcrumbs.svelte';
	import * as Note from '$lib/components/note/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Kbd } from '$lib/components/ui/kbd/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { motionTransition, springs } from '$lib/motion';
	import {
		canArchiveNote,
		canEditNote,
		canRemoveNote,
		noteDash,
		noteExcerpt,
		noteLabel,
		noteSurface
	} from '$lib/notes';
	import { noteCommands } from '$lib/notes-api';
	import { cn } from '$lib/utils.js';

	/**
	 * The note dock: every note in the org, docked to the edge of the screen.
	 *
	 * Four states, the way a stack of stickies on the edge of a desk has
	 * four: at rest it is one colored dash per note, a few pixels wide;
	 * pointing at it fans the notes out as tabs sticking out of the edge, each
	 * one its own paper with its label written up the spine; pointing at a tab
	 * pulls it out far enough to read the start of it; and picking one opens
	 * it full size, editing in place and saving itself. `⌥⌘L` leaves all of
	 * that for `/notes`, which is the same notes with room to search them.
	 *
	 * Mounted once by the `(app)` layout, like the ⌘K palette and the upgrade
	 * prompt, and fed by the layout's load — so it is on every screen without
	 * any screen knowing about it. That is also why writing goes through
	 * `/api/notes` (see `$lib/notes`): the dock has no page action to post to.
	 */

	// Null when this org has no notes feature, or this user cannot read it:
	// the layout ships nothing and the dock is not on the page at all.
	let deck = $derived(page.data.noteDock ?? null);
	// The reader's own `notes.dock` preference. False draws no rail while the
	// component stays mounted, so the shortcut below still opens every note —
	// the preference hides chrome, not the feature (docs/user-preferences.md).
	let docked = $derived(deck?.docked ?? false);
	let notes = $derived(deck?.open ?? []);

	let fanned = $state(false);
	// The tab the pointer (or focus) is on: it slides out to show a preview.
	let previewId = $state<string | null>(null);
	let openedId = $state<string | null>(null);
	// Deriving the open note from the list rather than holding a copy is what
	// makes archiving or deleting it fall back to the fan with no extra wiring.
	let opened = $derived(notes.find((note) => note.id === openedId) ?? null);

	async function addNote() {
		const note = await noteCommands.create();
		if (!note) return;
		fanned = true;
		openedId = note.id;
	}

	function open(id: string) {
		previewId = null;
		openedId = id;
	}

	function collapse() {
		openedId = null;
		previewId = null;
		fanned = false;
	}

	function openAll() {
		// A shell surface jumps rather than goes deeper, so the trail starts
		// over here — see $lib/breadcrumbs.svelte.
		breadcrumbs.startAt('/notes');
	}

	function handleKeydown(event: KeyboardEvent) {
		// The window listener is outside the dock's own markup, so it checks
		// what the dock checks: no feature, no shortcut — never a jump to a
		// page the gate would refuse.
		if (!deck) return;
		// The app's "open every note in one window". `code` rather than `key`:
		// Alt rewrites the character on a Mac keyboard.
		if ((event.metaKey || event.ctrlKey) && event.altKey && event.code === 'KeyL') {
			event.preventDefault();
			openAll();
			goto('/notes');
			return;
		}
		if (event.key === 'Escape' && fanned) {
			// One step at a time: the open note closes back to the fan, the fan
			// closes back to the rail.
			if (openedId) openedId = null;
			else fanned = false;
		}
	}

	/** Leaving with a note open would close it mid-sentence; only the fan follows the pointer. */
	function handlePointerLeave() {
		previewId = null;
		if (!openedId) fanned = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if deck && docked}
	<aside
		aria-label="Notes"
		class="fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 md:block"
		onpointerenter={() => (fanned = true)}
		onpointerleave={handlePointerLeave}
	>
		{#if !fanned}
			<button
				type="button"
				onclick={() => (fanned = true)}
				aria-label={notes.length === 1 ? '1 note' : `${notes.length} notes`}
				class="border-border/60 bg-background/80 hover:bg-background focus-visible:ring-ring flex max-h-[70vh] flex-col items-center gap-1 overflow-hidden rounded-l-lg border border-r-0 py-2.5 pr-1 pl-1.5 shadow-sm outline-none focus-visible:ring-2"
			>
				{#each notes as note (note.id)}
					<span
						data-slot="note-dash"
						class={cn('h-5 w-1.5 shrink-0 rounded-full', noteDash(note.color))}
					></span>
				{/each}
				{#if notes.length === 0}
					<StickyNoteIcon class="text-muted-foreground size-4" />
				{/if}
			</button>
		{:else}
			<div
				in:motionTransition={{
					keyframes: { opacity: [0, 1], x: [24, 0] },
					transition: springs.snap,
					reduced: { keyframes: { opacity: [0, 1] } }
				}}
				class={cn(
					'w-80',
					opened &&
						'border-border/60 bg-background/95 rounded-l-xl border border-r-0 p-2 shadow-lg backdrop-blur'
				)}
			>
				{#if opened}
					{@const note = opened}
					<div class="mb-1 flex items-center justify-between">
						<Button variant="ghost" size="sm" class="h-7 px-2" onclick={() => (openedId = null)}>
							<ChevronLeftIcon class="size-4" />
							All notes
						</Button>
						<Button variant="ghost" size="icon" class="size-7" onclick={collapse}>
							<XIcon class="size-4" />
							<span class="sr-only">Close</span>
						</Button>
					</div>
					<!-- Keyed so opening a different note builds a fresh editor: the
					     values are seeded once, and a save echoing back must never
					     rewrite what is being typed. -->
					{#key note.id}
						<Note.Card color={note.color} class="h-80">
							<Note.Editor
								{note}
								editable={canEditNote(note, deck)}
								autofocus
								bodyClass="flex-1 field-sizing-fixed"
								onsave={(patch) => noteCommands.save(note.id, patch)}
							/>
							<!-- The grant writes notes; RLS narrows that to the note's own
							     author, or an owner/admin. Both, so a control is only here
							     when the save behind it would land. -->
							{#if canArchiveNote(note, deck)}
								<Note.Actions>
									<Note.Palette
										value={note.color}
										onpick={(color) => noteCommands.save(note.id, { color })}
									/>
									<Button
										variant="ghost"
										size="icon"
										class="size-7"
										title="Archive"
										onclick={() => noteCommands.archive(note.id, true)}
									>
										<ArchiveIcon class="size-4" />
										<span class="sr-only">Archive note</span>
									</Button>
									{#if canRemoveNote(note, deck)}
										<Button
											variant="ghost"
											size="icon"
											class="size-7"
											title="Delete"
											onclick={() => noteCommands.remove(note.id)}
										>
											<Trash2Icon class="size-4" />
											<span class="sr-only">Delete note</span>
										</Button>
									{/if}
								</Note.Actions>
							{/if}
						</Note.Card>
					{/key}
				{:else}
					<!-- The notes as tabs: each one its own paper, sticking out of the
					     edge with its label written up the spine. The one under the
					     pointer slides out to show how it starts; a click pulls it
					     out the rest of the way. -->
					<ul
						class="flex max-h-[70vh] flex-col items-end gap-1.5 overflow-x-hidden overflow-y-auto py-1"
					>
						{#each notes as note (note.id)}
							{@const previewing = previewId === note.id}
							{@const excerpt = noteExcerpt(note)}
							<li class="relative shrink-0">
								<button
									type="button"
									data-slot="note-tab"
									data-state={previewing ? 'open' : 'closed'}
									aria-label={noteLabel(note)}
									onpointerenter={() => (previewId = note.id)}
									onfocus={() => (previewId = note.id)}
									onclick={() => open(note.id)}
									class={cn(
										'focus-visible:ring-ring flex min-h-24 items-stretch overflow-hidden rounded-l-xl border border-r-0 text-left shadow-sm transition-[width] duration-300 ease-out outline-none focus-visible:ring-2 motion-reduce:transition-none',
										previewing ? 'w-80' : 'w-11',
										noteSurface(note.color)
									)}
								>
									<!-- The spine: the label written up it, and the dashed fold
									     where the paper disappears into the edge. The tab is as
									     tall as its label, so a long name makes a longer tab. -->
									<span
										class="flex w-10 shrink-0 items-center justify-center border-r border-dashed border-current/25 py-3"
									>
										<span
											class="max-h-28 rotate-180 truncate text-[10px] font-semibold tracking-[0.18em] uppercase [writing-mode:vertical-rl]"
										>
											{noteLabel(note)}
										</span>
									</span>
									<!-- Out of the flow while folded, so the tab's height is
									     the spine's; in the flow once pulled out, so the paper
									     grows to fit what it says. -->
									<span
										aria-hidden="true"
										class={cn(
											'flex w-70 shrink-0 flex-col gap-1 p-3 transition-opacity duration-200 ease-out motion-reduce:transition-none',
											previewing ? 'opacity-100 delay-100' : 'invisible absolute opacity-0'
										)}
									>
										<span class="truncate text-sm font-semibold">{noteLabel(note)}</span>
										{#if excerpt}
											<span class="line-clamp-5 text-sm leading-relaxed whitespace-pre-line"
												>{excerpt}</span
											>
										{:else}
											<span class="text-sm opacity-55">Nothing more yet.</span>
										{/if}
									</span>
								</button>
							</li>
						{/each}
					</ul>

					{#if notes.length === 0}
						<p class="text-muted-foreground px-2 py-4 text-center text-sm">
							Nothing written down yet.
						</p>
					{/if}

					<div class="flex items-center justify-end gap-1.5 pt-1.5 pr-1">
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										href="/notes"
										onclick={openAll}
										variant="outline"
										size="icon"
										class="size-8 rounded-full"
									>
										<ArrowUpRightIcon class="size-4" />
										<span class="sr-only">Open every note</span>
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="left" class="flex items-center gap-2">
								Open every note
								<Kbd>⌥⌘L</Kbd>
							</Tooltip.Content>
						</Tooltip.Root>
						{#if deck.canManage}
							<Button variant="outline" size="icon" class="size-8 rounded-full" onclick={addNote}>
								<PlusIcon class="size-4" />
								<span class="sr-only">New note</span>
							</Button>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</aside>
{/if}
