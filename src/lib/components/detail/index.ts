import Activity from './detail-activity.svelte';
import Field from './detail-field.svelte';
import Related from './detail-related.svelte';
import Value from './detail-value.svelte';

/**
 * The parts the generic record page is drawn from — one field, one value, one
 * timeline entry, one related record. The page owns the data and every name:
 * each part takes exactly what it shows as a prop, so a specific record page
 * built later composes the same parts around its own load.
 */
export {
	Activity,
	Field,
	Related,
	Value,
	//
	Activity as DetailActivity,
	Field as DetailField,
	Related as DetailRelated,
	Value as DetailValue
};
