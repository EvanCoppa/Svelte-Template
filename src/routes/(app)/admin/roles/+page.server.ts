import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { pairKey, splitPair } from '$lib/features/pairs';
import { createRole, deleteRole, diffMaps, setRoleGrants } from '$lib/server/admin';
import { requireOperator } from '$lib/server/operator';
import { listRoles, type PermissionLevel, type RoleWithPermissions } from '$lib/server/roles';
import { createRoleSchema, deleteRoleSchema, grantsSchema, type GrantLevel } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Explicit ids: createRole and grants both carry `industry_id`, and the
 * delete form is id-only; naming all three keeps each superForm answering
 * to its own result — the same hazard /staff documents.
 */
const FORM_IDS = {
	grants: 'grants',
	createRole: 'create-role',
	deleteRole: 'delete-role'
} as const;

/** Role × feature → level, keyed `role|feature`, for the roles of one industry. */
function currentGrants(roles: RoleWithPermissions[]): Map<string, PermissionLevel> {
	return new Map(
		roles.flatMap((role) =>
			role.role_permissions.map(({ feature_id, level }) => [pairKey(role.id, feature_id), level])
		)
	);
}

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const db = await requireOperator(locals);
	const { industries, registry } = await parent();

	// Pick the industry from the query string, falling back to the first one
	// rather than 404ing on a stale link.
	const requested = url.searchParams.get('industry');
	const industry = industries.find((i) => i.id === requested) ?? industries[0];
	if (!industry) throw error(500, 'No industries are registered.');

	const roles = await listRoles(db, industry.id);
	const granted = currentGrants(roles);

	const [grantsForm, createRoleForm, deleteRoleForm] = await Promise.all([
		superValidate(
			{
				industry_id: industry.id,
				// The full grid in a fixed order (roles, then features), so the
				// page can index cells by position.
				grants: roles.flatMap((role) =>
					registry.map((feature) => {
						const level: GrantLevel = granted.get(pairKey(role.id, feature.id)) ?? 'none';
						return { role_id: role.id, feature_id: feature.id, level };
					})
				)
			},
			zod4(grantsSchema),
			{ errors: false, id: FORM_IDS.grants }
		),
		superValidate({ industry_id: industry.id }, zod4(createRoleSchema), {
			errors: false,
			id: FORM_IDS.createRole
		}),
		superValidate(zod4(deleteRoleSchema), { id: FORM_IDS.deleteRole })
	]);

	return { industry, roles, grantsForm, createRoleForm, deleteRoleForm };
};

export const actions: Actions = {
	saveGrants: async ({ locals, request }) => {
		const db = await requireOperator(locals);
		const form = await superValidate(request, zod4(grantsSchema), { id: FORM_IDS.grants });
		if (!form.valid) return fail(400, { form });

		// Only this industry's roles can be edited from its grid; a role id
		// from elsewhere is a stale page, not a request to honour.
		const roles = await listRoles(db, form.data.industry_id);
		const known = new Set(roles.map((role) => role.id));
		if (form.data.grants.some((cell) => !known.has(cell.role_id))) {
			return message(form, 'That role is not in this industry any more — reload the page.', {
				status: 400
			});
		}

		const wanted = new Map<string, PermissionLevel>(
			form.data.grants.flatMap((cell) =>
				cell.level === 'none' ? [] : [[pairKey(cell.role_id, cell.feature_id), cell.level]]
			)
		);
		const { upsert, remove } = diffMaps(currentGrants(roles), wanted);
		const split = (key: string) => splitPair(key) ?? [key, ''];

		try {
			await setRoleGrants(db, {
				upsert: upsert.map(([key, level]) => {
					const [role_id, feature_id] = split(key);
					return { role_id, feature_id, level };
				}),
				remove: remove.map((key) => {
					const [role_id, feature_id] = split(key);
					return { role_id, feature_id };
				})
			});
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not save.', {
				status: 400
			});
		}

		return { form };
	},

	createRole: async ({ locals, request }) => {
		const db = await requireOperator(locals);
		const form = await superValidate(request, zod4(createRoleSchema), { id: FORM_IDS.createRole });
		if (!form.valid) return fail(400, { form });

		try {
			await createRole(db, {
				industry_id: form.data.industry_id,
				name: form.data.name,
				description: form.data.description || null
			});
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not create the role.', {
				status: 400
			});
		}

		return { form };
	},

	deleteRole: async ({ locals, request }) => {
		const db = await requireOperator(locals);
		const form = await superValidate(request, zod4(deleteRoleSchema), { id: FORM_IDS.deleteRole });
		if (!form.valid) return fail(400, { form });

		try {
			await deleteRole(db, form.data.role_id);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not delete the role.', {
				status: 400
			});
		}

		return { form };
	}
};
