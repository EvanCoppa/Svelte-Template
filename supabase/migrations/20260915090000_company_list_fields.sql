-- Companies: status reads next to relationship (the two enums a reader
-- compares belong together), and phone is shown by default rather than
-- search-only, so a reader does not have to open a company just to see its
-- number.
insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('companies', 'relationship', true, false, true, 200),
	('companies', 'status', true, false, true, 300),
	('companies', 'email', true, true, false, 400),
	('companies', 'website', true, true, false, 500),
	('companies', 'phone', true, true, false, 600)
on conflict (feature_id, field) do update set
	shown = excluded.shown,
	searchable = excluded.searchable,
	filterable = excluded.filterable,
	sort_order = excluded.sort_order;
