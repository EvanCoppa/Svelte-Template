import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { DEFAULT_VIEW, fetchWindow, isCalendarView, parseDayKey } from '$lib/calendar';
import { memberName } from '$lib/components/staff/member';
import { recordListHref, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import {
	createCalendarEvent,
	deleteCalendarEvent,
	listCalendarEvents,
	updateCalendarEvent,
	type CalendarEventInput
} from '$lib/server/crm/calendar';
import { listCompanies } from '$lib/server/crm/companies';
import { listContacts } from '$lib/server/crm/contacts';
import { listDeals } from '$lib/server/crm/deals';
import { recordLinks } from '$lib/server/crm/links';
import { loadVocabulary } from '$lib/server/features';
import { getDisplayNames } from '$lib/server/profiles';
import { instant } from '$lib/server/records';
import { parseRecordRef, type LinkableRecord } from '$lib/schemas/record-ref';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import { listStaff } from '$lib/server/staff';
import {
	createEventSchema,
	deleteEventSchema,
	moveEventSchema,
	updateEventSchema,
	type Assignee,
	type EventFormValues
} from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The calendar — the org's schedule drawn as a month, a week or a day, with
 * events dragged into place. Gated by the hook on the `calendar` feature +
 * read grant; `manage` books, edits and moves an event, `delete` removes one
 * — the three levels, the way the staff page uses them.
 *
 * The view and the day on screen live in the URL (`?view=week&date=…`), so
 * a link to next Tuesday is a link and the browser's back button steps back
 * a week (docs/data-invalidation.md, "URL-driven state"). This load reads
 * both and fetches a window comfortably wider than any zone's grid; the page
 * draws its own local grid from the superset (`fetchWindow()` says why).
 *
 * Booking and editing are superforms forms (schema.ts) because an event is
 * more than a row of strings; a drag posts the `move` action with the two
 * instants it changed and nothing else, through the same road.
 */

/** Explicit form ids, shared by the load, the actions and the page's four `superForm`s. */
const FORM_IDS = {
	create: 'create-event',
	update: 'update-event',
	move: 'move-event',
	remove: 'delete-event'
} as const;

function orgOf(locals: App.Locals) {
	const { org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	return { org, orgId: activeOrgId, access: org.access };
}

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	const { supabase } = locals;
	const { org, orgId, access } = orgOf(locals);
	depends(QUERY.calendar);
	// The pickers read three lists and the roster; a row added elsewhere refreshes them.
	depends(QUERY.contacts);
	depends(QUERY.companies);
	depends(QUERY.deals);
	depends(QUERY.staff);

	const viewParam = url.searchParams.get('view');
	const view = isCalendarView(viewParam) ? viewParam : DEFAULT_VIEW;
	const dateParam = url.searchParams.get('date');
	// A key that is not a day is ignored, not an error: the page lands on today.
	const date = parseDayKey(dateParam) ? dateParam : null;
	const window = fetchWindow(view, date, new Date());

	// Whether the reader may open a record of another kind: the same decision
	// the hook makes for that kind's routes, so an event links only to a page
	// the reader can reach, and the picker offers only the kinds they can see.
	const { features } = org;
	const canRead = (featureId: string) => hasGrant(access, featureId);
	const canOpen = (kind: RecordKind) => passesFeatureGate(recordListHref(kind), features, canRead);
	const canManage = can(access, 'calendar', 'manage');

	const [
		events,
		vocabulary,
		staff,
		contacts,
		companies,
		deals,
		createForm,
		updateForm,
		moveForm,
		removeForm
	] = await Promise.all([
		listCalendarEvents(supabase, orgId, window),
		loadVocabulary(supabase, org.activeOrg.industryId),
		// The pickers exist for writers only; a reader gets the grid alone.
		canManage ? listStaff(supabase, orgId) : [],
		canManage && canOpen('contact') ? listContacts(supabase, orgId) : [],
		canManage && canOpen('company') ? listCompanies(supabase, orgId) : [],
		canManage && canOpen('deal') ? listDeals(supabase, orgId) : [],
		superValidate(zod4(createEventSchema), { id: FORM_IDS.create }),
		superValidate(zod4(updateEventSchema), { id: FORM_IDS.update }),
		superValidate(zod4(moveEventSchema), { id: FORM_IDS.move }),
		superValidate(zod4(deleteEventSchema), { id: FORM_IDS.remove })
	]);

	// Who each event belongs to, by name; and what it is for, linked.
	const [people, links] = await Promise.all([
		getDisplayNames(
			supabase,
			events.flatMap((event) => (event.assigned_to ? [event.assigned_to] : []))
		),
		recordLinks(supabase, orgId, events, canOpen, vocabulary)
	]);

	const records: LinkableRecord[] = [
		...contacts.map((row): LinkableRecord => ({ kind: 'contact', id: row.id, name: row.name })),
		...companies.map((row): LinkableRecord => ({ kind: 'company', id: row.id, name: row.name })),
		...deals.map((row): LinkableRecord => ({ kind: 'deal', id: row.id, name: row.title }))
	];

	return {
		view,
		date,
		events,
		links,
		people: Object.fromEntries(people),
		roster: staff.map((member): Assignee => ({ userId: member.userId, name: memberName(member) })),
		records,
		canManage,
		canDelete: can(access, 'calendar', 'delete'),
		createForm,
		updateForm,
		moveForm,
		removeForm
	};
};

/**
 * The one place the form's strings become columns: blank → null, the two
 * picks → instants, the record ref → the entity pair.
 */
function columns(data: EventFormValues): CalendarEventInput {
	const ref = data.record === '' ? null : parseRecordRef(data.record);
	return {
		title: data.title,
		description: data.description === '' ? null : data.description,
		location: data.location === '' ? null : data.location,
		starts_at: instant(data.starts_at) ?? data.starts_at,
		ends_at: instant(data.ends_at) ?? data.ends_at,
		all_day: data.all_day,
		color: data.color,
		assigned_to: data.assigned_to === '' ? null : data.assigned_to,
		entity_type: ref?.kind ?? null,
		entity_id: ref?.id ?? null
	};
}

/**
 * An event for a record the caller may not open would be one they can never
 * follow — and asking whether the insert succeeds would say whether that id
 * exists. The gate answers first, as it does on a page.
 */
function refusesRecord(locals: App.Locals, record: string): boolean {
	const ref = record === '' ? null : parseRecordRef(record);
	if (!ref) return false;
	const { org } = orgOf(locals);
	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	return !passesFeatureGate(recordListHref(ref.kind), org.features, canRead);
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const { orgId, access } = orgOf(locals);
		requirePermission(access, 'calendar', 'manage');
		const form = await superValidate(request, zod4(createEventSchema), { id: FORM_IDS.create });
		if (!form.valid) return fail(400, { form });
		if (refusesRecord(locals, form.data.record)) {
			return message(form, 'You cannot book an event for that record.', { status: 403 });
		}

		try {
			await createCalendarEvent(locals.supabase, orgId, columns(form.data));
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not book the event.', {
				status: 400
			});
		}
		return { form };
	},

	update: async ({ request, locals }) => {
		const { orgId, access } = orgOf(locals);
		requirePermission(access, 'calendar', 'manage');
		const form = await superValidate(request, zod4(updateEventSchema), { id: FORM_IDS.update });
		if (!form.valid) return fail(400, { form });
		if (refusesRecord(locals, form.data.record)) {
			return message(form, 'You cannot book an event for that record.', { status: 403 });
		}

		try {
			await updateCalendarEvent(locals.supabase, orgId, form.data.id, columns(form.data));
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save the event.', {
				status: 400
			});
		}
		return { form };
	},

	move: async ({ request, locals }) => {
		const { orgId, access } = orgOf(locals);
		requirePermission(access, 'calendar', 'manage');
		const form = await superValidate(request, zod4(moveEventSchema), { id: FORM_IDS.move });
		if (!form.valid) return fail(400, { form });

		try {
			await updateCalendarEvent(locals.supabase, orgId, form.data.id, {
				starts_at: instant(form.data.starts_at) ?? form.data.starts_at,
				ends_at: instant(form.data.ends_at) ?? form.data.ends_at
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not move the event.', {
				status: 400
			});
		}
		return { form };
	},

	remove: async ({ request, locals }) => {
		const { orgId, access } = orgOf(locals);
		requirePermission(access, 'calendar', 'delete');
		const form = await superValidate(request, zod4(deleteEventSchema), { id: FORM_IDS.remove });
		if (!form.valid) return fail(400, { form });

		try {
			await deleteCalendarEvent(locals.supabase, orgId, form.data.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not delete the event.', {
				status: 400
			});
		}
		return { form };
	}
};
