import { describe, expect, it } from 'vitest';
import {
	RECORD_FORMS,
	RECORD_PICKER_KINDS,
	RECORD_SCHEMAS,
	RECORD_TYPES,
	companyRecordSchema,
	dealRecordSchema,
	invoiceRecordSchema,
	taskRecordSchema,
	type RecordField
} from './records';

function isPickerKind(type: RecordField['type']): type is (typeof RECORD_PICKER_KINDS)[number] {
	return RECORD_PICKER_KINDS.some((kind) => kind === type);
}

function messagesOf(result: { error?: { issues: { message: string }[] } }) {
	return result.error?.issues.map((issue) => issue.message).join(' ') ?? '';
}

/** Something the field would legally hold, so a whole form can be filled in. */
function sampleFor(field: RecordField): string {
	switch (field.type) {
		case 'select':
			return field.options?.[0]?.value ?? '';
		case 'email':
			return 'someone@example.com';
		case 'number':
			return '1200.50';
		case 'integer':
			return '30';
		case 'company':
		case 'contact':
		case 'stage':
			return '20000000-0000-0000-0000-000000000001';
		case 'date':
			return '2026-09-10';
		case 'datetime':
			return '2026-09-10T17:00';
		default:
			return 'Something';
	}
}

describe('the record registry', () => {
	it('describes every record type once, in both tables', () => {
		expect(Object.keys(RECORD_FORMS).sort()).toEqual([...RECORD_TYPES].sort());
		expect(Object.keys(RECORD_SCHEMAS).sort()).toEqual([...RECORD_TYPES].sort());
	});

	// The form and the schema are two halves of one description, and nothing
	// else lines them up: a field with no schema entry would be dropped on
	// post, and a schema key with no field could never be filled in.
	it('validates exactly the fields it puts on screen', () => {
		for (const type of RECORD_TYPES) {
			const fields = RECORD_FORMS[type].fields;
			const filled = Object.fromEntries(fields.map((field) => [field.name, sampleFor(field)]));

			const parsed = RECORD_SCHEMAS[type].parse(filled);
			expect(Object.keys(parsed).sort()).toEqual(fields.map((field) => field.name).sort());
		}
	});

	it('names a picker field after the kind of row it picks', () => {
		for (const type of RECORD_TYPES) {
			for (const field of RECORD_FORMS[type].fields) {
				if (!isPickerKind(field.type)) continue;
				// The picker's column is the id of the row it points at, named
				// after the kind: `company_id`, `contact_id`, `stage_id`.
				expect(field.name).toBe(`${field.type}_id`);
			}
		}
	});

	it('gives every select field its options', () => {
		for (const type of RECORD_TYPES) {
			for (const field of RECORD_FORMS[type].fields) {
				if (field.type !== 'select') continue;
				expect(field.options?.length ?? 0).toBeGreaterThan(0);
			}
		}
	});
});

describe('record schemas', () => {
	it('defaults the enum fields so an untouched form still posts', () => {
		expect(companyRecordSchema.parse({ name: 'Acme' })).toMatchObject({
			relationship: 'customer',
			status: 'lead',
			email: ''
		});
	});

	it('requires the name and says so in a sentence', () => {
		expect(messagesOf(companyRecordSchema.safeParse({ name: '  ' }))).toBe('Name is required.');
	});

	it('accepts a blank optional email but not a malformed one', () => {
		expect(companyRecordSchema.safeParse({ name: 'Acme', email: '' }).success).toBe(true);
		expect(messagesOf(companyRecordSchema.safeParse({ name: 'Acme', email: 'nope' }))).toMatch(
			/valid email/
		);
	});

	it('accepts money as typed, and rejects anything else', () => {
		expect(dealRecordSchema.safeParse({ title: 'Renewal', amount: '1200.50' }).success).toBe(true);
		expect(dealRecordSchema.safeParse({ title: 'Renewal', amount: '' }).success).toBe(true);
		expect(messagesOf(dealRecordSchema.safeParse({ title: 'Renewal', amount: '1,200' }))).toMatch(
			/amount like/
		);
	});

	it('takes a due date both as picked and as the browser rewrites it', () => {
		const naive = taskRecordSchema.safeParse({ title: 'Call back', due_at: '2026-09-10T17:00' });
		const instant = taskRecordSchema.safeParse({
			title: 'Call back',
			due_at: '2026-09-11T00:00:00.000Z'
		});

		expect(naive.success).toBe(true);
		expect(instant.success).toBe(true);
		expect(
			messagesOf(taskRecordSchema.safeParse({ title: 'Call back', due_at: 'tomorrow' }))
		).toMatch(/date and time/);
	});

	it('bills a company, a person, or both — never nobody', () => {
		const wayne = '20000000-0000-0000-0000-000000000001';
		const bruce = '30000000-0000-0000-0000-000000000003';
		expect(invoiceRecordSchema.safeParse({ company_id: wayne }).success).toBe(true);
		expect(invoiceRecordSchema.safeParse({ contact_id: bruce }).success).toBe(true);
		expect(invoiceRecordSchema.safeParse({ company_id: wayne, contact_id: bruce }).success).toBe(
			true
		);

		const nobody = invoiceRecordSchema.safeParse({ payment_terms_days: '30' });
		expect(nobody.success).toBe(false);
		expect(messagesOf(nobody)).toBe('Pick a company or a person to bill.');
		expect(nobody.error?.issues[0]?.path).toEqual(['company_id']);
	});

	it('takes terms as whole days, or blank', () => {
		const wayne = '20000000-0000-0000-0000-000000000001';
		expect(
			invoiceRecordSchema.safeParse({ company_id: wayne, payment_terms_days: '' }).success
		).toBe(true);
		expect(
			messagesOf(invoiceRecordSchema.safeParse({ company_id: wayne, payment_terms_days: '30.5' }))
		).toBe('Enter a whole number.');
	});
});
