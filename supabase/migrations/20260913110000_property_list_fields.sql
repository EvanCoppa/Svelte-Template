-- The portfolio and the rent roll, as list fields
-- ===========================================================================
-- Every list page is its `list_fields` rows (the list_fields migration): which
-- columns it has, which the search box scans and which get a filter. The
-- properties and leases pages shipped just before that landed and were written
-- the old way — their columns hand-declared in the page file — so this is the
-- other half of that convention catching up, and the two pages lose their
-- column definitions entirely.
--
-- Both are real-estate only, so no `industry_list_fields` rows: there is no
-- second vertical to disagree with the defaults yet.

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	-- Properties. A unit and the building it belongs to are rows in one table,
	-- so "Part of" is a column rather than a tree: blank means this row IS the
	-- building (or a single-family, which is its own unit). It is filterable
	-- because "show me Rowan Street's units" is the question a portfolio asks
	-- most.
	('properties', 'name', true, true, false, 100),
	('properties', 'parent', true, true, true, 200),
	('properties', 'property_type', true, false, true, 300),
	('properties', 'identifier', true, true, false, 400),
	('properties', 'bedrooms', true, false, false, 500),
	('properties', 'bathrooms', true, false, false, 600),
	('properties', 'market_rent', true, false, false, 700),
	('properties', 'status', true, false, true, 800),
	-- Off by default: a building carries them and a unit does not, so they are
	-- half blank on any list holding both. Still searchable where it helps.
	('properties', 'square_feet', false, false, false, 900),
	('properties', 'acquired_on', false, false, false, 1000),
	('properties', 'purchase_price', false, false, false, 1100),
	('properties', 'created_at', false, false, false, 1200),

	-- The rent roll. `term` is the STORED half of a tenancy's shape — fixed or
	-- month-to-month, which is `ends_on` being null — and there is deliberately
	-- no "is it running today" column: that is a question about the viewer's
	-- date, and a cell described on the server would be wrong at midnight.
	-- `leaseStateOn()` ($lib/crm/leases.ts) is that question, client-safe and
	-- tested, for the rent-roll and delinquency screens that will ask it. Here
	-- the dates are the honest columns, and a blank `Ends` reads as
	-- month-to-month.
	--
	-- `name` is every kind's first field and the link into the record, and a
	-- lease's is what is rented and by whom — so Property and Tenant as
	-- columns too would print each of them twice on every row. They are
	-- hidden instead, NOT dropped: a hidden field still searches and filters,
	-- so "Rowan Street's leases" and "Priya's leases" both still work, and
	-- ViewOptions turns either back on.
	('leases', 'name', true, true, false, 100),
	('leases', 'property', false, true, true, 200),
	('leases', 'tenant', false, true, true, 300),
	('leases', 'starts_on', true, false, false, 400),
	('leases', 'ends_on', true, false, false, 500),
	('leases', 'rent_amount', true, false, false, 600),
	('leases', 'term', true, false, true, 700),
	('leases', 'security_deposit', false, false, false, 800),
	('leases', 'rent_due_day', false, false, false, 900),
	('leases', 'created_at', false, false, false, 1000)
on conflict (feature_id, field) do nothing;
