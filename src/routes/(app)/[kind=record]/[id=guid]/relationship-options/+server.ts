import { error, json } from '@sveltejs/kit';
import { RECORD_KIND_META, recordKindForSegment, recordListHref } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { listRecordNames } from '$lib/server/crm/records';
import { hasGrant, requirePermission } from '$lib/server/roles';
import { listStaff } from '$lib/server/staff';
import { RELATIONSHIP_OTHER_KINDS, type RelationshipOtherKind } from '$lib/schemas/relationships';
import type { RequestHandler } from './$types';

/**
 * The record picker behind the Relationships card's "Add relationship" form:
 * every name of one kind, fetched only once the reader has chosen that kind.
 * A JS-triggered GET read rather than something the page's own load carries
 * on every visit — the kind isn't known until the reader picks a
 * relationship type, and most visits never open this control at all.
 */

const OTHER_KINDS = new Set<string>(RELATIONSHIP_OTHER_KINDS);

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw error(401, 'Sign in required.');

	const kind = recordKindForSegment(params.kind);
	// The same gate the action takes: only a reader who may draw a
	// relationship on this record needs to see who it could point at.
	requirePermission(org.access, RECORD_KIND_META[kind].feature, 'manage');

	const otherKindParam = url.searchParams.get('kind');
	if (!otherKindParam || !OTHER_KINDS.has(otherKindParam)) {
		throw error(400, 'Unknown kind.');
	}
	// SAFETY: just checked `otherKindParam` is a member of `OTHER_KINDS`, the
	// runtime set built from `RELATIONSHIP_OTHER_KINDS`.
	const otherKind = otherKindParam as RelationshipOtherKind;

	// A member has no feature of their own — reading a colleague's name takes
	// no more than sharing an org with them, the roster's own rule.
	if (otherKind === 'member') {
		const members = await listStaff(supabase, activeOrgId);
		return json(
			members.map((member) => ({
				value: member.userId,
				label: member.displayName ?? member.email ?? 'Member'
			}))
		);
	}

	const { features, access } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	if (!passesFeatureGate(recordListHref(otherKind), features, canRead)) {
		throw error(403, 'You do not have access to this kind of record.');
	}

	const names = await listRecordNames(supabase, activeOrgId, otherKind);
	return json(names.map((row) => ({ value: row.id, label: row.name })));
};
