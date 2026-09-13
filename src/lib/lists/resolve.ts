import type { Tables } from '$lib/database.types';
import { BOOLEAN_OPTIONS, catalogField } from './catalog';
import { FILTERABLE_TYPES, type ListField, type ListKind, type ListSpec } from './types';

/**
 * From the rows to the spec a page can trust.
 *
 * Two things say what a list's fields are. The BUILT-IN columns are rows:
 * the defaults keyed by the feature that owns the list, and an industry's
 * own say — null inheriting column by column, exactly as `industry_features`
 * renames a feature, and a row for a column the defaults do not list adding
 * it. The CUSTOM fields are the org's definitions for the kind, each
 * carrying its own three list flags (the industry_custom_fields migration —
 * the industry ships the definitions, so a beverage distributor's Assets
 * page has a location and a serial number the day the org is created). The
 * fold here is the one `resolveFeatures()` does for names and order: the
 * built-ins in their order, then every custom field in label order, each as
 * its flags say.
 *
 * What the database cannot check is checked here, throwing with the list's
 * id like `resolveView()` does: a key the kind's catalog does not have, a
 * filter on a built-in field that cannot be one (an amount, a date). A throw
 * is a migration that shipped a bad row, and a 500 is the right answer. A
 * custom field's flags are an org's data, so they are never a 500: the
 * database refuses a filter on a numeric field, and the resolver reads what
 * it is given.
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
	| 'id'
	| 'key'
	| 'label'
	| 'value_type'
	| 'allowed_values'
	| 'list_shown'
	| 'list_searchable'
	| 'list_filterable'
>;

/**
 * A custom field's column id: its key behind a prefix no catalog key can
 * carry, so a custom `status` never collides with the built-in one.
 */
export const CUSTOM_FIELD_PREFIX = 'custom:';

export function customFieldColumnId(key: string): string {
	return `${CUSTOM_FIELD_PREFIX}${key}`;
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

	const builtIn = [...merged.values()]
		.sort(bySortOrder)
		.map((row) => builtInField(kind, featureId, row));

	// `name` leads every list and is always a column: it is the link into the
	// record. A list whose rows forgot it still has it.
	const name = builtIn.find((field) => field.key === 'name');
	const first = name
		? { ...name, shown: true }
		: builtInField(kind, featureId, {
				...ADDED_DEFAULTS,
				field: 'name',
				searchable: true,
				sort_order: 0
			});

	return {
		kind,
		fields: [
			first,
			...builtIn.filter((field) => field.key !== 'name'),
			// Then the org's custom fields, as each one says — the industry's
			// and the org's own alike, in label order (the definitions are read
			// that way).
			...customFields.map(customField)
		]
	};
}

function bySortOrder(a: MergedRow, b: MergedRow): number {
	if (a.sort_order === null) return b.sort_order === null ? 0 : 1;
	if (b.sort_order === null) return -1;
	return a.sort_order - b.sort_order;
}

function builtInField(kind: ListKind, featureId: string, row: MergedRow): ListField {
	const meta = catalogField(kind, row.field);
	if (!meta) {
		throw new Error(`List ${featureId} shows a field ${kind} does not have: ${row.field}.`);
	}
	if (row.filterable && !FILTERABLE_TYPES.some((type) => type === meta.type)) {
		throw new Error(
			`List ${featureId} filters on ${row.field}, but a ${meta.type} field cannot be filtered.`
		);
	}
	return {
		key: row.field,
		label: row.label ? { text: row.label } : meta.label,
		type: meta.type,
		options: meta.options ?? null,
		shown: row.shown,
		searchable: row.searchable,
		filterable: row.filterable,
		custom: null
	};
}

/**
 * A custom field as its definition says. The type follows the value type: a
 * select is an enum whose options are its allowed values (plain, no tone —
 * they are the org's words), the rest map one to one. The database already
 * refuses a filter on a type that has no values to pick from.
 */
function customField(definition: CustomFieldSummary): ListField {
	const rendering = customRendering(definition);
	return {
		key: customFieldColumnId(definition.key),
		label: { text: definition.label },
		...rendering,
		shown: definition.list_shown,
		searchable: definition.list_searchable,
		filterable:
			definition.list_filterable && FILTERABLE_TYPES.some((type) => type === rendering.type),
		custom: { definitionId: definition.id, valueType: definition.value_type }
	};
}

type FieldRendering = Pick<ListField, 'type' | 'options'>;

function customRendering(definition: CustomFieldSummary): FieldRendering {
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
