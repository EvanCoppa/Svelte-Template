import { read, utils } from 'xlsx';
import { MAX_IMPORT_ROWS } from '$lib/schemas/imports';

/**
 * A spreadsheet as a grid of strings — the one reader for every file the
 * import page accepts. SheetJS parses CSV, TSV and Excel alike, and every
 * cell comes back formatted the way the sheet showed it (a date as text, a
 * price without the float noise), because a row is validated as the strings
 * the record form would have posted, never as typed cells.
 *
 * Only the first sheet is read: a workbook with several is several imports.
 */

export type Spreadsheet = {
	/** The worksheet's name — "Sheet1", or the file's name for a CSV. */
	sheet: string;
	/** The first non-empty row, as written. */
	headers: string[];
	/** Every row after it, as many cells as there are headers; wholly blank rows are dropped. */
	rows: { line: number; cells: string[] }[];
};

/** Thrown for a file that is not a spreadsheet, or one with more than `MAX_IMPORT_ROWS` rows. */
export class SpreadsheetError extends Error {}

export async function readSpreadsheet(file: File): Promise<Spreadsheet> {
	let workbook;
	try {
		// The full parse: `cellDates` with a fixed ISO format is what turns an
		// Excel date serial into "2026-01-31" rather than "1/31/26".
		workbook = read(await file.arrayBuffer(), {
			type: 'array',
			cellDates: true,
			dateNF: 'yyyy-mm-dd',
			raw: false
		});
	} catch {
		throw new SpreadsheetError('That file could not be read as a spreadsheet.');
	}

	const sheet = workbook.SheetNames[0];
	const worksheet = sheet === undefined ? undefined : workbook.Sheets[sheet];
	if (sheet === undefined || worksheet === undefined) {
		throw new SpreadsheetError('That file has no worksheet to import.');
	}

	// `raw: false` with a blank default makes every cell its formatted text,
	// so a row is strings end to end — the shape a form posts. Blank rows are
	// kept here and dropped below, so a row's number stays the sheet's own.
	const grid = utils.sheet_to_json<string[]>(worksheet, {
		header: 1,
		raw: false,
		defval: '',
		blankrows: true
	});

	const headerIndex = grid.findIndex((row) => row.some((cell) => text(cell) !== ''));
	if (headerIndex === -1) {
		throw new SpreadsheetError('That file is empty — it needs a header row and at least one row.');
	}
	const headers = grid[headerIndex].map(text);
	const rows = grid
		.slice(headerIndex + 1)
		.map((cells, offset) => ({
			// Spreadsheet numbering: the header is row 1 when the file starts there.
			line: headerIndex + offset + 2,
			cells: headers.map((_, column) => text(cells[column]))
		}))
		.filter((row) => row.cells.some((cell) => cell !== ''));

	if (rows.length === 0) {
		throw new SpreadsheetError('That file has a header row but no rows to import.');
	}
	if (rows.length > MAX_IMPORT_ROWS) {
		throw new SpreadsheetError(
			`That file has ${rows.length} rows; import at most ${MAX_IMPORT_ROWS} at a time.`
		);
	}

	return { sheet, headers, rows };
}

/** A cell as text: SheetJS has already formatted it; a cell past the row's end is blank. */
function text(cell: string | undefined): string {
	return (cell ?? '').trim();
}
