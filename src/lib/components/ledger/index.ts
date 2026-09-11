import EntryCell from './ledger-entry-cell.svelte';
import RowActions from './ledger-row-actions.svelte';
import Stat from './ledger-stat.svelte';

/**
 * The parts the ledger page is drawn from: a figure at the top, the "what"
 * of a row, and what a row offers. The page owns the entries, the sums and
 * every name; each part takes exactly what it shows.
 */
export {
	EntryCell,
	RowActions,
	Stat,
	//
	EntryCell as LedgerEntryCell,
	RowActions as LedgerRowActions,
	Stat as LedgerStat
};
