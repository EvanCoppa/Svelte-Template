import {
	BADGE_TONE_CLASSES,
	BADGE_TONE_DOT_CLASSES,
	type BadgeTone
} from '$lib/components/ui/badge/badge-tones.js';
import type { Note } from '$lib/server/crm/notes';

/**
 * What a note IS to the browser: what it is called, whether it matches what
 * you typed in the search box, what it looks like on paper, and the shapes
 * every surface passes around.
 *
 * Pure on purpose — writing a note lives next door in `$lib/notes-api`, which
 * has to reach for `$app/navigation` and would drag it into every test that
 * asks what a note is called. The dock, `/notes` and a record's card all read
 * this file, so a note has one label and one color wherever it is drawn.
 */

/**
 * How long the editor waits after the last keystroke before saving. Short
 * enough that a note is never lost by closing the tab, long enough that a
 * sentence is one request rather than forty.
 */
export const AUTOSAVE_DELAY = 250;

/** What a note is written on. The ten tones the app already owns, nothing new. */
export function noteSurface(color: BadgeTone): string {
	return BADGE_TONE_CLASSES[color];
}

/** One note as the rail draws it: a colored dash, no words. */
export function noteDash(color: BadgeTone): string {
	return BADGE_TONE_DOT_CLASSES[color];
}

/**
 * What to call a note. Its title if it has one, otherwise its first line —
 * the way a sticky note on a desk is named by whatever it says at the top.
 * Never empty, so a fresh note still has a row in the fan to click.
 */
export function noteLabel(note: Pick<Note, 'title' | 'body'>): string {
	const title = note.title?.trim();
	if (title) return title;
	const firstLine = note.body
		.split('\n')
		.map((line) => line.trim())
		.find(Boolean);
	return firstLine ?? 'Empty note';
}

/**
 * What a note says below its name — the lines a peek at it shows before it
 * is opened. A titled note's body is all of it; an untitled note is named by
 * its first line, so the excerpt starts after that line rather than repeating
 * it. Empty when there is nothing more to show.
 */
export function noteExcerpt(note: Pick<Note, 'title' | 'body'>): string {
	const body = note.body.trim();
	if (note.title?.trim()) return body;
	const lines = body.split('\n');
	return lines.slice(1).join('\n').trim();
}

/**
 * Does a note match what was typed? Every whitespace-separated term has to
 * appear somewhere in the title or the body, case-insensitively — so "wayne
 * renewal" finds the note that mentions both, in either order. An empty query
 * matches everything.
 *
 * Client-side on purpose: `/notes` already holds every note the session may
 * read, so searching is a keystroke, not a round trip.
 */
export function noteMatches(note: Pick<Note, 'title' | 'body'>, query: string): boolean {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return true;
	const haystack = `${note.title ?? ''}\n${note.body}`.toLowerCase();
	return terms.every((term) => haystack.includes(term));
}

/**
 * Notes as one Markdown document — what the export button downloads. Each
 * note becomes a heading and its body, in the order given, so the file reads
 * top to bottom like the screen it came from.
 */
export function notesToMarkdown(notes: readonly Note[]): string {
	return notes
		.map((note) => `## ${noteLabel(note)}\n\n${note.body.trim()}\n`)
		.join('\n---\n\n')
		.trimEnd();
}

/**
 * What a surface is allowed to do with the notes it is showing: the session's
 * grants on the feature, and who is looking — because RLS narrows both again
 * to the note's own author (or an owner/admin). Built once per load by
 * `noteAccess()` in `$lib/server/notes`.
 */
export type NoteAccess = {
	canManage: boolean;
	canDelete: boolean;
	viewer: {
		userId: string;
		/** An owner or admin edits anyone's note — the policies' other half. */
		isOrgManager: boolean;
	};
};

/**
 * What the `(app)` layout ships to the dock, and a record page to its card:
 * the open notes, newest first, plus that access. Null when the notes feature
 * is not this org's — the dock then renders nothing at all.
 *
 * `docked` is the reader's own `notes.dock` preference. It hides the rail, not
 * the feature: the dock component stays mounted so ⌥⌘L still opens every note
 * (docs/user-preferences.md).
 */
export type NoteDeck = NoteAccess & { open: Note[]; docked: boolean };

/**
 * May this session edit this note? The grant AND the authorship rule the
 * policy applies, so the editor is never offered for a save that RLS would
 * refuse. An archived note is read until it is restored.
 */
export function canEditNote(note: Pick<Note, 'author_id' | 'archived_at'>, access: NoteAccess) {
	return access.canManage && note.archived_at === null && isOwn(note, access);
}

/** The same question for deleting, which takes the `delete` level. */
export function canRemoveNote(note: Pick<Note, 'author_id'>, access: NoteAccess) {
	return access.canDelete && isOwn(note, access);
}

/** Archiving is an edit, and an archived note is restored by the same people. */
export function canArchiveNote(note: Pick<Note, 'author_id'>, access: NoteAccess) {
	return access.canManage && isOwn(note, access);
}

function isOwn(note: Pick<Note, 'author_id'>, access: NoteAccess): boolean {
	return access.viewer.isOrgManager || note.author_id === access.viewer.userId;
}

/** The columns a note is created with; every one of them has a default. */
export type NoteInput = {
	title?: string | null;
	body?: string;
	color?: BadgeTone;
	/** The record it is about, as `crm_entity_type` names the kind. */
	entityType?: string;
	entityId?: string;
};

/** The columns an edit may change. Sent whole — a note is a document. */
export type NotePatch = {
	title?: string | null;
	body?: string;
	color?: BadgeTone;
	archived?: boolean;
	/** Where it sits on the rail; see `positionBetween()`. */
	position?: number;
};

/**
 * A list with one note moved to a new index, the rest keeping their order —
 * what the rail shows while a tab is being dragged, before anything is saved.
 * Unknown ids and out-of-range indexes leave the list as it was.
 */
export function moveNote<T extends Pick<Note, 'id'>>(
	notes: readonly T[],
	id: string,
	toIndex: number
): T[] {
	const from = notes.findIndex((note) => note.id === id);
	if (from === -1 || toIndex < 0 || toIndex >= notes.length) return [...notes];
	const moved = [...notes];
	const [note] = moved.splice(from, 1);
	if (note) moved.splice(toIndex, 0, note);
	return moved;
}

/**
 * The `position` a note takes to sit between two neighbours on the rail,
 * where higher is nearer the top: the midpoint when it has both, a step past
 * the one it has otherwise. Only the moved note is written, which is what a
 * double-precision column is for — the neighbours' positions are what they
 * were, and the gap between them halves each time something lands in it.
 */
export function positionBetween(above: number | undefined, below: number | undefined): number {
	if (above !== undefined && below !== undefined) return (above + below) / 2;
	if (above !== undefined) return above - 1;
	if (below !== undefined) return below + 1;
	return Date.now() / 1000;
}

/** The position for the note at `index` of an already-reordered rail. */
export function positionAt(notes: readonly Pick<Note, 'position'>[], index: number): number {
	return positionBetween(notes[index - 1]?.position, notes[index + 1]?.position);
}
