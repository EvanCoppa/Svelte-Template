-- A thumbnail on the products list.
--
-- The storefront migration gave products an `image_url`, and a catalog is the
-- one list where the picture IS the identifying fact: a reader scanning a page
-- of aligners or fittings recognises the thing before they read its name. So
-- the products list grows an `image` column — a field like any other, which is
-- the point: an industry that sells hours rather than objects hides it with one
-- `industry_list_fields` row, and no page file changes either way.
--
-- `image` is a new field TYPE (src/lib/lists/types.ts), not just a new key: a
-- picture is not a value, so it is never searched, filtered or sorted, and the
-- resolver already refuses `filterable` on a type that cannot be one.
--
-- sort_order 150 puts it between `name` (100) and `kind` (200) — the
-- nav_sort_order convention's whole point, a field slotted in without
-- renumbering the ones around it. `name` still leads the table whatever the
-- rows say, so the thumbnail sits immediately after it.

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('products', 'image', true, false, false, 150)
on conflict (feature_id, field) do update set
	shown = excluded.shown,
	searchable = excluded.searchable,
	filterable = excluded.filterable,
	sort_order = excluded.sort_order;
