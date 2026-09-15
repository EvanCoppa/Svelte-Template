import Activity from './detail-activity.svelte';
import Addresses from './detail-addresses.svelte';
import Back from './detail-back.svelte';
import Fact from './detail-fact.svelte';
import Facts from './detail-facts.svelte';
import Field from './detail-field.svelte';
import Header from './detail-header.svelte';
import HeaderActions from './detail-header-actions.svelte';
import Identity from './detail-identity.svelte';
import Images from './detail-images.svelte';
import InvoiceLines from './detail-invoice-lines.svelte';
import InvoicePayments from './detail-invoice-payments.svelte';
import Notes from './detail-notes.svelte';
import Rail from './detail-rail.svelte';
import RailSection from './detail-rail-section.svelte';
import Related from './detail-related.svelte';
import RelatedGroup from './detail-related-group.svelte';
import Relationship from './detail-relationship.svelte';
import Relationships from './detail-relationships.svelte';
import Thread from './detail-thread.svelte';
import Timeline from './detail-timeline.svelte';
import Value from './detail-value.svelte';

/**
 * The parts a record page is drawn from — the header a record is named in,
 * the rail beside the tabs, one field, one value, the timeline, one related
 * record and a group of them, one relationship, a party's addresses, an
 * asset's photos, an invoice's lines and its payments, the conversation on a
 * record and the notes kept about it — each with the form that edits it.
 *
 * The page owns the data and every name: each part takes exactly what it
 * shows as a prop, which is what lets the generic page at
 * `(app)/[kind=record]/[id=guid]` and a kind's own page (`(app)/companies/
 * [id=guid]`) compose the same bones around different loads.
 */
export { factIcon, recordInitials } from './facts.js';

export {
	Activity,
	Addresses,
	Back,
	Fact,
	Facts,
	Field,
	Header,
	HeaderActions,
	Identity,
	Images,
	InvoiceLines,
	InvoicePayments,
	Notes,
	Rail,
	RailSection,
	Related,
	RelatedGroup,
	Relationship,
	Relationships,
	Thread,
	Timeline,
	Value
};
