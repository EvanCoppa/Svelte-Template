import { createRawSnippet } from 'svelte';
import { renderComponent } from '@tanstack/svelte-table';
import { StatusBadge, type BadgeTone } from '$lib/components/ui/badge/index.js';

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
