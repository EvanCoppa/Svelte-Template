<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SearchIcon from '@lucide/svelte/icons/search';
	import StickyNoteIcon from '@lucide/svelte/icons/sticky-note';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import * as Note from '$lib/components/note/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import {
		canArchiveNote,
		canEditNote,
		canRemoveNote,
		noteMatches,
		notesToMarkdown
	} from '$lib/notes';
	import { noteCommands } from '$lib/notes-api';
	import type { Note as NoteRow } from '$lib/server/crm/notes';

	let { data } = $props();

	let query = $state('');
	let shelf = $state<'open' | 'archived'>('open');
	/** The note the "New note" button just made, so the caret lands in it. */
	let addedId = $state<string | null>(null);

	// Searching is a keystroke: the load already brought every note this
	// session may read, and `noteMatches` is the same rule wherever it is asked.
	let shown = $derived(
		data.notes.filter(
			(note) =>
				(shelf === 'archived' ? note.archived_at !== null : note.archived_at === null) &&
				noteMatches(note, query)
		)
	);

	async function addNote() {
		const note = await noteCommands.create();
		if (!note) return;
		shelf = 'open';
		query = '';
		addedId = note.id;
	}

	/** The visible notes as one Markdown file — what is on screen, in order. */
	function exportShown() {
		const file = new Blob([notesToMarkdown(shown)], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(file);
		const link = document.createElement('a');
		link.href = url;
		link.download = `notes-${new Date().toISOString().slice(0, 10)}.md`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		<PageHeader.Actions>
			<Button variant="outline" onclick={exportShown} disabled={shown.length === 0}>
				<DownloadIcon />
				Export
			</Button>
			{#if data.access.canManage}
				<Button onclick={addNote}>
					<PlusIcon />
					New note
				</Button>
			{/if}
		</PageHeader.Actions>
	</PageHeader.Root>

	<Tabs.Root bind:value={shelf} class="gap-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<Tabs.List>
				<Tabs.Trigger value="open">Open</Tabs.Trigger>
				<Tabs.Trigger value="archived">Archived</Tabs.Trigger>
			</Tabs.List>
			<div class="relative w-full sm:w-72">
				<SearchIcon
					class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
				/>
				<Input
					bind:value={query}
					type="search"
					placeholder="Search titles and bodies…"
					aria-label="Search notes"
					class="pl-8"
				/>
			</div>
		</div>

		<!-- One grid, rendered under whichever shelf is showing: `shown` already
		     knows which that is, and a tab panel per shelf is what makes the
		     tabs real rather than two buttons wearing a tab list. -->
		<Tabs.Content value="open">{@render grid()}</Tabs.Content>
		<Tabs.Content value="archived">{@render grid()}</Tabs.Content>
	</Tabs.Root>
</div>

{#snippet grid()}
	{#if shown.length === 0}
		<Empty.Root class="py-16">
			<Empty.Header>
				<Empty.Media variant="icon"><StickyNoteIcon /></Empty.Media>
				<Empty.Title>
					{#if query}No notes match “{query}”{:else if shelf === 'archived'}Nothing archived{:else}Nothing
						written down yet{/if}
				</Empty.Title>
				<Empty.Description>
					{#if query}
						Searching looks at titles and bodies, in the shelf you are on.
					{:else if shelf === 'archived'}
						Archiving a note takes it off the dock without deleting it.
					{:else}
						Notes dock to the edge of every screen. Press ⌥⌘L to come back here.
					{/if}
				</Empty.Description>
			</Empty.Header>
			{#if data.access.canManage && !query && shelf === 'open'}
				<Empty.Content>
					<Button onclick={addNote}><PlusIcon />New note</Button>
				</Empty.Content>
			{/if}
		</Empty.Root>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{#each shown as note (note.id)}
				{@render card(note)}
			{/each}
		</div>
	{/if}
{/snippet}

{#snippet card(note: NoteRow)}
	{@const link = data.links[note.id]}
	{@const archived = note.archived_at !== null}
	<!-- The grant says whether this session writes notes at all; RLS narrows
	     that to the author (or an owner/admin), so the editor is only offered
	     where a save would actually land. -->
	{@const mine = canArchiveNote(note, data.access)}
	<Note.Card color={note.color} class="h-64">
		<Note.Editor
			{note}
			editable={canEditNote(note, data.access)}
			autofocus={note.id === addedId}
			bodyClass="flex-1 field-sizing-fixed"
			onsave={(patch) => noteCommands.save(note.id, patch)}
		/>

		{#if link}
			<!-- What this note is about. The link is here only when the reader may
			     open that record — the load did not even fetch the rest. -->
			<a
				href={link.href}
				class="flex items-center gap-1 text-xs underline-offset-2 hover:underline"
			>
				<LinkIcon class="size-3 shrink-0" />
				<span class="truncate">{link.label}</span>
			</a>
		{/if}

		{#if mine || canRemoveNote(note, data.access)}
			<Note.Actions>
				{#if archived}
					{#if mine}
						<Button
							variant="ghost"
							size="sm"
							class="h-7 px-2"
							onclick={() => noteCommands.archive(note.id, false)}
						>
							<ArchiveRestoreIcon class="size-4" />
							Restore
						</Button>
					{/if}
				{:else if mine}
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
				{/if}
				{#if canRemoveNote(note, data.access)}
					<Button
						variant="ghost"
						size="icon"
						class="ml-auto size-7"
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
{/snippet}
