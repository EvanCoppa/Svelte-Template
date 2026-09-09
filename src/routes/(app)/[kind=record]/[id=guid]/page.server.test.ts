import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { actions } from './+page.server';
import type { OrgContext } from '$lib/server/org-context';
import { ORG_ID, supabaseMockSequence, type QueryResult } from '$lib/server/crm/test-support';

/**
 * The action only. The load fires seven parallel reads through modules that
 * have their own tests, so driving it here would assert the mocks rather than
 * the page.
 */

const CONTACT_ID = '30000000-0000-0000-0000-000000000003';
const DEFINITION_ID = 'a3000000-0000-0000-0000-000000000005';

/** One `date` field on contacts — enough to prove the type decides the column. */
const DEFINITION = {
	id: DEFINITION_ID,
	org_id: ORG_ID,
	entity_type: 'contact',
	key: 'last_review',
	label: 'Last review',
	value_type: 'date',
	allowed_values: null,
	created_at: '',
	updated_at: ''
};

function context(grant: 'read' | 'manage' | null): OrgContext {
	return {
		organizations: [],
		activeOrg: {
			id: ORG_ID,
			name: 'Bright Smile Dental',
			role: 'member',
			tierId: 'pro',
			tierName: 'Pro',
			industryId: 'dentistry'
		},
		features: {},
		access: {
			role: 'member',
			roles: [],
			grants: new Map(grant ? [['contacts', grant]] : [])
		}
	};
}

/**
 * `listCustomFields` runs two queries, then the write runs one or two — so the
 * sequence is: definitions, values, then whatever the write does.
 */
function harness(grant: 'read' | 'manage' | null, writes: QueryResult[] = [{ data: null }]) {
	const definitions = [DEFINITION];
	const mock = supabaseMockSequence([{ data: definitions }, { data: [] }, ...writes]);
	const locals = { org: context(grant), activeOrgId: ORG_ID, supabase: mock.supabase };
	return {
		...mock,
		post(fields: Record<string, string>) {
			const body = new FormData();
			for (const [name, value] of Object.entries(fields)) body.append(name, value);
			// SAFETY: the action reads locals, params and request only.
			return {
				locals,
				params: { kind: 'contacts', id: CONTACT_ID },
				request: new Request(`https://app.test/contacts/${CONTACT_ID}`, {
					method: 'POST',
					body
				})
			} as never;
		}
	};
}

describe('saveCustomField', () => {
	it('refuses a reader who may not manage the record’s feature', async () => {
		const h = harness('read');
		await expect(
			actions.saveCustomField(h.post({ field_definition_id: DEFINITION_ID, value: '2026-01-15' }))
		).rejects.toSatisfy((error) => isHttpError(error) && error.status === 403);
	});

	it('writes the value into the column its definition’s type names', async () => {
		const h = harness('manage', [{ data: null }, { data: null }]);

		await actions.saveCustomField(
			h.post({ field_definition_id: DEFINITION_ID, value: '2026-01-15' })
		);

		expect(h.builder.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				value_date: '2026-01-15',
				value_text: null,
				value_numeric: null,
				value_boolean: null,
				field_definition_id: DEFINITION_ID
			})
		);
	});

	it('clears the field by deleting the row when the value is blank', async () => {
		const h = harness('manage');

		await actions.saveCustomField(h.post({ field_definition_id: DEFINITION_ID, value: '' }));

		expect(h.builder.delete).toHaveBeenCalled();
		expect(h.builder.insert).not.toHaveBeenCalled();
		expect(h.builder.update).not.toHaveBeenCalled();
	});

	it('returns an inline error and writes nothing when the value fails its type', async () => {
		const h = harness('manage');

		const result = await actions.saveCustomField(
			h.post({ field_definition_id: DEFINITION_ID, value: 'the fifteenth' })
		);

		expect(result).toMatchObject({
			status: 400,
			data: { form: expect.objectContaining({ errors: { value: ['Choose a date.'] } }) }
		});
		expect(h.builder.insert).not.toHaveBeenCalled();
	});

	it('refuses a definition that is not one of this record’s kind', async () => {
		const h = harness('manage');

		const result = await actions.saveCustomField(
			h.post({ field_definition_id: '00000000-0000-0000-0000-0000000000ff', value: 'x' })
		);

		expect(result).toMatchObject({
			status: 400,
			data: { form: expect.objectContaining({ message: 'That field no longer exists.' }) }
		});
		expect(h.builder.insert).not.toHaveBeenCalled();
	});
});
