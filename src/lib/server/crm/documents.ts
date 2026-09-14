import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { CrmEntityRef } from './entity';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `documents` — the writing that has a title.
 *
 * Same contract as every other module here: the request-scoped client plus
 * the active org id, RLS deciding what exists, `created_by` filled by the
 * database. A document is read and written WHOLE — `body` is one jsonb column
 * and nothing in this module merges, appends or patches into it, because the
 * editor holds the document and sends all of it (the documents migration says
 * why a block is not a row).
 *
 * What a document MENTIONS is not written here: that index is
 * `./references.ts`, and `saveDocumentBody()` is the one place the two are
 * kept in step, so a body can never be stored with a stale set of backlinks.
 */

export type Document = Tables<'documents'>;

type DocumentInsertColumn = 'parent_id' | 'title' | 'icon' | 'body';
type DocumentUpdateColumn = DocumentInsertColumn | 'entity_type' | 'entity_id' | 'archived_at';

/** What an edit may set — the columns the browser's grant actually covers. */
export type DocumentEdit = Pick<TablesUpdate<'documents'>, DocumentUpdateColumn>;

export async function listDocuments(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: {
		entity?: CrmEntityRef;
		/** `true` restricts to the pages attached to some record, `false` to the loose ones. */
		attached?: boolean;
		archived?: boolean;
		ids?: readonly string[];
		limit?: number;
	} = {}
): Promise<Document[]> {
	let query = supabase
		.from('documents')
		.select('*')
		.eq('org_id', orgId)
		// Most recently worked on first: for a page the interesting date is the
		// last edit, not the birth — which is also why the list ships
		// `updated_at` shown and `created_at` hidden.
		.order('updated_at', { ascending: false });
	if (filter.entity) {
		query = query
			.eq('entity_type', filter.entity.entityType)
			.eq('entity_id', filter.entity.entityId);
	}
	if (filter.attached === false) query = query.is('entity_type', null);
	if (filter.attached === true) query = query.not('entity_type', 'is', null);
	// Unset means both; the list hides the archive behind a filter.
	if (filter.archived === true) query = query.not('archived_at', 'is', null);
	if (filter.archived === false) query = query.is('archived_at', null);
	if (filter.ids) {
		if (filter.ids.length === 0) return [];
		query = query.in('id', [...filter.ids]);
	}
	if (filter.limit) query = query.limit(filter.limit);
	return unwrap(await query);
}

export async function getDocument(
	supabase: SupabaseClient<Database>,
	orgId: string,
	documentId: string
): Promise<Document | null> {
	return unwrap(
		await supabase
			.from('documents')
			.select('*')
			.eq('org_id', orgId)
			.eq('id', documentId)
			.maybeSingle()
	);
}

/**
 * Writes a page. Every column has a default, so `createDocument(supabase,
 * orgId)` is the blank page the "Add" button makes — created first, titled
 * and typed into after, exactly as a note is.
 */
export async function createDocument(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'documents'>, DocumentInsertColumn> = {},
	entity?: CrmEntityRef
): Promise<Document> {
	return unwrap(
		await supabase
			.from('documents')
			.insert({
				...values,
				org_id: orgId,
				entity_type: entity?.entityType ?? null,
				entity_id: entity?.entityId ?? null
			})
			.select()
			.single()
	);
}

/**
 * Applies an edit. RLS refuses a page in another org and PostgREST reports
 * that as zero rows — `.single()` turns it into the thrown error every other
 * module's refusals arrive as.
 */
export async function updateDocument(
	supabase: SupabaseClient<Database>,
	orgId: string,
	documentId: string,
	values: DocumentEdit
): Promise<Document> {
	return unwrap(
		await supabase
			.from('documents')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', documentId)
			.select()
			.single()
	);
}

export async function deleteDocument(
	supabase: SupabaseClient<Database>,
	orgId: string,
	documentId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('documents').delete().eq('org_id', orgId).eq('id', documentId).select('id'),
		'Page'
	);
}
