import type { Attachment } from 'svelte/attachments';
import { cn } from '$lib/utils.js';

/**
 * Leading columns that are a control on the row rather than a column of data:
 * the expand chevron and the selection checkbox. A reader holding onto the
 * start of a row wants the column that names the record, not these.
 */
const ROW_CONTROL_COLUMNS = ['expand', 'select'];

/**
 * Which leading cells stay put when `DataTable.Content` pins its first column.
 *
 * The first column of data is pinned, and every row control in front of it
 * comes along — the chevron and the checkbox are controls on the row, not the
 * column a reader is holding onto while the rest scroll by.
 */
export function pinnedColumnCount(columnIds: readonly string[]): number {
	if (columnIds.length === 0) return 0;
	let controls = 0;
	while (controls < columnIds.length && ROW_CONTROL_COLUMNS.includes(columnIds[controls])) {
		controls++;
	}
	return Math.min(controls + 1, columnIds.length);
}

export type PinnedState = {
	/**
	 * Where each pinned cell sits: the widths of the pinned cells before it,
	 * added up. One entry per pinned column, so a row with a chevron AND a
	 * checkbox in front of its first column stacks them instead of piling all
	 * three on the same edge.
	 */
	offsets: readonly number[];
	/** Whether the reader has scrolled sideways, so the pinned edge casts a shadow. */
	scrolled: boolean;
};

/**
 * Which kind of cell is being pinned: a heading, a record's own row, or one of
 * the nested rows an expanded row opens. They differ only in what tints the
 * cell, which has to be painted on a layer of its own (see below).
 */
export type PinnedCellKind = 'head' | 'cell' | 'sub';

// A pinned cell is `sticky`; its opaque base is a `before` pseudo-element and
// every tint — the row's hover, its selection, the open row's own, a nested
// row's — an `after` one, because the cell's own background is what the row
// rules tint, and a translucent tint over a scrolled column would show the
// cells sliding underneath.
const PINNED_CELL =
	'sticky z-10 before:bg-background after:pointer-events-none before:pointer-events-none before:absolute before:inset-0 before:-z-10 after:absolute after:inset-0 after:-z-10';
const PINNED_TINTS =
	'[tr:hover>&]:after:bg-muted/50 [tr[data-state=selected]>&]:after:bg-muted [tr[data-expanded=true]>&]:after:bg-muted/40';
const PINNED_HEAD = 'after:bg-muted/60';
const PINNED_SUB = 'after:bg-muted/60';
const PINNED_EDGE = 'border-border/60 border-e-2';
const PINNED_EDGE_SCROLLED =
	'shadow-[6px_0_8px_-6px_rgb(0_0_0/0.18)] dark:shadow-[6px_0_8px_-6px_rgb(0_0_0/0.6)]';

/**
 * The classes a cell at `index` needs to stay put, or `false` when that cell
 * scrolls with the rest. The last pinned cell carries the edge the columns
 * slide under, and casts a shadow once anything is hidden behind it.
 */
export function pinnedCellClass(
	index: number,
	count: number,
	scrolled: boolean,
	kind: PinnedCellKind
): string | false {
	if (index >= count) return false;
	return cn(
		PINNED_CELL,
		kind === 'head' && PINNED_HEAD,
		kind === 'cell' && PINNED_TINTS,
		kind === 'sub' && PINNED_SUB,
		index === count - 1 && PINNED_EDGE,
		index === count - 1 && scrolled && PINNED_EDGE_SCROLLED
	);
}

/**
 * Where a pinned cell sits. The first one is flush with the start; each one
 * after it clears the cells before it, whose rendered widths only the browser
 * knows (`trackPinned`).
 */
export function pinnedCellStyle(
	index: number,
	count: number,
	offsets: readonly number[]
): string | undefined {
	if (index >= count) return undefined;
	return `left: ${offsets[index] ?? 0}px`;
}

/**
 * Watches the table's horizontal scroller for the two facts sticky cells
 * cannot read for themselves: how far in each pinned cell sits (the rendered
 * widths of the ones before it, which the rows' content decides) and whether
 * anything is hidden behind the pinned edge yet.
 */
export function trackPinned(onChange: (state: PinnedState) => void): Attachment<HTMLElement> {
	return (root) => {
		const scroller = root.querySelector<HTMLElement>('[data-slot="table-container"]');
		if (!scroller) return;

		let last: PinnedState = { offsets: [], scrolled: false };
		let frame = 0;

		const measure = () => {
			frame = 0;
			const heads = scroller.querySelectorAll<HTMLElement>('thead th[data-pinned]');
			const offsets: number[] = [];
			let left = 0;
			for (const head of heads) {
				offsets.push(left);
				left += head.offsetWidth;
			}
			const next: PinnedState = { offsets, scrolled: scroller.scrollLeft > 0 };
			if (
				next.scrolled === last.scrolled &&
				next.offsets.length === last.offsets.length &&
				next.offsets.every((value, index) => value === last.offsets[index])
			) {
				return;
			}
			last = next;
			onChange(next);
		};

		// A frame collapses a burst of scroll and resize callbacks into one pass
		// and keeps the write out of the effect that runs the attachment.
		const schedule = () => {
			frame ||= requestAnimationFrame(measure);
		};

		schedule();
		const observer = new ResizeObserver(schedule);
		observer.observe(scroller);
		scroller.addEventListener('scroll', schedule, { passive: true });

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			scroller.removeEventListener('scroll', schedule);
		};
	};
}
