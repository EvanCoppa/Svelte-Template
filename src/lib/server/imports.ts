import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import type { Database } from '$lib/database.types';
import type { FeatureMap } from '$lib/features/types';
import { coerceCell, mapHeaders, missingRequiredFields } from '$lib/imports';
import {
	IMPORT_KINDS,
	IMPORT_SPECS,
	importFields,
	type ImportCommitValues,
	type ImportKind,
	type ImportPreview,
	type ImportResult,
	type PreviewChange,
	type PreviewRow,
	type PreviewStatus
} from '$lib/schemas/imports';
import { RECORD_FORMS, RECORD_SCHEMAS, type RecordField } from '$lib/schemas/records';
import { listAssets } from './crm/assets';
import { listBillables } from './crm/billables';
import { listCompanies } from './crm/companies';
import { listContacts } from './crm/contacts';
import { listProducts } from './crm/products';
import { insertRecord, updateRecord } from './records';
import { can, type UserAccess } from './roles';
import { readSpreadsheet, type Spreadsheet } from './spreadsheet';

/**
 * The server half of the import page (`$lib/schemas/imports.ts` is the
 * registry; `$lib/imports.ts` the pure mapping). Two steps, two actions:
 *
 *   previewImport()  reads the file, reads its headers as fields, validates
 *                    every row as the record form would, and says of each
 *                    whether it is new, the same as a record the org already
 *                    has (and what it would change on it), invalid, or a
 *                    repeat of an earlier row — nothing is written.
 *   commitImport()   takes the rows back with a decision on each and writes
 *                    them through the same insert as the "Add …" modal, or
 *                    overwrites the matched record with the columns the file
 *                    provided. Each row succeeds or fails on its own.
 *
 * Importing a kind needs `manage` on its feature, exactly as adding one
 * record does; the page lists only the kinds the session may import, and
 * both actions refuse the rest.
 */

/** The kinds this session may import: the feature enabled for the org, and `manage` held on it. */
export function importableKinds(features: FeatureMap, access: UserAccess): ImportKind[] {
	return IMPORT_KINDS.filter((kind) => {
		const feature = RECORD_FORMS[kind].feature;
		return features[feature]?.mode === 'enabled' && can(access, feature, 'manage');
	});
}

/** A record the org already has, as the strings the file's cells are compared with. */
type ExistingRecord = { id: string; name: string; values: Record<string, string> };

export async function previewImport(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: ImportKind,
	file: File
): Promise<ImportPreview> {
	const [sheet, existing] = await Promise.all([
		readSpreadsheet(file),
		loadExisting(supabase, orgId, kind)
	]);
	return describePreview(kind, file.name, sheet, existing);
}

/**
 * The preview, from a parsed sheet and the org's rows — pure, so the
 * matching rules are testable without a file or a database.
 */
export function describePreview(
	kind: ImportKind,
	fileName: string,
	sheet: Spreadsheet,
	existing: readonly ExistingRecord[]
): ImportPreview {
	const fields = importFields(kind);
	const fieldsByName = new Map(fields.map((field) => [field.name, field]));
	const mapping = mapHeaders(kind, sheet.headers);
	const missingRequired = missingRequiredFields(kind, mapping);
	const key = IMPORT_SPECS[kind].key;

	const byKey = new Map<string, ExistingRecord>();
	const byName = new Map<string, ExistingRecord>();
	for (const record of existing) {
		const keyValue = normalizeKey(record.values[key] ?? '');
		if (keyValue !== '' && !byKey.has(keyValue)) byKey.set(keyValue, record);
		const name = normalizeKey(record.name);
		if (name !== '' && !byName.has(name)) byName.set(name, record);
	}

	const seenKeys = new Map<string, number>();
	const seenNames = new Map<string, number>();
	const counts = { new: 0, match: 0, invalid: 0, duplicate: 0 } satisfies Record<
		PreviewStatus,
		number
	>;

	const rows = sheet.rows.map((row): PreviewRow => {
		// Every field starts blank — a column the file lacks is a field left
		// empty, which is what the form would have posted and what the schema
		// has a message for.
		const values: Record<string, string> = Object.fromEntries(
			fields.map((field) => [field.name, ''])
		);
		mapping.forEach((entry, column) => {
			const field = entry.field === null ? undefined : fieldsByName.get(entry.field);
			if (field) values[field.name] = coerceCell(field, row.cells[column] ?? '');
		});
		// A select the form always posts, so its schema has no blank: a blank
		// cell is the field left out, and the default (or, on an overwrite,
		// the existing value) stands.
		for (const field of fields) {
			if (field.type === 'select' && values[field.name] === '') delete values[field.name];
		}

		const parsed = RECORD_SCHEMAS[kind].safeParse(values);
		if (!parsed.success) {
			counts.invalid += 1;
			return {
				line: row.line,
				values,
				status: 'invalid',
				errors: parsed.error.issues.map((issue) => {
					const field = fieldsByName.get(String(issue.path[0] ?? ''));
					return { field: field?.name ?? '', message: issueMessage(issue, field) };
				})
			};
		}

		const keyValue = normalizeKey(values[key] ?? '');
		const nameValue = normalizeKey(values.name ?? '');

		// A second row for the same record inside the file: the first one is
		// the import, this one is reported and left out. A row without a key
		// repeats by name — every kind here requires one.
		const duplicateOf = keyValue !== '' ? seenKeys.get(keyValue) : seenNames.get(nameValue);
		if (duplicateOf !== undefined) {
			counts.duplicate += 1;
			return { line: row.line, values, status: 'duplicate', errors: [], duplicateOf };
		}
		if (keyValue !== '') seenKeys.set(keyValue, row.line);
		if (nameValue !== '') seenNames.set(nameValue, row.line);

		const match = findMatch(byKey, byName, key, keyValue, nameValue);
		if (!match) {
			counts.new += 1;
			return { line: row.line, values, status: 'new', errors: [] };
		}

		counts.match += 1;
		return {
			line: row.line,
			values,
			status: 'match',
			errors: [],
			match: {
				id: match.record.id,
				name: match.record.name,
				by: match.by,
				changes: changesFor(fields, values, match.record, match.by)
			}
		};
	});

	return { kind, fileName, sheet: sheet.sheet, mapping, missingRequired, rows, counts };
}

/**
 * A schema issue as the preview words it. The form's schemas say what a
 * typed value must look like, but a select is never typed in a form — the
 * spreadsheet is the one place free text meets an enum — so that one issue
 * gets the column guide's own wording instead of zod's.
 */
function issueMessage(issue: z.core.$ZodIssue, field: RecordField | undefined): string {
	if (field?.type === 'select' && issue.code === 'invalid_value') {
		const options = (field.options ?? []).map((option) => option.label).join(', ');
		return `${field.label} must be one of: ${options}.`;
	}
	return issue.message;
}

/**
 * The org's record a row is: the one with its key, else — when the row or
 * the record has no key to go by — the one with its name. A row whose SKU
 * is new is a new product even if a product of that name exists with
 * another SKU: the key is the identity, and the name only stands in where
 * a key is missing on one side.
 */
function findMatch(
	byKey: ReadonlyMap<string, ExistingRecord>,
	byName: ReadonlyMap<string, ExistingRecord>,
	key: string,
	keyValue: string,
	nameValue: string
): { record: ExistingRecord; by: string } | null {
	const viaKey = keyValue === '' ? undefined : byKey.get(keyValue);
	if (viaKey) return { record: viaKey, by: key };
	const viaName = nameValue === '' ? undefined : byName.get(nameValue);
	if (viaName && (keyValue === '' || normalizeKey(viaName.values[key] ?? '') === '')) {
		return { record: viaName, by: 'name' };
	}
	return null;
}

/**
 * The fields the file would change on a matched record. A blank cell keeps
 * the existing value, so it never counts; nor does the field the match was
 * made by — "d2740" is the code D2740, not a new spelling of it.
 */
function changesFor(
	fields: readonly RecordField[],
	values: Record<string, string>,
	record: ExistingRecord,
	matchedBy: string
): PreviewChange[] {
	const changes: PreviewChange[] = [];
	for (const field of fields) {
		if (field.name === matchedBy) continue;
		const to = values[field.name];
		if (to === undefined || to === '') continue;
		const from = record.values[field.name] ?? '';
		if (!sameValue(field, from, to))
			changes.push({ field: field.name, label: field.label, to, from });
	}
	return changes;
}

/** "499" and "499.00" are one price; every other field compares as written. */
function sameValue(field: RecordField, a: string, b: string): boolean {
	if (field.type === 'number' || field.type === 'integer') {
		return a !== '' && b !== '' && Number(a) === Number(b);
	}
	return a === b;
}

/** A key as compared: trimmed, one space between words, case dropped. "D-2740" and "d-2740" are one code. */
function normalizeKey(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The org's rows of a kind, each read through its kind's fields — the columns a file can bring. */
async function loadExisting(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: ImportKind
): Promise<ExistingRecord[]> {
	const rows = await listRows(supabase, orgId, kind);
	const fields = importFields(kind);
	return rows.map((row) => {
		const columns = new Map<string, ColumnValue>(Object.entries(row));
		// Every field is named after its column, so the fields read the row directly.
		const values = Object.fromEntries(
			fields.map((field) => [field.name, stringify(columns.get(field.name))])
		);
		return { id: row.id, name: row.name, values };
	});
}

/** The org's rows of a kind, as the list pages read them — a screen's embedded relation and all. */
function listRows(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: ImportKind
): Promise<({ id: string; name: string } & Record<string, ColumnValue>)[]> {
	switch (kind) {
		case 'company':
			return listCompanies(supabase, orgId);
		case 'contact':
			return listContacts(supabase, orgId);
		case 'product':
			return listProducts(supabase, orgId);
		case 'billable':
			return listBillables(supabase, orgId);
		case 'asset':
			return listAssets(supabase, orgId);
	}
}

/**
 * What a listed row's column holds: a scalar, a list (a billable's unit
 * choices), or the relation a list embeds for its screen (a contact's
 * company, a product's category) — which no field is named after, so it is
 * never read, and blank if it ever were.
 */
type ColumnValue =
	string | number | boolean | readonly string[] | { id: string; name: string } | null | undefined;

/** A column as the text a cell would carry: null is blank, a list is comma-separated, a flag is true/false. */
function stringify(value: ColumnValue): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.join(', ');
	if (value instanceof Object) return '';
	return String(value);
}

/** How many rows are written at once — enough to finish a real file inside a request, few enough to stay polite. */
const WRITE_CONCURRENCY = 8;

/**
 * Write the rows as decided. Every row is validated again against the
 * kind's schema — the preview's word is not trusted — and written on its
 * own, so one refused row (a SKU another row already took) is one line in
 * the result rather than a lost file.
 */
export async function commitImport(
	supabase: SupabaseClient<Database>,
	orgId: string,
	kind: ImportKind,
	rows: ImportCommitValues['rows']
): Promise<ImportResult> {
	const result: ImportResult = { kind, created: 0, updated: 0, skipped: 0, failures: [] };

	await inBatches(rows, WRITE_CONCURRENCY, async (row) => {
		if (row.decision === 'skip') {
			result.skipped += 1;
			return;
		}
		const parsed = RECORD_SCHEMAS[kind].safeParse(row.values);
		if (!parsed.success) {
			result.failures.push({ line: row.line, message: parsed.error.issues[0].message });
			return;
		}
		try {
			if (row.decision === 'update') {
				if (row.existingId === '') throw new Error('There is no existing record to overwrite.');
				const provided = Object.keys(row.values).filter((field) => row.values[field] !== '');
				await updateRecord(supabase, orgId, kind, row.existingId, parsed.data, provided);
				result.updated += 1;
			} else {
				await insertRecord(supabase, orgId, kind, parsed.data);
				result.created += 1;
			}
		} catch (cause) {
			result.failures.push({
				line: row.line,
				message: cause instanceof Error ? cause.message : 'Could not write the row.'
			});
		}
	});

	result.failures.sort((a, b) => a.line - b.line);
	return result;
}

/** Run `work` over `items`, at most `size` at a time, in order of start. */
async function inBatches<T>(
	items: readonly T[],
	size: number,
	work: (item: T) => Promise<void>
): Promise<void> {
	for (let start = 0; start < items.length; start += size) {
		await Promise.all(items.slice(start, start + size).map(work));
	}
}
