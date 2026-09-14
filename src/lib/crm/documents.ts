import type { Json } from '$lib/database.types';
import {
	blockSchema,
	documentBodyReadSchema,
	DOCUMENT_BODY_VERSION,
	stringsInSchema,
	type DocumentBlock,
	type DocumentBody
} from '$lib/schemas/documents';
import { isRecordKind, type RecordKind } from './records';

/**
 * What a document IS to the browser: what it is called, what its body holds,
 * what it mentions, and how a nested set of them becomes a tree.
 *
 * Pure on purpose, the way `$lib/notes.ts` is — the list page, the editor,
 * the record page's Pages tab and the server's reference indexer all read
 * this file, so a document has one title and one set of mentions wherever it
 * is drawn. No `$lib/server` import and no `$app/*` import, so it stays
 * testable in node.
 *
 * The body is the editor's blocks inside OUR envelope (the documents
 * migration says why): `blocks` is whatever the editor emitted, `version` is
 * this schema's number. Nothing here refuses a block it does not recognise —
 * an unreadable block is the renderer's problem, never a reason to lose
 * somebody's writing.
 */

export { DOCUMENT_BODY_VERSION };
export type { DocumentBlock, DocumentBody };

/** What a page is created with, and what an unreadable body reads as. */
export function emptyDocumentBody(): DocumentBody {
	return { version: DOCUMENT_BODY_VERSION, blocks: [] };
}

/**
 * The `body` column as a body.
 *
 * Decoded by the schema, never inspected field by field — the same call
 * `$lib/whiteboard/scene` makes about a stored scene. An envelope that
 * cannot be read at all opens EMPTY rather than half-understood; a single
 * block that cannot be read is DROPPED and the rest of the page survives,
 * which is the opposite trade and the right one — losing one paragraph to a
 * version skew beats losing the document.
 */
export function documentBody(value: Json): DocumentBody {
	const envelope = documentBodyReadSchema.safeParse(value);
	if (!envelope.success) return emptyDocumentBody();
	return {
		version: envelope.data.version,
		blocks: envelope.data.blocks.flatMap((block) => {
			const parsed = blockSchema.safeParse(block);
			return parsed.success ? [parsed.data] : [];
		})
	};
}

const TAG = /<[^>]*>/g;
const ENTITY = new Map([
	['&amp;', '&'],
	['&lt;', '<'],
	['&gt;', '>'],
	['&quot;', '"'],
	['&#39;', "'"],
	['&nbsp;', ' ']
]);

/** Every string inside a block — its words and the markup around them. */
function blockStrings(block: DocumentBlock): string[] {
	const parsed = stringsInSchema.safeParse(block.data);
	return parsed.success ? parsed.data : [];
}

/** One block's words, without the markup the editor wrote around them. */
export function blockText(block: DocumentBlock): string {
	return blockStrings(block)
		.join(' ')
		.replace(TAG, '')
		.replace(/&[a-z#0-9]+;/gi, (entity) => ENTITY.get(entity) ?? entity)
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * What to call a document. Its title if it has one, otherwise the first
 * words in it — the way `noteLabel()` names an untitled note by its first
 * line, and for the same reason: a page created and typed into still needs a
 * row in the list to click. Never empty.
 *
 * The fallback word is deliberately not the industry's noun: this is the name
 * of a page that has none, and "Untitled" is what every editor calls that.
 */
export function documentTitle(document: { title: string | null; body?: Json }): string {
	const title = document.title?.trim();
	if (title) return title;
	for (const block of documentBody(document.body ?? null).blocks) {
		const text = blockText(block);
		if (text) return text.length > 80 ? `${text.slice(0, 79)}…` : text;
	}
	return 'Untitled';
}

// ---------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------
// An `@` reference is an anchor in the block's own HTML carrying the pair the
// whole CRM shares — the kind and the id, never a name, so renaming a company
// does not break the sentence that named it. The editor writes one of these;
// the server reads them back out on save and rewrites `entity_references`.

export const MENTION_CLASS = 'doc-mention';
export const MENTION_TYPE_ATTR = 'data-mention-type';
export const MENTION_ID_ATTR = 'data-mention-id';

/** One mention, as the index stores it. */
export type DocumentMention = { kind: RecordKind; id: string };

/**
 * The anchor the editor inserts. Kept here beside the parser so the two can
 * never disagree about the attribute names — the bug where mentions silently
 * stop being indexed and nobody notices until a backlink is missing.
 */
export function mentionAnchor(mention: DocumentMention, label: string): string {
	const text = label.replace(/[<>&]/g, (character) =>
		character === '<' ? '&lt;' : character === '>' ? '&gt;' : '&amp;'
	);
	return `<a class="${MENTION_CLASS}" ${MENTION_TYPE_ATTR}="${mention.kind}" ${MENTION_ID_ATTR}="${mention.id}">${text}</a>`;
}

const ANCHOR = /<a\b[^>]*>/gi;
const TYPE_VALUE = new RegExp(`${MENTION_TYPE_ATTR}="([a-z_]+)"`, 'i');
const ID_VALUE = new RegExp(
	`${MENTION_ID_ATTR}="([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"`,
	'i'
);

/**
 * Every record a body names, deduplicated and in the order it first appears.
 *
 * Reads the strings anywhere in the body rather than only a paragraph's
 * `text`, because an inline tool can land in a heading, a list item, a quote
 * or a table cell, and a mention that stopped being indexed because somebody
 * put it in a list is exactly the kind of quiet failure this index cannot
 * afford. A kind the app has no page for is skipped: the index only holds
 * things a backlink could open.
 */
export function documentMentions(body: Json): DocumentMention[] {
	const found = new Map<string, DocumentMention>();
	for (const block of documentBody(body).blocks) {
		for (const fragment of blockStrings(block)) {
			for (const tag of fragment.match(ANCHOR) ?? []) {
				const kind = tag.match(TYPE_VALUE)?.[1];
				const id = tag.match(ID_VALUE)?.[1];
				if (!kind || !id || !isRecordKind(kind)) continue;
				const key = `${kind}:${id}`;
				if (!found.has(key)) found.set(key, { kind, id });
			}
		}
	}
	return [...found.values()];
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/** The columns the tree fold needs — a row with a parent and a name. */
export type DocumentNode = {
	id: string;
	parent_id: string | null;
	title: string | null;
};

export type DocumentTreeNode<T extends DocumentNode> = {
	document: T;
	/** How deep it sits: a root is 0. */
	depth: number;
	children: DocumentTreeNode<T>[];
};

/**
 * The flat rows as a tree, siblings in the order they arrived.
 *
 * Copies `categoryTree()` exactly, including why: a node whose parent is not
 * in the list becomes a root rather than disappearing, and a cycle the
 * database somehow let through is shown at the top level instead of hanging
 * the walk. A page drawn at the wrong depth beats a page that vanished.
 */
export function documentTree<T extends DocumentNode>(
	documents: readonly T[]
): DocumentTreeNode<T>[] {
	const byParent = new Map<string | null, T[]>();
	const ids = new Set(documents.map((document) => document.id));
	for (const document of documents) {
		const parent =
			document.parent_id !== null && ids.has(document.parent_id) ? document.parent_id : null;
		const siblings = byParent.get(parent);
		if (siblings) siblings.push(document);
		else byParent.set(parent, [document]);
	}

	const placed = new Set<string>();
	const build = (parentId: string | null, depth: number): DocumentTreeNode<T>[] =>
		(byParent.get(parentId) ?? [])
			.filter((document) => !placed.has(document.id))
			.map((document) => {
				placed.add(document.id);
				return { document, depth, children: build(document.id, depth + 1) };
			});

	const roots = build(null, 0);
	for (const document of documents) {
		if (placed.has(document.id)) continue;
		placed.add(document.id);
		roots.push({ document, depth: 0, children: build(document.id, 1) });
	}
	return roots;
}

/** The tree flattened back to rows in reading order, each carrying its depth. */
export function flattenDocumentTree<T extends DocumentNode>(
	nodes: readonly DocumentTreeNode<T>[]
): DocumentTreeNode<T>[] {
	return nodes.flatMap((node) => [node, ...flattenDocumentTree(node.children)]);
}

/**
 * Every page that is this one or under it — the ids a "move" must refuse as a
 * new parent, since a page cannot become its own ancestor. The database's
 * trigger only refuses the self-parent case; this is what keeps the rest off
 * the picker in the first place.
 */
export function documentSubtreeIds<T extends DocumentNode>(
	documents: readonly T[],
	documentId: string
): Set<string> {
	const byParent = new Map<string, T[]>();
	for (const document of documents) {
		if (document.parent_id === null) continue;
		const siblings = byParent.get(document.parent_id);
		if (siblings) siblings.push(document);
		else byParent.set(document.parent_id, [document]);
	}
	const ids = new Set<string>();
	const walk = (id: string) => {
		if (ids.has(id)) return;
		ids.add(id);
		for (const child of byParent.get(id) ?? []) walk(child.id);
	};
	walk(documentId);
	return ids;
}
