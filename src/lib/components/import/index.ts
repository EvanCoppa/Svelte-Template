import ColumnGuide from './import-column-guide.svelte';
import DropZone from './import-drop-zone.svelte';
import RowDetails from './import-row-details.svelte';
import RowStatus from './import-row-status.svelte';

/**
 * The parts the import page is drawn from: the drop zone a file lands in,
 * the guide to a kind's columns, and a previewed row's status pill and its
 * details (what is wrong with it, or what it would change). Structural
 * parts, no shared state: the page owns the preview and every decision,
 * and each part takes exactly what it shows.
 */
export {
	ColumnGuide,
	DropZone,
	RowDetails,
	RowStatus,
	//
	ColumnGuide as ImportColumnGuide,
	DropZone as ImportDropZone,
	RowDetails as ImportRowDetails,
	RowStatus as ImportRowStatus
};
