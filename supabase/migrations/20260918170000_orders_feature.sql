-- Orders: what a customer asked for gets a page
-- ===========================================================================
-- `orders` and `order_line_items` have existed since the orders_and_shipments
-- migration, whose closing comment said the feature rows ship with the route
-- rather than ahead of it. This is the route.
--
-- The document itself needs no changes: the number is assigned by trigger,
-- `subtotal` and `tax` roll up from the lines, `total`, `net_amount` and
-- `line_total` are generated, and `refresh_order_fulfillment()` folds the
-- lines into the header's `fulfillment_status`. Confirming and cancelling are
-- the only two acts a person takes.

-- ---------------------------------------------------------------------------
-- The number must be omittable
-- ---------------------------------------------------------------------------
-- `assign_order_number()` fills it in, and the column is not grantable to
-- clients — so an insert must be able to leave it out. A blank default says
-- so in the schema and in the generated types, where the column stops being
-- required. Exactly what the ledger migration did for `invoices.number` and
-- the purchases migration for its own.
alter table public.orders alter column number set default '';

-- ---------------------------------------------------------------------------
-- The feature
-- ---------------------------------------------------------------------------

-- Filed under Commerce, at the head of it: an order is the thing the rest of
-- that section exists to serve — a catalog is what you can order, a coupon is
-- what it costs, a return is one coming back.
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('orders', 'Orders', 'order',
		'What a customer asked for: the lines they ordered, how much of it has gone out, and what it comes to.',
		'/orders', 'shopping-cart', 'commerce', 100)
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
-- The record page has no row — its title is the order's number.
insert into public.pages (id, feature_id, path, title) values
	('orders', 'orders', '/orders', null)
on conflict (id) do nothing;

-- The verticals that ship goods. A practice and a roofer bill for work
-- through a proposal and an invoice; neither takes an order.
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('crm', 'orders', null, null),
	('medical-supplies', 'orders', null, null),
	('beverage', 'orders', null, null)
on conflict (industry_id, feature_id) do nothing;

insert into public.tier_features (tier_id, feature_id) values
	('free', 'orders'),
	('pro', 'orders'),
	('enterprise', 'orders')
on conflict (tier_id, feature_id) do nothing;

-- Whoever a role lets work the customers may take orders from them, at the
-- same level — derived from companies, since a customer IS a company.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'orders', rp.level
from public.role_permissions rp
where rp.feature_id = 'companies'
on conflict (role_id, feature_id) do nothing;

-- Medical supplies orders its own Commerce section (the
-- commerce_and_finances_sections migration), and the reference sidebar leads
-- it with Orders.
update public.industry_features as f
set sort_order = v.sort_order
from (values
	('medical-supplies', 'orders', 100)
) as v (industry_id, feature_id, sort_order)
where f.industry_id = v.industry_id and f.feature_id = v.feature_id;

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------
-- The number first and searchable, the customer beside it and filterable,
-- then BOTH status axes — the lifecycle a person moved and the fulfillment
-- the lines folded into — because the question a fulfillment queue asks is
-- "which confirmed orders are not all out yet", and that needs both.
-- `customer_po` earns its column for the same reason a purchase's reference
-- does: it is what the other side looks the order up by.

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('orders', 'name', true, true, false, 100),
	('orders', 'company', true, true, true, 200),
	('orders', 'status', true, false, true, 300),
	('orders', 'fulfillment_status', true, false, true, 400),
	('orders', 'customer_po', true, true, false, 500),
	('orders', 'total', true, false, false, 600),
	('orders', 'estimated_ship_date', true, false, false, 700),
	('orders', 'created_at', false, false, false, 800)
on conflict (feature_id, field) do nothing;

-- Next: npm run db:reset, then npm run db:types and commit the regenerated
-- src/lib/database.types.ts.
