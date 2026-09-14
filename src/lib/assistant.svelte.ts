import { z } from 'zod';
import { browser } from '$app/environment';
import type { ConversationSummary } from '$lib/server/ai/conversations';

/**
 * The assistant's two thread dialogs, as one call from anywhere:
 *
 *   import { renameThread, deleteThread } from '$lib/assistant.svelte';
 *   renameThread(conversation);
 *
 * Module-level runes, like the upgrade prompt and the ⌘K palette, because the
 * surface that asks and the surface that answers are not the same one: the
 * threads are drawn by the sidebar the (app) layout mounts, while the forms
 * that rename and delete one belong to the assistant page — the route their
 * actions are on. Nothing here validates or posts; it only says which thread
 * a dialog is about.
 */
function createThreadDialogs() {
	let renaming = $state<ConversationSummary | null>(null);
	let deleting = $state<ConversationSummary | null>(null);

	return {
		/** The thread being renamed, or null when that dialog is closed. */
		get renaming() {
			return renaming;
		},
		/** The thread being deleted, or null when that dialog is closed. */
		get deleting() {
			return deleting;
		},
		rename(conversation: ConversationSummary) {
			renaming = conversation;
		},
		remove(conversation: ConversationSummary) {
			deleting = conversation;
		},
		closeRename() {
			renaming = null;
		},
		closeDelete() {
			deleting = null;
		}
	};
}

export const threadDialogs = createThreadDialogs();

/** Open the rename dialog for a thread. */
export function renameThread(conversation: ConversationSummary): void {
	threadDialogs.rename(conversation);
}

/** Open the delete confirmation for a thread. */
export function deleteThread(conversation: ConversationSummary): void {
	threadDialogs.remove(conversation);
}

/**
 * The threads this tab has open, as the strip above the conversation draws
 * them. **Ids only**: a title is looked up from the thread list the page
 * already has, so renaming one renames its tab and deleting one drops it
 * without anything here being told.
 *
 * Device state, in `sessionStorage` like the breadcrumb trail and for the
 * same reasons — this browser tab's own, no cookie on every request — so a
 * refresh keeps what you had open and a private window simply starts fresh.
 */
const OPEN_KEY = 'assistant:open';

/** What the store may find under that key — parsed, like the breadcrumb trail's. */
const openSchema = z.array(z.string());

function createOpenThreads() {
	let ids = $state<string[]>(read());

	function read(): string[] {
		if (!browser) return [];
		try {
			const raw = sessionStorage.getItem(OPEN_KEY);
			const parsed = openSchema.safeParse(raw ? JSON.parse(raw) : []);
			return parsed.success ? parsed.data : [];
		} catch {
			// Cleared, blocked or corrupt storage all read as "nothing open".
			return [];
		}
	}

	function save() {
		if (!browser) return;
		try {
			sessionStorage.setItem(OPEN_KEY, JSON.stringify(ids));
		} catch {
			// A private window can refuse to store; the strip still works for this visit.
		}
	}

	return {
		get ids() {
			return ids;
		},
		/** Record a thread as open, newest at the end, without duplicating it. */
		open(id: string) {
			if (ids.includes(id)) return;
			ids = [...ids, id];
			save();
		},
		/** Forget a thread: closed, deleted, or gone from the list the page can see. */
		close(id: string) {
			if (!ids.includes(id)) return;
			ids = ids.filter((open) => open !== id);
			save();
		},
		/** Drop everything the page no longer has a thread for. */
		keepOnly(known: Set<string>) {
			const kept = ids.filter((id) => known.has(id));
			if (kept.length === ids.length) return;
			ids = kept;
			save();
		}
	};
}

export const openThreads = createOpenThreads();
