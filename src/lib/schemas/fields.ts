import { z } from 'zod';

/**
 * Field shapes two or more routes post — kept here so a slot the assistant
 * books and an event the calendar books are the same string, and a quantity
 * packed from the chat is the one an order line accepts.
 */

/**
 * An instant as the browser posts it — ISO with its offset — or the naive
 * wall-clock value a no-JS post carries, which the server reads as UTC
 * (`instant()` in `$lib/server/records`).
 */
export const instantField = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/, {
		error: 'Choose a date and time.'
	});

/** A count of things, which may be fractional (a length, a weight). */
export const quantityField = z
	.string()
	.trim()
	.regex(/^\d{1,9}(\.\d{1,4})?$/, 'Enter a quantity like 24 or 2.5');
