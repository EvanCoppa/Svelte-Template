-- Purchases: what you buy gets a page
-- ===========================================================================
-- `purchases` and `purchase_line_items` have existed since the
-- vendors_and_purchasing migration with no screen. This registers the feature
-- and its list, and fixes the one thing that stopped an insert working from
-- the app.
--
-- The document itself needs no changes: the number is assigned by trigger,
-- the subtotal rolls up from the lines, `total`, `line_total` and
-- `landed_unit_cost` are generated, and `refresh_purchase_rollups()` already
-- moves the status between `ordered`, `partially_received` and `received`
-- from how much of each line has arrived. Placing and cancelling are the only
-- two acts a person takes.

-- ---------------------------------------------------------------------------
-- The number must be omittable
-- ---------------------------------------------------------------------------
-- `assign_purchase_number()` fills it in, and the column is not grantable to
-- clients — so an insert must be able to leave it out. A blank default says
-- so in the schema and in the generated types, where the column stops being
-- required. Exactly what the ledger migration did for `invoices.number` and
-- the rmas migration for its own; the purchases migration predates the rule.
alter table public.purchases alter column number set default '';

-- ---------------------------------------------------------------------------
-- The feature
-- ---------------------------------------------------------------------------

-- Filed under Finances beside the money it commits: the bill you send, the
-- account it lands on, then the orders you place and who you place them with.
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('purchases', 'Purchases', 'purchase',
		'Orders you place with a vendor: what was asked for, what has arrived, and what it landed at.',
		'/purchases', 'shopping-bag', 'finances', 250)
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
-- The record page has no row — its title is the purchase's number.
insert into public.pages (id, feature_id, path, title) values
	('purchases', 'purchases', '/purchases', null)
on conflict (id) do nothing;

-- The verticals that buy stock to resell it. A practice and a roofer buy
-- things too, but through the supplier they already have on Companies — a
-- purchase order is a distributor's instrument.
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('crm', 'purchases', null, null),
	('medical-supplies', 'purchases', 'Purchase orders', 'purchase order'),
	('beverage', 'purchases', null, null)
on conflict (industry_id, feature_id) do nothing;

insert into public.tier_features (tier_id, feature_id) values
	('free', 'purchases'),
	('pro', 'purchases'),
	('enterprise', 'purchases')
on conflict (tier_id, feature_id) do nothing;

-- Whoever a role lets work the vendors may place orders with them, at the
-- same level — derived from companies, since a vendor IS a company.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'purchases', rp.level
from public.role_permissions rp
where rp.feature_id = 'companies'
on conflict (role_id, feature_id) do nothing;

-- Medical supplies orders its whole Finances section itself (the
-- commerce_and_finances_sections migration), so the newcomer needs a place:
-- the reference sidebar puts Purchases between Invoices and Vendors.
update public.industry_features as f
set sort_order = v.sort_order
from (values
	('medical-supplies', 'purchases', 250)
) as v (industry_id, feature_id, sort_order)
where f.industry_id = v.industry_id and f.feature_id = v.feature_id;

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------
-- The number first and searchable, the vendor beside it and filterable, the
-- state filterable. The reference is what a buyer actually looks one up by
-- after the number, so it is searched and shown. `expected_at` earns its
-- column because the question a buying queue answers is "when is it coming".

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('purchases', 'name', true, true, false, 100),
	('purchases', 'company', true, true, true, 200),
	('purchases', 'status', true, false, true, 300),
	('purchases', 'reference', true, true, false, 400),
	('purchases', 'total', true, false, false, 500),
	('purchases', 'expected_at', true, false, false, 600),
	('purchases', 'ordered_at', false, false, false, 700),
	('purchases', 'created_at', false, false, false, 800)
on conflict (feature_id, field) do nothing;

-- Next: npm run db:reset, then npm run db:types and commit the regenerated
-- src/lib/database.types.ts.
