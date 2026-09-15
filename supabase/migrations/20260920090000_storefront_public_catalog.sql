-- A published catalog a storefront can read without a session.
--
-- Every other table in this schema is default-deny: `to authenticated` plus
-- `private.org_role(org_id)`, and anon sees nothing. A storefront breaks that
-- by definition — a shopper has no account and no membership, and the shop
-- still has to list what is for sale. This migration opens exactly that much
-- and no more, and is the one deliberate public read path in the app. It is
-- not a precedent for opening another table; the product images bucket
-- ("Anyone can view product images") is the only other thing here a stranger
-- can reach, and for the same reason.
--
-- Three gates, all of which must pass:
--
--   1. The ORG opted in. `storefront_enabled` is off for every org and is not
--      in the browser's update grant, so it is set by an operator through SQL
--      or service-role code — the `tier_id` rule. An org cannot put its own
--      catalog on the internet by clicking something.
--   2. The PRODUCT is active. `is_active` is already what the app means by
--      "still sold".
--   3. The PRODUCT is published. A storefront row needs a slug to have a URL
--      at all, so a non-blank `metadata.slug` IS the publish switch: a product
--      an org keeps for proposals has no slug and never appears in a shop,
--      even in an org that opted in. Blank counts as absent, matching how the
--      storefront itself reads the field.
--
-- Row access is not the whole story: a policy exposes every column of a row
-- it admits, so the column grants below are as load-bearing as the policies.
-- `unit_cost`, `quantity_on_hand`, `created_by` and the Stripe ids stay behind
-- them — margin, stock and internal ids are not the shop's business.

-- ---------------------------------------------------------------------------
-- The org's opt-in
-- ---------------------------------------------------------------------------

alter table public.organizations
	add column storefront_enabled boolean not null default false;

comment on column public.organizations.storefront_enabled is
	'Whether this org''s published products may be read without a session. Operator/service-role only, like tier_id: the organizations update grant covers name alone, so members cannot set it.';

-- ---------------------------------------------------------------------------
-- The helper
-- ---------------------------------------------------------------------------

-- Security definer for the same reason `private.org_role()` is: a policy on
-- products cannot read `organizations` directly, because that table's own RLS
-- hides every row from anon, and the check would answer "no" for everyone.
create function private.is_storefront_org(org uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select coalesce(
		(select storefront_enabled from public.organizations where id = org),
		false
	)
$$;

-- ---------------------------------------------------------------------------
-- The policies
-- ---------------------------------------------------------------------------

-- `to anon` only. Members already read their own org's catalog through
-- "Members can view products", including the rows no storefront may see, so
-- this policy adds nothing for a signed-in reader and nothing changes inside
-- the app.
create policy "The public can view published storefront products"
	on public.products for select to anon
	using (
		is_active
		and nullif(trim(metadata ->> 'slug'), '') is not null
		and private.is_storefront_org(org_id)
	);

-- A product names its category, so a shop that can list products but not read
-- what they are filed under can only draw one flat wall of items. The names
-- are the same words the products already carry.
create policy "The public can view storefront product categories"
	on public.product_categories for select to anon
	using (private.is_storefront_org(org_id));

-- ---------------------------------------------------------------------------
-- The column grants
-- ---------------------------------------------------------------------------

-- Select is narrowed to what a shop renders. Insert/update/delete go too:
-- no policy admits anon for those, so they were already refused, but leaving
-- a write grant on the one table a stranger can now read is an invitation to
-- read this file wrong later.
revoke select, insert, update, delete on table public.products from anon;
grant select (
		id, org_id, sku, name, description, long_description, unit_price, currency, unit,
		category_id, is_active, image_url, additional_images, metadata, msrp, created_at
	)
	on table public.products to anon;

revoke select, insert, update, delete on table public.product_categories from anon;
grant select (id, org_id, name) on table public.product_categories to anon;

-- ---------------------------------------------------------------------------
-- One home for the compare-at price
-- ---------------------------------------------------------------------------

-- `msrp` has been the column for "the price shown struck through" since the
-- storefront fields migration, but the rows imported before the product form
-- could edit any of this carry the same figure as `metadata.compareAtCents`,
-- in cents. Fill the column from the bag so the form opens on the number the
-- shop is already showing; `writeRecord()` derives the bag's key from the
-- column from here on, so the two cannot drift and the shop reads the same
-- value throughout. The key stays in `metadata` deliberately — a deployed
-- storefront is reading it, and it goes when the shop reads `msrp` instead.
update public.products
set msrp = round((metadata ->> 'compareAtCents')::numeric / 100, 2)
where msrp is null
	and jsonb_typeof(metadata -> 'compareAtCents') = 'number';

-- ---------------------------------------------------------------------------
-- Putting a catalog on the internet — the checklist
-- ---------------------------------------------------------------------------
--
--   1. update public.organizations set storefront_enabled = true where id = '<org>';
--      (service-role or SQL editor — there is deliberately no screen for this)
--   2. Give every product that should appear a non-blank Slug and a category,
--      and leave it active. The product form's Storefront section is where
--      those live; a product with no slug stays invisible to the shop.
--   3. Point the storefront at this project with the ANON key and filter its
--      read by `org_id` — the policy scopes rows to opted-in orgs, not to one
--      org, so the shop says which catalog it is showing.
--
-- To take a catalog back down, flip `storefront_enabled` off. That is one
-- statement and it covers every product at once, which is the point of
-- hanging the switch on the org rather than on each row.
