import type { Attachment } from 'svelte/attachments';

/**
 * Space the app shell keeps below the page content — `.app-content`'s bottom
 * padding in `src/routes/(app)/+layout.svelte`. A table that lives somewhere
 * else (inside a card, halfway down a long page) is given an explicit
 * `pageSize` instead, so this stays one constant rather than another knob.
 */
const PAGE_INSET = 48;

/** Stand-in row height for the moment before a real row exists to measure. */
const FALLBACK_ROW_HEIGHT = 37;

/** Floor for a fitted page: a viewport too short for this many rows scrolls. */
export const MIN_PAGE_SIZE = 5;

export type TableMetrics = {
	/** Height of the viewport the table has to fit into. */
	viewportHeight: number;
	/** The table's distance from the top of the document. */
	tableTop: number;
	/**
	 * Everything the table spends on something other than rows: the toolbar
	 * above it, its header row and border, and the pagination row beneath.
	 */
	chrome: number;
	/** Height of the row a page grows by. */
	rowHeight: number;
	/** Floor for the result. */
	minPageSize: number;
};

/**
 * How many rows fit between the top of the table and the bottom of the
 * viewport.
 *
 * Every input is invariant to the number of rows currently on screen — what is
 * above the table, what the table spends on chrome and how tall one row is all
 * stay put as the page grows and shrinks — so a single measurement lands on the
 * answer instead of settling towards it.
 */
export function rowsThatFit({
	viewportHeight,
	tableTop,
	chrome,
	rowHeight,
	minPageSize
}: TableMetrics): number {
	if (rowHeight <= 0) return minPageSize;
	const available = viewportHeight - tableTop - PAGE_INSET - chrome;
	return Math.max(minPageSize, Math.floor(available / rowHeight));
}

/**
 * Keeps a data table's page size equal to the number of rows that fit on
 * screen, re-measuring when the viewport or the table's own box changes.
 *
 * A rows-per-page picker asks the reader to solve a layout problem the browser
 * already has the answer to, so `DataTable.Root` attaches this instead and the
 * table shows as many rows as there is room for and no more.
 */
export function fitPageSize(options: {
	/** Applied whenever the fitted size changes; never called with the same value twice. */
	setPageSize: (size: number) => void;
	minPageSize?: number;
}): Attachment<HTMLElement> {
	return (root) => {
		let applied = -1;
		let frame = 0;

		const measure = () => {
			frame = 0;
			const body = root.querySelector('tbody');
			if (!body) return;

			// The average, not one row: rows are not all the same height (the first
			// carries the table's top border, the last drops its bottom one), and
			// the average is exactly what a page grows and shrinks by. The
			// empty-state placeholder is a deliberately taller shape, so it is not
			// a row to measure — with only that on screen there is nothing to
			// measure at all.
			const rows = body.querySelectorAll('tr:not([data-empty])').length;
			const bodyHeight = body.getBoundingClientRect().height;

			const next = rowsThatFit({
				viewportHeight: window.innerHeight,
				tableTop: root.getBoundingClientRect().top + window.scrollY,
				chrome: root.getBoundingClientRect().height - bodyHeight,
				rowHeight: rows > 0 ? bodyHeight / rows : FALLBACK_ROW_HEIGHT,
				minPageSize: options.minPageSize ?? MIN_PAGE_SIZE
			});

			if (next === applied) return;
			applied = next;
			options.setPageSize(next);
		};

		// Measuring in a frame keeps the write out of the effect that runs the
		// attachment, and collapses a burst of observer callbacks into one pass.
		const schedule = () => {
			frame ||= requestAnimationFrame(measure);
		};

		schedule();
		const observer = new ResizeObserver(schedule);
		observer.observe(root);
		window.addEventListener('resize', schedule);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			window.removeEventListener('resize', schedule);
		};
	};
}
