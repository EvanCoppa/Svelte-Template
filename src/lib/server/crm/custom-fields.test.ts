import { describe, expect, it } from 'vitest';
import type { CustomField, CustomFieldColumns } from './custom-fields';
import {
	clearCustomFieldValue,
	createCustomFieldDefinition,
	customFieldColumns,
	customFieldEntries,
	deleteCustomFieldDefinition,
	listCustomFieldDefinitions,
	listCustomFields,
	setCustomFieldValue,
	updateCustomFieldDefinition
} from './custom-fields';
import { ORG_ID, supabaseMock, supabaseMockSequence, supabaseTablesMock } from './test-support';

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

describe('custom field definitions', () => {
	it('lists every kind’s fields for the org, grouped by kind then label', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [] });

		await listCustomFieldDefinitions(supabase, ORG_ID);

		expect(from).toHaveBeenCalledWith('custom_field_definitions');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		// One query, not one per kind — the settings page groups them itself.
		expect(builder.order).toHaveBeenCalledWith('entity_type');
		expect(builder.order).toHaveBeenCalledWith('label');
	});

	it('creates a definition with the org and only the granted insert columns', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: 'd1' } });

		await createCustomFieldDefinition(supabase, ORG_ID, {
			entity_type: 'contact',
			key: 'preferred_channel',
			label: 'Preferred channel',
			value_type: 'select',
			allowed_values: ['email', 'phone']
		});

		expect(builder.insert).toHaveBeenCalledWith({
			org_id: ORG_ID,
			entity_type: 'contact',
			key: 'preferred_channel',
			label: 'Preferred channel',
			value_type: 'select',
			allowed_values: ['email', 'phone']
		});
	});

	it('never sends value_type or entity_type on an update — both are insert-only', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: 'd1' } });

		await updateCustomFieldDefinition(supabase, ORG_ID, 'd1', {
			key: 'channel',
			label: 'Channel',
			allowed_values: null
		});

		expect(builder.update).toHaveBeenCalledWith({
			key: 'channel',
			label: 'Channel',
			allowed_values: null
		});
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('id', 'd1');
	});

	it('treats a delete RLS filtered away as a failure', async () => {
		const { supabase } = supabaseMock({ data: [] });

		await expect(deleteCustomFieldDefinition(supabase, ORG_ID, 'd1')).rejects.toThrow(
			'Custom field was not deleted'
		);
	});
});

describe('customFieldColumns', () => {
	// The check constraint restated in TypeScript: exactly one column carries
	// the value, and which one is the definition's type's business.
	const filled = (columns: CustomFieldColumns) =>
		Object.entries(columns).filter(([, value]) => value !== null);

	it('puts the value in the column its type names, and nulls the rest', () => {
		expect(customFieldColumns('text', 'hello')).toEqual({
			value_text: 'hello',
			value_numeric: null,
			value_boolean: null,
			value_date: null
		});
		expect(filled(customFieldColumns('select', 'email'))).toEqual([['value_text', 'email']]);
		expect(filled(customFieldColumns('numeric', '7.5'))).toEqual([['value_numeric', 7.5]]);
		expect(filled(customFieldColumns('boolean', 'true'))).toEqual([['value_boolean', true]]);
		expect(filled(customFieldColumns('boolean', 'false'))).toEqual([['value_boolean', false]]);
		expect(filled(customFieldColumns('date', '2026-01-15'))).toEqual([
			['value_date', '2026-01-15']
		]);
	});
});

describe('custom field values', () => {
	const columns = {
		value_text: null,
		value_numeric: null,
		value_boolean: null,
		value_date: '2026-01-15'
	};

	it('inserts the whole entity link when the record has no value yet', async () => {
		const { supabase, builder } = supabaseMockSequence([{ data: null }, { data: null }]);

		await setCustomFieldValue(supabase, ORG_ID, entity, 'd1', columns);

		expect(builder.insert).toHaveBeenCalledWith({
			...columns,
			org_id: ORG_ID,
			entity_type: 'contact',
			entity_id: CONTACT_ID,
			field_definition_id: 'd1'
		});
	});

	it('updates by id and touches no entity column — they are insert-only', async () => {
		const { supabase, builder } = supabaseMockSequence([{ data: { id: 'v1' } }, { data: null }]);

		await setCustomFieldValue(supabase, ORG_ID, entity, 'd1', columns);

		expect(builder.insert).not.toHaveBeenCalled();
		// The payload is the four typed columns and nothing else: org_id and the
		// entity link are insert-only, so an update that carried them would be a
		// 42501 at runtime.
		expect(builder.update).toHaveBeenCalledWith(columns);
		expect(builder.eq).toHaveBeenCalledWith('id', 'v1');
	});

	it('clears a field by deleting its row, and says nothing when there was none', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await expect(clearCustomFieldValue(supabase, ORG_ID, entity, 'd1')).resolves.toBeUndefined();

		expect(builder.delete).toHaveBeenCalled();
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('entity_type', 'contact');
		expect(builder.eq).toHaveBeenCalledWith('entity_id', CONTACT_ID);
		expect(builder.eq).toHaveBeenCalledWith('field_definition_id', 'd1');
	});
});

describe('customFieldEntries', () => {
	const definition = (
		overrides: Partial<CustomField['definition']>
	): CustomField['definition'] => ({
		id: 'd1',
		org_id: ORG_ID,
		entity_type: 'contact',
		key: 'field',
		label: 'Field',
		value_type: 'text',
		allowed_values: null,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		...overrides
	});
	const value = (
		overrides: Partial<NonNullable<CustomField['value']>>
	): NonNullable<CustomField['value']> => ({
		id: 'v1',
		org_id: ORG_ID,
		entity_type: 'contact',
		entity_id: CONTACT_ID,
		field_definition_id: 'd1',
		value_text: null,
		value_numeric: null,
		value_boolean: null,
		value_date: null,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		...overrides
	});
	const valueOf = (
		valueType: CustomField['definition']['value_type'],
		stored: Partial<NonNullable<CustomField['value']>> | null
	) =>
		customFieldEntries([
			{ definition: definition({ value_type: valueType }), value: stored && value(stored) }
		])[0].value;

	it('reads every type back as the string the form posts', () => {
		expect(valueOf('text', { value_text: 'hello' })).toBe('hello');
		expect(valueOf('select', { value_text: 'email' })).toBe('email');
		expect(valueOf('numeric', { value_numeric: 7.5 })).toBe('7.5');
		expect(valueOf('boolean', { value_boolean: false })).toBe('false');
		expect(valueOf('date', { value_date: '2026-01-15' })).toBe('2026-01-15');
	});

	it('reads an unfilled field as blank, which is what clears it', () => {
		expect(valueOf('text', null)).toBe('');
		expect(valueOf('boolean', null)).toBe('');
	});

	it('narrows a select’s choices and offers none for any other type', () => {
		const [choice] = customFieldEntries([
			{
				definition: definition({ value_type: 'select', allowed_values: ['email', 'phone'] }),
				value: null
			}
		]);
		expect(choice.choices).toEqual(['email', 'phone']);

		const [text] = customFieldEntries([{ definition: definition({}), value: null }]);
		expect(text.choices).toBeNull();
	});
});
