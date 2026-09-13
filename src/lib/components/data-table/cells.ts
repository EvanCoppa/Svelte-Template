import { createRawSnippet } from 'svelte';
import { renderComponent } from '@tanstack/svelte-table';
import { StatusBadge, type BadgeTone } from '$lib/components/ui/badge/index.js';
import ImageCell from './data-table-image-cell.svelte';
import LinkCell from './data-table-link-cell.svelte';

/**
 * Cell renderers shared by list pages, so an enum value looks the same in
 * every table. Plain functions returning TanStack render configs — pass them
 * from a column's `cell`.
 */

/** A StatusBadge for an enum value: the label is the value, title-cased. */
export function statusCell(value: string, tone: BadgeTone) {
	const label = value.charAt(0).toUpperCase() + value.slice(1);
	return renderComponent(StatusBadge, {
		tone,
		children: createRawSnippet(() => ({ render: () => `<span>${label}</span>` }))
	});
}

/**
 * The row's primary column as a link to the record it is about — every list
 * page's way into the record page (`recordHref()` in `$lib/crm/records`).
 */
export function linkCell(label: string, href: string) {
	return renderComponent(LinkCell, { label, href });
}

/**
 * A row's picture as a thumbnail — an `image` field's cell. `url` is null
 * for a record with none, which draws a placeholder tile of the same size.
 */
export function imageCell(url: string | null) {
	return renderComponent(ImageCell, { url });
}
