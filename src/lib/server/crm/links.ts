import type { SupabaseClient } from '@supabase/supabase-js';
import { RECORD_KINDS, recordHref, type RecordKind } from '$lib/crm/records';
import type { Database } from '$lib/database.types';
import type { Vocabulary } from '$lib/features/vocabulary';
import type { CrmEntityType } from './entity';
import { getRecord, type CanOpen } from './records';

/**
 * Where a row points, named and linked — what a surface shows on a note or
 * a calendar event that is about some record.
 *
 * Anything that is "about a record" says so through the same polymorphic
 * link (see `./entity`), so naming the target is one job whatever the table:
 * `getRecord()` — the app's one namer — rather than a second table-to-name
 * map that could disagree with the record page. Targets are deduped, and a
 * kind the reader may not open is not fetched at all (the record page's
 * rule): no link, and nothing leaked about a record they cannot see. Rows
 * pointing at nothing, which is most of them, cost no query.
 */

/** A row that may point at a record: what every table with the shared link has. */
export type LinkedRow = {
	id: string;
	entity_type: CrmEntityType | null;
	entity_id: string | null;
};

export type RecordLink = { label: string; href: string };

/** The records the given rows are about, keyed by row id. */
export async function recordLinks(
	supabase: SupabaseClient<Database>,
	orgId: string,
	rows: readonly LinkedRow[],
	canOpen: CanOpen,
	vocabulary: Vocabulary
): Promise<Record<string, RecordLink>> {
	const targets = new Map<string, { kind: RecordKind; id: string }>();
	for (const row of rows) {
		const kind = RECORD_KINDS.find((candidate) => candidate === row.entity_type);
		// `proposal_option` is an entity type with no page of its own; a row
		// about one is legal in the database and simply unnamed here.
		if (!kind || !row.entity_id || !canOpen(kind)) continue;
		targets.set(`${kind}:${row.entity_id}`, { kind, id: row.entity_id });
	}
	if (targets.size === 0) return {};

	const found = new Map(
		(
			await Promise.all(
				[...targets].map(async ([key, { kind, id }]) => {
					const record = await getRecord(supabase, orgId, kind, id, canOpen, vocabulary);
					return record
						? ([key, { label: record.name, href: recordHref(kind, id) }] as const)
						: null;
				})
			)
		).filter((entry): entry is [string, RecordLink] => entry !== null)
	);

	return Object.fromEntries(
		rows.flatMap((row) => {
			const link = found.get(`${row.entity_type}:${row.entity_id}`);
			return link ? [[row.id, link] as const] : [];
		})
	);
}
