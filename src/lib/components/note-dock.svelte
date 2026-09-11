<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
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
	import { clampPlacement, floatingNotes } from '$lib/floating-notes.svelte';
	import { motionFlip, motionTransition, springs } from '$lib/motion';
	import {
		canArchiveNote,
		canEditNote,
		canRemoveNote,
		moveNote,
		noteDash,
		noteExcerpt,
		noteLabel,
		noteSurface,
		positionAt
	} from '$lib/notes';
	import { noteCommands } from '$lib/notes-api';
	import type { Note as NoteRow } from '$lib/server/crm/notes';
	import { cn } from '$lib/utils.js';

	/**
	 * The note dock: every note in the org, docked to the edge of the screen.
	 *
	 * Four states, the way a stack of stickies on the edge of a desk has
	 * four: at rest it is one colored dash per note, a few pixels wide;
	 * pointing at it fans the notes out as tabs sticking out of the edge, each
	 * one its own paper with its label written up the spine; pointing at a tab
	 * pulls it out far enough to read the start of it; and picking one grows
	 * it, right there in the fan, into the whole note — still stuck to the
	 * edge, editing in place and saving itself.
	 *
	 * Each of those runs backwards on the way out, because the way back is the
	 * way in: the pointer leaving a tab slides that tab straight into the edge
	 * again, and the pointer leaving the tabs altogether lets the fan wait a
	 * beat and then slide off the screen along the entrance it played, at the
	 * same rate. Only the tabs themselves are the dock as far as the pointer is
	 * concerned — the panel around them lets the page under it be clicked — so
	 * "off the notes" means off the paper, not out of a box nobody can see.
	 *
	 * Two gestures on top of that. A tab can be picked up and dropped between
	 * two others, which is how the rail is ordered (`notes.position`; the
	 * notes_position migration). And a grown note can be grabbed by its rim
	 * and pulled off the edge: it comes away as a sticky note floating over the
	 * page, wherever it is dropped, on every screen until its × is pressed or
	 * it is dragged back onto the dock (`$lib/floating-notes.svelte` remembers
	 * where, for this tab). `⌥⌘L` leaves all of that for `/notes`, which is the
	 * same notes with room to search them.
	 *
	 * Mounted once by the `(app)` layout, like the ⌘K palette and the upgrade
	 * prompt, and fed by the layout's load — so it is on every screen without
	 * any screen knowing about it. That is also why writing goes through
	 * `/api/notes` (see `$lib/notes`): the dock has no page action to post to,
	 * and a drop that reorders the rail is one more of those writes.
	 */

	/** How long the fan waits after the pointer leaves the tabs before settling back in, in ms. */
	const RETRACT_DELAY = 400;
	/** How far the fan travels, in pixels: wider than a folded tab, so the tabs leave the screen. */
	const FAN_SLIDE = 48;
	/**
	 * The fan coming out, and the same thing backwards. One pair, written here
	 * rather than at the two ends of the `{#if}`, so the exit cannot drift into
	 * an animation of its own: same distance, same spring, opposite direction.
	 * The exit names only where it is going, so an exit that interrupts an
	 * entrance carries on from wherever the fan had got to.
	 */
	const fanIn = {
		keyframes: { opacity: [0, 1], x: [FAN_SLIDE, 0] },
		transition: springs.snap,
		reduced: { keyframes: { opacity: [0, 1] }, transition: springs.snap }
	};
	const fanOut = {
		keyframes: { opacity: 0, x: FAN_SLIDE },
		transition: springs.snap,
		reduced: { keyframes: { opacity: 0 }, transition: springs.snap }
	};
	/** How far a press travels before it is a drag rather than a click, in pixels. */
	const LIFT = 6;

	// Null when this org has no notes feature, or this user cannot read it:
	// the layout ships nothing and the dock is not on the page at all.
	let deck = $derived(page.data.noteDock ?? null);
	// The reader's own `notes.dock` preference. False draws no rail while the
	// component stays mounted, so the shortcut below still opens every note —
	// the preference hides chrome, not the feature (docs/user-preferences.md).
	let docked = $derived(deck?.docked ?? false);
	let notes = $derived(deck?.open ?? []);
	// A desk belongs to one user in one organization — the breadcrumb trail's scope.
	let scope = $derived(`${page.data.user?.id ?? ''}:${page.data.activeOrg?.id ?? ''}`);

	let fanned = $state(false);
	// The tab the pointer (or focus) is on: it slides out to show a preview.
	let previewId = $state<string | null>(null);
	let openedId = $state<string | null>(null);

	/**
	 * The rail's order while a tab is being dragged: the ids as the pointer
	 * has arranged them, over whatever the server currently says. Null when
	 * nothing is being dragged. Ids rather than rows, so a refresh landing
	 * mid-drag (an autosave elsewhere) cannot bring back a stale row.
	 */
	let sortedIds = $state<string[] | null>(null);
	let rail = $derived.by(() => {
		if (!sortedIds) return notes;
		const byId = new Map(notes.map((note) => [note.id, note]));
		return sortedIds.flatMap((id) => {
			const note = byId.get(id);
			return note ? [note] : [];
		});
	});

	// Where the notes pulled off the edge are, and the rows to draw there. A
	// note that has been archived or deleted since is simply no longer in the
	// layout's list, so it leaves the desk with no wiring of its own.
	// Restoring the desk is a side effect (it reads sessionStorage and writes
	// state), so it runs here rather than inside the derived below — mutating
	// state during a derivation is unsafe and Svelte rejects it.
	$effect(() => {
		floatingNotes.enter(scope);
	});
	let floating = $derived(floatingNotes.floatingIn(scope));
	let floatingIds = $derived(new Set(floating.map((placed) => placed.id)));
	let desk = $derived(
		floating.flatMap((placed) => {
			const note = notes.find((candidate) => candidate.id === placed.id);
			return note ? [{ placed, note }] : [];
		})
	);
	// A note on the desk has left the edge: the rail shows the ones still on it.
	let railNotes = $derived(rail.filter((note) => !floatingIds.has(note.id)));

	/**
	 * A press that may become a drag. `sort` picks a tab up to move it along
	 * the rail; `lift` takes a grown note by its rim — off the edge, or across
	 * the page if it already floats. `grab` is where inside the note the
	 * pointer took hold, so the note moves with the hand rather than jumping
	 * to it. Neither is live until the pointer has travelled `LIFT`.
	 */
	type Gesture =
		| { kind: 'sort'; id: string; startX: number; startY: number; live: boolean }
		| {
				kind: 'lift';
				id: string;
				startX: number;
				startY: number;
				grab: { x: number; y: number };
				size: { width: number; height: number };
				live: boolean;
		  };

	let gesture = $state<Gesture | null>(null);
	/** A note being carried is over the dock: letting go here puts it back. */
	let overDock = $state(false);
	/** Set by a drop that reordered, so the click the browser fires after it does not open the tab. */
	let justSorted = false;

	let aside = $state<HTMLElement | null>(null);
	let tabList = $state<HTMLUListElement | null>(null);
	let retract: ReturnType<typeof setTimeout> | undefined;

	async function addNote() {
		const note = await noteCommands.create();
		if (!note) return;
		fanned = true;
		openedId = note.id;
	}

	function open(id: string) {
		// The drop that just reordered the rail lands as a click on the same
		// tab; that click was the drag, not a choice to open it.
		if (justSorted) {
			justSorted = false;
			return;
		}
		previewId = null;
		openedId = id;
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
		if (event.key === 'Escape') {
			if (gesture) {
				cancelGesture();
				return;
			}
			if (!fanned) return;
			// One step at a time: the grown note closes back to a tab, the fan
			// closes back to the rail.
			if (openedId) openedId = null;
			else fanned = false;
		}
	}

	function handlePointerEnter() {
		clearTimeout(retract);
		fanned = true;
	}

	/**
	 * Leaving does not snap the fan shut: a beat later it slides back off the
	 * edge the way it came — unless a note is open (it would close
	 * mid-sentence) or something is being carried (it would be dropped on a
	 * dock that had just left). The tab the pointer was on has folded itself
	 * back into the rail already; this beat is the fan's own.
	 */
	function handlePointerLeave() {
		clearTimeout(retract);
		retract = setTimeout(() => {
			previewId = null;
			if (!openedId && !gesture) fanned = false;
		}, RETRACT_DELAY);
	}

	/** A tab the pointer or the focus has left slides straight back into the rail. */
	function endPreview(id: string) {
		if (previewId === id) previewId = null;
	}

	// --- the two drags ----------------------------------------------------

	function startSort(e: PointerEvent, note: NoteRow) {
		if (!deck || !canArchiveNote(note, deck)) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		gesture = { kind: 'sort', id: note.id, startX: e.clientX, startY: e.clientY, live: false };
	}

	function startLift(
		e: PointerEvent & { currentTarget: EventTarget & HTMLElement },
		note: NoteRow
	) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		// The rim is for carrying; the words, the palette and the buttons are
		// for what they are for.
		if (e.target instanceof Element && e.target.closest('input, textarea, button, a')) return;
		const rect = e.currentTarget.getBoundingClientRect();
		gesture = {
			kind: 'lift',
			id: note.id,
			startX: e.clientX,
			startY: e.clientY,
			grab: { x: e.clientX - rect.left, y: e.clientY - rect.top },
			size: { width: rect.width, height: rect.height },
			live: false
		};
	}

	/** Which slot of the rail a pointer at this height is over, counting the tabs it has passed. */
	function slotAt(y: number, draggedId: string): number {
		if (!tabList) return 0;
		let slot = 0;
		for (const item of tabList.querySelectorAll<HTMLElement>('[data-slot="note-tab-item"]')) {
			if (item.dataset.id === draggedId) continue;
			const rect = item.getBoundingClientRect();
			if (rect.top + rect.height / 2 < y) slot += 1;
		}
		return slot;
	}

	function isOverDock(x: number, y: number): boolean {
		if (!aside) return false;
		const rect = aside.getBoundingClientRect();
		return x >= rect.left && y >= rect.top && y <= rect.bottom;
	}

	function handlePointerMove(e: PointerEvent) {
		const current = gesture;
		if (!current) return;
		const dx = e.clientX - current.startX;
		const dy = e.clientY - current.startY;
		if (!current.live) {
			if (Math.hypot(dx, dy) < LIFT) return;
			current.live = true;
			previewId = null;
			// Off the edge: from here on the note is drawn on the desk, not in the fan.
			if (current.kind === 'lift') openedId = null;
		}
		if (current.kind === 'sort') {
			sortedIds = moveNote(rail, current.id, slotAt(e.clientY, current.id)).map((n) => n.id);
			return;
		}
		floatingNotes.place(scope, {
			id: current.id,
			x: e.clientX - current.grab.x,
			y: e.clientY - current.grab.y
		});
		overDock = isOverDock(e.clientX, e.clientY);
	}

	function handlePointerUp(e: PointerEvent) {
		const current = gesture;
		gesture = null;
		overDock = false;
		if (!current?.live) return;

		if (current.kind === 'sort') {
			justSorted = true;
			void commitSort(current.id);
			return;
		}
		if (isOverDock(e.clientX, e.clientY)) {
			// Back onto the dock, where it started: a tab again.
			floatingNotes.dock(scope, current.id);
			return;
		}
		const placed = floating.find((f) => f.id === current.id);
		if (!placed) return;
		floatingNotes.place(scope, {
			id: current.id,
			...clampPlacement(placed, current.size, {
				width: window.innerWidth,
				height: window.innerHeight
			})
		});
		// The hand is out over the page now: the fan it left settles back in.
		handlePointerLeave();
	}

	/**
	 * A drop writes ONE row: the moved note takes the midpoint between its new
	 * neighbours (`positionAt`), and the rail keeps the pointer's order until
	 * `QUERY.notes` has come back with the server agreeing — or, on a refusal,
	 * with the order it was.
	 */
	async function commitSort(id: string) {
		const index = rail.findIndex((note) => note.id === id);
		if (index !== -1) await noteCommands.save(id, { position: positionAt(rail, index) });
		sortedIds = null;
	}

	function cancelGesture() {
		gesture = null;
		overDock = false;
		sortedIds = null;
	}
</script>

<!-- The drags ride on the window rather than on pointer capture: a note
     pulled off the edge leaves the fan's DOM for the desk's mid-gesture, and a
     node that is replaced loses any capture it held. -->
<svelte:window
	onkeydown={handleKeydown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={cancelGesture}
	onblur={cancelGesture}
/>

{#if deck && docked}
	<!-- The rail and the fan share one grid cell, so the fan can settle back
	     in over the rail rather than the two trading places in a jump.

	     `pointer-events-none` here, `pointer-events-auto` on the paper: the fan
	     is 20rem wide so that a grown note fits in it, and a box nobody can see
	     should neither eat the clicks meant for the page under it nor hold the
	     fan out because the pointer came to rest in it. Enter and leave still
	     fire here — they are dispatched up the ancestors of whatever was hit —
	     so the tabs are what the fan follows. -->
	<aside
		bind:this={aside}
		aria-label="Notes"
		class="pointer-events-none fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 items-center justify-items-end md:grid [&>*]:col-start-1 [&>*]:row-start-1"
		onpointerenter={handlePointerEnter}
		onpointerleave={handlePointerLeave}
	>
		{#if !fanned}
			<button
				type="button"
				in:motionTransition={{
					keyframes: { opacity: [0, 1] },
					transition: { ...springs.snap, delay: 0.12 }
				}}
				out:motionTransition={{ keyframes: { opacity: 0 }, transition: springs.snap }}
				onclick={() => (fanned = true)}
				aria-label={railNotes.length === 1 ? '1 note' : `${railNotes.length} notes`}
				class="border-border/60 bg-background/80 hover:bg-background focus-visible:ring-ring pointer-events-auto flex max-h-[70vh] flex-col items-center gap-1 overflow-hidden rounded-l-lg border border-r-0 py-2.5 pr-1 pl-1.5 shadow-sm outline-none focus-visible:ring-2"
			>
				{#each railNotes as note (note.id)}
					<span
						data-slot="note-dash"
						class={cn('h-5 w-1.5 shrink-0 rounded-full', noteDash(note.color))}
					></span>
				{/each}
				{#if railNotes.length === 0}
					<StickyNoteIcon class="text-muted-foreground size-4" />
				{/if}
			</button>
		{:else}
			<div
				in:motionTransition={fanIn}
				out:motionTransition={fanOut}
				class={cn(
					'w-80 rounded-l-2xl transition-shadow duration-200',
					overDock && 'bg-accent/40 shadow-[inset_0_0_0_2px_var(--ring)]'
				)}
			>
				<!-- The notes as tabs: each one its own paper, sticking out of the
				     edge with its label written up the spine. The one under the
				     pointer slides out to show how it starts; a click grows it into
				     the whole note, right here; a drag along the rail moves it. -->
				<ul
					bind:this={tabList}
					class="flex max-h-[70vh] flex-col items-end gap-1.5 overflow-x-hidden overflow-y-auto py-1"
				>
					{#each railNotes as note (note.id)}
						{@const previewing = previewId === note.id}
						{@const excerpt = noteExcerpt(note)}
						{@const lifted = gesture?.kind === 'sort' && gesture.live && gesture.id === note.id}
						<li
							data-slot="note-tab-item"
							data-id={note.id}
							class="pointer-events-auto relative shrink-0"
							animate:motionFlip={{ transition: springs.snap }}
						>
							{#if openedId === note.id}
								<!-- Grown in place: the tab becomes the note, still on the edge. -->
								<div
									in:motionTransition={{
										keyframes: { opacity: [0, 1], x: [40, 0], scale: [0.92, 1] },
										transition: springs.settle,
										reduced: { keyframes: { opacity: [0, 1] } }
									}}
									class="origin-right"
								>
									{@render paper(note, false)}
								</div>
							{:else}
								<button
									type="button"
									data-slot="note-tab"
									data-state={previewing ? 'open' : 'closed'}
									aria-label={noteLabel(note)}
									onpointerenter={() => {
										if (!gesture) previewId = note.id;
									}}
									onpointerleave={() => endPreview(note.id)}
									onfocus={() => (previewId = note.id)}
									onblur={() => endPreview(note.id)}
									onpointerdown={(e) => startSort(e, note)}
									onclick={() => open(note.id)}
									class={cn(
										'focus-visible:ring-ring flex touch-none items-stretch overflow-hidden rounded-l-xl border border-r-0 text-left shadow-sm transition-[width,min-height,box-shadow,scale] duration-300 ease-out outline-none select-none focus-visible:ring-2 motion-reduce:transition-none',
										// Pulled out, it is a sticky note — squarer than wide,
										// and a preview of how it starts, not the whole thing.
										previewing ? 'min-h-44 w-56' : 'min-h-24 w-11',
										// Picked up: lifted off the rail, riding along it.
										lifted ? 'z-10 scale-105 cursor-grabbing shadow-lg' : 'cursor-pointer',
										noteSurface(note.color)
									)}
								>
									<!-- The spine: the label written up it, and the perforation
									     where the paper disappears into the edge. The dashes are a
									     painted gradient, not `border-dashed`: a CSS dash is a few
									     pixels long with a gap to match and reads as a solid line
									     from arm's length, and only a gradient can set the dash and
									     the gap. Each tile is gap–dash–gap and the tiles are
									     `round`ed to fit the spine whole, so the run starts and ends
									     with a gap and no dash ever touches an edge of the card —
									     the way a perforated edge is punched. The tab is as tall as
									     its label, so a long name makes a longer tab. -->
									<span
										class="flex w-10 shrink-0 items-center justify-center bg-[linear-gradient(to_bottom,transparent_4px,color-mix(in_oklab,currentColor_25%,transparent)_4px,color-mix(in_oklab,currentColor_25%,transparent)_16px,transparent_16px)] bg-[length:1px_20px] bg-right [background-repeat:no-repeat_round] py-3"
									>
										<span
											class="max-h-28 rotate-180 truncate text-[10px] font-semibold tracking-[0.18em] uppercase [writing-mode:vertical-rl]"
										>
											{noteLabel(note)}
										</span>
									</span>
									<!-- Out of the flow while folded, so the tab's height is
									     the spine's; in the flow once pulled out, so the paper
									     grows to fit what it says. Out of the flow but still
									     painted, so folding fades the words away under the paper
									     closing over them rather than cutting them at the first
									     frame — the narrowing tab clips what is left. -->
									<span
										aria-hidden="true"
										class={cn(
											'flex w-46 shrink-0 flex-col gap-1 p-3 transition-opacity duration-200 ease-out motion-reduce:transition-none',
											previewing ? 'opacity-100 delay-100' : 'absolute opacity-0'
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
							{/if}
						</li>
					{/each}
				</ul>

				{#if railNotes.length === 0}
					<p class="text-muted-foreground pointer-events-auto ml-auto w-fit px-2 py-4 text-sm">
						{desk.length > 0 ? 'Every note is out on the desk.' : 'Nothing written down yet.'}
					</p>
				{/if}

				<div class="pointer-events-auto ml-auto flex w-fit items-center gap-1.5 pt-1.5 pr-1">
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
			</div>
		{/if}
	</aside>
{/if}

{#if deck}
	<!-- The desk: the notes pulled off the edge, floating where they were
	     dropped. Above the dock, below dialogs. -->
	{#each desk as { placed, note } (note.id)}
		<div
			data-slot="floating-note"
			class="fixed z-40 hidden md:block"
			style:left="{placed.x}px"
			style:top="{placed.y}px"
		>
			{@render paper(note, true)}
		</div>
	{/each}
{/if}

{#snippet paper(note: NoteRow, floating: boolean)}
	{#if deck}
		{@const carried = gesture?.kind === 'lift' && gesture.live && gesture.id === note.id}
		<!-- The whole note. Its rim is a handle — take it and the note comes
		     with the hand — while the words and the buttons inside stay what
		     they are. The × puts a grown note back to a tab, and a floating one
		     back on the dock. -->
		<Note.Card
			color={note.color}
			class={cn(
				'h-72 w-80 cursor-grab touch-none pt-2 select-none',
				floating ? 'shadow-xl' : 'rounded-r-none border-r-0 shadow-lg',
				carried && 'cursor-grabbing shadow-2xl'
			)}
			onpointerdown={(e) => startLift(e, note)}
		>
			<div class="-mt-1 -mr-1 flex justify-end">
				<Button
					variant="ghost"
					size="icon"
					class="size-6"
					onclick={() => {
						if (floating) floatingNotes.dock(scope, note.id);
						else openedId = null;
					}}
				>
					<XIcon class="size-4" />
					<span class="sr-only">Close note</span>
				</Button>
			</div>
			<Note.Editor
				{note}
				editable={canEditNote(note, deck)}
				autofocus={!floating}
				bodyClass="flex-1 field-sizing-fixed cursor-text select-text"
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
	{/if}
{/snippet}
