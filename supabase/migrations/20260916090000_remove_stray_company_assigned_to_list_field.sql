-- The hosted database carries a `list_fields` row for
-- ('companies', 'assigned_to') that no migration ever inserted and that
-- `LIST_FIELD_CATALOG.company` (src/lib/lists/catalog.ts) has no matching
-- key for -- a company has no assigned_to field, only deals and calendar
-- events do. `resolveList()` throws on any row it cannot map to the
-- catalog, so this row 500s the companies list page. Remove it; the
-- resolver is the catalog's only extension point, so an unmatched row is
-- always a data bug rather than a feature the code has yet to grow.
delete from public.list_fields where feature_id = 'companies' and field = 'assigned_to';
