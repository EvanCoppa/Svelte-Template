import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { CrmEntityType } from './entity';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `visits` — somebody went somewhere, about one CRM record,
 * and something came of it (the visits migration). Same contract as
 * companies.ts: the request-scoped client and the active org id, with RLS
 * deciding what exists.
 *
 * A visit has a `status` (where it sits) and an `occurred_at` (when it
 * happened), and the migration's trigger holds the one relationship between
 * them: `status = 'completed'` exactly when the timestamp is set. Neither is
 * written specially here: whichever column a caller sets, the database fills
 * in the other, so `updateVisit` is the whole story and there is no
 * `logVisit()` shadowing it.
 *
 * **Who went is not a column here.** A crew is two technicians and a
 * ride-along is a rep and their manager, so attendance is `attended_by`
 * relationships (docs/tasks.md's rule, applied) — drawn, added and removed by
 * the record page's generic Relationships card, which is already the one way
 * every relationship is written. Typed helpers like the task board's
 * `assignTask()` land here when a visit-specific screen needs them, and not
 * before. `created_by` still says who typed the row up, which is a different
 * fact and stays a column.
 *
 * **What the visit is about** is the shared polymorphic link, and the database
 * narrows it to the kinds you can go and see (`VISIT_SUBJECT_KINDS` in
 * $lib/crm/visits mirrors that constraint). Resolving a subject to its name is
 * `$lib/server/crm/records`' job, not this module's — it is the one place that
 * knows how to read any kind as a record.
 */

export type Visit = Tables<'visits'>;
export type VisitOutcome = Tables<'visit_outcomes'>;

/** A visit with the outcome it reached, which is how every screen reads one. */
export type VisitWithOutcome = Visit & {
	visit_outcomes: Pick<VisitOutcome, 'id' | 'name' | 'result' | 'tone'> | null;
};

type VisitColumn =
	| 'entity_type'
	| 'entity_id'
	| 'status'
	| 'scheduled_for'
	| 'occurred_at'
	| 'ended_at'
	| 'outcome_id'
	| 'notes'
	| 'latitude'
	| 'longitude'
	| 'location_accuracy_m';

const OUTCOME = 'visit_outcomes(id, name, result, tone)';

/**
 * The org's visits, most recent first, with unplanned ones — which have no
 * occurrence yet — at the top where they can be acted on.
 *
 * `entityType`/`entityId` is a record's own history, the question a record
 * page asks; `plannedOnly` is the round still to be made.
 */
export async function listVisits(
	supabase: SupabaseClient<Database>,
	orgId: string,
	filter: {
		entityType?: CrmEntityType;
		entityId?: string;
		plannedOnly?: boolean;
		ids?: readonly string[];
	} = {}
): Promise<VisitWithOutcome[]> {
	let query = supabase
		.from('visits')
		.select(`*, ${OUTCOME}`)
		.eq('org_id', orgId)
		.order('occurred_at', { ascending: false, nullsFirst: true })
		.order('scheduled_for', { ascending: false, nullsFirst: false });
	if (filter.entityType) query = query.eq('entity_type', filter.entityType);
	if (filter.entityId) query = query.eq('entity_id', filter.entityId);
	if (filter.plannedOnly) query = query.eq('status', 'planned');
	if (filter.ids) query = query.in('id', filter.ids);
	return unwrap(await query);
}

export async function getVisit(
	supabase: SupabaseClient<Database>,
	orgId: string,
	visitId: string
): Promise<VisitWithOutcome | null> {
	return unwrap(
		await supabase
			.from('visits')
			.select(`*, ${OUTCOME}`)
			.eq('org_id', orgId)
			.eq('id', visitId)
			.maybeSingle()
	);
}

export async function createVisit(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: Pick<TablesInsert<'visits'>, VisitColumn>
): Promise<Visit> {
	return unwrap(
		await supabase
			.from('visits')
			.insert({ ...values, org_id: orgId })
			.select()
			.single()
	);
}

export async function updateVisit(
	supabase: SupabaseClient<Database>,
	orgId: string,
	visitId: string,
	values: Pick<TablesUpdate<'visits'>, VisitColumn>
): Promise<Visit> {
	return unwrap(
		await supabase
			.from('visits')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', visitId)
			.select()
			.single()
	);
}

export async function deleteVisit(
	supabase: SupabaseClient<Database>,
	orgId: string,
	visitId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('visits').delete().eq('org_id', orgId).eq('id', visitId).select('id'),
		'Visit'
	);
}

/** The outcomes this org can reach, in its own order — the form's picker. */
export async function listVisitOutcomes(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<VisitOutcome[]> {
	return unwrap(
		await supabase
			.from('visit_outcomes')
			.select('*')
			.eq('org_id', orgId)
			.order('sort_order', { ascending: true })
			.order('name', { ascending: true })
	);
}
