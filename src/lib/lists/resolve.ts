import type { Tables } from '$lib/database.types';
import { BOOLEAN_OPTIONS, catalogField } from './catalog';
import { FILTERABLE_TYPES, type ListField, type ListKind, type ListSpec } from './types';

/**
 * From the `list_fields` rows to the spec a page can trust.
 *
 * Two tables say what a list's fields are: the defaults, keyed by the
 * feature that owns the list, and an industry's own say — null inheriting
 * column by column, exactly as `industry_features` renames a feature, and a
 * row for a field the defaults do not list adding it. The fold here is the
 * one `resolveFeatures()` does for names and order, so an industry that
 * wants a custom field on its Assets page or its Companies searchable by a
 * MID inserts rows and nothing in `src/` changes.
 *
 * What the database cannot check is checked here, throwing with the list's
 * id like `resolveView()` does: a key the kind's catalog does not have, a
 * filter on a field that cannot be one (an amount, a date). A throw is a
 * migration that shipped a bad row, and a 500 is the right answer. The one
 * quiet case is a custom field the org has not declared: the industry names
 * it by key because definitions are the org's rows, so the column simply
 * waits until the org declares the field.
 */

/** A default row, as the registry loads it (`loadListRegistry()` in `$lib/server/features`). */
export type ListFieldRow = Pick<
	Tables<'list_fields'>,
	'feature_id' | 'field' | 'label' | 'shown' | 'searchable' | 'filterable' | 'sort_order'
>;

/** An industry's row: every column nullable, null inheriting the default's. */
export type IndustryListFieldRow = Pick<
	Tables<'industry_list_fields'>,
	| 'industry_id'
	| 'feature_id'
	| 'field'
	| 'label'
	| 'shown'
	| 'searchable'
	| 'filterable'
	| 'sort_order'
>;

export type ListRegistry = {
	defaults: readonly ListFieldRow[];
	industries: readonly IndustryListFieldRow[];
};

/** What the resolver needs of a custom field definition — client-safe, no org id. */
export type CustomFieldSummary = Pick<
	Tables<'custom_field_definitions'>,
	'id' | 'key' | 'label' | 'value_type' | 'allowed_values'
>;

export const CUSTOM_FIELD_PREFIX = 'custom:';

/** The key of a `custom:<key>` field, or null for a catalog key. */
export function customFieldKey(field: string): string | null {
	return field.startsWith(CUSTOM_FIELD_PREFIX) ? field.slice(CUSTOM_FIELD_PREFIX.length) : null;
}

/** A default row's values for whatever an added industry row leaves null. */
const ADDED_DEFAULTS = { label: null, shown: true, searchable: false, filterable: false };

/** A row after the industry's say has been applied. */
type MergedRow = {
	field: string;
	label: string | null;
	shown: boolean;
	searchable: boolean;
	filterable: boolean;
	/** Null only for an added row that set none: it goes last, in the order added. */
	sort_order: number | null;
};

export function resolveList(
	kind: ListKind,
	featureId: string,
	registry: ListRegistry,
	industryId: string,
	customFields: readonly CustomFieldSummary[]
): ListSpec {
	const merged = new Map<string, MergedRow>();
	for (const row of registry.defaults) {
		if (row.feature_id !== featureId) continue;
		merged.set(row.field, { ...row });
	}
	for (const row of registry.industries) {
		if (row.feature_id !== featureId || row.industry_id !== industryId) continue;
		const base = merged.get(row.field) ?? { ...ADDED_DEFAULTS, sort_order: null };
		merged.set(row.field, {
			field: row.field,
			label: row.label ?? base.label,
			shown: row.shown ?? base.shown,
			searchable: row.searchable ?? base.searchable,
			filterable: row.filterable ?? base.filterable,
			sort_order: row.sort_order ?? base.sort_order
		});
	}

	const byKey = new Map(customFields.map((definition) => [definition.key, definition]));
	const fields: ListField[] = [];
	for (const row of [...merged.values()].sort(bySortOrder)) {
		const field = fieldFor(kind, featureId, row, byKey);
		if (field) fields.push(field);
	}

	// `name` leads every list and is always a column: it is the link into the
	// record. A list whose rows forgot it still has it.
	const name = fields.find((field) => field.key === 'name');
	const rest = fields.filter((field) => field.key !== 'name');
	const first = name
		? { ...name, shown: true }
		: fieldFor(
				kind,
				featureId,
				{ ...ADDED_DEFAULTS, field: 'name', searchable: true, sort_order: 0 },
				byKey
			);
	if (!first) throw new Error(`List ${featureId} lists ${kind}, which has no name field.`);
	return { kind, fields: [first, ...rest] };
}

function bySortOrder(a: MergedRow, b: MergedRow): number {
	if (a.sort_order === null) return b.sort_order === null ? 0 : 1;
	if (b.sort_order === null) return -1;
	return a.sort_order - b.sort_order;
}

function fieldFor(
	kind: ListKind,
	featureId: string,
	row: MergedRow,
	customFields: ReadonlyMap<string, CustomFieldSummary>
): ListField | null {
	const customKey = customFieldKey(row.field);
	if (customKey !== null) {
		const definition = customFields.get(customKey);
		if (!definition) return null;
		return checked(featureId, {
			key: row.field,
			label: { text: row.label ?? definition.label },
			...customType(definition),
			shown: row.shown,
			searchable: row.searchable,
			filterable: row.filterable,
			custom: { definitionId: definition.id, valueType: definition.value_type }
		});
	}

	const meta = catalogField(kind, row.field);
	if (!meta) {
		throw new Error(`List ${featureId} shows a field ${kind} does not have: ${row.field}.`);
	}
	return checked(featureId, {
		key: row.field,
		label: row.label ? { text: row.label } : meta.label,
		type: meta.type,
		options: meta.options ?? null,
		shown: row.shown,
		searchable: row.searchable,
		filterable: row.filterable,
		custom: null
	});
}

/** A filter is a multi-select of values, so only a field that has values to pick can be one. */
function checked(featureId: string, field: ListField): ListField {
	if (field.filterable && !FILTERABLE_TYPES.some((type) => type === field.type)) {
		throw new Error(
			`List ${featureId} filters on ${field.key}, but a ${field.type} field cannot be filtered.`
		);
	}
	return field;
}

/**
 * How a custom field renders, from its value type: a select is an enum
 * whose options are its allowed values (plain, no tone — they are the org's
 * words), the rest map one to one.
 */
type FieldRendering = Pick<ListField, 'type' | 'options'>;

function customType(definition: CustomFieldSummary): FieldRendering {
	switch (definition.value_type) {
		case 'text':
			return { type: 'text', options: null };
		case 'numeric':
			return { type: 'number', options: null };
		case 'boolean':
			return { type: 'boolean', options: BOOLEAN_OPTIONS };
		case 'select':
			return {
				type: 'enum',
				options: allowedValues(definition).map((v) => ({ value: v, label: v }))
			};
	}
}

/** The select's choices: a jsonb array of strings by constraint, read defensively all the same. */
function allowedValues(definition: CustomFieldSummary): string[] {
	const values = definition.allowed_values;
	return Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string') : [];
}
