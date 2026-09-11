import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import { listTasks, setTaskStatus } from '$lib/server/crm/tasks';
import { createRecord, loadCreateRecord } from '$lib/server/records';
import { can, requirePermission } from '$lib/server/roles';
import { moveTaskSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The tasks page: the same rows drawn as a board or as a grouped list, and
 * one write — moving a task to a column.
 *
 * Gated by the hook on the `tasks` feature + read grant; see companies. The
 * two views are a device preference and never reach the server, so this load
 * is the list it always was — which view is on screen changes nothing about
 * what has to be fetched.
 */

/** Explicit form id, shared by the load, the action and the page's `superForm`. */
const MOVE_FORM_ID = 'move-task';

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	depends(QUERY.tasks);

	return {
		tasks: await listTasks(locals.supabase, activeOrgId),
		// Whether the board is live or a picture of one: without `manage` the
		// cards are read-only, so the page freezes it rather than offering a
		// drag that would come back a 403.
		canMove: can(org.access, 'tasks', 'manage'),
		moveForm: await superValidate(zod4(moveTaskSchema), { id: MOVE_FORM_ID }),
		...(await loadCreateRecord(locals, 'task'))
	};
};

export const actions: Actions = {
	// Creating goes through the generic record form ($lib/server/records.ts), which
	// opens with requirePermission(locals.org.access, 'tasks', 'manage').
	create: (event) => createRecord(event, 'task'),

	/**
	 * A card was dropped in another column, carried there with the arrow keys,
	 * or its checkbox was ticked. One action for the three, because they are
	 * one act: the task is in a different column than it was.
	 */
	move: async ({ request, locals }) => {
		const { org, activeOrgId } = locals;
		if (!org || !activeOrgId) throw redirect(303, '/login');
		requirePermission(org.access, 'tasks', 'manage');

		const form = await superValidate(request, zod4(moveTaskSchema), { id: MOVE_FORM_ID });
		if (!form.valid) return fail(400, { form });

		try {
			await setTaskStatus(locals.supabase, activeOrgId, form.data.id, form.data.status);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not move the task.', {
				status: 400
			});
		}
		return { form };
	}
};
