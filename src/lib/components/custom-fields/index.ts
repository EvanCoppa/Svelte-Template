import RowActions from './custom-field-row-actions.svelte';

/**
 * The cell the custom fields table renders through TanStack's
 * `renderComponent`. The page owns the data and every handler — the part
 * takes what it shows as a prop, the quick plans table's shape.
 */
export { RowActions, RowActions as CustomFieldRowActions };
