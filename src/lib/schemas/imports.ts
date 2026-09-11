import { z } from 'zod';
import { RECORD_FORMS, RECORD_SCHEMAS, type RecordField, type RecordFormValues } from './records';

/**
 * The bulk-import registry — which kinds of record a spreadsheet can bring
 * in, and how a file's rows are told apart from the rows the org already
 * has. The one import page (`src/routes/(app)/import/`) reads it; there is
 * no "Import" button on any list page on purpose.
 *
 * An import is the generic create form, many rows at a time: a kind's
 * columns ARE its `RECORD_FORMS` fields and its validation IS its
 * `RECORD_SCHEMAS` entry, so a value that the "Add …" modal would refuse is
 * refused here with the same message, and adding a column to the form adds
 * it to the import with no second list. What this registry adds is the
 * part a spreadsheet needs and a form does not: the header names a column
 * may arrive under (`aliases`), and the column that says two rows are the
 * same record (`key` — a SKU, a code, an email — with `name` as the
 * fallback), which is what lets the preview offer "overwrite or add as new"
 * instead of silently doubling a catalog.
 *
 * Client-safe like every schema module: the page renders the column guide
 * and validates the decisions from it; `$lib/server/imports.ts` parses the
 * file, matches the rows and writes them.
 */

/** The kinds a spreadsheet can import — the catalog-shaped ones a business already keeps in one. */
export const IMPORT_KINDS = ['company', 'contact', 'product', 'billable', 'asset'] as const;

export type ImportKind = (typeof IMPORT_KINDS)[number];

export function isImportKind(value: string): value is ImportKind {
	return IMPORT_KINDS.some((kind) => kind === value);
}

export type ImportSpec = {
	/**
	 * The field that identifies a record in the file and in the org: two
	 * rows with the same value are the same thing. Blank in the file → the
	 * row is matched by `name` instead, so a list with no codes still
	 * updates rather than duplicates.
	 */
	key: string;
	/** Extra header names a column is recognised under, per field — normalised by `normalizeHeader()` before comparing. */
	aliases: Partial<Record<string, readonly string[]>>;
};

type ImportRegistry = { [K in ImportKind]: ImportSpec };

export const IMPORT_SPECS: ImportRegistry = {
	company: {
		key: 'name',
		aliases: {
			name: ['company', 'company name', 'organization', 'organisation', 'account', 'client'],
			relationship: ['type', 'kind'],
			email: ['e-mail', 'email address'],
			phone: ['telephone', 'phone number', 'tel'],
			website: ['url', 'web', 'site', 'domain']
		}
	},
	contact: {
		key: 'email',
		aliases: {
			name: ['full name', 'contact', 'contact name', 'person', 'patient', 'client'],
			title: ['job title', 'role', 'position'],
			email: ['e-mail', 'email address'],
			phone: ['telephone', 'phone number', 'tel', 'mobile', 'cell']
		}
	},
	product: {
		key: 'sku',
		aliases: {
			name: ['product', 'product name', 'item', 'item name', 'title'],
			kind: ['type', 'product type'],
			sku: ['code', 'product code', 'item code', 'part number', 'part no', 'id'],
			unit_price: ['price', 'unit price', 'sell price', 'sale price', 'list price', 'retail'],
			unit_cost: ['cost', 'unit cost', 'cost price', 'buy price'],
			unit: ['unit of measure', 'uom', 'units'],
			description: ['notes', 'details']
		}
	},
	billable: {
		key: 'code',
		aliases: {
			name: ['billable', 'procedure', 'service', 'item', 'description of service', 'title'],
			code: ['cdt', 'cdt code', 'procedure code', 'service code', 'sku', 'id'],
			unit_price: ['price', 'unit price', 'fee', 'rate', 'charge'],
			unit: ['unit of measure', 'uom', 'units', 'per'],
			unit_choices: ['choices', 'options', 'unit options'],
			is_featured: ['featured', 'pinned', 'default'],
			description: ['notes', 'details']
		}
	},
	asset: {
		key: 'identifier',
		aliases: {
			name: ['asset', 'asset name', 'item', 'equipment', 'title'],
			asset_type: ['type', 'category', 'kind'],
			identifier: ['id', 'tag', 'asset tag', 'serial', 'serial number', 'code'],
			status: ['state'],
			acquired_on: ['acquired', 'purchased', 'purchase date', 'date acquired', 'bought'],
			purchase_price: ['price', 'cost', 'purchase cost', 'value'],
			description: ['notes', 'details']
		}
	}
};

/** The fields a kind imports: exactly the ones its "Add …" form asks for. */
export function importFields(kind: ImportKind): readonly RecordField[] {
	return RECORD_FORMS[kind].fields;
}

/**
 * The fields a kind cannot do without, read off its schema rather than kept
 * in a second list: validating an empty row fails on exactly the required
 * ones, because every optional field defaults to blank.
 */
export function requiredFields(kind: ImportKind): string[] {
	const result = RECORD_SCHEMAS[kind].safeParse({});
	if (result.success) return [];
	return [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
}

/** A spreadsheet bigger than this is refused before it is parsed. */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

/** More rows than this in one file is a job for two files. */
export const MAX_IMPORT_ROWS = 5000;

/** The file types the upload accepts — by extension too, since browsers disagree about CSV's MIME type. */
export const IMPORT_FILE_EXTENSIONS = ['.csv', '.tsv', '.txt', '.xlsx', '.xls', '.ods'] as const;

function hasImportExtension(name: string): boolean {
	const lower = name.toLowerCase();
	return IMPORT_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Step one: the kind and the file. Posted as multipart by the upload form. */
export const importUploadSchema = z.object({
	kind: z.enum(IMPORT_KINDS, { error: 'Choose what you are importing.' }),
	file: z
		.instanceof(File, { message: 'Choose a spreadsheet to import.' })
		.refine((file) => file.size > 0, 'Choose a spreadsheet to import.')
		.refine((file) => file.size <= MAX_IMPORT_BYTES, 'Files must be 4MB or smaller.')
		.refine((file) => hasImportExtension(file.name), 'Use a CSV, TSV or Excel file.')
});

/**
 * What to do with one previewed row. A row that matches an existing record
 * is overwritten (`update`), added beside it (`create`) or left alone
 * (`skip`); a new row is created or skipped.
 */
export const ROW_DECISIONS = ['create', 'update', 'skip'] as const;

export type RowDecision = (typeof ROW_DECISIONS)[number];

export function isRowDecision(value: string): value is RowDecision {
	return ROW_DECISIONS.some((decision) => decision === value);
}

/** Two forms of two schemas share the page, so each is named; the ids keep a result routing to its own form. */
export const IMPORT_FORM_IDS = { upload: 'import-upload', commit: 'import-commit' } as const;

/**
 * Step two: the rows the preview showed, each with its decision, posted
 * back as JSON. Values are the field strings the preview coerced — the
 * server re-validates every row against the kind's schema before writing,
 * so a tampered post fails a row rather than a table.
 */
export const importCommitSchema = z.object({
	kind: z.enum(IMPORT_KINDS),
	rows: z
		.array(
			z.object({
				/** The row's number in the spreadsheet, for the result's messages. */
				line: z.int().min(1),
				decision: z.enum(ROW_DECISIONS),
				/** The record an `update` overwrites; blank otherwise. */
				existingId: z.guid().or(z.literal('')).default(''),
				values: z.record(z.string(), z.string())
			})
		)
		.max(MAX_IMPORT_ROWS, `Import at most ${MAX_IMPORT_ROWS} rows at a time.`)
});

export type ImportCommitValues = z.infer<typeof importCommitSchema>;

// --- The preview, as the page draws it ---------------------------------------

/**
 * How a row will land: `new` (no record like it), `match` (a record like it
 * exists — the decision says what happens), `invalid` (a value the kind's
 * schema refuses; never imported), `duplicate` (a second row for the same
 * record inside the file; never imported — the first one is).
 */
export type PreviewStatus = 'new' | 'match' | 'invalid' | 'duplicate';

export type PreviewChange = {
	field: string;
	label: string;
	/** The value the org has now, as text. */
	from: string;
	/** The value the file brings. */
	to: string;
};

export type PreviewMatch = {
	id: string;
	/** The existing record's name, for "same as Porcelain crown". */
	name: string;
	/** Which field said so: the kind's key, or `name`. */
	by: string;
	/** Every field the file would change on it — empty when the row is identical. */
	changes: PreviewChange[];
};

export type PreviewRow = {
	line: number;
	/** The coerced value per mapped field — what a commit posts back. */
	values: RecordFormValues;
	status: PreviewStatus;
	errors: { field: string; message: string }[];
	match?: PreviewMatch;
	/** For a `duplicate`: the line of the row it repeats. */
	duplicateOf?: number;
};

/** One header of the file and the field it was read as — null when nothing matched. */
export type HeaderMapping = { header: string; field: string | null };

export type ImportPreview = {
	kind: ImportKind;
	fileName: string;
	/** The worksheet the rows came from — the first one; a CSV has one. */
	sheet: string;
	mapping: HeaderMapping[];
	/** Required fields no header mapped to: nothing can be imported until the file has them. */
	missingRequired: string[];
	rows: PreviewRow[];
	counts: Record<PreviewStatus, number>;
};

/** What a commit did, row by row folded into totals. */
export type ImportResult = {
	kind: ImportKind;
	created: number;
	updated: number;
	skipped: number;
	failures: { line: number; message: string }[];
};
