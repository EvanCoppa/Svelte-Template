-- Coupons: what an org takes off, and when it will
-- ===========================================================================
-- A coupon is a code a buyer types and a discount it earns them. The row is
-- the OFFER — the code, what it takes off, the window it is good for and
-- whether it is switched on — and nothing else.
--
-- Two columns are deliberately absent, and for the reason the orders
-- migration gives about `quantity_reserved`: `max_redemptions` and
-- `times_redeemed` only mean something once something applies a coupon and
-- counts it, and a limit nothing counts against is worse than no limit —
-- it reads as enforced. They arrive with the table that records a
-- redemption, which is the same table that will let an order carry a
-- coupon. Until then a coupon is on or it is off, and `ends_on` is how it
-- stops.
--
-- Likewise no per-product or per-category scope: "20% off, but only on
-- gloves" is a rule about a basket, and there is no basket yet. A scope
-- column nothing applies would be the same defect.
--
-- Working data like the catalog it discounts: members write it, deletes stay
-- owner/admin, column grants keep org_id and authorship out of the browser's
-- reach.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

-- Two ways to say "less": a share of the price, or a sum off it. An enum
-- rather than rows — no vertical has ever wanted a third.
create type public.coupon_discount_type as enum ('percent', 'amount');

create table public.coupons (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- What a buyer types. Unique within the org case-insensitively: SPRING20
	-- and spring20 are one coupon, and a second one would be a support call.
	code text not null,
	description text,
	discount_type public.coupon_discount_type not null default 'percent',
	-- Read against the type: a percentage when `percent`, a sum in `currency`
	-- when `amount`. Money as numeric, never float — the deals rule.
	discount_value numeric(12, 2) not null default 0,
	currency text not null default 'USD',
	-- The window, as dates: nobody publishes a coupon that starts at 14:05.
	-- Both ends INCLUSIVE — "good through the 30th" is what a coupon means,
	-- unlike a calendar event's exclusive end, which is a block of time.
	starts_on date,
	ends_on date,
	is_active boolean not null default true,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Composite target, the companies trick, so a later table (a redemption)
	-- can pin a child to a coupon in the same org.
	unique (id, org_id),
	-- A code with a space in it cannot be typed back reliably; a code is one
	-- token of letters, digits, dashes and underscores.
	constraint coupons_code_is_a_token check (code ~ '^[A-Za-z0-9_-]{2,40}$'),
	constraint coupons_discount_value_nonnegative check (discount_value >= 0),
	-- A percentage over 100 is not a discount, it is a refund.
	constraint coupons_percent_within_100
		check (discount_type <> 'percent' or discount_value <= 100),
	constraint coupons_currency_is_iso4217 check (currency ~ '^[A-Z]{3}$'),
	constraint coupons_ends_after_starts
		check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

comment on table public.coupons is
	'A discount an org publishes: a code, what it takes off, and the window it is good for. Redemption limits arrive with the table that records a redemption — a limit nothing counts against reads as enforced.';
comment on column public.coupons.discount_value is
	'Read against discount_type: a percentage when percent, a sum in currency when amount.';
comment on column public.coupons.ends_on is
	'The last day the coupon is good for, inclusive — unlike a calendar event''s exclusive end.';

create index coupons_org_id_idx on public.coupons (org_id);
-- The list page: an org's coupons, live ones first, by code.
create index coupons_org_id_is_active_code_idx on public.coupons (org_id, is_active, code);

create unique index coupons_org_id_code_idx on public.coupons (org_id, lower(code));

create trigger coupons_set_updated_at
	before update on public.coupons
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The shared polymorphic link learns about coupons
-- ---------------------------------------------------------------------------
-- A coupon resolves like every other table, so it can carry an activity, a
-- tag, a custom field and a relationship — "this coupon was made for that
-- company" is a link the columns did not foresee, which is what the graph
-- is for.

create or replace function private.crm_entity_exists(org uuid, kind public.crm_entity_type, entity uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select case kind
		when 'asset' then exists (select 1 from public.assets where id = entity and org_id = org)
		when 'billable' then exists (select 1 from public.billables where id = entity and org_id = org)
		when 'company' then exists (select 1 from public.companies where id = entity and org_id = org)
		when 'contact' then exists (select 1 from public.contacts where id = entity and org_id = org)
		when 'coupon' then exists (select 1 from public.coupons where id = entity and org_id = org)
		when 'deal' then exists (select 1 from public.deals where id = entity and org_id = org)
		when 'invoice' then exists (select 1 from public.invoices where id = entity and org_id = org)
		when 'member' then exists (select 1 from public.organization_members where user_id = entity and org_id = org)
		when 'order' then exists (select 1 from public.orders where id = entity and org_id = org)
		when 'product' then exists (select 1 from public.products where id = entity and org_id = org)
		when 'proposal' then exists (select 1 from public.proposals where id = entity and org_id = org)
		when 'proposal_option' then exists (select 1 from public.proposal_options where id = entity and org_id = org)
		when 'purchase' then exists (select 1 from public.purchases where id = entity and org_id = org)
		when 'shipment' then exists (select 1 from public.shipments where id = entity and org_id = org)
		when 'task' then exists (select 1 from public.tasks where id = entity and org_id = org)
		when 'ticket' then exists (select 1 from public.support_tickets where id = entity and org_id = org)
		else false
	end
$$;

create trigger coupons_crm_entity_deleted
	after delete on public.coupons
	for each row execute procedure public.on_crm_entity_deleted('coupon');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.coupons enable row level security;

create policy "Members can view coupons"
	on public.coupons for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create coupons as themselves"
	on public.coupons for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update coupons"
	on public.coupons for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete coupons"
	on public.coupons for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

revoke insert, update on table public.coupons from authenticated;
grant insert (org_id, code, description, discount_type, discount_value, currency,
		starts_on, ends_on, is_active, created_by),
	update (code, description, discount_type, discount_value, currency,
		starts_on, ends_on, is_active)
	on table public.coupons to authenticated;

-- ---------------------------------------------------------------------------
-- The feature
-- ---------------------------------------------------------------------------

-- Filed under Tools after the shelf: what you sell, what you charge for, the
-- bundles, how you shelve it, then what you knock off it.
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('coupons', 'Coupons', 'coupon',
		'Codes a buyer types for a discount — a share off, or a sum off, for as long as you say.',
		'/coupons', 'ticket-percent', 'tools', 500)
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('coupons', 'coupons', '/coupons', null)
on conflict (id) do nothing;

-- The verticals that sell off a catalog. A practice does not coupon a crown.
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('crm', 'coupons', null, null),
	('medical-supplies', 'coupons', null, null),
	('beverage', 'coupons', 'Promo codes', 'promo code')
on conflict (industry_id, feature_id) do nothing;

insert into public.tier_features (tier_id, feature_id) values
	('free', 'coupons'),
	('pro', 'coupons'),
	('enterprise', 'coupons')
on conflict (tier_id, feature_id) do nothing;

-- Whoever a role lets keep the catalog may discount it, at the same level.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'coupons', rp.level
from public.role_permissions rp
where rp.feature_id = 'products'
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------
-- The code first and searchable (it is what anyone looks a coupon up by),
-- the two enums filterable, the window shown, the description searched
-- without taking a column. The industry says nothing different yet.

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('coupons', 'name', true, true, false, 100),
	('coupons', 'discount_type', true, false, true, 200),
	('coupons', 'discount', true, false, false, 300),
	('coupons', 'starts_on', true, false, false, 400),
	('coupons', 'ends_on', true, false, false, 500),
	('coupons', 'status', true, false, true, 600),
	('coupons', 'description', false, true, false, 700),
	('coupons', 'created_at', false, false, false, 800)
on conflict (feature_id, field) do nothing;
