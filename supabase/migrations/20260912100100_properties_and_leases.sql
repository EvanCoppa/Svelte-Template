-- Properties and leases: the two tables a rental portfolio cannot borrow
-- ===========================================================================
-- The real_estate_industry migration turned the vertical on as rows, renaming
-- `assets` to "Properties" and leaning on the relationship graph for the rest.
-- That was right for one landlord with five doors and wrong for a property
-- MANAGEMENT product, which is what this is now: a portfolio is the primary
-- screen, a unit has attributes people sort and filter on every day, and a
-- tenancy carries money, which the graph cannot hold at all.
--
-- So the two things that could not be borrowed become tables, and everything
-- else stays borrowed — tenants are contacts, vendors are companies,
-- maintenance is tickets, and equipment goes back to being `assets`, which is
-- what that table was always for.
--
-- ---------------------------------------------------------------------------
-- Decision 1: ONE table for buildings and units, joined by a self-reference
-- ---------------------------------------------------------------------------
-- A duplex has two rentable units and one mortgage. Utilities are per unit,
-- the mortgage is per building, and a report has to add them up together — so
-- the two levels cannot be unrelated rows, and they are alike enough
-- (a name, an address, a status, a value) that two tables would be the same
-- columns twice.
--
-- A unit is therefore a `properties` row with `parent_id` set:
--
--   Rowan Street Duplex          parent_id null     the building
--     └ Rowan Street — Unit 1    parent_id → Rowan  the rentable thing
--     └ Rowan Street — Unit 2    parent_id → Rowan
--   Larkspur Court               parent_id null     a single-family: BOTH
--
-- A single-family is one row that is its own rentable unit, with no ceremony.
-- And because anything that points at "a property" points at one id whatever
-- level it means, a lease and (later) a transaction each need ONE column, not
-- a nullable property/unit pair — the workbook's "Shared" bucket is simply
-- the parent row.
--
-- **Depth is capped at two**, by `private.properties_enforce_depth()` below,
-- and that cap is what keeps this cheap: the building a row rolls up to is
-- `coalesce(parent_id, id)`, so every report groups by a plain expression
-- with no recursive CTE and no denormalised root column to keep true. A
-- complex → building → unit hierarchy is a later migration that drops the
-- trigger and adds a real root; until someone needs it, each building is a
-- top-level property and nothing is paid for in advance.
--
-- ---------------------------------------------------------------------------
-- Decision 2: a lease has no status column
-- ---------------------------------------------------------------------------
-- Whether a lease is upcoming, running or finished is a question about today,
-- and today is a wall-clock word — the rule the ledger's "overdue" and the
-- task board's "today" already follow. `starts_on` and `ends_on` are the
-- truth, a lease ended early has its `ends_on` moved to the day it actually
-- ended, and "active on D" is `starts_on <= D and (ends_on is null or
-- ends_on >= D)`. A status column would be a second copy of that, needing a
-- trigger to stay honest, and it would be wrong at midnight.
--
-- `ends_on` is INCLUSIVE — the last day the tenancy covers — deliberately
-- unlike `calendar_events.ends_at`, which is an exclusive instant. These are
-- different things: an event is a block of time, a lease is a set of days a
-- human names ("the lease ends September 30th" means the 30th is theirs). A
-- null `ends_on` is month-to-month, which is also what a holdover becomes.
--
-- Overlapping leases on one property are ALLOWED on purpose: two roommates
-- each holding their own lease on the same unit is a real arrangement, so
-- there is no exclusion constraint here.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
-- Lifecycle only. Occupancy is NOT here: whether a unit is occupied is a
-- question the leases table answers for a given day, so storing it would be
-- the status column decision 2 rejects, one table over.
create type public.property_status as enum ('active', 'inactive', 'sold');

comment on type public.property_status is
	'Where a property sits in the org''s portfolio. Occupancy is a question for leases, never a column here.';

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------

create table public.properties (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- The building this row is a unit of, or null when this row IS the
	-- building. Composite, so a unit can never be parented across tenants;
	-- cascade, because a unit of a deleted building has no subject left.
	parent_id uuid,
	name text not null,
	-- 'single_family', 'duplex', 'apartment', 'condo', 'commercial' — free
	-- text rather than an enum or a table for the reason `assets.asset_type`
	-- is: no two portfolios agree on the list, and a filter on it is a filter
	-- on a column either way.
	property_type text,
	-- The org's own tag: a parcel number, a door code, a unit number as it
	-- appears on the lease. Unique within the org when set, like products.sku.
	identifier text,
	status public.property_status not null default 'active',
	description text,

	-- What a rentable unit is, physically. These are columns rather than
	-- custom fields precisely BECAUSE this is a purpose-built table: under the
	-- old `assets` model they had to be per-org custom field definitions, so
	-- every new org started without them. Nullable, because on a building row
	-- (one with children) they mean nothing — the units carry them.
	bedrooms smallint,
	-- numeric, not an integer: half baths are the whole reason this field is
	-- ever discussed.
	bathrooms numeric(3, 1),
	square_feet integer,
	-- What the org believes it could rent for. NOT what anyone is paying —
	-- that is the lease's `rent_amount`, which is per tenancy and historical.
	market_rent numeric(12, 2),

	-- When the org took it on and when it let it go. Dates, not instants:
	-- nobody records the hour a building was bought.
	acquired_on date,
	disposed_on date,
	purchase_price numeric(12, 2),
	currency text not null default 'USD',

	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	-- Composite target, the companies trick, so leases (and later
	-- transactions) pin a child to a property in the same org.
	unique (id, org_id),
	unique (org_id, identifier),
	foreign key (parent_id, org_id) references public.properties (id, org_id) on delete cascade,
	constraint properties_name_not_blank check (length(trim(name)) > 0),
	constraint properties_not_own_parent check (parent_id is null or parent_id <> id),
	constraint properties_bedrooms_nonnegative check (bedrooms is null or bedrooms >= 0),
	constraint properties_bathrooms_nonnegative check (bathrooms is null or bathrooms >= 0),
	constraint properties_square_feet_positive check (square_feet is null or square_feet > 0),
	constraint properties_market_rent_nonnegative check (market_rent is null or market_rent >= 0),
	constraint properties_purchase_price_nonnegative
		check (purchase_price is null or purchase_price >= 0),
	constraint properties_currency_is_iso4217 check (currency ~ '^[A-Z]{3}$'),
	constraint properties_disposed_after_acquired
		check (acquired_on is null or disposed_on is null or disposed_on >= acquired_on)
);

comment on table public.properties is
	'A building, or a rentable unit inside one: a unit is a row with parent_id set. Depth is capped at two, so the building a row belongs to is coalesce(parent_id, id).';
comment on column public.properties.parent_id is
	'The building this unit belongs to, or null when this row is itself the building (a single-family is both).';
comment on column public.properties.market_rent is
	'What the org believes the unit could rent for. What someone actually pays is leases.rent_amount.';

create index properties_org_id_idx on public.properties (org_id);
create index properties_parent_id_idx on public.properties (org_id, parent_id);
create index properties_status_idx on public.properties (org_id, status);

create trigger properties_set_updated_at
	before update on public.properties
	for each row execute procedure public.set_updated_at();

-- The depth cap from decision 1. Two rows of guard, both needed: a unit may
-- not be parented to another unit, and a building that already has units may
-- not become one. Cross-row, so a check constraint cannot express it.
create function private.properties_enforce_depth()
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
		select 1 from public.properties p
		where p.id = new.parent_id and p.parent_id is not null
	) then
		raise exception 'a property may not be a unit of a unit: % already belongs to a building', new.parent_id
			using errcode = 'check_violation';
	end if;

	if exists (select 1 from public.properties c where c.parent_id = new.id) then
		raise exception 'property % has units of its own and cannot become a unit', new.id
			using errcode = 'check_violation';
	end if;

	return new;
end;
$$;

comment on function private.properties_enforce_depth() is
	'Keeps the property tree exactly two deep, which is what lets reports roll up with coalesce(parent_id, id) instead of a recursive CTE.';

create trigger properties_enforce_depth
	before insert or update of parent_id on public.properties
	for each row execute procedure private.properties_enforce_depth();

-- ---------------------------------------------------------------------------
-- leases
-- ---------------------------------------------------------------------------

create table public.leases (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- The thing being rented — a unit, or a whole single-family property. One
	-- column, because decision 1 made both the same kind of row.
	property_id uuid not null,

	-- The tenant, as a PARTY: a person renting a flat names the contact, a
	-- company renting a shop names the company, and a corporate let for a
	-- named employee names both. Same rule invoices and payments follow, and
	-- the reason a tenant needs no table of its own.
	company_id uuid,
	contact_id uuid,

	starts_on date not null,
	-- Inclusive, and null means month-to-month — see decision 2.
	ends_on date,
	rent_amount numeric(12, 2) not null,
	-- Day of the month rent falls due. Enough for "is this tenant late" once
	-- transactions exist; a full schedule (pro-rated first months, mid-term
	-- increases) is a rent_charges table and deliberately not this.
	rent_due_day smallint not null default 1,
	security_deposit numeric(12, 2),
	currency text not null default 'USD',
	notes text,

	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	unique (id, org_id),
	foreign key (property_id, org_id) references public.properties (id, org_id) on delete cascade,
	foreign key (company_id, org_id) references public.companies (id, org_id)
		on delete set null (company_id),
	foreign key (contact_id, org_id) references public.contacts (id, org_id)
		on delete set null (contact_id),
	constraint leases_has_tenant check (company_id is not null or contact_id is not null),
	constraint leases_ends_after_starts check (ends_on is null or ends_on >= starts_on),
	constraint leases_rent_nonnegative check (rent_amount >= 0),
	constraint leases_deposit_nonnegative check (security_deposit is null or security_deposit >= 0),
	constraint leases_rent_due_day_is_a_day check (rent_due_day between 1 and 31),
	constraint leases_currency_is_iso4217 check (currency ~ '^[A-Z]{3}$')
);

comment on table public.leases is
	'A tenancy: who rents a property, over what dates, at what rent. Whether it is running is a question about today, never a column.';
comment on column public.leases.ends_on is
	'The last day the tenancy covers (INCLUSIVE, unlike calendar_events.ends_at). Null is month-to-month, which is also what a holdover becomes.';

create index leases_org_id_idx on public.leases (org_id);
create index leases_property_id_idx on public.leases (org_id, property_id);
create index leases_contact_id_idx on public.leases (org_id, contact_id);
create index leases_company_id_idx on public.leases (org_id, company_id);
-- The rent roll's question: which leases cover a given day.
create index leases_term_idx on public.leases (org_id, starts_on, ends_on);

create trigger leases_set_updated_at
	before update on public.leases
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — CRM working data, the crm_core shape
-- ---------------------------------------------------------------------------
-- Members create and edit both; deletes stay owner/admin. A portfolio and its
-- tenancies are the working data of the whole org, not one person's.

alter table public.properties enable row level security;

create policy "Members can view properties"
	on public.properties for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create properties as themselves"
	on public.properties for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update properties"
	on public.properties for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete properties"
	on public.properties for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

alter table public.leases enable row level security;

create policy "Members can view leases"
	on public.leases for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create leases as themselves"
	on public.leases for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update leases"
	on public.leases for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete leases"
	on public.leases for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- `org_id` and `created_by` are insert-only, the house rule: a row may not be
-- moved between tenants or reattributed from the browser.

revoke insert, update on table public.properties from authenticated;
grant insert (org_id, parent_id, name, property_type, identifier, status, description,
		bedrooms, bathrooms, square_feet, market_rent, acquired_on, disposed_on,
		purchase_price, currency, created_by),
	update (parent_id, name, property_type, identifier, status, description,
		bedrooms, bathrooms, square_feet, market_rent, acquired_on, disposed_on,
		purchase_price, currency)
	on table public.properties to authenticated;

revoke insert, update on table public.leases from authenticated;
grant insert (org_id, property_id, company_id, contact_id, starts_on, ends_on, rent_amount,
		rent_due_day, security_deposit, currency, notes, created_by),
	update (property_id, company_id, contact_id, starts_on, ends_on, rent_amount,
		rent_due_day, security_deposit, currency, notes)
	on table public.leases to authenticated;

-- ---------------------------------------------------------------------------
-- The shared entity link — one branch each, never a second mechanism
-- ---------------------------------------------------------------------------

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
		when 'invoice' then exists (select 1 from public.invoices where id = entity and org_id = org)
		when 'lease' then exists (select 1 from public.leases where id = entity and org_id = org)
		when 'member' then exists (select 1 from public.organization_members where user_id = entity and org_id = org)
		when 'order' then exists (select 1 from public.orders where id = entity and org_id = org)
		when 'product' then exists (select 1 from public.products where id = entity and org_id = org)
		when 'property' then exists (select 1 from public.properties where id = entity and org_id = org)
		when 'proposal' then exists (select 1 from public.proposals where id = entity and org_id = org)
		when 'proposal_option' then exists (select 1 from public.proposal_options where id = entity and org_id = org)
		when 'purchase' then exists (select 1 from public.purchases where id = entity and org_id = org)
		when 'shipment' then exists (select 1 from public.shipments where id = entity and org_id = org)
		when 'task' then exists (select 1 from public.tasks where id = entity and org_id = org)
		when 'ticket' then exists (select 1 from public.support_tickets where id = entity and org_id = org)
		else false
	end
$$;

-- What happens when one goes: the one place that answers it, for every kind.
create trigger properties_on_crm_entity_deleted
	after delete on public.properties
	for each row execute procedure public.on_crm_entity_deleted('property');

create trigger leases_on_crm_entity_deleted
	after delete on public.leases
	for each row execute procedure public.on_crm_entity_deleted('lease');

-- ---------------------------------------------------------------------------
-- A property has an address, and pictures
-- ---------------------------------------------------------------------------
-- Both constraints are widened by REPLACEMENT, which is what each one's own
-- comment says to do rather than adding a second mechanism.
--
-- `addresses` was pinned to parties, which is why the assets-shaped portfolio
-- had no address and therefore no map pin and no geocoding. A property is the
-- one kind in this product whose address is the most important thing about
-- it, so this is the fix for that gap rather than a convenience.
--
-- A UNIT deliberately may carry its own address too: "Unit 2" at the same
-- street address is how a mailing address actually works, and forcing units
-- to inherit would make the common case the awkward one.
alter table public.addresses drop constraint addresses_entity_is_party;
alter table public.addresses
	add constraint addresses_entity_is_party_or_property
		check (entity_type in ('company', 'contact', 'property'));

comment on constraint addresses_entity_is_party_or_property on public.addresses is
	'Parties and properties have addresses. Widen by replacing this constraint, never by adding a second mechanism.';

alter table public.entity_images drop constraint entity_images_entity_is_asset;
alter table public.entity_images
	add constraint entity_images_entity_is_asset_or_property
		check (entity_type in ('asset', 'property'));

comment on constraint entity_images_entity_is_asset_or_property on public.entity_images is
	'Assets and properties have pictures. Widen by replacing this constraint, never by adding a second mechanism.';

-- ---------------------------------------------------------------------------
-- The features
-- ---------------------------------------------------------------------------
-- Unlike `assets`, which every vertical got because every vertical owns
-- things, these two are REAL-ESTATE ONLY: a dental practice has no leases.
-- The industry map below is therefore the only place they are turned on, and
-- every other industry resolves them `hidden` by the absence of a row.

insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('properties', 'Properties', 'property',
		'The portfolio: buildings, the units inside them, and what each one is worth.',
		'/properties', 'building-2', 'crm', 20),
	('leases', 'Leases', 'lease',
		'Who rents what, over what dates, at what rent — the rent roll.',
		'/leases', 'file-signature', 'crm', 22)
on conflict (id) do nothing;

-- No title of their own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('properties', 'properties', '/properties', null),
	('leases', 'leases', '/leases', null)
on conflict (id) do nothing;

-- Every plan. A portfolio you cannot see is not a product, and gating the
-- rent roll behind an upgrade would gate the reason someone signed up.
insert into public.tier_features (tier_id, feature_id)
select t.id, f.feature_id
from public.tiers t
cross join (values ('properties'), ('leases')) as f (feature_id)
on conflict (tier_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- Two system relationship types the portfolio wants
-- ---------------------------------------------------------------------------
-- `managed_by` and `responsible_for` already cover who runs a building: both
-- take null sides, so they accept 'property' the moment the enum value
-- exists. These two are the ones with no equivalent: the trade that services
-- a building, and the unit an asset is installed in — a dishwasher is an
-- `asset`, and it lives in a unit.
insert into public.relationship_types (id, key, forward_label, inverse_label, source_type, target_type) values
	('f0000000-0000-0000-0000-000000000031', 'services', 'services', 'serviced by', 'company', 'property'),
	('f0000000-0000-0000-0000-000000000032', 'located_at', 'located at', 'houses', 'asset', 'property')
on conflict (id) do nothing;

-- And `owns` is widened rather than duplicated. It shipped as (null →
-- 'asset'), which read as the whole truth while an asset was the only thing
-- an org could own; a property is the obvious second, and "owns" is plainly
-- the same relationship in both cases. Clearing `target_type` is the same
-- move as widening a check constraint — one mechanism, admitting a new kind —
-- and it is safe in the direction it goes: relaxing a side never invalidates
-- a row already stored under the stricter rule.
update public.relationship_types
set target_type = null
where id = 'f0000000-0000-0000-0000-000000000011' and target_type = 'asset';
