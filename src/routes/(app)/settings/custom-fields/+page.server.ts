import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { recordListHref, RECORD_KINDS } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import {
	createCustomFieldDefinition,
	deleteCustomFieldDefinition,
	listCustomFieldDefinitions,
	updateCustomFieldDefinition
} from '$lib/server/crm/custom-fields';
import { hasGrant } from '$lib/server/roles';
import {
	choiceList,
	createCustomFieldSchema,
	deleteCustomFieldSchema,
	updateCustomFieldSchema
} from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The extra attributes an org declares for a kind of record — the vocabulary
 * behind the "Custom fields" card on every record page.
 *
 * This is where an industry's own data lives: the party-model rule puts a
 * column in the schema when two unrelated industries would query on it, and
 * everything else here. A practice's allergy note, a roofer's roof pitch and
 * a distributor's licence number are all this screen.
 *
 * A settings page, so it is exempt from the feature gate and exists for every
 * org — and gated on owner/admin like /settings/features rather than on a
 * permission level, because that is exactly what the definitions' RLS accepts.
 * Declaring a field is configuration; filling one in is editing the record,
 * which the record page gates on `manage` over the kind's own feature.
 *
 * `proposal_option` definitions are deliberately not listed: an option has no
 * record page and no feature terms to name it by, so its comparison rows stay
 * with the proposal builder.
 */

/** Explicit form ids, shared by the load, the actions and the page's three `superForm`s. */
const FORM_IDS = {
	create: 'create-custom-field',
	update: 'update-custom-field',
	remove: 'delete-custom-field'
} as const;

function canManage(role: string): boolean {
	return role === 'owner' || role === 'admin';
}

function orgOf(locals: App.Locals) {
	const { org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	return { org, orgId: activeOrgId };
}

/** Just enough of a PostgrestError to recognise one, parsed rather than asserted. */
const postgrestError = z.object({ code: z.string() });

/**
 * Why a write failed, in words a reader can act on.
 *
 * The two definition triggers already raise sentences ("custom field X has
 * values; its type cannot change"), so those pass through. A unique violation
 * does not — it names a constraint — and reusing a key is the likeliest
 * mistake on this screen, so it gets the one translation.
 */
function reason(cause: unknown, fallback: string): string {
	if (!(cause instanceof Error)) return fallback;
	const parsed = postgrestError.safeParse(cause.cause);
	if (parsed.success && parsed.data.code === '23505') {
		return 'A field with that key already exists on this kind of record.';
	}
	return cause.message;
}

/** The guard every action opens with — the shape /settings/features uses. */
function requireManage(role: string): void {
	if (!canManage(role)) {
		throw error(403, 'Only owners and admins can change custom fields.');
	}
}

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase } = locals;
	const { org, orgId } = orgOf(locals);
	depends(QUERY.customFields);

	// Only the kinds this session may open: `featureTerms()` throws for a
	// feature that is off screen, so a kind the page cannot name is one it must
	// not offer — the same question the nav and the route gate ask.
	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	const kinds = RECORD_KINDS.filter((kind) =>
		passesFeatureGate(recordListHref(kind), org.features, canRead)
	);
	const shown = new Set<string>(kinds);

	const [definitions, createForm, updateForm, removeForm] = await Promise.all([
		listCustomFieldDefinitions(supabase, orgId),
		superValidate(zod4(createCustomFieldSchema), { id: FORM_IDS.create }),
		superValidate(zod4(updateCustomFieldSchema), { id: FORM_IDS.update }),
		superValidate(zod4(deleteCustomFieldSchema), { id: FORM_IDS.remove })
	]);

	return {
		definitions: definitions.filter((definition) => shown.has(definition.entity_type)),
		kinds,
		canManage: canManage(org.activeOrg.role),
		createForm,
		updateForm,
		removeForm
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const { org, orgId } = orgOf(locals);
		requireManage(org.activeOrg.role);

		const form = await superValidate(request, zod4(createCustomFieldSchema), {
			id: FORM_IDS.create
		});
		if (!form.valid) return fail(400, { form });

		try {
			await createCustomFieldDefinition(locals.supabase, orgId, {
				entity_type: form.data.entity_type,
				key: form.data.key,
				label: form.data.label,
				value_type: form.data.value_type,
				// Non-null for a choice list and null for everything else, which is
				// the column's own check constraint restated.
				allowed_values:
					form.data.value_type === 'select' ? choiceList(form.data.allowed_values) : null
			});
		} catch (cause) {
			return message(form, reason(cause, 'Could not add the field.'), { status: 400 });
		}
		return { form };
	},

	update: async ({ request, locals }) => {
		const { org, orgId } = orgOf(locals);
		requireManage(org.activeOrg.role);

		const form = await superValidate(request, zod4(updateCustomFieldSchema), {
			id: FORM_IDS.update
		});
		if (!form.valid) return fail(400, { form });

		// The stored type decides whether choices are required — the form does
		// not carry it, because a type cannot change once values exist.
		const definitions = await listCustomFieldDefinitions(locals.supabase, orgId);
		const definition = definitions.find((row) => row.id === form.data.id);
		if (!definition) return message(form, 'That field no longer exists.', { status: 400 });

		const choices = choiceList(form.data.allowed_values);
		if (definition.value_type === 'select' && choices.length === 0) {
			return message(form, 'A choice list needs at least one choice.', { status: 400 });
		}

		try {
			await updateCustomFieldDefinition(locals.supabase, orgId, form.data.id, {
				key: form.data.key,
				label: form.data.label,
				allowed_values: definition.value_type === 'select' ? choices : null
			});
		} catch (cause) {
			// Carries the definition triggers' own words: a choice removed from
			// under a stored value says so here.
			return message(form, reason(cause, 'Could not save the field.'), { status: 400 });
		}
		return { form };
	},

	remove: async ({ request, locals }) => {
		const { org, orgId } = orgOf(locals);
		requireManage(org.activeOrg.role);

		const form = await superValidate(request, zod4(deleteCustomFieldSchema), {
			id: FORM_IDS.remove
		});
		if (!form.valid) return fail(400, { form });

		try {
			await deleteCustomFieldDefinition(locals.supabase, orgId, form.data.id);
		} catch (cause) {
			return message(form, reason(cause, 'Could not remove the field.'), { status: 400 });
		}
		return { form };
	}
};
