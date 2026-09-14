import { describe, expect, it } from 'vitest';
import { recordLinks, type LinkedRow } from './links';
import { ORG_ID, supabaseTablesMock } from './test-support';

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';

function row(fields: Partial<LinkedRow> = {}): LinkedRow {
	return {
		id: 'd0000000-0000-0000-0000-000000000001',
		entity_type: null,
		entity_id: null,
		...fields
	};
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

/** The record labels main's vocabulary supplies; `recordLinks` only passes them through. */
const vocabulary = {
	proposal_presenter: 'Presenter',
	proposal_responsible: 'Responsible',
	graph_member: 'Staff'
};

describe('recordLinks', () => {
	it('asks nothing when no row is about anything', async () => {
		const { supabase, from } = supabaseTablesMock({});

		await expect(
			recordLinks(supabase, ORG_ID, [row(), row()], openEverything, vocabulary)
		).resolves.toEqual({});
		expect(from).not.toHaveBeenCalled();
	});

	it('names the record a row is about, and links to it', async () => {
		const { supabase } = supabaseTablesMock({
			companies: { data: company }
		});

		const attached = row({ entity_type: 'company', entity_id: COMPANY_ID });
		await expect(
			recordLinks(supabase, ORG_ID, [attached], openEverything, vocabulary)
		).resolves.toEqual({
			[attached.id]: { label: 'Wayne Enterprises', href: `/companies/${COMPANY_ID}` }
		});
	});

	it('reads a record once however many rows point at it', async () => {
		const { supabase, from } = supabaseTablesMock({
			companies: { data: company }
		});

		const rows = [
			row({ id: 'd0000000-0000-0000-0000-00000000000a' }),
			row({ id: 'd0000000-0000-0000-0000-00000000000b' })
		].map((r) => ({ ...r, entity_type: 'company' as const, entity_id: COMPANY_ID }));

		const links = await recordLinks(supabase, ORG_ID, rows, openEverything, vocabulary);
		expect(Object.keys(links)).toHaveLength(2);
		expect(from).toHaveBeenCalledTimes(1);
	});

	it('does not even fetch a record the reader may not open', async () => {
		const { supabase, from } = supabaseTablesMock({
			companies: { data: company }
		});

		await expect(
			recordLinks(
				supabase,
				ORG_ID,
				[row({ entity_type: 'company', entity_id: COMPANY_ID })],
				() => false,
				vocabulary
			)
		).resolves.toEqual({});
		expect(from).not.toHaveBeenCalled();
	});

	it('leaves a row unlinked when the record is gone', async () => {
		const { supabase } = supabaseTablesMock({ companies: { data: null } });

		await expect(
			recordLinks(
				supabase,
				ORG_ID,
				[row({ entity_type: 'company', entity_id: COMPANY_ID })],
				openEverything,
				vocabulary
			)
		).resolves.toEqual({});
	});

	it('ignores an entity type that has no page of its own', async () => {
		const { supabase, from } = supabaseTablesMock({});

		await expect(
			recordLinks(
				supabase,
				ORG_ID,
				[row({ entity_type: 'proposal_option', entity_id: COMPANY_ID })],
				openEverything,
				vocabulary
			)
		).resolves.toEqual({});
		expect(from).not.toHaveBeenCalled();
	});
});
