import type { RecordField } from '$lib/schemas/records';
import {
	IMPORT_SPECS,
	importFields,
	requiredFields,
	type HeaderMapping,
	type ImportKind
} from '$lib/schemas/imports';

/**
 * The pure half of importing: reading a spreadsheet's headers as fields and
 * its cells as the strings the record form would have posted. Client-safe
 * on purpose — the page draws the column guide and the template from it,
 * the server maps and coerces with it, and the two can never disagree about
 * what "Unit price" means.
 */

/** A header as compared: case, spacing and punctuation dropped, so "Unit Price", "unit_price" and "UNIT-PRICE" are one. */
export function normalizeHeader(header: string): string {
	return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Every spelling a field answers to: its name, its label and its aliases, normalised. */
function headerNamesFor(kind: ImportKind, field: RecordField): Set<string> {
	const aliases = IMPORT_SPECS[kind].aliases[field.name] ?? [];
	return new Set([field.name, field.label, ...aliases].map(normalizeHeader));
}

/**
 * Which field each header is read as. First header wins when two would map
 * to the same field, the second one being ignored rather than silently
 * overwriting the first; a header nothing answers to maps to null and the
 * preview lists it so a typo'd column is noticed rather than dropped.
 */
export function mapHeaders(kind: ImportKind, headers: readonly string[]): HeaderMapping[] {
	const fields = importFields(kind);
	const taken = new Set<string>();
	return headers.map((header) => {
		const wanted = normalizeHeader(header);
		if (wanted === '') return { header, field: null };
		const field = fields.find(
			(candidate) => !taken.has(candidate.name) && headerNamesFor(kind, candidate).has(wanted)
		);
		if (field) taken.add(field.name);
		return { header, field: field?.name ?? null };
	});
}

/** The required fields no header maps to — the file cannot import without them. */
export function missingRequiredFields(
	kind: ImportKind,
	mapping: readonly HeaderMapping[]
): string[] {
	const mapped = new Set(mapping.map((entry) => entry.field));
	return requiredFields(kind).filter((field) => !mapped.has(field));
}

const YES = new Set(['true', 'yes', 'y', '1', 'x', '✓']);
const NO = new Set(['false', 'no', 'n', '0', '']);

/**
 * A cell as the record form would have posted it. Spreadsheets are typed by
 * people and exported by other software, so the obvious spellings are
 * accepted and turned into the one the schema wants: "$1,200.00" is an
 * amount, "Service" or "SERVICE" is the `service` option, "Yes" is `true`
 * for a yes/no select, "3/1/2024" is a date. Anything else is passed
 * through as typed for the schema to refuse with its own message.
 */
export function coerceCell(field: RecordField, raw: string): string {
	const value = raw.trim();
	if (value === '') return '';
	switch (field.type) {
		case 'select':
			return coerceOption(field, value);
		case 'number':
			return coerceAmount(value);
		case 'integer':
			return value.replace(/,/g, '');
		case 'date':
			return coerceDate(value);
		default:
			return value;
	}
}

function coerceOption(field: RecordField, value: string): string {
	const options = field.options ?? [];
	const wanted = value.toLowerCase();
	const byValue = options.find((option) => option.value.toLowerCase() === wanted);
	if (byValue) return byValue.value;
	const byLabel = options.find((option) => option.label.toLowerCase() === wanted);
	if (byLabel) return byLabel.value;
	// A yes/no select ("Featured") takes every way a spreadsheet says yes.
	const values = new Set(options.map((option) => option.value));
	if (values.has('true') && values.has('false')) {
		if (YES.has(wanted)) return 'true';
		if (NO.has(wanted)) return 'false';
	}
	return value;
}

/** "$1,200.50" → "1200.50"; "1 200" → "1200"; a negative or a word is left for the schema to refuse. */
function coerceAmount(value: string): string {
	const stripped = value.replace(/[$€£,\s]/g, '');
	return /^\d+(\.\d+)?$/.test(stripped) ? stripped : value;
}

/** ISO stays; "3/1/2024" and "03-01-2024" (month first, as US spreadsheets export) become "2024-03-01". */
function coerceDate(value: string): string {
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
	const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ]/);
	if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
	const us = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
	if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
	return value;
}

/** What a column guide says a field takes: the shape a cell must have. */
export function fieldFormat(field: RecordField): string {
	switch (field.type) {
		case 'select':
			return `One of: ${(field.options ?? []).map((option) => option.label).join(', ')}`;
		case 'number':
			return 'An amount like 1200 or 1200.50';
		case 'integer':
			return 'A whole number';
		case 'date':
			return 'A date, YYYY-MM-DD';
		case 'datetime':
			return 'A date and time';
		case 'email':
			return 'An email address';
		case 'tel':
			return 'A phone number';
		case 'textarea':
			return 'Text, up to 2000 characters';
		case 'company':
		case 'contact':
			return 'The id of an existing record';
		default:
			return 'Text, up to 200 characters';
	}
}

/** The header spellings a guide shows beside a field: its aliases, as written in the registry. */
export function fieldAliases(kind: ImportKind, field: RecordField): readonly string[] {
	return IMPORT_SPECS[kind].aliases[field.name] ?? [];
}

/** The example a template row shows for a field: its placeholder, or its first option. */
function exampleFor(field: RecordField): string {
	if (field.type === 'select') return field.options?.[0]?.label ?? '';
	if (field.type === 'date') return '2026-01-31';
	return field.placeholder?.split(' — ')[0] ?? '';
}

function csvCell(value: string): string {
	return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * A starter CSV for a kind: the column labels as the guide shows them, and
 * one example row taken from the form's own placeholders, so the file that
 * comes back maps to every field with nothing to rename.
 */
export function templateCsv(kind: ImportKind): string {
	const fields = importFields(kind);
	const header = fields.map((field) => csvCell(field.label)).join(',');
	const example = fields.map((field) => csvCell(exampleFor(field))).join(',');
	return `${header}\r\n${example}\r\n`;
}
