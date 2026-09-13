import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { FeatureMap } from '$lib/features/types';
import { ORG_ID, supabaseMockSequence, supabaseTablesMock } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { actions, load } from './+page.server';

/**
 * The calendar page from the outside: what the URL selects, what a reader
 * and a writer are handed, and how a booking, a drag and a delete become
 * columns.
 */

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['calendar', 'read' as const]])
};
const MANAGER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['calendar', 'manage' as const]])
};

const EVENT_ID = 'e1000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';
const MEMBER_ID = '00000000-0000-0000-0000-000000000001';

/** The term registry `loadVocabulary()` folds; the load only passes the words through. */
const TERMS = {
	data: [
		{ id: 'proposal_presenter', label: 'Presenter', industry_terms: [] },
		{ id: 'proposal_responsible', label: 'Responsible', industry_terms: [] },
		{ id: 'graph_member', label: 'Staff', industry_terms: [] }
	]
};

/** A registry with contacts hidden from this org, so the record gate has something to refuse. */
const FEATURES: FeatureMap = {
	contacts: {
		mode: 'hidden',
		// SAFETY: the gate reads `id` and `route`; the rest of the row is never touched.
		feature: { id: 'contacts', route: '/contacts' } as never
	}
};

function localsFor(
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	features: FeatureMap = {}
): App.Locals {
	// SAFETY: the load and the actions read `supabase`, `activeOrgId`,
	// `org.access`, `org.features` and `org.activeOrg.industryId`; the rest of
	// App.Locals is never touched.
	return {
		supabase,
		activeOrgId: ORG_ID,
		org: { access, features, activeOrg: { industryId: 'crm' } }
	} as never;
}

/** A plain form post, the way the page's forms post without JavaScript too. */
function post(fields: [name: string, value: string][]) {
	const body = new FormData();
	for (const [name, value] of fields) body.append(name, value);
	return new Request('https://app.test/calendar', { method: 'POST', body });
}

type ActionName = keyof typeof actions;

function run(
	name: ActionName,
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	fields: [string, string][],
	features?: FeatureMap
) {
	// SAFETY: the actions read `request` and `locals` only.
	return actions[name]({
		request: post(fields),
		locals: localsFor(supabase, access, features)
	} as never);
}

async function runLoad(supabase: SupabaseClient<Database>, access: UserAccess, search = '') {
	// SAFETY: the load reads `locals`, `url` and calls `depends`; nothing else on the event.
	const data = await load({
		locals: localsFor(supabase, access),
		url: new URL(`https://app.test/calendar${search}`),
		depends: vi.fn()
	} as never);
	if (!data) throw new Error('expected data');
	return data;
}

const BOOKING: [string, string][] = [
	['title', 'Site visit'],
	['starts_at', '2026-09-09T14:00:00.000Z'],
	['ends_at', '2026-09-09T15:30:00.000Z'],
	['color', 'violet'],
	['location', 'Gotham HQ'],
	['description', ''],
	['assigned_to', MEMBER_ID],
	['record', `contact:${CONTACT_ID}`]
];

describe('the calendar load', () => {
	it('reads the view and the day off the URL and fetches a window around them', async () => {
		const { supabase, builders } = supabaseTablesMock({
			calendar_events: { data: [{ id: EVENT_ID, assigned_to: null }] },
			terms: TERMS
		});

		const data = await runLoad(supabase, READER, '?view=month&date=2026-09-15');
		expect(data.view).toBe('month');
		expect(data.date).toBe('2026-09-15');
		// The month padded past both its padded weeks — see `fetchWindow()`.
		expect(builders.calendar_events?.lt).toHaveBeenCalledWith(
			'starts_at',
			'2026-10-16T00:00:00.000Z'
		);
		expect(builders.calendar_events?.gt).toHaveBeenCalledWith(
			'ends_at',
			'2026-08-24T00:00:00.000Z'
		);
		expect(data.events).toEqual([{ id: EVENT_ID, assigned_to: null }]);
	});

	it('lands on today in the week view when the URL says nothing usable', async () => {
		const { supabase } = supabaseTablesMock({ calendar_events: { data: [] }, terms: TERMS });

		const data = await runLoad(supabase, READER, '?view=agenda&date=2026-02-30');
		expect(data.view).toBe('week');
		expect(data.date).toBeNull();
	});

	it('hands a reader the grid alone, and a writer the pickers', async () => {
		const reader = supabaseTablesMock({ calendar_events: { data: [] }, terms: TERMS });
		const readerData = await runLoad(reader.supabase, READER);
		expect(readerData.canManage).toBe(false);
		expect(readerData.roster).toEqual([]);
		expect(readerData.records).toEqual([]);
		expect(reader.from).not.toHaveBeenCalledWith('contacts');
		expect(reader.from).not.toHaveBeenCalledWith('organization_members');

		const writer = supabaseTablesMock({
			calendar_events: { data: [] },
			terms: TERMS,
			organization_members: {
				data: [
					{
						user_id: MEMBER_ID,
						role: 'member',
						created_at: '',
						profiles: { display_name: 'Dev User', email: 'dev@example.com', avatar_url: null },
						member_roles: []
					}
				]
			},
			contacts: { data: [{ id: CONTACT_ID, name: 'Lucius Fox' }] },
			companies: { data: [] },
			deals: { data: [{ id: 'd', title: 'Renewal' }] }
		});
		const writerData = await runLoad(writer.supabase, MANAGER);
		expect(writerData.canManage).toBe(true);
		expect(writerData.canDelete).toBe(false);
		expect(writerData.roster).toEqual([{ userId: MEMBER_ID, name: 'Dev User' }]);
		expect(writerData.records).toEqual([
			{ kind: 'contact', id: CONTACT_ID, name: 'Lucius Fox' },
			{ kind: 'deal', id: 'd', name: 'Renewal' }
		]);
		expect(writerData.createForm.data.color).toBe('info');
	});

	it('names who an event belongs to', async () => {
		const { supabase, builders } = supabaseTablesMock({
			calendar_events: { data: [{ id: EVENT_ID, assigned_to: MEMBER_ID }] },
			terms: TERMS,
			profiles: { data: [{ id: MEMBER_ID, display_name: 'Dev User', email: null }] }
		});

		const data = await runLoad(supabase, READER);
		expect(builders.profiles?.in).toHaveBeenCalledWith('id', [MEMBER_ID]);
		expect(data.people).toEqual({ [MEMBER_ID]: 'Dev User' });
	});
});

describe('the calendar actions', () => {
	it('refuses a reader, before writing anything', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		await expect(run('create', supabase, READER, BOOKING)).rejects.toMatchObject({ status: 403 });
		await expect(
			run('move', supabase, READER, [
				['id', EVENT_ID],
				['starts_at', BOOKING[1][1]],
				['ends_at', BOOKING[2][1]]
			])
		).rejects.toMatchObject({ status: 403 });
		await expect(run('remove', supabase, MANAGER, [['id', EVENT_ID]])).rejects.toMatchObject({
			status: 403
		});
		expect(from).not.toHaveBeenCalled();
	});

	it('books an event from the form, turning blanks and the record ref into columns', async () => {
		const { supabase, from, builder } = supabaseMockSequence([{ data: { id: EVENT_ID } }]);

		const result = await run('create', supabase, MANAGER, BOOKING);
		expect(result).toHaveProperty('form.valid', true);
		expect(from).toHaveBeenCalledWith('calendar_events');
		expect(builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			title: 'Site visit',
			description: null,
			location: 'Gotham HQ',
			starts_at: '2026-09-09T14:00:00.000Z',
			ends_at: '2026-09-09T15:30:00.000Z',
			all_day: false,
			color: 'violet',
			assigned_to: MEMBER_ID,
			entity_type: 'contact',
			entity_id: CONTACT_ID
		});
	});

	it('reads a naive no-JS pick as UTC and a checkbox as a boolean', async () => {
		const { supabase, builder } = supabaseMockSequence([{ data: { id: EVENT_ID } }]);

		await run('create', supabase, MANAGER, [
			['title', 'Offsite'],
			['starts_at', '2026-09-10T00:00'],
			['ends_at', '2026-09-11T00:00'],
			['all_day', 'on']
		]);
		expect(builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				starts_at: '2026-09-10T00:00:00.000Z',
				ends_at: '2026-09-11T00:00:00.000Z',
				all_day: true,
				color: 'info',
				entity_type: null,
				entity_id: null,
				assigned_to: null
			})
		);
	});

	it('refuses an event that ends before it starts, in a sentence', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await run('create', supabase, MANAGER, [
			['title', 'Backwards'],
			['starts_at', '2026-09-09T15:00:00.000Z'],
			['ends_at', '2026-09-09T14:00:00.000Z']
		]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.errors.ends_at', [
			'The event has to end after it starts.'
		]);
		expect(from).not.toHaveBeenCalled();
	});

	it('refuses a record the caller may not open, before asking the database', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: {} }]);

		const result = await run('create', supabase, MANAGER, BOOKING, FEATURES);
		expect(result).toMatchObject({ status: 403 });
		expect(result).toHaveProperty('data.form.message', 'You cannot book an event for that record.');
		expect(from).not.toHaveBeenCalled();
	});

	it('moves an event by writing the two instants and nothing else', async () => {
		const { supabase, builder } = supabaseMockSequence([{ data: { id: EVENT_ID } }]);

		const result = await run('move', supabase, MANAGER, [
			['id', EVENT_ID],
			['starts_at', '2026-09-10T14:00:00.000Z'],
			['ends_at', '2026-09-10T15:30:00.000Z']
		]);
		expect(result).toHaveProperty('form.valid', true);
		expect(builder.update).toHaveBeenCalledWith({
			starts_at: '2026-09-10T14:00:00.000Z',
			ends_at: '2026-09-10T15:30:00.000Z'
		});
		expect(builder.eq).toHaveBeenCalledWith('id', EVENT_ID);
	});

	it('saves an edit and deletes with evidence', async () => {
		const updated = supabaseMockSequence([{ data: { id: EVENT_ID } }]);
		await run('update', updated.supabase, MANAGER, [['id', EVENT_ID], ...BOOKING]);
		expect(updated.builder.update).toHaveBeenCalledWith(
			expect.objectContaining({ title: 'Site visit', entity_id: CONTACT_ID })
		);

		const removed = supabaseMockSequence([{ data: [] }]);
		const result = await run('remove', removed.supabase, OWNER, [['id', EVENT_ID]]);
		expect(result).toMatchObject({ status: 400 });
		expect(result).toHaveProperty('data.form.message', expect.stringContaining('was not deleted'));
	});
});
