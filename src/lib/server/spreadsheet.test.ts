import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { readSpreadsheet, SpreadsheetError } from './spreadsheet';

/**
 * One reader for CSV and Excel alike. What matters is the grid it hands
 * back: the first non-empty row as headers, every row after as that many
 * strings, blank rows gone, and a spreadsheet's own row numbers kept for
 * the messages.
 */

function csv(text: string, name = 'products.csv'): File {
	return new File([text], name, { type: 'text/csv' });
}

function xlsx(rows: (string | number | Date)[][], name = 'products.xlsx'): File {
	const workbook = utils.book_new();
	utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), 'Catalog');
	const bytes: ArrayBuffer = write(workbook, { type: 'array', bookType: 'xlsx' });
	return new File([bytes], name);
}

describe('readSpreadsheet', () => {
	it('reads a CSV as headers and rows of strings, numbered as the sheet numbers them', async () => {
		const sheet = await readSpreadsheet(
			csv('Name,SKU,Price\nWidget,W-1,"1,200.50"\n\nGadget,G-1,\n')
		);

		expect(sheet.headers).toEqual(['Name', 'SKU', 'Price']);
		expect(sheet.rows).toEqual([
			{ line: 2, cells: ['Widget', 'W-1', '1,200.50'] },
			{ line: 4, cells: ['Gadget', 'G-1', ''] }
		]);
	});

	it('reads an Excel workbook, formatting a number and a date as text', async () => {
		const sheet = await readSpreadsheet(
			xlsx([
				['Name', 'Price', 'Acquired'],
				['Widget', 1200.5, new Date(Date.UTC(2026, 0, 31))]
			])
		);

		expect(sheet.sheet).toBe('Catalog');
		expect(sheet.headers).toEqual(['Name', 'Price', 'Acquired']);
		expect(sheet.rows[0].cells.slice(0, 2)).toEqual(['Widget', '1200.5']);
		expect(sheet.rows[0].cells[2]).toMatch(/^2026-01-3[01]$/);
	});

	it('skips leading blank rows to find the header, and pads short rows', async () => {
		const sheet = await readSpreadsheet(csv('\n\nName,SKU\nWidget\n'));

		expect(sheet.headers).toEqual(['Name', 'SKU']);
		expect(sheet.rows).toEqual([{ line: 4, cells: ['Widget', ''] }]);
	});

	it('refuses an empty file and a header with nothing under it', async () => {
		await expect(readSpreadsheet(csv(''))).rejects.toBeInstanceOf(SpreadsheetError);
		await expect(readSpreadsheet(csv('Name,SKU\n'))).rejects.toThrow(/no rows to import/);
	});

	it('refuses more rows than one import takes', async () => {
		const rows = Array.from({ length: 5001 }, (_, index) => `Row ${index}`).join('\n');
		await expect(readSpreadsheet(csv(`Name\n${rows}\n`))).rejects.toThrow(/at most 5000/);
	});
});
