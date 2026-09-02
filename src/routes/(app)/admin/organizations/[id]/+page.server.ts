import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { resolveFeatures } from '$lib/features/resolve';
import { assignRoleSchema, unassignRoleSchema } from '$lib/schemas/member-roles';
import {
	diffMaps,
	diffSets,
	getOrganization,
	setFeatureOverrides,
	setMemberOrgRole,
	updateOrganizationPlan,
	type AdminOrganizationDetail,
	type OverrideMode
} from '$lib/server/admin';
import { setDisabledFeatures } from '$lib/server/features';
import { requireOperator } from '$lib/server/operator';
import { assignRole, listRoles, unassignRole } from '$lib/server/roles';
import { featuresSchema, memberRoleSchema, planSchema, type OverrideChoice } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Explicit ids: memberRole, assignRole and unassignRole all start with a
 * `user_id`, so without these the three superForms would answer to each
 * other's results — the hazard /staff documents.
 */
const FORM_IDS = {
	plan: 'plan',
	features: 'org-features',
	memberRole: 'member-role',
	assignRole: 'assign-role',
	unassignRole: 'unassign-role'
} as const;

// z.guid(), not z.uuid(): the seed's fixed ids are not RFC 4122 versions.
const idSchema = z.guid();

/** The org behind the URL, or a 404 that does not say whether it exists. */
async function loadOrg(
	db: Awaited<ReturnType<typeof requireOperator>>,
	id: string
): Promise<AdminOrganizationDetail> {
	if (!idSchema.safeParse(id).success) throw error(404, 'Not found.');
	const org = await getOrganization(db, id);
	if (!org) throw error(404, 'Not found.');
	return org;
}

function overrideMap(org: AdminOrganizationDetail): Map<string, OverrideMode> {
	return new Map(org.overrides.map(({ feature_id, mode }) => [feature_id, mode]));
}

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const db = await requireOperator(locals);
	const [org, { registry }] = await Promise.all([loadOrg(db, params.id), parent()]);
	const roles = await listRoles(db, org.industryId);

	// What the sidebar resolves to for this org right now — the same fold the
	// hook runs, so the preview cannot disagree with the gate.
	const resolved = resolveFeatures(registry, {
		tierId: org.tierId,
		industryId: org.industryId,
		overrides: org.overrides,
		disabled: org.disabled
	});
	const overrides = overrideMap(org);

	const [planForm, featuresForm, memberRoleForm, assignForm, unassignForm] = await Promise.all([
		superValidate({ industry_id: org.industryId, tier_id: org.tierId }, zod4(planSchema), {
			errors: false,
			id: FORM_IDS.plan
		}),
		superValidate(
			{
				overrides: registry.map((feature) => {
					const mode: OverrideChoice = overrides.get(feature.id) ?? 'inherit';
					return { feature_id: feature.id, mode };
				}),
				disabled: org.disabled
			},
			zod4(featuresSchema),
			{ errors: false, id: FORM_IDS.features }
		),
		superValidate(zod4(memberRoleSchema), { id: FORM_IDS.memberRole }),
		superValidate(zod4(assignRoleSchema), { id: FORM_IDS.assignRole }),
		superValidate(zod4(unassignRoleSchema), { id: FORM_IDS.unassignRole })
	]);

	return {
		org,
		roles,
		modes: Object.fromEntries(
			Object.values(resolved).map(({ feature, mode }) => [feature.id, mode])
		),
		planForm,
		featuresForm,
		memberRoleForm,
		assignForm,
		unassignForm
	};
};

export const actions: Actions = {
	savePlan: async ({ locals, params, request }) => {
		const db = await requireOperator(locals);
		const org = await loadOrg(db, params.id);
		const form = await superValidate(request, zod4(planSchema), { id: FORM_IDS.plan });
		if (!form.valid) return fail(400, { form });

		try {
			await updateOrganizationPlan(db, org.id, form.data);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not save.', {
				status: 400
			});
		}

		return { form };
	},

	saveFeatures: async ({ locals, params, request }) => {
		const db = await requireOperator(locals);
		const org = await loadOrg(db, params.id);
		const form = await superValidate(request, zod4(featuresSchema), { id: FORM_IDS.features });
		if (!form.valid) return fail(400, { form });

		const wanted = new Map<string, OverrideMode>(
			form.data.overrides.flatMap(({ feature_id, mode }) =>
				mode === 'inherit' ? [] : [[feature_id, mode]]
			)
		);
		const { upsert, remove } = diffMaps(overrideMap(org), wanted);
		const { add: disable, remove: enable } = diffSets(org.disabled, form.data.disabled);

		try {
			await setFeatureOverrides(db, org.id, {
				upsert: upsert.map(([feature_id, mode]) => ({ feature_id, mode })),
				remove
			});
			await setDisabledFeatures(db, org.id, { disable, enable });
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not save.', {
				status: 400
			});
		}

		return { form };
	},

	setMemberRole: async ({ locals, params, request }) => {
		const db = await requireOperator(locals);
		const org = await loadOrg(db, params.id);
		const form = await superValidate(request, zod4(memberRoleSchema), {
			id: FORM_IDS.memberRole
		});
		if (!form.valid) return fail(400, { form });

		const member = org.members.find((m) => m.userId === form.data.user_id);
		if (!member) {
			return message(form, 'That person is not a member of this organization.', { status: 400 });
		}
		// An org with no owner has nobody who can delete it or hand it on.
		const owners = org.members.filter((m) => m.role === 'owner').length;
		if (member.role === 'owner' && form.data.role !== 'owner' && owners <= 1) {
			return message(form, 'Make someone else an owner first — an organization needs one.', {
				status: 400
			});
		}

		try {
			await setMemberOrgRole(db, org.id, form.data.user_id, form.data.role);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not change the role.', {
				status: 400
			});
		}

		return { form };
	},

	assignRole: async ({ locals, params, request }) => {
		const db = await requireOperator(locals);
		const org = await loadOrg(db, params.id);
		const form = await superValidate(request, zod4(assignRoleSchema), { id: FORM_IDS.assignRole });
		if (!form.valid) return fail(400, { form });

		// The service role skips the RLS check that keeps a construction role
		// out of a general org, so it is re-made here.
		const roles = await listRoles(db, org.industryId);
		if (!roles.some((role) => role.id === form.data.role_id)) {
			return message(form, "That role belongs to another industry's catalog.", { status: 400 });
		}

		try {
			await assignRole(db, org.id, form.data.user_id, form.data.role_id);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not assign the role.', {
				status: 400
			});
		}

		return { form };
	},

	unassignRole: async ({ locals, params, request }) => {
		const db = await requireOperator(locals);
		const org = await loadOrg(db, params.id);
		const form = await superValidate(request, zod4(unassignRoleSchema), {
			id: FORM_IDS.unassignRole
		});
		if (!form.valid) return fail(400, { form });

		try {
			await unassignRole(db, org.id, form.data.user_id, form.data.role_id);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not remove the role.', {
				status: 400
			});
		}

		return { form };
	}
};
