import { describe, expect, it } from 'vitest';
import { cellSortValue, cellText, paymentTone, paymentWord } from './cells';

const TODAY = '2026-09-12';

describe('cellText', () => {
	it('reads every kind of cell as the text a filter compares', () => {
		expect(cellText({ type: 'link', text: 'Acme', href: null }, TODAY)).toBe('Acme');
		expect(cellText({ type: 'status', text: 'active', tone: 'success' }, TODAY)).toBe('active');
		expect(cellText({ type: 'record', text: '', href: null }, TODAY)).toBe('');
		expect(cellText({ type: 'number', value: 3 }, TODAY)).toBe('3');
		expect(cellText({ type: 'money', value: null, currency: 'USD', unit: null }, TODAY)).toBe('');
		expect(cellText({ type: 'boolean', value: true }, TODAY)).toBe('Yes');
		expect(cellText({ type: 'boolean', value: null }, TODAY)).toBe('');
		expect(cellText({ type: 'date', value: '2026-01-15' }, TODAY)).toBe('2026-01-15');
		expect(cellText({ type: 'datetime', value: null }, TODAY)).toBe('');
	});
});

describe('paymentWord', () => {
	it('says overdue only for an issued invoice past due with money owed', () => {
		const owed = { type: 'payment', state: 'partial', dueDate: '2026-09-01', owed: true } as const;
		expect(paymentWord(owed, TODAY)).toBe('overdue');
		expect(paymentTone('overdue')).toBe('error');
		expect(paymentWord({ ...owed, owed: false, state: 'paid' }, TODAY)).toBe('paid');
		expect(paymentWord({ ...owed, dueDate: '2026-12-01' }, TODAY)).toBe('partial');
		expect(paymentWord({ ...owed, dueDate: null }, TODAY)).toBe('partial');
		expect(paymentWord({ ...owed, state: null }, TODAY)).toBe('');
		expect(paymentTone('paid')).toBe('success');
	});
});

describe('cellSortValue', () => {
	it('orders amounts as numbers and everything else as text', () => {
		expect(cellSortValue({ type: 'money', value: 1250, currency: 'USD', unit: null }, TODAY)).toBe(
			1250
		);
		expect(cellSortValue({ type: 'number', value: null }, TODAY)).toBeNull();
		expect(cellSortValue({ type: 'date', value: '2026-01-15' }, TODAY)).toBe('2026-01-15');
		expect(cellSortValue({ type: 'text', text: 'b' }, TODAY)).toBe('b');
		expect(
			cellSortValue({ type: 'payment', state: 'unpaid', dueDate: null, owed: true }, TODAY)
		).toBe('unpaid');
	});
});
