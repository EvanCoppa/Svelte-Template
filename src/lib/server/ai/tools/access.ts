import { RECORD_KIND_META, RECORD_KINDS, recordTerms, type RecordKind } from '$lib/crm/records';
import { visibleTerms } from '$lib/features/terms';
import type { FeatureId } from '$lib/features/types';
import type { CanOpen } from '$lib/server/crm/records';
import type { OrgContext } from '$lib/server/org-context';
import { hasGrant, type PermissionLevel } from '$lib/server/roles';
import type { AssistantToolContext } from '../context';

/**
 * A tool is linked to the feature whose data it touches, at the level it
 * needs there — the same key and the same read < manage < delete ladder the
 * rest of the app is gated on. The assistant itself grants nothing: if the
 * feature is switched off for the org, or the caller lacks the level, the
 * tool does not exist for this request.
 *
 * Two shapes. A tool about one feature names it. A tool addressed by record
 * kind (`getRecord`, `updateRecord`, …) serves every kind through one door,
 * so it is offered while ANY of the kinds' features is open to the caller
 * (`anyOf`) and re-checks the one kind a call names with `recordAccess()` —
 * a kind whose feature is off for the org, or that the caller may not
 * read, fails inside the call exactly as a single-feature tool would.
 */
export type ToolAccess =
	| { feature: FeatureId; level: PermissionLevel }
	| { anyOf: readonly FeatureId[]; level: PermissionLevel };

/** The access one call on a kind-addressed tool needs: that kind's feature, at the level. */
export function recordAccess(kind: RecordKind, level: PermissionLevel): ToolAccess {
	return { feature: RECORD_KIND_META[kind].feature, level };
}

/** A kind-addressed tool's own access: offered while any record kind is open at the level. */
export function anyRecordAccess(level: PermissionLevel): ToolAccess {
	return { anyOf: RECORD_KINDS.map((kind) => RECORD_KIND_META[kind].feature), level };
}

/**
 * The intersection the hook enforces for pages, applied to one tool: the
 * feature's mode for the org must be `enabled` AND the caller must hold the
 * level. Drives `activeTools` on the agent, so the model never even sees a
 * tool it may not call.
 */
export function isToolActive(org: OrgContext, access: ToolAccess): boolean {
	if ('anyOf' in access) {
		return access.anyOf.some((feature) => isToolActive(org, { feature, level: access.level }));
	}
	return (
		org.features[access.feature]?.mode === 'enabled' &&
		hasGrant(org.access, access.feature, access.level)
	);
}

/**
 * Defence in depth behind `activeTools`, run first in every tool: a call the
 * model should not have been able to make (a stale one replayed from a
 * stored thread, a forged one) fails here as a tool error the model can read
 * and explain, before any data module runs.
 */
export function requireToolContext(
	context: AssistantToolContext,
	access: ToolAccess
): AssistantToolContext {
	if (!isToolActive(context.org, access)) {
		const subject = 'anyOf' in access ? 'any kind of record' : access.feature;
		throw new Error(
			`This organization or your role does not allow "${access.level}" on ${subject}.`
		);
	}
	return context;
}

/**
 * Whether a request may read a kind of record — the record page's `canOpen`,
 * answered from the tool context: the same intersection as `isToolActive`,
 * so a related record, a relationship's other end or a graph node is named
 * to the model exactly when the page would link it, and a kind the caller
 * may not open is never fetched.
 */
export function canOpenFor(org: OrgContext): CanOpen {
	return (kind) => isToolActive(org, recordAccess(kind, 'read'));
}

/** One kind of record as this session may use it: its id, its industry's words, and what the caller may do. */
export type RecordKindAccess = {
	kind: RecordKind;
	/** The list, as the sidebar names it: "Patients". */
	name: string;
	/** One of them: "patient". */
	noun: string;
	canManage: boolean;
};

/**
 * The record kinds this request may read, named the way the org's industry
 * names them — what the session block tells the model, so it asks for a
 * "patient" as `kind: 'contact'` and never for a kind that does not exist
 * for this org. Same predicate as the nav, so the list matches the sidebar.
 */
export function recordKindAccess(org: OrgContext): RecordKindAccess[] {
	const canOpen = canOpenFor(org);
	const terms = visibleTerms(org.features, (featureId) => hasGrant(org.access, featureId));
	return RECORD_KINDS.flatMap((kind): RecordKindAccess[] => {
		if (!canOpen(kind) || !terms[RECORD_KIND_META[kind].feature]?.noun) return [];
		const { name, noun } = recordTerms(terms, kind);
		return [{ kind, name, noun, canManage: isToolActive(org, recordAccess(kind, 'manage')) }];
	});
}
