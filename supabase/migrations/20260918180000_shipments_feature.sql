-- Shipments: the box gets a page
-- ===========================================================================
-- `shipments`, `shipment_line_items` and `shipment_events` have existed since
-- the orders_and_shipments migration, whose closing comment said the feature
-- rows ship with the route rather than ahead of it. This is the route, and it
-- lands with Orders because a shipment's `order_id` is NOT NULL: a box with no
-- order to ship is not a thing this schema can hold.
--
-- Nothing about the tables changes. A shipment has no number of its own (it is
-- known by its carrier and tracking number, which are unique together per org),
-- the packing rows carry no quantity, and `apply_shipment_status_to_lines()`
-- already pushes a delivery status onto every line in the box.

-- ---------------------------------------------------------------------------
-- The feature
-- ---------------------------------------------------------------------------

-- Filed under Commerce directly after Orders — the box is what satisfies what
-- was asked for, so a view of one sits beside the other (the order-of-the-work
-- rule in docs/features.md).
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('shipments', 'Shipments', 'shipment',
		'Boxes going out against an order: what is inside, who is carrying it, and where the carrier last saw it.',
		'/shipments', 'truck', 'commerce', 150)
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
-- The record page has no row — its title is the carrier and tracking number.
insert into public.pages (id, feature_id, path, title) values
	('shipments', 'shipments', '/shipments', null)
on conflict (id) do nothing;

-- The verticals that ship goods — exactly the ones that take orders, since a
-- shipment cannot exist without one.
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('crm', 'shipments', null, null),
	('medical-supplies', 'shipments', null, null),
	('beverage', 'shipments', null, null)
on conflict (industry_id, feature_id) do nothing;

insert into public.tier_features (tier_id, feature_id) values
	('free', 'shipments'),
	('pro', 'shipments'),
	('enterprise', 'shipments')
on conflict (tier_id, feature_id) do nothing;

-- Whoever a role lets work the orders may ship them, at the same level: a
-- shipment is a fact about an order, and its only write that matters moves
-- that order's lines.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'shipments', rp.level
from public.role_permissions rp
where rp.feature_id = 'orders'
on conflict (role_id, feature_id) do nothing;

-- Medical supplies orders its own Commerce section (the
-- commerce_and_finances_sections migration), so the newcomer needs a place:
-- directly after Orders, before the catalog.
update public.industry_features as f
set sort_order = v.sort_order
from (values
	('medical-supplies', 'shipments', 150)
) as v (industry_id, feature_id, sort_order)
where f.industry_id = v.industry_id and f.feature_id = v.feature_id;

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------
-- A shipment has no name of its own, so the tracking number is what a row is
-- known by — searched, because looking one up by the number a customer quoted
-- is the whole job. The order beside it, the carrier's last word filterable
-- (the tracking board is a filter on that column), and the two dates that
-- answer "when did it go" and "when does it land".

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('shipments', 'name', true, true, false, 100),
	('shipments', 'order', true, true, false, 200),
	('shipments', 'delivery_status', true, false, true, 300),
	('shipments', 'carrier', true, true, true, 400),
	('shipments', 'supplier', true, true, true, 500),
	('shipments', 'ship_date', true, false, false, 600),
	('shipments', 'estimated_delivery_date', true, false, false, 700),
	('shipments', 'delivered_at', false, false, false, 800),
	('shipments', 'created_at', false, false, false, 900)
on conflict (feature_id, field) do nothing;

-- Next: npm run db:reset, then npm run db:types and commit the regenerated
-- src/lib/database.types.ts.
