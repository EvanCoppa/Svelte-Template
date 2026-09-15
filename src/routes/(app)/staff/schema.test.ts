import { describe, expect, it } from 'vitest';
import { compensationSchema } from './schema';

describe('compensationSchema', () => {
	const USER_ID = '00000000-0000-0000-0000-000000000002';

	it('accepts blank fields as "no figure"', () => {
		const result = compensationSchema.safeParse({
			user_id: USER_ID,
			hourly_wage: '',
			commission_percent: ''
		});
		expect(result.success).toBe(true);
	});

	it('accepts a wage and a commission within range', () => {
		const result = compensationSchema.safeParse({
			user_id: USER_ID,
			hourly_wage: '22.50',
			commission_percent: '8.5'
		});
		expect(result.success).toBe(true);
	});

	it('refuses a negative wage', () => {
		const result = compensationSchema.safeParse({
			user_id: USER_ID,
			hourly_wage: '-5',
			commission_percent: ''
		});
		expect(result.success).toBe(false);
	});

	it('refuses a commission over 100', () => {
		const result = compensationSchema.safeParse({
			user_id: USER_ID,
			hourly_wage: '',
			commission_percent: '150'
		});
		expect(result.success).toBe(false);
	});

	it('refuses text that is not a number', () => {
		const result = compensationSchema.safeParse({
			user_id: USER_ID,
			hourly_wage: 'lots',
			commission_percent: ''
		});
		expect(result.success).toBe(false);
	});
});
