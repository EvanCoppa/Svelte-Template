import type { Attachment } from 'svelte/attachments';

/**
 * Which leading cells stay put when `DataTable.Content` pins its first column.
 *
 * The first column is pinned; when it is the selection checkbox, the column
 * after it is pinned too — the checkbox is a control on the row, not the
 * column a reader is holding onto while the rest scroll by.
 */
export function pinnedColumnCount(columnIds: readonly string[]): number {
	if (columnIds.length === 0) return 0;
	return columnIds[0] === 'select' && columnIds.length > 1 ? 2 : 1;
}

export type PinnedState = {
	/** Width of the first pinned cell — the `left` offset of the second one. */
	offset: number;
	/** Whether the reader has scrolled sideways, so the pinned edge casts a shadow. */
	scrolled: boolean;
};

/**
 * Watches the table's horizontal scroller for the two facts sticky cells
 * cannot read for themselves: how far in the second pinned cell sits (the
 * first pinned cell's rendered width, which the row's content decides) and
 * whether anything is hidden behind the pinned edge yet.
 */
export function trackPinned(onChange: (state: PinnedState) => void): Attachment<HTMLElement> {
	return (root) => {
		const scroller = root.querySelector<HTMLElement>('[data-slot="table-container"]');
		if (!scroller) return;

		let last: PinnedState = { offset: 0, scrolled: false };
		let frame = 0;

		const measure = () => {
			frame = 0;
			const first = scroller.querySelector<HTMLElement>('thead th[data-pinned]');
			const next: PinnedState = {
				offset: first?.offsetWidth ?? 0,
				scrolled: scroller.scrollLeft > 0
			};
			if (next.offset === last.offset && next.scrolled === last.scrolled) return;
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
