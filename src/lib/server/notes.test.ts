import { describe, expect, it } from 'vitest';
import type { Note } from './crm/notes';
import { ORG_ID, supabaseTablesMock } from './crm/test-support';
import type { OrgRole } from '$lib/org';
import type { OrgContext } from './org-context';
import type { PermissionLevel } from './roles';
import { noteAccess, noteColumns, noteLinks } from './notes';

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';

function note(fields: Partial<Note> = {}): Note {
	// SAFETY: `noteLinks` reads id, entity_type and entity_id and nothing else.
	return {
		id: 'd0000000-0000-0000-0000-000000000001',
		entity_type: null,
		entity_id: null,
		...fields
	} as Note;
}

/** Enough of a company row for `getRecord()` to describe one — it pills the lifecycle. */
const company = {
	id: COMPANY_ID,
	name: 'Wayne Enterprises',
	status: 'active',
	relationship: 'customer',
	contacts: []
};

const openEverything = () => true;

/** The record labels main's vocabulary supplies; `noteLinks` only passes them through. */
const vocabulary = { proposal_presenter: 'Presenter', proposal_responsible: 'Responsible' };

describe('noteColumns', () => {
	it('writes only what the browser sent, so one surface never clobbers another', () => {
		expect(noteColumns({ body: 'edited' })).toEqual({ body: 'edited' });
		expect(noteColumns({})).toEqual({});
	});

	it('clears a title rather than storing an empty one', () => {
		expect(noteColumns({ title: null })).toEqual({ title: null });
	});

	it('turns the API’s boolean into the column’s timestamp', () => {
		const before = Date.now();
		const archived = noteColumns({ archived: true });
		expect(Date.parse(archived.archived_at ?? '')).toBeGreaterThanOrEqual(before);
		expect(noteColumns({ archived: false })).toEqual({ archived_at: null });
	});
});

describe('noteLinks', () => {
	it('asks nothing when no note is about anything', async () => {
		const { supabase, from } = supabaseTablesMock({});

		await expect(
			noteLinks(supabase, ORG_ID, [note(), note()], openEverything, vocabulary)
		).resolves.toEqual({});
		expect(from).not.toHaveBeenCalled();
	});

	it('names the record a note is about, and links to it', async () => {
		const { supabase } = supabaseTablesMock({
			companies: { data: company }
		});

		const attached = note({ entity_type: 'company', entity_id: COMPANY_ID });
		await expect(
			noteLinks(supabase, ORG_ID, [attached], openEverything, vocabulary)
		).resolves.toEqual({
			[attached.id]: { label: 'Wayne Enterprises', href: `/companies/${COMPANY_ID}` }
		});
	});

	it('reads a record once however many notes point at it', async () => {
		const { supabase, from } = supabaseTablesMock({
			companies: { data: company }
		});

		const notes = [
			note({ id: 'd0000000-0000-0000-0000-00000000000a' }),
			note({ id: 'd0000000-0000-0000-0000-00000000000b' })
		].map((row) => ({ ...row, entity_type: 'company' as const, entity_id: COMPANY_ID }));

		const links = await noteLinks(supabase, ORG_ID, notes, openEverything, vocabulary);
		expect(Object.keys(links)).toHaveLength(2);
		expect(from).toHaveBeenCalledTimes(1);
	});

	it('does not even fetch a record the reader may not open', async () => {
		const { supabase, from } = supabaseTablesMock({
			companies: { data: company }
		});

		await expect(
			noteLinks(
				supabase,
				ORG_ID,
				[note({ entity_type: 'company', entity_id: COMPANY_ID })],
				() => false,
				vocabulary
			)
		).resolves.toEqual({});
		expect(from).not.toHaveBeenCalled();
	});

	it('leaves a note unlinked when the record is gone', async () => {
		const { supabase } = supabaseTablesMock({ companies: { data: null } });

		await expect(
			noteLinks(
				supabase,
				ORG_ID,
				[note({ entity_type: 'company', entity_id: COMPANY_ID })],
				openEverything,
				vocabulary
			)
		).resolves.toEqual({});
	});

	it('ignores an entity type that has no page of its own', async () => {
		const { supabase, from } = supabaseTablesMock({});

		await expect(
			noteLinks(
				supabase,
				ORG_ID,
				[note({ entity_type: 'proposal_option', entity_id: COMPANY_ID })],
				openEverything,
				vocabulary
			)
		).resolves.toEqual({});
		expect(from).not.toHaveBeenCalled();
	});
});

describe('noteAccess', () => {
	function org(role: OrgRole, grants: [string, PermissionLevel][] = []): OrgContext {
		return {
			organizations: [],
			activeOrg: {
				id: '10000000-0000-0000-0000-000000000001',
				name: 'Acme Inc',
				role,
				tierId: 'pro',
				tierName: 'Pro',
				industryId: 'crm'
			},
			features: {},
			access: { role, roles: [], grants: new Map(grants) }
		};
	}

	it('gives an owner both levels without a role assignment', () => {
		expect(noteAccess(org('owner'), 'u1')).toEqual({
			canManage: true,
			canDelete: true,
			viewer: { userId: 'u1', isOrgManager: true }
		});
	});

	it('reads a member’s level off their grants', () => {
		expect(noteAccess(org('member', [['notes', 'manage']]), 'u1')).toEqual({
			canManage: true,
			canDelete: false,
			viewer: { userId: 'u1', isOrgManager: false }
		});
	});

	it('leaves a member with no grant reading only', () => {
		const access = noteAccess(org('member'), 'u1');
		expect(access.canManage).toBe(false);
		expect(access.canDelete).toBe(false);
	});
});
