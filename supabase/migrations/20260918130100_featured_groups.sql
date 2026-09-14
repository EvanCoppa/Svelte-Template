-- Featured groups: the merchandising shelf
-- ===========================================================================
-- A featured group is a named, ordered set of products an org wants put in
-- front of a buyer together — "Spring promo", "New this month", "Starter
-- kit". It is the first thing a storefront or an order screen draws before
-- anyone searches the catalog, and it is the org's own editorial decision
-- rather than a fact about any product, which is why it is a table of its
-- own and not a column on `products`. A product sits in as many groups as
-- the merchandiser wants it in.
--
-- The shape is `quick_plans` exactly, and on purpose (the
-- billables_and_quick_plans migration): a named row plus join rows naming
-- its members in order, both always read and written together, because a
-- group with no members is not a group. That is also why this is NOT a
-- `crm_entity_type` kind with a record page: its one interesting field is a
-- multi-select of products, which the generic record form's
-- one-string-per-field contract cannot render, so it keeps its own page and
-- its own forms the way quick plans do.
--
-- What is deliberately NOT here: a schedule (a group that turns itself on
-- and off on a date), a per-group discount, and a storefront slot. The first
-- two belong to a storefront that can read them and nothing does yet; the
-- third is a deployment decision, not a row. `is_active` and `sort_order`
-- are the two the page itself uses.

-- ---------------------------------------------------------------------------
-- The tables
-- ---------------------------------------------------------------------------

create table public.featured_groups (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	name text not null,
	description text,
	-- Off without being deleted: last spring's promo, kept for next spring.
	is_active boolean not null default true,
	-- Where the group sits among the org's groups. Multiples of 100 by the
	-- nav_sort_order convention, so one slots between two others.
	sort_order integer not null default 100,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (org_id, name),
	-- Composite target: a group's members must be this org's products.
	unique (id, org_id),
	constraint featured_groups_name_not_blank check (length(trim(name)) > 0),
	constraint featured_groups_sort_order_positive check (sort_order > 0)
);

comment on table public.featured_groups is
	'A named, ordered set of products an org puts in front of a buyer together. Editorial, not a fact about any product — the quick_plans shape.';
comment on column public.featured_groups.is_active is
	'Whether the group is currently shown. Off rather than deleted keeps a seasonal group for next season.';

create index featured_groups_org_id_idx on public.featured_groups (org_id);

create trigger featured_groups_set_updated_at
	before update on public.featured_groups
	for each row execute procedure public.set_updated_at();

create table public.featured_group_products (
	featured_group_id uuid not null,
	product_id uuid not null,
	org_id uuid not null references public.organizations (id) on delete cascade,
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	primary key (featured_group_id, product_id),
	-- Both composite: a group can only hold its own org's products, and a
	-- deleted product leaves every group it was in.
	foreign key (featured_group_id, org_id)
		references public.featured_groups (id, org_id) on delete cascade,
	foreign key (product_id, org_id) references public.products (id, org_id) on delete cascade
);

comment on table public.featured_group_products is
	'A featured group''s members, in the order the merchandiser put them. Replaced wholesale when the group is edited — the rows carry nothing but order.';

create index featured_group_products_org_id_idx on public.featured_group_products (org_id);
create index featured_group_products_product_id_idx on public.featured_group_products (product_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Working data like the catalog it merchandises: the members who keep the
-- products current keep the shelves current. Deletes stay owner/admin.

alter table public.featured_groups enable row level security;
alter table public.featured_group_products enable row level security;

create policy "Members can view featured groups"
	on public.featured_groups for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create featured groups as themselves"
	on public.featured_groups for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update featured groups"
	on public.featured_groups for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete featured groups"
	on public.featured_groups for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- A group's members change whenever the group is edited, so members may
-- replace them; the group row itself is what deletes are gated on.
create policy "Members can view featured group products"
	on public.featured_group_products for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can add products to featured groups"
	on public.featured_group_products for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can remove products from featured groups"
	on public.featured_group_products for delete to authenticated
	using (private.org_role(org_id) is not null);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

revoke insert, update on table public.featured_groups from authenticated;
grant insert (org_id, name, description, is_active, sort_order, created_by),
	update (name, description, is_active, sort_order)
	on table public.featured_groups to authenticated;

-- Membership rows are replaced, never edited in place.
revoke insert, update on table public.featured_group_products from authenticated;
grant insert (featured_group_id, product_id, org_id, sort_order)
	on table public.featured_group_products to authenticated;

-- ---------------------------------------------------------------------------
-- The feature
-- ---------------------------------------------------------------------------

-- Filed under Tools beside the catalog it arranges, after the bundles: what
-- you sell, what you charge for, the bundles of it, then how you shelve it.
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('featured-groups', 'Featured groups', 'featured group',
		'Named sets of products put in front of a buyer together — a promo, a starter kit, what is new this month.',
		'/featured-groups', 'star', 'tools', 400)
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('featured-groups', 'featured-groups', '/featured-groups', null)
on conflict (id) do nothing;

-- The verticals that sell things off a shelf. A practice and a roofer quote
-- work rather than merchandise a catalog, so the feature is `hidden` for
-- them — it does not exist as far as those orgs are concerned, and a vertical
-- joins later with one row here.
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('crm', 'featured-groups', null, null),
	('medical-supplies', 'featured-groups', null, null),
	('beverage', 'featured-groups', 'Featured lineups', 'featured lineup')
on conflict (industry_id, feature_id) do nothing;

-- Every plan: a shelf is how a catalog is read, not an upsell.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'featured-groups'),
	('pro', 'featured-groups'),
	('enterprise', 'featured-groups')
on conflict (tier_id, feature_id) do nothing;

-- Whoever a role lets keep the catalog may arrange it, at the same level —
-- derived from products the way assets and billables derived theirs, so a
-- role added later cannot silently miss it.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'featured-groups', rp.level
from public.role_permissions rp
where rp.feature_id = 'products'
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- Adding one of these, next time
-- ---------------------------------------------------------------------------
--   1. The table(s), RLS, column grants — above.
--   2. The `features` row (id, route, icon, category, sort_order) and its
--      `pages` row; the id goes in FEATURE_IDS (src/lib/features/types.ts).
--   3. `industry_features` for every vertical that has it, `tier_features`
--      for every plan that unlocks it, `role_permissions` derived from the
--      feature whose readers should get it.
--   4. The route under src/routes/(app)/, and a `$lib/server/crm/` module —
--      loads and actions never touch `.from()` themselves.
--
-- Next: npm run db:reset (proves it replays onto an empty database), then
-- npm run db:types and commit the regenerated src/lib/database.types.ts.
