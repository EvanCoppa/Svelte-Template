<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderPlusIcon from '@lucide/svelte/icons/folder-plus';
	import LinkIcon from '@lucide/svelte/icons/link';
	import MoreHorizontalIcon from '@lucide/svelte/icons/more-horizontal';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SearchIcon from '@lucide/svelte/icons/search';
	import StickyNoteIcon from '@lucide/svelte/icons/sticky-note';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import * as GroupList from '$lib/components/group-list/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as Note from '$lib/components/note/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { BADGE_TONE_DOT_CLASSES } from '$lib/components/ui/badge/badge-tones.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import {
		canArchiveNote,
		canEditNote,
		canRemoveNote,
		noteMatches,
		notesToMarkdown
	} from '$lib/notes';
	import { noteCommands } from '$lib/notes-api';
	import { QUERY } from '$lib/queries';
	import type { NoteCategory } from '$lib/server/crm/note-categories';
	import type { Note as NoteRow } from '$lib/server/crm/notes';
	import { cn } from '$lib/utils.js';
	import { createCategorySchema, updateCategorySchema } from './schema';

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

	/**
	 * The shelves, in order, with what is on each — and the unfiled pile last.
	 * A real category is rendered even when it is empty, because an empty shelf
	 * is somewhere to file a note into; the unfiled pile only appears when
	 * something is actually loose.
	 */
	let groups = $derived([
		...data.categories.map((category) => ({
			id: category.id,
			name: category.name,
			category,
			notes: shown.filter((note) => note.category_id === category.id)
		})),
		{
			id: 'unfiled',
			name: 'Unfiled',
			category: null,
			notes: shown.filter((note) => note.category_id === null)
		}
	]);

	async function addNote(categoryId: string | null) {
		const note = await noteCommands.create(categoryId ? { categoryId } : {});
		if (!note) return;
		shelf = 'open';
		query = '';
		addedId = note.id;
	}

	/** Filing a note is editing it, so it takes the road every other note edit takes. */
	async function fileNote(note: NoteRow, categoryId: string | null) {
		if (note.category_id === categoryId) return;
		const saved = await noteCommands.save(note.id, { categoryId });
		if (!saved) return;
		const name = data.categories.find((c) => c.id === categoryId)?.name;
		toast.success(name ? `Filed under ${name}` : 'Note unfiled');
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

	function countLabel(n: number): string {
		return `${String(n)} ${n === 1 ? 'note' : 'notes'}`;
	}

	// --- the shelves themselves -------------------------------------------
	// A category is edited from this page out of a form, so unlike a note it is
	// an ordinary form action (see the server file).

	let addOpen = $state(false);
	/** The category being renamed, and the one being removed. */
	let editing = $state<NoteCategory | null>(null);
	let removing = $state<NoteCategory | null>(null);

	const {
		form: addData,
		errors: addErrors,
		message: addMessage,
		constraints: addConstraints,
		submitting: adding,
		enhance: addEnhance
	} = superForm(data.createCategoryForm, {
		id: 'create-category',
		invalidateAll: false,
		validators: zod4Client(createCategorySchema),
		async onUpdated({ form }) {
			if (!form.valid) return;
			await invalidate(QUERY.noteCategories);
			addOpen = false;
			toast.success(`Added ${form.data.name}`);
		}
	});

	const {
		form: editData,
		errors: editErrors,
		message: editMessage,
		constraints: editConstraints,
		submitting: saving,
		enhance: editEnhance
	} = superForm(data.updateCategoryForm, {
		id: 'update-category',
		invalidateAll: false,
		validators: zod4Client(updateCategorySchema),
		async onUpdated({ form }) {
			if (!form.valid) return;
			await invalidate(QUERY.noteCategories);
			editing = null;
			toast.success('Category saved');
		}
	});

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(data.deleteCategoryForm, {
		id: 'delete-category',
		invalidateAll: false,
		async onUpdated({ form }) {
			if (!form.valid) return;
			// The notes on it were unfiled, not deleted, so both lists move.
			await Promise.all([invalidate(QUERY.noteCategories), invalidate(QUERY.notes)]);
			removing = null;
			toast.success('Category deleted');
		}
	});

	function startRename(category: NoteCategory) {
		$editData = { id: category.id, name: category.name, color: category.color };
		editing = category;
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
				<Modal.Root bind:open={addOpen}>
					<Modal.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>
								<FolderPlusIcon />
								New category
							</Button>
						{/snippet}
					</Modal.Trigger>
					<Modal.Content>
						<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
						<form method="POST" action="?/createCategory" use:addEnhance>
							<Modal.Card>
								<Modal.Header>
									<Modal.Title><FolderPlusIcon /> New category</Modal.Title>
									<Modal.Description>
										A heading to file notes under. Everything stays where it is until you move it.
									</Modal.Description>
								</Modal.Header>
								<Modal.Body>
									<FormAlert message={$addMessage} class="mb-0" />
									<div class="grid gap-2">
										<Label for="add-category-name">Name</Label>
										<Input
											id="add-category-name"
											name="name"
											placeholder="Onboarding"
											aria-invalid={$addErrors.name ? 'true' : undefined}
											bind:value={$addData.name}
											{...$addConstraints.name}
										/>
										{#if $addErrors.name}
											<p class="text-destructive text-sm">{$addErrors.name}</p>
										{/if}
									</div>
									<div class="grid gap-2">
										<Label>Colour</Label>
										<Note.Palette
											value={$addData.color}
											onpick={(color) => ($addData.color = color)}
										/>
										<input type="hidden" name="color" value={$addData.color} />
									</div>
								</Modal.Body>
							</Modal.Card>
							<Modal.Footer>
								<Modal.Cancel>Cancel</Modal.Cancel>
								<Modal.Action type="submit" disabled={$adding}>
									{$adding ? 'Adding…' : 'Add category'}
								</Modal.Action>
							</Modal.Footer>
						</form>
					</Modal.Content>
				</Modal.Root>

				<Button onclick={() => addNote(null)}>
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

		<!-- A panel per shelf is what makes these tabs real rather than two
		     buttons wearing a tab list — but both panels stay mounted (the
		     inactive one merely `hidden`), so the content is guarded: without
		     the check every note would exist twice, with two editors and two
		     autosave timers behind the one you can see. -->
		<Tabs.Content value="open">
			{#if shelf === 'open'}{@render shelves()}{/if}
		</Tabs.Content>
		<Tabs.Content value="archived">
			{#if shelf === 'archived'}{@render shelves()}{/if}
		</Tabs.Content>
	</Tabs.Root>
</div>

<!-- Renaming and recolouring a shelf. One dialog for whichever is being
     edited, filled by `startRename` — a dialog per category would mount one
     form per heading on the page. -->
<Modal.Root
	open={editing !== null}
	onOpenChange={(open) => {
		if (!open) editing = null;
	}}
>
	<Modal.Content>
		<form method="POST" action="?/updateCategory" use:editEnhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><PencilIcon /> Rename category</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$editMessage} class="mb-0" />
					<input type="hidden" name="id" value={$editData.id} />
					<div class="grid gap-2">
						<Label for="edit-category-name">Name</Label>
						<Input
							id="edit-category-name"
							name="name"
							aria-invalid={$editErrors.name ? 'true' : undefined}
							bind:value={$editData.name}
							{...$editConstraints.name}
						/>
						{#if $editErrors.name}
							<p class="text-destructive text-sm">{$editErrors.name}</p>
						{/if}
					</div>
					<div class="grid gap-2">
						<Label>Colour</Label>
						<Note.Palette value={$editData.color} onpick={(color) => ($editData.color = color)} />
						<input type="hidden" name="color" value={$editData.color} />
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$saving}>
					{$saving ? 'Saving…' : 'Save'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Removing a shelf. Worth a confirmation because it moves every note on it. -->
<Modal.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removing = null;
	}}
>
	<Modal.Content>
		<form method="POST" action="?/deleteCategory" use:removeEnhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><Trash2Icon /> Delete {removing?.name}</Modal.Title>
					<Modal.Description>
						The notes filed here are not deleted — they go back to Unfiled.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$removeMessage} class="mb-0" />
					<input type="hidden" name="id" value={removing?.id ?? ''} />
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" color="primary-destructive" disabled={$deleting}>
					{$deleting ? 'Deleting…' : 'Delete category'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

{#snippet shelves()}
	{#if shown.length === 0 && data.categories.length === 0}
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
					<Button onclick={() => addNote(null)}><PlusIcon />New note</Button>
				</Empty.Content>
			{/if}
		</Empty.Root>
	{:else}
		<GroupList.Root>
			{#each groups as group (group.id)}
				{#if group.notes.length > 0 || group.category}
					<GroupList.Group open={group.notes.length > 0}>
						<GroupList.Header tone={group.category?.color} count={countLabel(group.notes.length)}>
							{group.name}
							{#snippet actions()}
								{@render shelfActions(group.category)}
							{/snippet}
						</GroupList.Header>
						<GroupList.Items layout="grid">
							{#each group.notes as note (note.id)}
								{@render card(note)}
							{:else}
								<GroupList.Empty class="col-span-full">
									{#if query}
										Nothing here matches “{query}”.
									{:else}
										Nothing filed here yet.
									{/if}
								</GroupList.Empty>
							{/each}
						</GroupList.Items>
					</GroupList.Group>
				{/if}
			{/each}
		</GroupList.Root>
	{/if}
{/snippet}

<!-- What a heading lets you do: write a note straight onto this shelf, and —
     for a real category rather than the unfiled pile — rename or remove it. -->
{#snippet shelfActions(category: NoteCategory | null)}
	{#if data.access.canManage}
		<Button
			variant="ghost"
			size="icon"
			class="size-8"
			title="New note here"
			onclick={() => addNote(category?.id ?? null)}
		>
			<PlusIcon class="size-4" />
			<span class="sr-only">New note in {category?.name ?? 'Unfiled'}</span>
		</Button>
	{/if}
	{#if category && data.access.canManage}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="ghost" size="icon" class="size-8" {...props}>
						<MoreHorizontalIcon class="size-4" />
						<span class="sr-only">Actions for {category.name}</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onSelect={() => startRename(category)}>
					<PencilIcon class="size-4" />
					Rename
				</DropdownMenu.Item>
				{#if data.access.canDelete}
					<DropdownMenu.Item variant="destructive" onSelect={() => (removing = category)}>
						<Trash2Icon class="size-4" />
						Delete
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
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
					{@render filePicker(note)}
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

<!-- Moving one note between shelves. A radio group rather than a list of
     commands, because a note is on exactly one shelf and the menu should say
     which. -->
{#snippet filePicker(note: NoteRow)}
	{#if data.categories.length > 0}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="ghost" size="icon" class="size-7" title="File note" {...props}>
						<FolderIcon class="size-4" />
						<span class="sr-only">File note under a category</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start">
				<DropdownMenu.RadioGroup
					value={note.category_id ?? 'unfiled'}
					onValueChange={(value) => fileNote(note, value === 'unfiled' ? null : value)}
				>
					<DropdownMenu.RadioItem value="unfiled">Unfiled</DropdownMenu.RadioItem>
					{#each data.categories as category (category.id)}
						<DropdownMenu.RadioItem value={category.id}>
							<span
								class={cn('size-2 shrink-0 rounded-full', BADGE_TONE_DOT_CLASSES[category.color])}
							></span>
							{category.name}
						</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
{/snippet}
