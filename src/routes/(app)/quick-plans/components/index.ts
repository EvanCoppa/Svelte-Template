import RowActions from './quick-plan-row-actions.svelte';

/**
 * The cell the quick plans table renders through TanStack's `renderComponent`.
 * The page owns the data and every handler — the part takes what it shows as
 * a prop, the staff roster's shape.
 */
export { RowActions, RowActions as QuickPlanRowActions };
