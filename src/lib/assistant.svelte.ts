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
