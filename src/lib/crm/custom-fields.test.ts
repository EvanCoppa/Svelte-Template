import { describe, expect, it } from 'vitest';
import { allowedValues, customFieldInputKind, customFieldValueSchema } from './custom-fields';

const accepts = (
	valueType: Parameters<typeof customFieldValueSchema>[0]['value_type'],
	value: string,
	choices: string[] | null = null
) => customFieldValueSchema({ value_type: valueType, allowed_values: choices }).safeParse(value);

describe('customFieldInputKind', () => {
	it('names one input per value type, so nothing sniffs a stored value', () => {
		expect(customFieldInputKind('text')).toBe('text');
		expect(customFieldInputKind('numeric')).toBe('number');
		expect(customFieldInputKind('date')).toBe('date');
		expect(customFieldInputKind('boolean')).toBe('boolean');
		expect(customFieldInputKind('select')).toBe('select');
	});
});

describe('allowedValues', () => {
	it('narrows a jsonb string array, and answers null for anything else', () => {
		expect(allowedValues(['email', 'phone'])).toEqual(['email', 'phone']);
		expect(allowedValues(null)).toBeNull();
		expect(allowedValues('email')).toBeNull();
		expect(allowedValues([1, 2])).toBeNull();
		expect(allowedValues({ email: true })).toBeNull();
	});
});

describe('customFieldValueSchema', () => {
	it('takes any text up to the column’s cap', () => {
		expect(accepts('text', 'anything at all').success).toBe(true);
		expect(accepts('text', 'x'.repeat(2001)).success).toBe(false);
	});

	it('takes a number and refuses what is not one', () => {
		expect(accepts('numeric', '7').success).toBe(true);
		expect(accepts('numeric', '-7.25').success).toBe(true);
		expect(accepts('numeric', '7.5.1').success).toBe(false);
		expect(accepts('numeric', 'seven').success).toBe(false);
	});

	it('takes the shape `<input type="date">` posts, not a loose date', () => {
		expect(accepts('date', '2026-01-15').success).toBe(true);
		expect(accepts('date', '2026-1-5').success).toBe(false);
		expect(accepts('date', '15/01/2026').success).toBe(false);
	});

	it('takes a boolean as the string a form posts', () => {
		expect(accepts('boolean', 'true').success).toBe(true);
		expect(accepts('boolean', 'false').success).toBe(true);
		expect(accepts('boolean', 'yes').success).toBe(false);
	});

	it('holds a choice to the list its definition declares', () => {
		const choices = ['email', 'phone'];
		expect(accepts('select', 'email', choices).success).toBe(true);
		expect(accepts('select', 'carrier pigeon', choices).success).toBe(false);
		// A definition with no choices accepts nothing, which is the check
		// constraint's position too.
		expect(accepts('select', 'email', null).success).toBe(false);
	});
});
