<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as Note from '$lib/components/note/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { canArchiveNote, canEditNote, type NoteAccess } from '$lib/notes';
	import type { NoteInput } from '$lib/notes';
	import type { Tables } from '$lib/database.types';

	let {
		notes,
		noun,
		autofocusId = null,
		onadd,
		onsave,
		onarchive
	}: {
		/** The open notes on this record, and what this session may do with one. */
		notes: NoteAccess & { open: Tables<'notes'>[] };
		/** What the record is called — "about this quote". */
		noun: string;
		/** A note just written here, so the caret lands in it. */
		autofocusId?: string | null;
		onadd: () => void;
		onsave: (id: string, patch: NoteInput) => void;
		onarchive: (id: string) => void;
	} = $props();
</script>

<!--
	What is written down about the record. Same table, same endpoint, same
	editor as the dock — these notes are simply born attached.
-->
<div data-slot="detail-notes" class="space-y-3">
	<p class="text-muted-foreground text-sm">
		Written down about this {noun}. Only visible to you — they don't show up on the dock or the
		notes page.
	</p>
	{#each notes.open as note (note.id)}
		<Note.Card color={note.color} class="h-40">
			<Note.Editor
				{note}
				editable={canEditNote(note, notes)}
				autofocus={note.id === autofocusId}
				bodyClass="flex-1 field-sizing-fixed"
				onsave={(patch) => onsave(note.id, patch)}
			/>
			{#if canArchiveNote(note, notes)}
				<Note.Actions>
					<Note.Palette value={note.color} onpick={(color) => onsave(note.id, { color })} />
					<Button
						variant="ghost"
						size="icon"
						class="size-7"
						title="Archive"
						onclick={() => onarchive(note.id)}
					>
						<ArchiveIcon class="size-4" />
						<span class="sr-only">Archive note</span>
					</Button>
				</Note.Actions>
			{/if}
		</Note.Card>
	{/each}

	{#if notes.canManage}
		<Button variant="outline" class="w-full" onclick={onadd}>
			<PlusIcon />
			New note
		</Button>
	{:else if notes.open.length === 0}
		<p class="text-muted-foreground text-sm">Nothing written down about this {noun}.</p>
	{/if}
</div>
