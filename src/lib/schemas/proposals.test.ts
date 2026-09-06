import { describe, expect, it } from 'vitest';
import {
	comparisonTableSchema,
	investmentLineItemsSchema,
	MONEY_MAX,
	parseNumericCell,
	proposalInsertSchema,
	proposalLineItemSchema,
	proposalOptionInsertSchema,
	proposalOptionUpdateSchema,
	proposalUpdateSchema,
	type ComparisonTable
} from './proposals';

const ID = '11111111-1111-1111-1111-111111111111';

function messagesOf(result: { error?: { issues: { message: string }[] } }) {
	return result.error?.issues.map((issue) => issue.message).join(' ') ?? '';
}

function pathsOf(result: { error?: { issues: { path: PropertyKey[] }[] } }) {
	return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('proposalInsertSchema', () => {
	it('trims the title and leaves unset columns to the database defaults', () => {
		const result = proposalInsertSchema.safeParse({ title: '  Annual support  ' });
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ title: 'Annual support' });
	});

	it('accepts a complete parent link and rejects half of one', () => {
		expect(
			proposalInsertSchema.safeParse({ title: 'x', entity_type: 'deal', entity_id: ID }).success
		).toBe(true);
		const half = proposalInsertSchema.safeParse({ title: 'x', entity_type: 'deal' });
		expect(messagesOf(half)).toMatch(/both the kind of record/);
		expect(pathsOf(half)).toContain('entity_id');
	});

	it('only knows the entity kinds the database knows', () => {
		const result = proposalInsertSchema.safeParse({
			title: 'x',
			entity_type: 'patient',
			entity_id: ID
		});
		expect(result.success).toBe(false);
		expect(pathsOf(result)).toContain('entity_type');
	});

	it('never carries a computed total', () => {
		const result = proposalInsertSchema.safeParse({ title: 'x', computed_total: 99 });
		expect(result.success).toBe(true);
		expect(result.data).not.toHaveProperty('computed_total');
	});

	it('keeps money and percentages inside their columns', () => {
		expect(messagesOf(proposalInsertSchema.safeParse({ title: 'x', default_fee: -1 }))).toMatch(
			/negative/
		);
		expect(messagesOf(proposalInsertSchema.safeParse({ title: 'x', default_fee: 1.005 }))).toMatch(
			/two decimal/
		);
		expect(
			messagesOf(proposalInsertSchema.safeParse({ title: 'x', default_fee: MONEY_MAX + 1 }))
		).toMatch(/too large/);
		expect(messagesOf(proposalInsertSchema.safeParse({ title: 'x', tax_rate: 101 }))).toMatch(
			/100%/
		);
		expect(
			proposalInsertSchema.safeParse({ title: 'x', default_fee: 250, tax_rate: 8.25 }).success
		).toBe(true);
	});

	it('requires base_config to be a JSON object', () => {
		expect(proposalInsertSchema.safeParse({ title: 'x', base_config: ['no'] }).success).toBe(false);
		expect(
			proposalInsertSchema.safeParse({ title: 'x', base_config: { seats: 12, regions: ['us'] } })
				.success
		).toBe(true);
	});

	it('wants valid_until as an ISO instant with an offset', () => {
		expect(
			proposalInsertSchema.safeParse({ title: 'x', valid_until: '2026-10-01T00:00:00Z' }).success
		).toBe(true);
		expect(proposalInsertSchema.safeParse({ title: 'x', valid_until: '2026-10-01' }).success).toBe(
			false
		);
	});
});

describe('proposalUpdateSchema', () => {
	it('lets a partial edit through without touching the link', () => {
		expect(proposalUpdateSchema.safeParse({ title: 'Renamed' }).success).toBe(true);
		expect(proposalUpdateSchema.safeParse({ entity_id: ID }).success).toBe(true);
	});

	it('still refuses a half link when both halves are sent', () => {
		expect(proposalUpdateSchema.safeParse({ entity_type: null, entity_id: ID }).success).toBe(
			false
		);
	});

	it('makes accepting name the accepted option', () => {
		const bare = proposalUpdateSchema.safeParse({ status: 'accepted' });
		expect(messagesOf(bare)).toMatch(/which option was accepted/);
		expect(pathsOf(bare)).toContain('selected_option_id');
		expect(
			proposalUpdateSchema.safeParse({ status: 'accepted', selected_option_id: ID }).success
		).toBe(true);
		expect(proposalUpdateSchema.safeParse({ status: 'declined' }).success).toBe(true);
	});
});

describe('proposalOptionInsertSchema', () => {
	const base = { proposal_id: ID, label: 'Better' };

	it('leaves unset columns to the database defaults', () => {
		const result = proposalOptionInsertSchema.safeParse(base);
		expect(result.success).toBe(true);
		expect(result.data).toEqual(base);
	});

	it('needs the proposal it belongs to', () => {
		expect(proposalOptionInsertSchema.safeParse({ label: 'Better' }).success).toBe(false);
	});

	it('pairs a duration value with a unit', () => {
		const half = proposalOptionInsertSchema.safeParse({ ...base, duration_value: 3 });
		expect(messagesOf(half)).toMatch(/both a number and a unit/);
		expect(pathsOf(half)).toContain('duration_unit');
		expect(
			proposalOptionInsertSchema.safeParse({ ...base, duration_value: 3, duration_unit: 'visits' })
				.success
		).toBe(true);
		expect(
			proposalOptionInsertSchema.safeParse({ ...base, duration_unit: 'fortnights' }).success
		).toBe(false);
	});

	it('normalises the currency code and rejects anything but ISO 4217', () => {
		expect(
			proposalOptionInsertSchema.safeParse({ ...base, currency: ' eur ' }).data?.currency
		).toBe('EUR');
		expect(
			messagesOf(proposalOptionInsertSchema.safeParse({ ...base, currency: 'dollars' }))
		).toMatch(/three-letter/);
	});

	it('keeps financing terms sane', () => {
		expect(
			proposalOptionInsertSchema.safeParse({ ...base, financing_term_months: 0 }).success
		).toBe(false);
		expect(
			proposalOptionInsertSchema.safeParse({ ...base, financing_term_months: 12.5 }).success
		).toBe(false);
		expect(proposalOptionInsertSchema.safeParse({ ...base, financing_apr: -1 }).success).toBe(
			false
		);
		expect(
			proposalOptionInsertSchema.safeParse({
				...base,
				financing_available: true,
				financing_term_months: 24,
				financing_apr: 4.99
			}).success
		).toBe(true);
	});

	it('drops a computed total sent by the client', () => {
		const result = proposalOptionInsertSchema.safeParse({ ...base, computed_total: 1 });
		expect(result.success).toBe(true);
		expect(result.data).not.toHaveProperty('computed_total');
	});
});

describe('proposalOptionUpdateSchema', () => {
	it('accepts a partial edit and never a new proposal_id', () => {
		const result = proposalOptionUpdateSchema.safeParse({ base_price: 1200.5, proposal_id: ID });
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ base_price: 1200.5 });
	});

	it('checks the duration pair only when both halves are sent', () => {
		expect(proposalOptionUpdateSchema.safeParse({ duration_value: 3 }).success).toBe(true);
		expect(
			proposalOptionUpdateSchema.safeParse({ duration_value: 3, duration_unit: null }).success
		).toBe(false);
	});
});

describe('proposalLineItemSchema', () => {
	it('needs only a label and refuses negatives', () => {
		expect(proposalLineItemSchema.safeParse({ label: 'Crown' }).data).toEqual({ label: 'Crown' });
		expect(proposalLineItemSchema.safeParse({ label: 'Crown', quantity: -1 }).success).toBe(false);
		expect(proposalLineItemSchema.safeParse({ label: 'Crown', unit_cost: 1.999 }).success).toBe(
			false
		);
	});
});

describe('parseNumericCell', () => {
	it('reads money and percentages the way the slides do', () => {
		expect(parseNumericCell('$4,500.00')).toBe(4500);
		expect(parseNumericCell(' 12% ')).toBe(12);
		expect(parseNumericCell('-30')).toBe(-30);
		expect(parseNumericCell('3 visits')).toBeNull();
		expect(parseNumericCell('TBD')).toBeNull();
		expect(parseNumericCell('')).toBeNull();
	});
});

describe('comparisonTableSchema', () => {
	const table = [
		'Feature | Basic | Standard* | Premium',
		'Price | $12,000 | $24,000 | $30,000',
		'Onboarding | no | yes | included',
		'Support tier | email | business hours | 24/7'
	].join('\n');

	function parse(raw: string): ComparisonTable {
		const result = comparisonTableSchema.safeParse(raw);
		if (!result.success) throw new Error(messagesOf(result));
		return result.data;
	}

	it('parses the header, the recommended column and typed cells', () => {
		const parsed = parse(table);
		expect(parsed.heading).toBe('Feature');
		expect(parsed.columns).toEqual([
			{ label: 'Basic', recommended: false },
			{ label: 'Standard', recommended: true },
			{ label: 'Premium', recommended: false }
		]);
		expect(parsed.rows.map((row) => row.label)).toEqual(['Price', 'Onboarding', 'Support tier']);
		expect(parsed.rows[0]).toMatchObject({
			numeric: true,
			cells: [
				{ kind: 'number', value: 12000, text: '$12,000' },
				{ kind: 'number', value: 24000, text: '$24,000' },
				{ kind: 'number', value: 30000, text: '$30,000' }
			]
		});
		expect(parsed.rows[1]?.cells).toEqual([{ kind: 'no' }, { kind: 'yes' }, { kind: 'yes' }]);
		expect(parsed.rows[2]).toMatchObject({ numeric: false });
		expect(parsed.rows[2]?.cells[2]).toEqual({ kind: 'text', text: '24/7' });
	});

	it('rejects a row whose cell count differs from the header', () => {
		const result = comparisonTableSchema.safeParse(`${table}\nWarranty | 1 | 2`);
		expect(messagesOf(result)).toMatch(/Line 5: 3 cells, the header has 4/);
	});

	it('rejects a numeric row with a cell that does not parse', () => {
		const result = comparisonTableSchema.safeParse(
			'Feature | Basic | Premium\nPrice | $1,200 | TBD'
		);
		expect(messagesOf(result)).toMatch(/"TBD" is not a number/);
	});

	it('lets a numeric row carry blanks and dashes as "not offered"', () => {
		const result = comparisonTableSchema.safeParse(
			'Feature | Basic | Premium\nSeats | — | 12\nAddons | | 3'
		);
		expect(result.success).toBe(true);
		expect(result.data?.rows[0]?.cells).toEqual([
			{ kind: 'no' },
			{ kind: 'number', value: 12, text: '12' }
		]);
		expect(result.data?.rows[1]?.cells[0]).toEqual({ kind: 'text', text: '' });
	});

	it('allows at most one recommended column', () => {
		const result = comparisonTableSchema.safeParse('Feature | A* | B*\nPrice | 1 | 2');
		expect(messagesOf(result)).toMatch(/only one column can end in "\*"/);
	});

	it('needs a header, at least one option column and at least one row', () => {
		expect(messagesOf(comparisonTableSchema.safeParse(''))).toMatch(
			/header line and at least one row/
		);
		expect(messagesOf(comparisonTableSchema.safeParse('Feature | A'))).toMatch(/at least one row/);
		expect(messagesOf(comparisonTableSchema.safeParse('Feature\nPrice'))).toMatch(
			/at least one option column/
		);
		expect(messagesOf(comparisonTableSchema.safeParse('Feature | A | \nPrice | 1 | 2'))).toMatch(
			/option 2 has no label/
		);
		expect(messagesOf(comparisonTableSchema.safeParse('Feature | A\n | 1'))).toMatch(
			/row has no label/
		);
	});

	it('reports every problem at once', () => {
		const result = comparisonTableSchema.safeParse('Feature | A* | B*\nPrice | 1\nSeats | TBD | 2');
		expect(result.error?.issues).toHaveLength(3);
	});
});

describe('investmentLineItemsSchema', () => {
	it('parses label|amount lines with tolerant amounts', () => {
		const result = investmentLineItemsSchema.safeParse('Crown | $1,200.50\nWhitening|300');
		expect(result.data).toEqual([
			{ label: 'Crown', amount: 1200.5 },
			{ label: 'Whitening', amount: 300 }
		]);
	});

	it('treats blank input as no items', () => {
		expect(investmentLineItemsSchema.safeParse('  \n ').data).toEqual([]);
	});

	it('rejects a line without an amount, a bad amount, or a missing label', () => {
		expect(messagesOf(investmentLineItemsSchema.safeParse('Crown'))).toMatch(
			/expected "label\|amount"/
		);
		expect(messagesOf(investmentLineItemsSchema.safeParse('Crown | TBD'))).toMatch(
			/"TBD" is not an amount/
		);
		expect(messagesOf(investmentLineItemsSchema.safeParse(' | 100'))).toMatch(/no label/);
	});
});
