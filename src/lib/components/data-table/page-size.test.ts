import { describe, expect, it } from 'vitest';
import { MIN_PAGE_SIZE, rowsThatFit, type TableMetrics } from './page-size.js';

/**
 * A tall viewport with a short page above the table: 900 − 200 above − 48 of
 * shell padding − 100 of chrome leaves 552px of room for rows.
 */
const metrics = (overrides: Partial<TableMetrics> = {}): TableMetrics => ({
	viewportHeight: 900,
	tableTop: 200,
	chrome: 100,
	rowHeight: 40,
	minPageSize: MIN_PAGE_SIZE,
	...overrides
});

describe('rowsThatFit', () => {
	it('fills the room left between the table and the bottom of the viewport', () => {
		expect(rowsThatFit(metrics())).toBe(13); // 552 ÷ 40 = 13.8
	});

	it('leaves the row that only half fits off the page', () => {
		expect(rowsThatFit(metrics({ rowHeight: 50 }))).toBe(11); // 552 ÷ 50 = 11.04
		expect(rowsThatFit(metrics({ rowHeight: 46 }))).toBe(12); // 552 ÷ 46 = 12 exactly
	});

	it('gives a taller viewport more rows and a shorter one fewer', () => {
		expect(rowsThatFit(metrics({ viewportHeight: 1200 }))).toBe(21);
		expect(rowsThatFit(metrics({ viewportHeight: 700 }))).toBe(8);
	});

	it('counts a busier page above the table, and more chrome, against the rows', () => {
		expect(rowsThatFit(metrics({ tableTop: 400 }))).toBe(8);
		expect(rowsThatFit(metrics({ chrome: 300 }))).toBe(8);
	});

	it('falls back to the floor when there is no room at all', () => {
		expect(rowsThatFit(metrics({ tableTop: 4000 }))).toBe(MIN_PAGE_SIZE);
		expect(rowsThatFit(metrics({ tableTop: 4000, minPageSize: 8 }))).toBe(8);
	});

	it('does not divide by a row it could not measure', () => {
		expect(rowsThatFit(metrics({ rowHeight: 0 }))).toBe(MIN_PAGE_SIZE);
	});
});
