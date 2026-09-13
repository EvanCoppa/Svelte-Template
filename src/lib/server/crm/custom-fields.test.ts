import { describe, expect, it } from 'vitest';
import { listCustomFields } from './custom-fields';
import { ORG_ID, supabaseTablesMock } from './test-support';

const CONTACT_ID = '30000000-0000-0000-0000-000000000003';
const entity = { entityType: 'contact', entityId: CONTACT_ID } as const;

describe('custom fields data access', () => {
	it('pairs every definition for the kind with the record’s value, or none', async () => {
		const channel = { id: 'd1', label: 'Preferred channel', value_type: 'select' };
		const insurer = { id: 'd2', label: 'Insurer', value_type: 'text' };
		const value = { id: 'v1', field_definition_id: 'd1', value_text: 'email' };
		const { supabase, from, builders } = supabaseTablesMock({
			custom_field_definitions: { data: [channel, insurer] },
			custom_field_values: { data: [value] }
		});

		await expect(listCustomFields(supabase, ORG_ID, entity)).resolves.toEqual([
			{ definition: channel, value },
			{ definition: insurer, value: null }
		]);

		expect(from).toHaveBeenCalledWith('custom_field_definitions');
		expect(from).toHaveBeenCalledWith('custom_field_values');
		// Definitions are the kind's; values are this record's.
		const definitions = builders.custom_field_definitions;
		expect(definitions.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(definitions.eq).toHaveBeenCalledWith('entity_type', 'contact');
		expect(definitions.eq).not.toHaveBeenCalledWith('entity_id', CONTACT_ID);
		expect(definitions.order).toHaveBeenCalledWith('label');
		const values = builders.custom_field_values;
		expect(values.eq).toHaveBeenCalledWith('entity_type', 'contact');
		expect(values.eq).toHaveBeenCalledWith('entity_id', CONTACT_ID);
	});

	it('throws the PostgREST message when either query fails', async () => {
		const { supabase } = supabaseTablesMock({
			custom_field_definitions: { data: [] },
			custom_field_values: { error: { message: 'boom' } }
		});

		await expect(listCustomFields(supabase, ORG_ID, entity)).rejects.toThrow('boom');
	});
});
