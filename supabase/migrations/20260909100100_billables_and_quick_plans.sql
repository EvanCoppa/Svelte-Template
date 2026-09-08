-- Billables and quick plans: what a proposal option is made of, and the
-- bundles that fill one in a click.
--
-- The products catalog is what an org SELLS — goods and services with a
-- price, inventory, a category tree. A billable is what an org CHARGES FOR
-- on a proposal: a dental procedure with its CDT code, a roofing labor line,
-- a consultation. The two overlap in a shop and diverge everywhere else
-- (a practice's fee schedule is not its retail shelf), so they are two
-- tables and two features, and a proposal line cites whichever it came
-- from. Ported from Yes Smile's `billables` (code, description, cost,
-- delimiter, is_displayed) and `quick_plans` + `quick_plan_billables`:
--
--   billables            one chargeable line: an optional code, a name, a
--                        unit price, the unit it is counted in, and —
--                        generalising the dental "teeth / quadrant / arch"
--                        input — either a fixed set of unit choices the
--                        builder offers as chips, or free-text units.
--                        `is_featured` = Yes Smile's `is_displayed`: shown
--                        as a checkbox on every option rather than found
--                        by search.
--   quick_plans          a named bundle of billables; picking one on an
--                        option replaces its billable lines with the
--                        bundle's, keeping any product lines.
--   quick_plan_billables the bundle's members, in order.
--
-- A proposal line item learns to cite a billable (`billable_id`, provenance
-- exactly like `product_id`) and to carry the units it was counted in
-- (`detail`, "12, 13" or "UR, UL"): `quantity` is the number of units and
-- `unit_cost` the snapshot price, so repricing the fee schedule never
-- rewrites a plan that was already presented.
--
-- Tenancy follows the product catalog: working data, member-writable,
-- owner/admin delete, column grants keep org_id and authorship immutable.
-- Both are features (docs/features.md) named by the industry — a dentist
-- has "Procedures" and "Quick plans", a roofer "Services" and "Packages".

-- ---------------------------------------------------------------------------
-- billables — the fee schedule
-- ---------------------------------------------------------------------------

create table public.billables (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- The org's own code for it (a CDT code, a service code). Optional but
	-- unique within the org when set, like products.sku.
	code text,
	name text not null,
	description text,
	-- What one unit is charged at. Money as numeric, never float.
	unit_price numeric(12, 2) not null default 0,
	currency text not null default 'USD',
	-- What one of it is: 'tooth', 'quadrant', 'sq ft', 'visit'. Free text,
	-- for the same reason products.unit is.
	unit text,
	-- The units the builder offers as chips ('UR', 'UL', 'BR', 'BL'; 'Upper',
	-- 'Lower'). Null means the units are typed in ("12, 13, 15-18") and each
	-- token counts one. A line's quantity is the number of units either way.
	unit_choices text[],
	-- Shown as a checkbox on every option of the builder; everything else is
	-- found through the search box. Yes Smile's is_displayed.
	is_featured boolean not null default false,
	is_active boolean not null default true,
	sort_order integer not null default 0,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Composite target for proposal_line_items and quick_plan_billables.
	unique (id, org_id),
	constraint billables_name_not_blank check (length(trim(name)) > 0),
	constraint billables_unit_price_nonnegative check (unit_price >= 0),
	constraint billables_currency_is_iso4217 check (currency ~ '^[A-Z]{3}$'),
	constraint billables_unit_choices_not_empty
		check (unit_choices is null or array_length(unit_choices, 1) > 0)
);

comment on table public.billables is
	'One chargeable line an org puts on a proposal — a procedure, a service, a labor line — with its code, unit price and how its units are counted. The fee schedule, as distinct from the products catalog.';
comment on column public.billables.unit_choices is
	'The units the builder offers as chips (UR/UL/BR/BL, Upper/Lower). Null: units are typed in and each token counts one.';
comment on column public.billables.is_featured is
	'Shown as a checkbox on every option of the proposal builder; the rest of the schedule is found by search.';

create index billables_org_id_idx on public.billables (org_id);
-- The builder: an org's live billables, featured first, by name.
create index billables_org_id_is_active_name_idx on public.billables (org_id, is_active, name);

create unique index billables_org_id_code_idx
	on public.billables (org_id, lower(code))
	where code is not null;

create trigger billables_set_updated_at
	before update on public.billables
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- quick_plans — bundles of billables
-- ---------------------------------------------------------------------------

create table public.quick_plans (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	name text not null,
	sort_order integer not null default 0,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (org_id, name),
	-- Composite target: a bundle's members must be this org's.
	unique (id, org_id),
	constraint quick_plans_name_not_blank check (length(trim(name)) > 0)
);

comment on table public.quick_plans is
	'A named bundle of billables that fills a proposal option in one click. Picking one replaces the option''s billable lines; product lines are kept.';

create index quick_plans_org_id_idx on public.quick_plans (org_id);

create trigger quick_plans_set_updated_at
	before update on public.quick_plans
	for each row execute procedure public.set_updated_at();

create table public.quick_plan_billables (
	quick_plan_id uuid not null,
	billable_id uuid not null,
	org_id uuid not null references public.organizations (id) on delete cascade,
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	primary key (quick_plan_id, billable_id),
	-- Both composite: a bundle can only hold its own org's billables, and a
	-- retired billable leaves every bundle it was in.
	foreign key (quick_plan_id, org_id) references public.quick_plans (id, org_id) on delete cascade,
	foreign key (billable_id, org_id) references public.billables (id, org_id) on delete cascade
);

comment on table public.quick_plan_billables is
	'The billables a quick plan bundles, in order.';

create index quick_plan_billables_org_id_idx on public.quick_plan_billables (org_id);
create index quick_plan_billables_billable_id_idx on public.quick_plan_billables (billable_id);

-- ---------------------------------------------------------------------------
-- proposal_line_items cite the fee schedule and count their units
-- ---------------------------------------------------------------------------

-- Provenance, like product_id: the line keeps its own label and unit_cost.
-- A line came from the schedule, from the catalog, or was typed in — never
-- from both.
alter table public.proposal_line_items
	add column billable_id uuid,
	add column detail text,
	add constraint proposal_line_items_billable_id_org_id_fkey
		foreign key (billable_id, org_id) references public.billables (id, org_id)
		on delete set null (billable_id),
	add constraint proposal_line_items_one_citation
		check (product_id is null or billable_id is null);

create index proposal_line_items_billable_id_idx on public.proposal_line_items (billable_id);

comment on column public.proposal_line_items.billable_id is
	'The fee-schedule entry this line came from, if any. Provenance only — label and unit_cost are snapshots taken when the line was written.';
comment on column public.proposal_line_items.detail is
	'The units the line was counted in, as entered: "12, 13" (teeth), "UR, UL" (quadrants), "north slope". quantity is how many that is.';

-- ---------------------------------------------------------------------------
-- The shared polymorphic link learns about billables
-- ---------------------------------------------------------------------------

-- The 'billable' value shipped in the previous migration; this is the branch
-- that makes it resolvable, so tags and custom fields can point at one.
create or replace function private.crm_entity_exists(org uuid, kind public.crm_entity_type, entity uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select case kind
		when 'billable' then exists (select 1 from public.billables where id = entity and org_id = org)
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

-- Line items drop their citation through the foreign key above; the one
-- cleanup function takes the tags, activities and custom values.
create trigger billables_crm_entity_deleted
	after delete on public.billables
	for each row execute procedure public.on_crm_entity_deleted('billable');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Working data, exactly like products: the members who build proposals keep
-- the schedule and the bundles current. Deletes stay owner/admin.

alter table public.billables enable row level security;
alter table public.quick_plans enable row level security;
alter table public.quick_plan_billables enable row level security;

create policy "Members can view billables"
	on public.billables for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create billables as themselves"
	on public.billables for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update billables"
	on public.billables for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete billables"
	on public.billables for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

create policy "Members can view quick plans"
	on public.quick_plans for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create quick plans as themselves"
	on public.quick_plans for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update quick plans"
	on public.quick_plans for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete quick plans"
	on public.quick_plans for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- A bundle's members change whenever the bundle is edited, so members may
-- replace them; the bundle row itself is what deletes are gated on.
create policy "Members can view quick plan billables"
	on public.quick_plan_billables for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can add billables to quick plans"
	on public.quick_plan_billables for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can remove billables from quick plans"
	on public.quick_plan_billables for delete to authenticated
	using (private.org_role(org_id) is not null);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

revoke insert, update on table public.billables from authenticated;
grant insert (org_id, code, name, description, unit_price, currency, unit, unit_choices,
		is_featured, is_active, sort_order, created_by),
	update (code, name, description, unit_price, currency, unit, unit_choices, is_featured,
		is_active, sort_order)
	on table public.billables to authenticated;

revoke insert, update on table public.quick_plans from authenticated;
grant insert (org_id, name, sort_order, created_by),
	update (name, sort_order)
	on table public.quick_plans to authenticated;

-- Membership rows are replaced, never edited in place.
revoke insert, update on table public.quick_plan_billables from authenticated;
grant insert (quick_plan_id, billable_id, org_id, sort_order)
	on table public.quick_plan_billables to authenticated;

-- Both citations are set when the line is written and cleared by their own
-- foreign keys; the units may be corrected afterwards.
revoke insert, update on table public.proposal_line_items from authenticated;
grant insert (org_id, proposal_option_id, product_id, billable_id, label, quantity, unit_cost,
		detail, sort_order),
	update (label, quantity, unit_cost, detail, sort_order)
	on table public.proposal_line_items to authenticated;

-- ---------------------------------------------------------------------------
-- The features
-- ---------------------------------------------------------------------------

insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('billables', 'Billables', 'billable',
		'What you charge for on a proposal: the fee schedule, with codes and unit prices.',
		'/billables', 'receipt-text', 'platform', 26),
	('quick-plans', 'Quick plans', 'quick plan',
		'Bundles of billables that fill a proposal option in one click.',
		'/quick-plans', 'layers', 'platform', 27)
on conflict (id) do nothing;

-- No title of their own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('billables', 'billables', '/billables', null),
	('quick-plans', 'quick-plans', '/quick-plans', null)
on conflict (id) do nothing;

-- Every industry charges for something and repeats itself; each says it in
-- its own words (null inherits the feature's).
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('crm', 'billables', null, null),
	('roofing', 'billables', 'Services', 'service'),
	('medical-supplies', 'billables', 'Billable items', 'billable item'),
	('cosmetic', 'billables', 'Services', 'service'),
	('dentistry', 'billables', 'Procedures', 'procedure'),
	('beverage', 'billables', 'Line items', 'line item'),
	('crm', 'quick-plans', 'Bundles', 'bundle'),
	('roofing', 'quick-plans', 'Packages', 'package'),
	('medical-supplies', 'quick-plans', 'Order templates', 'order template'),
	('cosmetic', 'quick-plans', 'Treatment packages', 'treatment package'),
	('dentistry', 'quick-plans', null, null),
	('beverage', 'quick-plans', 'Standing orders', 'standing order')
on conflict (industry_id, feature_id) do nothing;

-- Every plan, like proposals: the builder is useless without its schedule.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'billables'),
	('pro', 'billables'),
	('enterprise', 'billables'),
	('free', 'quick-plans'),
	('pro', 'quick-plans'),
	('enterprise', 'quick-plans')
on conflict (tier_id, feature_id) do nothing;

-- Whoever a role lets work proposals may keep the schedule and the bundles
-- at the same level — derived, the way proposals inherited deals.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, f.feature_id, rp.level
from public.role_permissions rp
cross join (values ('billables'), ('quick-plans')) as f (feature_id)
where rp.feature_id = 'proposals'
on conflict (role_id, feature_id) do nothing;
