import {
	MENTION_CLASS,
	MENTION_ID_ATTR,
	MENTION_TYPE_ATTR,
	type DocumentMention
} from '$lib/crm/documents';

/**
 * The `@` language, in the browser.
 *
 * Editor.js has no notion of a trigger character: its inline tools are
 * selection-driven, so they appear when you highlight something. Typing `@`
 * and getting a menu is therefore ours to build, and this module is the whole
 * of it — the pure half (where does the query start and end) beside the two
 * DOM acts (put a mention in, and tell the sanitizer to keep it).
 *
 * The rule the rest of the app depends on: what goes into the body is
 * `mentionAnchor()` from `$lib/crm/documents`, and nothing else. That function
 * and `documentMentions()` are a matched pair — if a mention is written any
 * other way here, the server stops indexing it and a backlink quietly goes
 * missing with nothing to notice.
 */

/** What the menu is searching for, and the text it will replace. */
export type MentionQuery = {
	/** Where the `@` sits in the text. */
	start: number;
	/** Where the caret sits — the end of what has been typed. */
	end: number;
	/** What was typed after the `@`. */
	query: string;
};

/** Past this, it is a sentence rather than a name, and the menu stands down. */
const MAX_QUERY = 60;

/**
 * The `@…` being typed immediately before the caret, or null.
 *
 * Pure and offset-based so it can be tested without a DOM. The rules are the
 * ones that stop a menu opening over an email address or a stray `@`: the
 * trigger must start the line or follow whitespace, and the query itself may
 * not contain whitespace beyond a single space between words.
 */
export function mentionQueryAt(text: string, caret: number): MentionQuery | null {
	const before = text.slice(0, caret);
	const at = before.lastIndexOf('@');
	if (at === -1) return null;

	// `foo@bar.com` is an address, not a mention: something must separate the
	// trigger from the word before it.
	const preceding = at === 0 ? '' : before[at - 1];
	if (preceding !== '' && !/[\s\u00a0]/.test(preceding)) return null;

	const query = before.slice(at + 1);
	if (query.length > MAX_QUERY) return null;
	// One space is allowed, so "Acme Ho" still finds "Acme Holdings"; a second
	// means the typist moved on and the `@` was just punctuation.
	if (/[\n\t]/.test(query) || (query.match(/[ \u00a0]/g) ?? []).length > 1) return null;

	return { start: at, end: caret, query };
}

/** The caret, when it sits in a text node inside `root`. */
export type CaretPosition = { node: Text; offset: number };

export function caretIn(root: HTMLElement): CaretPosition | null {
	const selection = window.getSelection();
	if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return null;
	const node = selection.anchorNode;
	if (!node || node.nodeType !== Node.TEXT_NODE) return null;
	if (!root.contains(node)) return null;
	// SAFETY: `nodeType === Node.TEXT_NODE` is the DOM's own discriminant for
	// `Text`, checked on the line above; TypeScript's lib types do not model it
	// as a narrowing, so the assertion states what the check established.
	return { node: node as Text, offset: selection.anchorOffset };
}

/**
 * Replaces the `@…` the typist wrote with a mention, and leaves the caret
 * after it with a space — so the sentence carries on rather than continuing
 * inside the link.
 */
export function insertMention(
	caret: CaretPosition,
	found: MentionQuery,
	mention: DocumentMention,
	label: string
): void {
	const range = document.createRange();
	range.setStart(caret.node, found.start);
	range.setEnd(caret.node, found.end);
	range.deleteContents();

	const anchor = document.createElement('a');
	anchor.className = MENTION_CLASS;
	anchor.setAttribute(MENTION_TYPE_ATTR, mention.kind);
	anchor.setAttribute(MENTION_ID_ATTR, mention.id);
	anchor.textContent = label;
	range.insertNode(anchor);

	// A trailing space, and the caret in it. Without this the caret stays
	// inside the anchor and the next word joins the link.
	const after = document.createTextNode('\u00a0');
	anchor.after(after);

	const selection = window.getSelection();
	if (!selection) return;
	const caretRange = document.createRange();
	caretRange.setStart(after, 1);
	caretRange.collapse(true);
	selection.removeAllRanges();
	selection.addRange(caretRange);
}

/**
 * The inline tool whose only job is to tell Editor.js's sanitizer that a
 * mention anchor may stay.
 *
 * Editor.js strips every tag a tool has not declared, and it builds that
 * allow-list from the INLINE tools in play — so without this, the anchors
 * written above would survive in the DOM and vanish on `save()`, which is the
 * worst failure available: the writing looks right and the index is empty.
 *
 * It is a real tool rather than a sanitize stub — selecting text and pressing
 * the button opens the same menu the `@` does — so nothing about it is a
 * workaround that a later Editor.js release could quietly drop.
 */
export function createMentionTool(onPick: () => void) {
	return class MentionTool {
		static isInline = true;
		static title = 'Mention';

		static get sanitize() {
			return {
				a: {
					class: MENTION_CLASS,
					[MENTION_TYPE_ATTR]: true,
					[MENTION_ID_ATTR]: true
				}
			};
		}

		private button: HTMLButtonElement | null = null;

		render(): HTMLElement {
			const button = document.createElement('button');
			button.type = 'button';
			button.classList.add('ce-inline-tool');
			button.textContent = '@';
			button.title = 'Mention a record';
			this.button = button;
			return button;
		}

		surround(): void {
			onPick();
		}

		checkState(): boolean {
			return false;
		}

		clear(): void {
			this.button = null;
		}
	};
}
