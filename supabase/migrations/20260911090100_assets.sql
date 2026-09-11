-- Assets: the things an org owns, uses, leases, assigns or tracks — a
-- laptop, a truck, a compressor, a dental chair, a rental unit.
--
-- The table is deliberately small. An asset has the columns every kind of
-- asset has and nothing else: what it is, the org's own tag for it, whether
-- it is in service, when it came and went, and what it cost. What is
-- specific to a kind of asset — a serial number, a VIN, a mileage, a
-- warranty expiry, a calibration date — is a custom field on it (the
-- custom_fields_generalized migration: definitions declare `entity_type =
-- 'asset'`), exactly as industry specifics land on a contact or a product.
--
-- What is NOT here, on purpose: who owns it, who it is assigned to, which
-- company it was bought or leased from, which asset it is part of. Every one
-- of those is a record-to-record link, and the relationships migration that
-- follows gives them one home rather than a column each — an `owner_id`
-- would have to choose between a contact and a company before the first row
-- was written, and a `vendor_id` would be the third table to grow one.
--
-- Working data like products: member-writable, owner/admin delete, column
-- grants keeping org_id and authorship out of the browser's reach. The
-- 'asset' entity kind shipped in the previous migration; this one adds the
-- table and the branch that makes it resolvable, plus the branch for the
-- 'member' kind that shipped beside it.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

-- An enum, not is_active: an asset that is not in service is either resting
-- (`inactive` — the winter truck) or gone for good (`retired` — sold,
-- scrapped, written off), and a fleet screen needs to tell the two apart.
create type public.asset_status as enum ('active', 'inactive', 'retired');

create table public.assets (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	name text not null,
	-- What kind of thing it is, in the org's own words: 'vehicle',
	-- 'equipment', 'device', 'property'. Free text rather than an enum or a
	-- table because no two verticals agree on the list, and a filter on it
	-- is a filter on a column either way.
	asset_type text,
	-- The org's own tag for it — an asset number, a fleet number, a plate.
	-- Optional, but unique within the org when set, like products.sku.
	identifier text,
	status public.asset_status not null default 'active',
	description text,
	-- When the org took it on and when it let it go. Dates, not instants:
	-- nobody records the hour a truck was bought.
	acquired_on date,
	disposed_on date,
	-- What it cost. Money as numeric, never float — the deals rule.
	purchase_price numeric(12, 2),
	currency text not null default 'USD',
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Composite target, the companies trick from crm_core, so a later table
	-- can pin a child to an asset in the same org.
	unique (id, org_id),
	constraint assets_name_not_blank check (length(trim(name)) > 0),
	constraint assets_purchase_price_nonnegative
		check (purchase_price is null or purchase_price >= 0),
	constraint assets_currency_is_iso4217 check (currency ~ '^[A-Z]{3}$'),
	constraint assets_disposed_after_acquired
		check (acquired_on is null or disposed_on is null or disposed_on >= acquired_on)
);

comment on table public.assets is
	'A thing the org owns, uses, leases or tracks. Only the universal columns live here: who owns or holds it is a relationship, and a serial number or a VIN is a custom field.';
comment on column public.assets.asset_type is
	'What kind of thing it is, in the org''s own words — vehicle, equipment, device, property.';
comment on column public.assets.identifier is
	'The org''s own tag for it: an asset number, a fleet number. Unique within the org when set.';

create index assets_org_id_idx on public.assets (org_id);
-- The list page: an org's assets, in service first, by name.
create index assets_org_id_status_name_idx on public.assets (org_id, status, name);

create unique index assets_org_id_identifier_idx
	on public.assets (org_id, lower(identifier))
	where identifier is not null;

create trigger assets_set_updated_at
	before update on public.assets
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The shared polymorphic link learns about assets and members
-- ---------------------------------------------------------------------------

-- Two new branches. An asset resolves like every other table. A member
-- resolves through the membership: the entity id is the user id, and it
-- exists in an org for exactly as long as the organization_members row
-- does — so a relationship can name the employee a laptop is assigned to,
-- and can never name someone who is not on this org's roster.
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
		when 'deal' then exists (select 1 from public.deals where id = entity and org_id = org)
		when 'member' then exists (select 1 from public.organization_members where user_id = entity and org_id = org)
		when 'product' then exists (select 1 from public.products where id = entity and org_id = org)
		when 'proposal' then exists (select 1 from public.proposals where id = entity and org_id = org)
		when 'proposal_option' then exists (select 1 from public.proposal_options where id = entity and org_id = org)
		when 'task' then exists (select 1 from public.tasks where id = entity and org_id = org)
		when 'ticket' then exists (select 1 from public.support_tickets where id = entity and org_id = org)
		else false
	end
$$;

-- Tags, activities and custom values go with the asset; the one cleanup
-- function takes them (and, after the next migration, its relationships).
create trigger assets_crm_entity_deleted
	after delete on public.assets
	for each row execute procedure public.on_crm_entity_deleted('asset');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Working data, exactly like products: the members who use the things keep
-- the register current. Deletes stay owner/admin.

alter table public.assets enable row level security;

create policy "Members can view assets"
	on public.assets for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create assets as themselves"
	on public.assets for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update assets"
	on public.assets for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete assets"
	on public.assets for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

revoke insert, update on table public.assets from authenticated;
grant insert (org_id, name, asset_type, identifier, status, description, acquired_on, disposed_on,
		purchase_price, currency, created_by),
	update (name, asset_type, identifier, status, description, acquired_on, disposed_on,
		purchase_price, currency)
	on table public.assets to authenticated;

-- ---------------------------------------------------------------------------
-- The feature
-- ---------------------------------------------------------------------------

insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('assets', 'Assets', 'asset',
		'The things you own, use, lease or track — and who holds each one.',
		'/assets', 'box', 'crm', 28)
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('assets', 'assets', '/assets', null)
on conflict (id) do nothing;

-- Every vertical has things to keep track of — trucks, chairs, kegs — so
-- the feature goes to the whole catalog, derived rather than listed, the
-- way contacts and products did. Each industry keeps the default words:
-- "Assets" reads the same on a roof and in a practice.
insert into public.industry_features (industry_id, feature_id)
select i.id, 'assets'
from public.industries i
on conflict (industry_id, feature_id) do nothing;

-- Every plan, like contacts: a register of what you own is table stakes.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'assets'),
	('pro', 'assets'),
	('enterprise', 'assets')
on conflict (tier_id, feature_id) do nothing;

-- Whoever a role lets keep the catalog may keep the register at the same
-- level — derived from products, the way billables inherited proposals, so
-- a role added later cannot silently miss it.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'assets', rp.level
from public.role_permissions rp
where rp.feature_id = 'products'
on conflict (role_id, feature_id) do nothing;
