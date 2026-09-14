import type { SupabaseClient } from '@supabase/supabase-js';
import { documentMentions, type DocumentMention } from '$lib/crm/documents';
import type { Database, Enums, Tables } from '$lib/database.types';
import { updateDocument, type Document, type DocumentEdit } from './documents';
import type { CrmEntityRef } from './entity';
import { unwrap } from './unwrap';

/**
 * The reference index — what a piece of writing names, and who names a record.
 *
 * A body is opaque jsonb, so "which pages mention this company" has to be
 * rows. This module is the only place those rows are written, and
 * `saveDocument()` below is the only place a body and its index are written
 * together — which is what stops a document being stored with a stale set of
 * backlinks.
 *
 * The rows are DERIVED. Nothing here is a fact a person typed, so the index
 * is rebuilt wholesale on every save rather than diffed, and a reference that
 * cannot be written is dropped rather than failing the save: losing one
 * backlink is recoverable (the next save rebuilds it), losing somebody's
 * writing is not.
 */

export type EntityReference = Tables<'entity_references'>;
export type ReferenceKind = Enums<'reference_kind'>;

/**
 * Who names this record — the backlinks a record page's "Mentioned in" group
 * draws. Returns the SOURCES, so the caller resolves their names through
 * their own kinds' modules and applies its own feature gate: a reference is
 * not a licence to see the thing referencing it.
 */
export async function listReferencesTo(
	supabase: SupabaseClient<Database>,
	orgId: string,
	target: CrmEntityRef,
	kind?: ReferenceKind
): Promise<EntityReference[]> {
	let query = supabase
		.from('entity_references')
		.select('*')
		.eq('org_id', orgId)
		.eq('target_type', target.entityType)
		.eq('target_id', target.entityId)
		.order('created_at', { ascending: false });
	if (kind) query = query.eq('kind', kind);
	return unwrap(await query);
}

/** What this piece of writing names — the outward half, for the editor's rail. */
export async function listReferencesFrom(
	supabase: SupabaseClient<Database>,
	orgId: string,
	source: CrmEntityRef,
	kind?: ReferenceKind
): Promise<EntityReference[]> {
	let query = supabase
		.from('entity_references')
		.select('*')
		.eq('org_id', orgId)
		.eq('source_type', source.entityType)
		.eq('source_id', source.entityId)
		.order('created_at', { ascending: true });
	if (kind) query = query.eq('kind', kind);
	return unwrap(await query);
}

/**
 * Rewrites one source's index to exactly this set of mentions.
 *
 * Delete-then-insert rather than a diff, because the body is the truth and
 * the rows are a projection of it: a diff would be more code and one more
 * place for the two to drift. The delete is scoped to `kind` so rewriting the
 * mentions never disturbs an embed (and vice versa, when the `/view` block
 * lands).
 *
 * A mention whose target went away between the edit and the save is dropped:
 * the batch is retried row by row and the refusals skipped, so one stale
 * reference costs one backlink rather than the whole index.
 */
export async function setReferences(
	supabase: SupabaseClient<Database>,
	orgId: string,
	source: CrmEntityRef,
	targets: readonly DocumentMention[],
	kind: ReferenceKind = 'mention'
): Promise<void> {
	unwrap(
		await supabase
			.from('entity_references')
			.delete()
			.eq('org_id', orgId)
			.eq('source_type', source.entityType)
			.eq('source_id', source.entityId)
			.eq('kind', kind)
			.select('id')
	);

	if (targets.length === 0) return;

	const rows = targets
		// A page that mentions itself is not a backlink, and the database
		// refuses the row — so it never becomes the one bad row that sends the
		// whole batch down the slow path below.
		.filter((target) => !(target.kind === source.entityType && target.id === source.entityId))
		.map((target) => ({
			org_id: orgId,
			source_type: source.entityType,
			source_id: source.entityId,
			target_type: target.kind,
			target_id: target.id,
			kind
		}));
	if (rows.length === 0) return;

	const { error } = await supabase.from('entity_references').insert(rows);
	if (!error) return;

	// One of them names a record that is no longer there. Put back the ones
	// that can go in; the body is already saved either way.
	for (const row of rows) {
		await supabase.from('entity_references').insert(row);
	}
}

/**
 * Saves a document and re-indexes what it mentions, in that order.
 *
 * The order is the point: the writing lands first, so a failure in the
 * derived index can never cost somebody their page. Callers never write
 * `body` through `updateDocument()` directly — go through here, or the
 * backlinks quietly stop matching the prose.
 */
export async function saveDocument(
	supabase: SupabaseClient<Database>,
	orgId: string,
	documentId: string,
	values: DocumentEdit
): Promise<Document> {
	const document = await updateDocument(supabase, orgId, documentId, values);
	if (values.body !== undefined) {
		await setReferences(
			supabase,
			orgId,
			{ entityType: 'document', entityId: documentId },
			documentMentions(document.body)
		);
	}
	return document;
}
