import Activity from './detail-activity.svelte';
import Addresses from './detail-addresses.svelte';
import Field from './detail-field.svelte';
import Related from './detail-related.svelte';
import Relationship from './detail-relationship.svelte';
import Thread from './detail-thread.svelte';
import Value from './detail-value.svelte';

/**
 * The parts the generic record page is drawn from — one field, one value, one
 * timeline entry, one related record, one relationship, a party's addresses with the form
 * that edits them, and the conversation on a record with the form that writes
 * it. The page owns the data and every name: each part takes
 * exactly what it shows as a prop, so a specific record page built later
 * composes the same parts around its own load.
 */
export {
	Activity,
	Addresses,
	Field,
	Related,
	Relationship,
	Thread,
	Value,
	//
	Activity as DetailActivity,
	Addresses as DetailAddresses,
	Field as DetailField,
	Related as DetailRelated,
	Relationship as DetailRelationship,
	Thread as DetailThread,
	Value as DetailValue
};
