import { describe, expect, it } from 'vitest';
import {
	canArchiveNote,
	canEditNote,
	canRemoveNote,
	noteDash,
	noteExcerpt,
	moveNote,
	noteLabel,
	noteMatches,
	noteSurface,
	notesToMarkdown,
	positionAt,
	positionBetween,
	type NoteAccess
} from './notes';
import type { Note } from './server/crm/notes';

/** A note row with only the columns the helpers read filled in. */
function note(fields: Partial<Note> = {}): Note {
	// SAFETY: every helper under test reads only title, body and color; the
	// rest of the row is the database's, and naming it here would only make
	// the fixture rot with the schema.
	return {
		title: null,
		body: '',
		color: 'warning',
		archived_at: null,
		author_id: null,
		...fields
	} as Note;
}

const ME = '00000000-0000-0000-0000-000000000001';
const SOMEONE_ELSE = '00000000-0000-0000-0000-000000000002';

function access(fields: Partial<NoteAccess> = {}): NoteAccess {
	return {
		canManage: true,
		canDelete: true,
		viewer: { userId: ME, isOrgManager: false },
		...fields
	};
}

describe('noteLabel', () => {
	it('is the title when there is one', () => {
		expect(noteLabel(note({ title: 'Renewal call prep', body: 'Ask about the site' }))).toBe(
			'Renewal call prep'
		);
	});

	it('falls back to the first line that says something', () => {
		expect(noteLabel(note({ body: '\n\n  wifi: gotham-2026\nprinter: third floor' }))).toBe(
			'wifi: gotham-2026'
		);
	});

	it('never comes back empty, so a fresh note is still clickable', () => {
		expect(noteLabel(note())).toBe('Empty note');
		expect(noteLabel(note({ title: '   ', body: '  \n ' }))).toBe('Empty note');
	});
});

describe('noteExcerpt', () => {
	it('is the whole body when the note has a title', () => {
		expect(noteExcerpt(note({ title: 'Renewal call prep', body: 'Ask about the site\n' }))).toBe(
			'Ask about the site'
		);
	});

	it('skips the first line of an untitled note, which is its label', () => {
		expect(noteExcerpt(note({ body: '\n  wifi: gotham-2026\nprinter: third floor\n' }))).toBe(
			'printer: third floor'
		);
	});

	it('is empty when there is nothing past the label', () => {
		expect(noteExcerpt(note({ body: 'just one line' }))).toBe('');
		expect(noteExcerpt(note())).toBe('');
	});
});

describe('noteMatches', () => {
	const target = note({ title: 'Renewal call prep', body: 'Wayne wants the mid tier' });

	it('matches every term, in either order, in title or body', () => {
		expect(noteMatches(target, 'wayne renewal')).toBe(true);
		expect(noteMatches(target, 'RENEWAL MID')).toBe(true);
	});

	it('refuses a term that appears nowhere', () => {
		expect(noteMatches(target, 'wayne stark')).toBe(false);
	});

	it('matches everything when nothing was typed', () => {
		expect(noteMatches(target, '')).toBe(true);
		expect(noteMatches(target, '   ')).toBe(true);
	});

	it('searches an untitled note by its body alone', () => {
		expect(noteMatches(note({ body: 'procurement freeze' }), 'freeze')).toBe(true);
	});
});

describe('notesToMarkdown', () => {
	it('writes one heading per note, in the order given', () => {
		const markdown = notesToMarkdown([
			note({ title: 'First', body: 'one' }),
			note({ body: 'second note' })
		]);

		expect(markdown).toBe('## First\n\none\n\n---\n\n## second note\n\nsecond note');
	});

	it('is empty for no notes', () => {
		expect(notesToMarkdown([])).toBe('');
	});
});

describe('note colors', () => {
	it('paints from the app’s own tones rather than inventing any', () => {
		// Both halves carry their dark pair, which is what keeps a note legible
		// under the theme toggle.
		expect(noteSurface('warning')).toContain('dark:');
		expect(noteDash('warning')).toBe(noteDash('warning'));
		expect(noteDash('info')).not.toBe(noteDash('warning'));
	});
});

describe('who may write on a note', () => {
	const mine = note({ author_id: ME });
	const theirs = note({ author_id: SOMEONE_ELSE });

	it('lets the author edit their own note', () => {
		expect(canEditNote(mine, access())).toBe(true);
	});

	it('refuses somebody else’s note, grant or no grant', () => {
		// The `Authors and managers can update notes` policy would refuse the
		// save, so the editor must not be offered in the first place.
		expect(canEditNote(theirs, access())).toBe(false);
	});

	it('lets an owner or admin edit anyone’s', () => {
		expect(canEditNote(theirs, access({ viewer: { userId: ME, isOrgManager: true } }))).toBe(true);
	});

	it('refuses a reader who cannot manage notes at all', () => {
		expect(canEditNote(mine, access({ canManage: false }))).toBe(false);
	});

	it('reads an archived note rather than editing it', () => {
		const archived = note({ author_id: ME, archived_at: '2026-09-01T00:00:00Z' });
		expect(canEditNote(archived, access())).toBe(false);
		// …but restoring it is still the author's to do.
		expect(canArchiveNote(archived, access())).toBe(true);
	});

	it('takes the delete level to remove one, on top of authorship', () => {
		expect(canRemoveNote(mine, access())).toBe(true);
		expect(canRemoveNote(mine, access({ canDelete: false }))).toBe(false);
		expect(canRemoveNote(theirs, access())).toBe(false);
	});
});

describe('moveNote', () => {
	const rail = [note({ id: 'a' }), note({ id: 'b' }), note({ id: 'c' })];

	it('moves one note and keeps the others in order', () => {
		expect(moveNote(rail, 'c', 0).map((n) => n.id)).toEqual(['c', 'a', 'b']);
		expect(moveNote(rail, 'a', 2).map((n) => n.id)).toEqual(['b', 'c', 'a']);
		expect(moveNote(rail, 'b', 1).map((n) => n.id)).toEqual(['a', 'b', 'c']);
	});

	it('leaves the rail alone for an unknown note or a slot that is not there', () => {
		expect(moveNote(rail, 'zzz', 0).map((n) => n.id)).toEqual(['a', 'b', 'c']);
		expect(moveNote(rail, 'a', 3).map((n) => n.id)).toEqual(['a', 'b', 'c']);
		expect(moveNote(rail, 'a', -1)).not.toBe(rail);
	});
});

describe('positionBetween', () => {
	it('is the midpoint between two neighbours, higher nearer the top', () => {
		expect(positionBetween(30, 10)).toBe(20);
	});

	it('steps past the one neighbour it has, at either end of the rail', () => {
		expect(positionBetween(undefined, 10)).toBe(11);
		expect(positionBetween(30, undefined)).toBe(29);
	});

	it('reads the neighbours off a rail that has already been reordered', () => {
		const rail = [
			note({ id: 'a', position: 40 }),
			note({ id: 'moved', position: 5 }),
			note({ id: 'c', position: 20 })
		];
		expect(positionAt(rail, 1)).toBe(30);
		expect(positionAt(rail, 0)).toBe(6);
		expect(positionAt(rail, 2)).toBe(4);
	});
});
