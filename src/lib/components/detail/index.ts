import Activity from './detail-activity.svelte';
import Addresses from './detail-addresses.svelte';
import Field from './detail-field.svelte';
import Images from './detail-images.svelte';
import InvoiceLines from './detail-invoice-lines.svelte';
import InvoicePayments from './detail-invoice-payments.svelte';
import Related from './detail-related.svelte';
import Relationship from './detail-relationship.svelte';
import Thread from './detail-thread.svelte';
import Value from './detail-value.svelte';

/**
 * The parts the generic record page is drawn from — one field, one value, one
 * timeline entry, one related record, one relationship, a party's addresses,
 * an asset's photos, an invoice's lines and its payments, and the
 * conversation on a record — each with the form that edits it. The page owns the data and every name: each part takes
 * exactly what it shows as a prop, so a specific record page built later
 * composes the same parts around its own load.
 */
export {
	Activity,
	Addresses,
	Field,
	Images,
	InvoiceLines,
	InvoicePayments,
	Related,
	Relationship,
	Thread,
	Value,
	//
	Activity as DetailActivity,
	Addresses as DetailAddresses,
	Field as DetailField,
	Images as DetailImages,
	InvoiceLines as DetailInvoiceLines,
	InvoicePayments as DetailInvoicePayments,
	Related as DetailRelated,
	Relationship as DetailRelationship,
	Thread as DetailThread,
	Value as DetailValue
};
