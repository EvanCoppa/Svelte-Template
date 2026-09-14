import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { memberName } from '$lib/components/staff/member.js';
import { recordListHref, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import { parseRecordRef, type LinkableRecord } from '$lib/schemas/record-ref';
import { listCompanies } from '$lib/server/crm/companies';
import { listContacts } from '$lib/server/crm/contacts';
import {
	assignTask,
	createTask,
	endTaskAssignment,
	listAssigneesByTask,
	listTasks,
	setTaskStatus,
	updateTask
} from '$lib/server/crm/tasks';
import { countTaskComments } from '$lib/server/crm/task-comments';
import { instant } from '$lib/server/records';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import { listStaff } from '$lib/server/staff';
import {
	assignTaskSchema,
	createTaskSchema,
	moveTaskSchema,
	prioritizeTaskSchema,
	scheduleTaskSchema,
	unassignTaskSchema
} from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The tasks page: the same rows drawn as a board or as a grouped list, the
 * task modal that adds one, and the four small writes a card offers in place
 * — moving it, giving it a day, saying how urgent it is, putting somebody on
 * it. Everything else about a task is the record page's.
 *
 * Creating is this page's own form rather than the generic `CreateRecord`
 * (schema.ts, `createTaskSchema` says why): the modal writes the row and its
 * `assigned_to` relationships in one post, and links the task to a party
 * from one picker. The pickers exist for writers only, and offer only the
 * kinds the reader may open — the calendar's booking form's rule.
 *
 * Gated by the hook on the `tasks` feature + read grant; see companies. The
 * two views are a device preference and never reach the server, so this load
 * is the list it always was — which view is on screen changes nothing about
 * what has to be fetched.
 *
 * The three extra reads are each **one query for the whole board**, not one
 * per card: who holds each task, how much conversation each has collected, and
 * the roster the assignee menu offers.
 */

/** Explicit form ids, shared by the load, the actions and the page's `superForm`s. */
const FORM_ID = {
	create: 'create-task',
	move: 'move-task',
	schedule: 'schedule-task',
	prioritize: 'prioritize-task',
	assign: 'assign-task',
	unassign: 'unassign-task'
} as const;

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { org, activeOrgId, user } = locals;
	if (!org || !activeOrgId || !user) throw redirect(303, '/login');
	depends(QUERY.tasks);

	const tasks = await listTasks(locals.supabase, activeOrgId);
	const ids = tasks.map((task) => task.id);

	// Whether the board is live or a picture of one: without `manage` the
	// cards are read-only, so the page freezes it rather than offering a
	// drag that would come back a 403.
	const canManage = can(org.access, 'tasks', 'manage');

	// Whether the reader may open a record of another kind: the same decision
	// the hook makes for that kind's routes, so the modal's record picker
	// offers only the kinds they can see.
	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	const canOpen = (kind: RecordKind) =>
		passesFeatureGate(recordListHref(kind), org.features, canRead);

	const [assignees, comments, staff, companies, contacts] = await Promise.all([
		listAssigneesByTask(locals.supabase, activeOrgId, ids),
		countTaskComments(locals.supabase, activeOrgId, ids),
		// The menu of people to put on a card, and the modal's assignees. Only
		// worth reading when there is a menu to open — a reader who cannot
		// manage a task cannot assign one.
		canManage ? listStaff(locals.supabase, activeOrgId) : Promise.resolve([]),
		canManage && canOpen('company') ? listCompanies(locals.supabase, activeOrgId) : [],
		canManage && canOpen('contact') ? listContacts(locals.supabase, activeOrgId) : []
	]);

	const records: LinkableRecord[] = [
		...companies.map((row): LinkableRecord => ({ kind: 'company', id: row.id, name: row.name })),
		...contacts.map((row): LinkableRecord => ({ kind: 'contact', id: row.id, name: row.name }))
	];

	return {
		tasks,
		// Plain objects rather than Maps: a load's return is serialized, and a
		// Map arrives at the browser as `{}`.
		assignees: Object.fromEntries(assignees),
		commentCounts: Object.fromEntries(comments),
		// Named here the way the roster names a member, so a card and the staff
		// page call the same person the same thing — and named only: the board
		// has no use for a roster row's roles, email or avatar.
		members: staff.map((member) => ({ userId: member.userId, name: memberName(member) })),
		canMove: canManage,
		canCreate: canManage,
		records,
		// Who the modal assigns a new task to unless told otherwise: the person
		// writing it, the way most tasks start.
		currentUserId: user.id,
		createForm: await superValidate(zod4(createTaskSchema), { id: FORM_ID.create }),
		moveForm: await superValidate(zod4(moveTaskSchema), { id: FORM_ID.move }),
		scheduleForm: await superValidate(zod4(scheduleTaskSchema), { id: FORM_ID.schedule }),
		prioritizeForm: await superValidate(zod4(prioritizeTaskSchema), { id: FORM_ID.prioritize }),
		assignForm: await superValidate(zod4(assignTaskSchema), { id: FORM_ID.assign }),
		unassignForm: await superValidate(zod4(unassignTaskSchema), { id: FORM_ID.unassign })
	};
};

/**
 * A task for a record the caller may not open would be one they can never
 * follow — and asking whether the insert succeeds would say whether that id
 * exists. The gate answers first, as it does on a page.
 */
function refusesRecord(org: NonNullable<App.Locals['org']>, record: string): boolean {
	const ref = record === '' ? null : parseRecordRef(record);
	if (!ref) return false;
	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	return !passesFeatureGate(recordListHref(ref.kind), org.features, canRead);
}

export const actions: Actions = {
	/**
	 * The modal's post: the row, then one `assigned_to` relationship per
	 * person named. The party is the one the picker chose — a company or a
	 * contact, never both — and it is only accepted when the caller may open
	 * that kind. A task can be about a deal or an asset too, but not from
	 * here: those are relationships, added on the record page.
	 */
	create: async ({ request, locals }) => {
		const { org, activeOrgId } = locals;
		if (!org || !activeOrgId) throw redirect(303, '/login');
		requirePermission(org.access, 'tasks', 'manage');

		const form = await superValidate(request, zod4(createTaskSchema), { id: FORM_ID.create });
		if (!form.valid) return fail(400, { form });
		if (refusesRecord(org, form.data.record)) {
			return message(form, 'You cannot link a task to that record.', { status: 403 });
		}

		const ref = form.data.record === '' ? null : parseRecordRef(form.data.record);
		try {
			const task = await createTask(locals.supabase, activeOrgId, {
				title: form.data.title,
				due_at: instant(form.data.due_at),
				company_id: ref?.kind === 'company' ? ref.id : null,
				contact_id: ref?.kind === 'contact' ? ref.id : null
			});
			for (const userId of new Set(form.data.assignees)) {
				await assignTask(locals.supabase, activeOrgId, task.id, userId);
			}
		} catch (cause) {
			return message(form, reason(cause, 'Could not create the task.'), { status: 400 });
		}
		return { form };
	},

	/**
	 * A card was dropped on another status, carried there with the arrow keys,
	 * or its checkbox was ticked. One action for the three, because they are
	 * one act: the task is in a different status than it was.
	 */
	move: async ({ request, locals }) => {
		const { org, activeOrgId } = locals;
		if (!org || !activeOrgId) throw redirect(303, '/login');
		requirePermission(org.access, 'tasks', 'manage');

		const form = await superValidate(request, zod4(moveTaskSchema), { id: FORM_ID.move });
		if (!form.valid) return fail(400, { form });

		try {
			await setTaskStatus(locals.supabase, activeOrgId, form.data.id, form.data.status);
		} catch (cause) {
			return message(form, reason(cause, 'Could not move the task.'), { status: 400 });
		}
		return { form };
	},

	/** A day was picked on a card, or cleared off it. */
	schedule: async ({ request, locals }) => {
		const { org, activeOrgId } = locals;
		if (!org || !activeOrgId) throw redirect(303, '/login');
		requirePermission(org.access, 'tasks', 'manage');

		const form = await superValidate(request, zod4(scheduleTaskSchema), { id: FORM_ID.schedule });
		if (!form.valid) return fail(400, { form });

		try {
			// Blank clears the column: the schema lets it through because "no
			// due date" is an answer, and null is how the table spells it.
			await updateTask(locals.supabase, activeOrgId, form.data.id, {
				due_at: form.data.due_at === '' ? null : form.data.due_at
			});
		} catch (cause) {
			return message(form, reason(cause, 'Could not change the due date.'), { status: 400 });
		}
		return { form };
	},

	/** How urgent a task is, set from the card. */
	prioritize: async ({ request, locals }) => {
		const { org, activeOrgId } = locals;
		if (!org || !activeOrgId) throw redirect(303, '/login');
		requirePermission(org.access, 'tasks', 'manage');

		const form = await superValidate(request, zod4(prioritizeTaskSchema), {
			id: FORM_ID.prioritize
		});
		if (!form.valid) return fail(400, { form });

		try {
			await updateTask(locals.supabase, activeOrgId, form.data.id, {
				priority: form.data.priority
			});
		} catch (cause) {
			return message(form, reason(cause, 'Could not change the priority.'), { status: 400 });
		}
		return { form };
	},

	/**
	 * Somebody was put on a task. Assignment is a relationship, so this creates
	 * a row rather than writing a column, and the database refuses a second
	 * open assignment to the same person — assigning twice is safe.
	 */
	assign: async ({ request, locals }) => {
		const { org, activeOrgId } = locals;
		if (!org || !activeOrgId) throw redirect(303, '/login');
		requirePermission(org.access, 'tasks', 'manage');

		const form = await superValidate(request, zod4(assignTaskSchema), { id: FORM_ID.assign });
		if (!form.valid) return fail(400, { form });

		try {
			await assignTask(locals.supabase, activeOrgId, form.data.id, form.data.user_id);
		} catch (cause) {
			return message(form, reason(cause, 'Could not assign the task.'), { status: 400 });
		}
		return { form };
	},

	/**
	 * Somebody came off a task. The row is **ended**, not deleted: who held
	 * this until today is part of the task's story (docs/tasks.md).
	 */
	unassign: async ({ request, locals }) => {
		const { org, activeOrgId } = locals;
		if (!org || !activeOrgId) throw redirect(303, '/login');
		requirePermission(org.access, 'tasks', 'manage');

		const form = await superValidate(request, zod4(unassignTaskSchema), { id: FORM_ID.unassign });
		if (!form.valid) return fail(400, { form });

		try {
			await endTaskAssignment(locals.supabase, activeOrgId, form.data.assignment_id);
		} catch (cause) {
			return message(form, reason(cause, 'Could not change who is on the task.'), { status: 400 });
		}
		return { form };
	}
};

/** What went wrong, in the database's words when it had any. */
function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}
