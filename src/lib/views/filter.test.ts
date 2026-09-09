import { describe, expect, it } from 'vitest';
import { companyFilterSchema, contactFilterSchema, VIEW_FILTER_SCHEMAS } from './filter';
import { VIEW_SOURCES } from './types';

describe('the view filter schemas', () => {
	it('has one schema per source', () => {
		expect(Object.keys(VIEW_FILTER_SCHEMAS).sort()).toEqual([...VIEW_SOURCES].sort());
	});

	it('accepts an empty filter, defaulting the conditions and leaving the sort out', () => {
		expect(companyFilterSchema.parse({})).toEqual({ where: [] });
		expect(contactFilterSchema.parse({ where: [] })).toEqual({ where: [] });
	});

	it('accepts every kind of company condition', () => {
		const parsed = companyFilterSchema.parse({
			where: [
				{ field: 'relationship', op: 'in', values: ['supplier'] },
				{ field: 'status', op: 'not_in', values: ['inactive'] },
				{ field: 'name', op: 'ilike', value: ' steel ' },
				{ field: 'tag', op: 'has', value: 'VIP' }
			],
			sort: { field: 'created_at', direction: 'desc' }
		});
		expect(parsed.where[2]).toEqual({ field: 'name', op: 'ilike', value: 'steel' });
		expect(parsed.sort).toEqual({ field: 'created_at', direction: 'desc' });
	});

	it('accepts every kind of contact condition, including the hop through the company', () => {
		const parsed = contactFilterSchema.parse({
			where: [
				{ field: 'company.relationship', op: 'in', values: ['partner'] },
				{ field: 'company_id', op: 'in', values: ['20000000-0000-0000-0000-000000000001'] },
				{ field: 'has_company', op: 'eq', value: false },
				{ field: 'title', op: 'ilike', value: 'CEO' }
			],
			sort: { field: 'name' }
		});
		expect(parsed.where).toHaveLength(4);
		expect(parsed.sort).toEqual({ field: 'name', direction: 'asc' });
	});

	it('refuses a field the source does not have, an unknown operator, and an empty list', () => {
		expect(
			companyFilterSchema.safeParse({ where: [{ field: 'title', op: 'ilike', value: 'x' }] })
				.success
		).toBe(false);
		expect(
			companyFilterSchema.safeParse({ where: [{ field: 'name', op: 'eq', value: 'x' }] }).success
		).toBe(false);
		expect(
			companyFilterSchema.safeParse({ where: [{ field: 'status', op: 'in', values: [] }] }).success
		).toBe(false);
		expect(
			companyFilterSchema.safeParse({ where: [{ field: 'status', op: 'in', values: ['open'] }] })
				.success
		).toBe(false);
		expect(
			contactFilterSchema.safeParse({
				where: [{ field: 'company_id', op: 'in', values: ['nope'] }]
			}).success
		).toBe(false);
		expect(contactFilterSchema.safeParse({ sort: { field: 'email' } }).success).toBe(false);
	});
});
