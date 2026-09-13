-- The Companies list gets an "Assigned to" column, sourced from the
-- relationship graph rather than a new column on `companies`.
--
-- Who a company is assigned to is already expressible as a relationship: the
-- system `assigned_to` type (relationships migration,
-- f0000000-0000-0000-0000-000000000012) with `from_type = 'company'` and
-- `to_type = 'member'`. That is also what /graph draws its edges from
-- (src/lib/server/crm/graph.ts), so putting the same fact in a column would
-- give the list and the graph two different sources for one relationship.
-- Instead the list reads it the way `describeListRows()` already reads any
-- built-in field: a `list_fields` row naming a catalog key
-- (`assigned_to` in LIST_FIELD_CATALOG.company, type `person`), filled by
-- `listAssignedMembers()` in src/lib/server/crm/lists.ts, which batches one
-- `listRelationshipsFrom()` call and one `getDisplayNames()` call for the
-- whole page rather than a query per row.
--
-- Not filterable: a `person` field has no fixed set of options the way an
-- enum or a picker does, and this is the first one on a list — `shown` only.

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('companies', 'assigned_to', true, false, false, 750)
on conflict (feature_id, field) do nothing;
