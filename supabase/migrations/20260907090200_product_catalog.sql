-- The catalog: the things an org sells, whether or not they are things.
--
-- The verticals this template serves divide badly into "service businesses"
-- and "product businesses". A dental practice sells procedures; a roofer sells
-- a roof, which is labor plus materials; a distributor sells stock. But all
-- three put priced lines on a proposal, price them per unit, group them for
-- browsing, and want to reuse them instead of retyping. That is one table.
--
-- So `kind` is a column, not a table split: a good and a service differ in
-- whether inventory means anything, and in nothing else that the schema cares
-- about. Splitting them would double the catalog, double the feature, and
-- force every proposal line to know which of two foreign keys to follow.
--
-- What a line item does NOT do is read its price through the product at render
-- time. `proposal_line_items` keeps its own label and unit_cost; the product
-- link is provenance, not a live lookup. A quote sent in March must still say
-- what it said in March after the catalog is repriced in April.

create type public.product_kind as enum ('good', 'service');

-- ---------------------------------------------------------------------------
-- product_categories — the browsing tree
-- ---------------------------------------------------------------------------

-- Self-referencing so an org can nest as deeply as its catalog needs
-- (Materials → Shingles → Architectural), and composite so a child can never
-- point at another org's category.
create table public.product_categories (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	parent_id uuid,
	name text not null,
	description text,
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (id, org_id),
	foreign key (parent_id, org_id) references public.product_categories (id, org_id)
		on delete cascade,
	constraint product_categories_name_not_blank check (length(trim(name)) > 0),
	constraint product_categories_not_own_parent check (parent_id is null or parent_id <> id)
);

comment on table public.product_categories is
	'A node in an org''s catalog tree. Deleting a category deletes its subtree; the products in it are kept and uncategorised.';

create index product_categories_org_id_idx on public.product_categories (org_id);
create index product_categories_parent_id_idx on public.product_categories (parent_id);

-- Sibling names are unique, and two partial indexes are what says so: SQL
-- uniqueness ignores rows where a column is null, so the roots need their own.
create unique index product_categories_unique_child_name_idx
	on public.product_categories (org_id, parent_id, lower(name))
	where parent_id is not null;
create unique index product_categories_unique_root_name_idx
	on public.product_categories (org_id, lower(name))
	where parent_id is null;

create trigger product_categories_set_updated_at
	before update on public.product_categories
	for each row execute procedure public.set_updated_at();

-- The check constraint stops a category being its own parent; only a walk up
-- the tree stops A → B → A. Without it a recursive catalog query hangs, and
-- the row that caused it is invisible in any single-row view.
create function public.check_product_category_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.parent_id is null then
		return new;
	end if;

	if exists (
		with recursive ancestors as (
			select c.id, c.parent_id
			from public.product_categories c
			where c.id = new.parent_id
			union all
			select c.id, c.parent_id
			from public.product_categories c
			join ancestors a on c.id = a.parent_id
		)
		select 1 from ancestors where id = new.id
	) then
		raise exception 'category % cannot be nested under its own descendant', new.id
			using errcode = 'check_violation';
	end if;

	return new;
end;
$$;

create trigger product_categories_check_cycle
	before insert or update of parent_id on public.product_categories
	for each row execute procedure public.check_product_category_cycle();

-- ---------------------------------------------------------------------------
-- products — goods and services in one catalog
-- ---------------------------------------------------------------------------

create table public.products (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	category_id uuid,
	kind public.product_kind not null default 'good',
	-- The org's own code for it. Optional (a dental procedure has a CDT code,
	-- a one-off labor line has nothing) but unique within the org when set.
	sku text,
	name text not null,
	description text,
	-- Money as numeric, never float — the deals rule. `unit_cost` is what it
	-- costs the org, so margin is a subtraction rather than a second table.
	unit_price numeric(12, 2) not null default 0,
	unit_cost numeric(12, 2),
	currency text not null default 'USD',
	-- What one of it is: 'each', 'hour', 'sq ft', 'visit'. Free text because
	-- every vertical measures differently and none of them agree on a list.
	unit text,
	is_active boolean not null default true,
	-- Inventory is the one thing a service genuinely lacks, so it is two
	-- nullable columns guarded by a check rather than a separate table.
	track_inventory boolean not null default false,
	quantity_on_hand numeric,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (category_id, org_id) references public.product_categories (id, org_id)
		on delete set null (category_id),
	-- Composite target for proposal_line_items and anything else that cites a
	-- catalog entry.
	unique (id, org_id),
	constraint products_name_not_blank check (length(trim(name)) > 0),
	constraint products_unit_price_nonnegative check (unit_price >= 0),
	constraint products_unit_cost_nonnegative check (unit_cost is null or unit_cost >= 0),
	constraint products_only_goods_have_inventory
		check (kind = 'good' or not track_inventory),
	constraint products_quantity_requires_tracking
		check (quantity_on_hand is null or track_inventory)
);

comment on table public.products is
	'One sellable thing — a good or a service. `kind` decides whether inventory applies; everything else is shared.';
comment on column public.products.unit is
	'What one of it is (each, hour, sq ft, visit). Free text: no two verticals measure the same way.';

create index products_org_id_idx on public.products (org_id);
create index products_category_id_idx on public.products (category_id);
-- The catalog picker: an org's live products by name.
create index products_org_id_is_active_name_idx on public.products (org_id, is_active, name);

create unique index products_org_id_sku_idx
	on public.products (org_id, lower(sku))
	where sku is not null;

create trigger products_set_updated_at
	before update on public.products
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- proposal_line_items cite the catalog
-- ---------------------------------------------------------------------------

-- Provenance, not a live lookup: the line keeps its own label and unit_cost, so
-- retiring or repricing a product never rewrites a quote that was already sent.
-- Deleting the product therefore only clears the citation.
alter table public.proposal_line_items
	add column product_id uuid,
	add constraint proposal_line_items_product_id_org_id_fkey
		foreign key (product_id, org_id) references public.products (id, org_id)
		on delete set null (product_id);

create index proposal_line_items_product_id_idx on public.proposal_line_items (product_id);

comment on column public.proposal_line_items.product_id is
	'The catalog entry this line came from, if any. Provenance only — label and unit_cost are snapshots taken when the line was written.';

-- ---------------------------------------------------------------------------
-- The shared polymorphic link learns about products
-- ---------------------------------------------------------------------------

-- The 'product' value shipped with the enum in the party-model migration; this
-- is the branch that makes it resolvable, so tags and custom fields can point
-- at a catalog entry.
create or replace function private.crm_entity_exists(org uuid, kind public.crm_entity_type, entity uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select case kind
		when 'company' then exists (select 1 from public.companies where id = entity and org_id = org)
		when 'contact' then exists (select 1 from public.contacts where id = entity and org_id = org)
		when 'deal' then exists (select 1 from public.deals where id = entity and org_id = org)
		when 'product' then exists (select 1 from public.products where id = entity and org_id = org)
		when 'proposal' then exists (select 1 from public.proposals where id = entity and org_id = org)
		when 'proposal_option' then exists (select 1 from public.proposal_options where id = entity and org_id = org)
		when 'task' then exists (select 1 from public.tasks where id = entity and org_id = org)
		when 'ticket' then exists (select 1 from public.support_tickets where id = entity and org_id = org)
		else false
	end
$$;

-- Products carry no addresses and parent no proposals, so this trigger is inert
-- today. It is installed now anyway: the migrations that add tags and custom
-- values extend one function body instead of remembering to attach a trigger to
-- every parent table they can reach.
create trigger products_crm_entity_deleted
	after delete on public.products
	for each row execute procedure public.on_crm_entity_deleted('product');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- The catalog is working data, not configuration: in a shop the people adding
-- products are the same members who add clients. Deletes stay owner/admin, and
-- the category tree is shaped by owners and admins because a bad edit there
-- re-files the whole catalog.

alter table public.product_categories enable row level security;
alter table public.products enable row level security;

create policy "Members can view product categories"
	on public.product_categories for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners and admins can create product categories"
	on public.product_categories for insert to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update product categories"
	on public.product_categories for update to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can delete product categories"
	on public.product_categories for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

create policy "Members can view products"
	on public.products for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create products as themselves"
	on public.products for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update products"
	on public.products for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete products"
	on public.products for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

revoke insert, update on table public.product_categories from authenticated;
grant insert (org_id, parent_id, name, description, sort_order),
	update (parent_id, name, description, sort_order)
	on table public.product_categories to authenticated;

revoke insert, update on table public.products from authenticated;
grant insert (org_id, category_id, kind, sku, name, description, unit_price, unit_cost,
		currency, unit, is_active, track_inventory, quantity_on_hand, created_by),
	update (category_id, kind, sku, name, description, unit_price, unit_cost, currency,
		unit, is_active, track_inventory, quantity_on_hand)
	on table public.products to authenticated;

-- The citation is set when the line is written and cleared by the catalog's
-- own foreign key; nothing else may repoint it.
revoke insert, update on table public.proposal_line_items from authenticated;
grant insert (org_id, proposal_option_id, product_id, label, quantity, unit_cost, sort_order),
	update (label, quantity, unit_cost, sort_order)
	on table public.proposal_line_items to authenticated;
