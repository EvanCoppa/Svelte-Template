import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
import { PAYMENT_STATE_TONE } from '$lib/crm/tones';
import type { ListCell } from './types';

/**
 * Reading a cell as the words and the value the toolbar and the sort use.
 *
 * A cell is typed by how it renders; the search box, a filter and a sort
 * need one plain reading of it — the text a person would type to find it,
 * or the number that orders it. These are pure so the server's describer
 * tests and the page agree on them.
 */

/**
 * An invoice's money state as one word, decided by the viewer's own date
 * (`today`, a calendar date — `localDate()` in `$lib/crm/ledger`): the
 * payment state for an issued invoice, "overdue" when it is past due and
 * still owed, nothing for a draft or a void one.
 */
export function paymentWord(
	cell: Extract<ListCell, { type: 'payment' }>,
	today: string
): '' | 'overdue' | NonNullable<(typeof cell)['state']> {
	if (cell.state === null) return '';
	if (cell.owed && cell.dueDate !== null && cell.dueDate < today) return 'overdue';
	return cell.state;
}

/** The tone of that word — the shared map's, and the error tone for overdue. */
export function paymentTone(word: Exclude<ReturnType<typeof paymentWord>, ''>): BadgeTone {
	return word === 'overdue' ? 'error' : PAYMENT_STATE_TONE[word];
}

/**
 * What a filter compares and the search box matches: the cell's value as
 * text. An enum is its raw value (the filter's options are too), a yes/no
 * the word, a blank an empty string.
 */
export function cellText(cell: ListCell, today: string): string {
	switch (cell.type) {
		case 'link':
		case 'status':
		case 'record':
		case 'text':
			return cell.text;
		case 'person':
			return cell.name ?? '';
		case 'number':
		case 'money':
			return cell.value === null ? '' : String(cell.value);
		case 'boolean':
			return cell.value === null ? '' : cell.value ? 'Yes' : 'No';
		case 'date':
		case 'datetime':
			return cell.value ?? '';
		case 'payment':
			return paymentWord(cell, today);
	}
}

/**
 * What a sort orders by: the number for an amount, the ISO string for a
 * date (which orders as text), the text for the rest. Null sorts as
 * nothing, which the basic sort puts first.
 */
export function cellSortValue(cell: ListCell, today: string): string | number | null {
	switch (cell.type) {
		case 'number':
		case 'money':
			return cell.value;
		case 'date':
		case 'datetime':
			return cell.value;
		default:
			return cellText(cell, today);
	}
}
