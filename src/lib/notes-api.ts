import { toast } from 'svelte-sonner';
import { z } from 'zod';
import { invalidate } from '$app/navigation';
import { QUERY } from '$lib/queries';
import type { NoteInput, NotePatch } from '$lib/notes';
import type { Note } from '$lib/server/crm/notes';

/**
 * The browser's half of the notes API (`src/routes/api/notes`).
 *
 * Notes are the app's one cross-page mutation: the dock floats over every
 * screen, so it has no page action to post to, and the same editor is used on
 * `/notes` and on a record page. One endpoint, reached only through
 * `noteCommands` below, is what keeps that a single mechanism instead of one
 * per surface.
 */
const notesApi = {
	create: (input: NoteInput = {}): Promise<Note> => send('/api/notes', 'POST', input),
	save: (id: string, patch: NotePatch): Promise<Note> => send(`/api/notes/${id}`, 'PATCH', patch),
	async remove(id: string): Promise<void> {
		await request(`/api/notes/${id}`, 'DELETE');
	}
};

/** What a write carries: the columns for a new note, or the ones an edit changes. */
type NoteWrite = NoteInput | NotePatch;

async function send(url: string, method: 'POST' | 'PATCH', body: NoteWrite): Promise<Note> {
	const response = await request(url, method, body);
	const note: Note = await response.json();
	return note;
}

/** Throws the endpoint's own message, so a refusal reads as one in a toast. */
async function request(url: string, method: string, body?: NoteWrite): Promise<Response> {
	const response = await fetch(url, {
		method,
		headers: body === undefined ? undefined : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	if (!response.ok) {
		throw new Error(await errorMessage(response));
	}
	return response;
}

/** What SvelteKit's `error()` answers with; anything else is not one of ours. */
const errorBody = z.object({ message: z.string() });

async function errorMessage(response: Response): Promise<string> {
	// A proxy or an outage answers HTML, and a page of markup in a toast helps
	// nobody — those fall back to the status.
	const parsed = errorBody.safeParse(await response.json().catch(() => null));
	return parsed.success ? parsed.data.message : `That did not save (${response.status}).`;
}

/**
 * The four things a note surface does, with the refresh and the error report
 * already in them.
 *
 * Freshness is one key: every surface that shows a note depends on
 * `QUERY.notes` (the shell's dock included), so one `invalidate` after a
 * write is what keeps the rail, the page and a record's card in step —
 * `invalidateAll()` would reload the world to move a sticky note.
 *
 * Saving is deliberately silent. An autosave that toasts every 250 ms is a
 * notification stream, so only the things you can't see for yourself say
 * anything, and only failures interrupt.
 */
export const noteCommands = {
	/** A blank sticky, or one already about a record. Null if it was refused. */
	async create(input: NoteInput = {}): Promise<Note | null> {
		return run(() => notesApi.create(input));
	},
	async save(id: string, patch: NotePatch): Promise<Note | null> {
		return run(() => notesApi.save(id, patch));
	},
	async archive(id: string, archived: boolean): Promise<Note | null> {
		const note = await run(() => notesApi.save(id, { archived }));
		if (note) toast.success(archived ? 'Note archived' : 'Note restored');
		return note;
	},
	async remove(id: string): Promise<boolean> {
		const done = await run(async () => {
			await notesApi.remove(id);
			return true as const;
		});
		if (done) toast.success('Note deleted');
		return done === true;
	}
};

async function run<T>(write: () => Promise<T>): Promise<T | null> {
	try {
		const result = await write();
		await invalidate(QUERY.notes);
		return result;
	} catch (cause) {
		toast.error(cause instanceof Error ? cause.message : 'That note could not be saved.');
		return null;
	}
}
