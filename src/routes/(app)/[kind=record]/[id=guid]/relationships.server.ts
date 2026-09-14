import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate, type SuperValidated } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Infer } from 'sveltekit-superforms';
import {
	RECORD_KIND_META,
	RECORD_KINDS,
	recordKindForSegment,
	type RecordKind,
	type RecordSegment
} from '$lib/crm/records';
import { relationshipTypeOptions, type RelationshipTypeOption } from '$lib/crm/relationships';
import type { CrmEntityRef } from '$lib/server/crm/entity';
import type { CanOpen } from '$lib/server/crm/records';
import {
	createRelationship,
	listRelationships,
	listRelationshipTypes,
	orientRelationship,
	removeRelationship
} from '$lib/server/crm/relationships';
import { can, requirePermission } from '$lib/server/roles';
import {
	addRelationshipSchema,
	removeRelationshipSchema,
	RELATIONSHIP_OTHER_KINDS,
	type RelationshipOtherKind
} from '$lib/schemas/relationships';
import type { Actions } from './$types';

/**
 * The write side of the record page's Relationships card — drawing one and
 * removing one, the piece docs/relationships.md flags as not built yet. The
 * read side (`getRelationships()`) already lives in the page's own load; this
 * module is only what it takes to write a row: the type-and-direction
 * choices that fit this record's own kind, which other kinds the reader may
 * point at, and the two actions.
 */

export const RELATIONSHIP_FORM_IDS = {
	add: 'add-relationship',
	remove: 'remove-relationship'
} as const;

export type RelationshipForms = {
	add: SuperValidated<Infer<typeof addRelationshipSchema>>;
	remove: SuperValidated<Infer<typeof removeRelationshipSchema>>;
};

/**
 * What the record page's load adds so the Relationships card can draw the
 * "Add relationship" control: the type+direction choices that fit this
 * record, which other kinds the reader may point at when a type leaves that
 * open, whether this reader may use any of it, and the two blank forms.
 * Cheap reference data (a few dozen rows at most), so read unconditionally
 * rather than gated like a list page's create pickers — the record's own
 * relationships are already read the same way.
 */
export async function loadRelationshipPickers(
	locals: App.Locals,
	kind: RecordKind,
	canOpen: CanOpen
): Promise<{
	relationshipTypeOptions: RelationshipTypeOption[];
	otherKinds: RelationshipOtherKind[];
	canManageRelationships: boolean;
	relationshipForms: RelationshipForms;
}> {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');

	const [types, add, remove] = await Promise.all([
		listRelationshipTypes(supabase, activeOrgId),
		superValidate(zod4(addRelationshipSchema), { id: RELATIONSHIP_FORM_IDS.add }),
		superValidate(zod4(removeRelationshipSchema), { id: RELATIONSHIP_FORM_IDS.remove })
	]);

	return {
		relationshipTypeOptions: relationshipTypeOptions(types, kind),
		// Anyone in the org may be pointed at (a colleague's name takes no
		// feature grant); a kind of record only when the reader may open it —
		// the same rule a related-records group follows.
		otherKinds: [...RECORD_KINDS.filter((other) => canOpen(other)), 'member'],
		canManageRelationships: can(org.access, RECORD_KIND_META[kind].feature, 'manage'),
		relationshipForms: { add, remove }
	};
}

const SUPPORTED_OTHER_KINDS = new Set<string>(RELATIONSHIP_OTHER_KINDS);

function isRelationshipOtherKind(kind: string): kind is RelationshipOtherKind {
	return SUPPORTED_OTHER_KINDS.has(kind);
}

/** The org and the on-screen record a relationship action names, or the refusal the hook would give. */
function recordOf(locals: App.Locals, params: { kind: RecordSegment; id: string }) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	const kind = recordKindForSegment(params.kind);
	requirePermission(org.access, RECORD_KIND_META[kind].feature, 'manage');
	return { supabase, orgId: activeOrgId, entity: { entityType: kind, entityId: params.id } };
}

export const relationshipActions: Actions = {
	addRelationship: async ({ request, locals, params }) => {
		const { supabase, orgId, entity } = recordOf(locals, params);
		const form = await superValidate(request, zod4(addRelationshipSchema), {
			id: RELATIONSHIP_FORM_IDS.add
		});
		if (!form.valid) return fail(400, { form });

		const { typeId, direction, otherKind, otherId } = form.data;
		if (!isRelationshipOtherKind(otherKind)) {
			return message(form, 'Choose a kind of record.', { status: 400 });
		}
		const other: CrmEntityRef = { entityType: otherKind, entityId: otherId };

		// A relationship whose type reads the same both ways is one fact
		// however it is drawn; checking both directions before inserting is
		// what keeps it from showing twice (docs/relationships.md).
		const existing = await listRelationships(supabase, orgId, entity, { typeId, openOnly: true });
		const duplicate = existing.some((row) => {
			const oriented = orientRelationship(row, entity);
			return (
				oriented.other.entityType === other.entityType && oriented.other.entityId === other.entityId
			);
		});
		if (duplicate) {
			return message(form, 'A relationship like this already exists.', { status: 400 });
		}

		try {
			await createRelationship(supabase, orgId, {
				typeId,
				from: direction === 'forward' ? entity : other,
				to: direction === 'forward' ? other : entity
			});
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not draw the relationship.',
				{ status: 400 }
			);
		}
		return { form };
	},

	removeRelationship: async ({ request, locals, params }) => {
		const { supabase, orgId } = recordOf(locals, params);
		const form = await superValidate(request, zod4(removeRelationshipSchema), {
			id: RELATIONSHIP_FORM_IDS.remove
		});
		if (!form.valid) return fail(400, { form });

		try {
			await removeRelationship(supabase, orgId, form.data.id);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not remove the relationship.',
				{ status: 400 }
			);
		}
		return { form };
	}
};
