-- RMAs: goods coming back
-- ===========================================================================
-- An RMA — a return merchandise authorisation — is the org's answer to "can
-- I send this back": a numbered record that a customer's return was asked
-- for, agreed to, arrived, and was settled. It is the mirror of an order,
-- and like an order it is a document with a state that moves rather than a
-- row of fields somebody edits.
--
-- THE CUSTOMER IS A PARTY, the ledger's rule: `company_id` and `contact_id`
-- are both nullable and at least one is set, because a homeowner returning a
-- tarp belongs to no company and a hospital's buyer belongs to one.
--
-- WHAT IS NOT HERE, on purpose:
--
--   order_id       the order the goods came off. The `orders` table exists
--                  (the orders_and_shipments migration) but its feature and
--                  its pages do not, so nothing could pick one — and a
--                  nullable column nothing writes is dead weight. It lands
--                  with the Orders feature, as that migration's own closing
--                  note says its feature rows ship with its route.
--   rma_line_items which units are coming back, and what to restock. A
--                  restock is an inventory movement, and inventory does not
--                  move yet: `products.quantity_on_hand` is a number nothing
--                  decrements (that same migration says so about
--                  `quantity_reserved`). Lines that claimed to restock would
--                  be the same defect. They arrive with the movement.
--   credit         what the customer gets back. That is a payment of kind
--                  `refund` against their account, which the ledger already
--                  models — never a second copy of an amount here.
--
-- So this migration ships the header: who, why, how far along, and what was
-- decided. Working data like tickets: members raise and work them, deletes
-- stay owner/admin.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

-- The ladder a return climbs, plus the one bad end. `closed` is the finished
-- state whatever the outcome was — refunded, replaced, credited — because
-- WHAT was done is `resolution`, in the org's own words, and a second closed
-- state per outcome is how a status column stops being honest (the task
-- board's `cancelled` reasoning).
create type public.rma_status as enum ('requested', 'approved', 'received', 'closed', 'rejected');

create table public.rmas (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- The number the customer is told to write on the box. Assigned by the
	-- database (below) and not grantable: a document number a client can
	-- choose collides — the invoices rule. The blank default is that rule's
	-- other half (the ledger migration): the column is not grantable, so an
	-- insert must be able to leave it out, and `assign_rma_number()` already
	-- treats blank as "assign the next". It also stops the column being
	-- required in the generated types.
	number text not null default '',
	company_id uuid,
	contact_id uuid,
	status public.rma_status not null default 'requested',
	-- Why it is coming back, in the customer's words.
	reason text,
	-- What was done about it, in the org's. Filled in on the way to `closed`.
	resolution text,
	requested_on date not null default current_date,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Composite, so a return can only name this org's customer.
	constraint rmas_company_id_org_id_fkey
		foreign key (company_id, org_id) references public.companies (id, org_id)
		on delete set null (company_id),
	constraint rmas_contact_id_org_id_fkey
		foreign key (contact_id, org_id) references public.contacts (id, org_id)
		on delete set null (contact_id),
	-- Composite target for the line items that arrive with inventory movement.
	unique (id, org_id),
	unique (org_id, number),
	constraint rmas_has_a_customer check (company_id is not null or contact_id is not null)
);

comment on table public.rmas is
	'A return authorisation: goods coming back from a customer, and how far back they are. The header only — which units, and the credit for them, wait for inventory movement and the ledger respectively.';
comment on column public.rmas.number is
	'The number the customer writes on the box. Assigned by trigger and not grantable to clients.';
comment on column public.rmas.resolution is
	'What was done about the return, in the org''s own words — refunded, replaced, credited. The status says only that it is closed.';

create index rmas_org_id_idx on public.rmas (org_id);
-- The list page: an org's returns, newest first.
create index rmas_org_id_created_at_idx on public.rmas (org_id, created_at desc);
create index rmas_company_id_idx on public.rmas (company_id);
create index rmas_contact_id_idx on public.rmas (contact_id);

create trigger rmas_set_updated_at
	before update on public.rmas
	for each row execute procedure public.set_updated_at();

-- A sequence, not a per-org counter table — the reasoning is on
-- `purchase_number_seq` in the vendors-and-purchasing migration: the number
-- is an identifier, not a count, and a counter table serialises every insert.
create sequence public.rma_number_seq start with 1;

create function public.assign_rma_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.number is null or length(trim(new.number)) = 0 then
		new.number := 'RMA-' || lpad(nextval('public.rma_number_seq')::text, 5, '0');
	end if;
	return new;
end;
$$;

create trigger rmas_assign_number
	before insert on public.rmas
	for each row execute procedure public.assign_rma_number();

-- ---------------------------------------------------------------------------
-- The shared polymorphic link learns about returns
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
		when 'coupon' then exists (select 1 from public.coupons where id = entity and org_id = org)
		when 'deal' then exists (select 1 from public.deals where id = entity and org_id = org)
		when 'invoice' then exists (select 1 from public.invoices where id = entity and org_id = org)
		when 'member' then exists (select 1 from public.organization_members where user_id = entity and org_id = org)
		when 'order' then exists (select 1 from public.orders where id = entity and org_id = org)
		when 'product' then exists (select 1 from public.products where id = entity and org_id = org)
		when 'proposal' then exists (select 1 from public.proposals where id = entity and org_id = org)
		when 'proposal_option' then exists (select 1 from public.proposal_options where id = entity and org_id = org)
		when 'purchase' then exists (select 1 from public.purchases where id = entity and org_id = org)
		when 'rma' then exists (select 1 from public.rmas where id = entity and org_id = org)
		when 'shipment' then exists (select 1 from public.shipments where id = entity and org_id = org)
		when 'task' then exists (select 1 from public.tasks where id = entity and org_id = org)
		when 'ticket' then exists (select 1 from public.support_tickets where id = entity and org_id = org)
		else false
	end
$$;

create trigger rmas_crm_entity_deleted
	after delete on public.rmas
	for each row execute procedure public.on_crm_entity_deleted('rma');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.rmas enable row level security;

create policy "Members can view rmas"
	on public.rmas for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create rmas as themselves"
	on public.rmas for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update rmas"
	on public.rmas for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete rmas"
	on public.rmas for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- `number` is the database's, and org_id and authorship are immutable from
-- the browser.

revoke insert, update on table public.rmas from authenticated;
grant insert (org_id, company_id, contact_id, status, reason, resolution, requested_on, created_by),
	update (company_id, contact_id, status, reason, resolution, requested_on)
	on table public.rmas to authenticated;

-- ---------------------------------------------------------------------------
-- The feature
-- ---------------------------------------------------------------------------

-- Filed under CRM with the other things that have a state that moves, after
-- tickets and before the graph.
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('rmas', 'Returns', 'return',
		'Goods coming back from a customer: asked for, agreed, arrived, settled.',
		'/rmas', 'rotate-ccw', 'crm', 1150)
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('rmas', 'rmas', '/rmas', null)
on conflict (id) do nothing;

-- The verticals that ship goods and get them back. A practice and a roofer
-- do not take a crown or a roof back, so the feature is `hidden` for them.
insert into public.industry_features (industry_id, feature_id, name, noun) values
	('crm', 'rmas', null, null),
	-- A distributor calls the paperwork an RMA. `noun` is lower case by
	-- constraint (the feature_names_by_industry migration) — it is the word a
	-- sentence uses, "3 rmas", not a heading.
	('medical-supplies', 'rmas', 'RMAs', 'rma'),
	('beverage', 'rmas', null, null)
on conflict (industry_id, feature_id) do nothing;

-- Every plan: if you sell goods you take them back.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'rmas'),
	('pro', 'rmas'),
	('enterprise', 'rmas')
on conflict (tier_id, feature_id) do nothing;

-- Whoever a role lets work tickets may work returns, at the same level: a
-- return arrives the way a complaint does, through whoever answers the
-- customer.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'rmas', rp.level
from public.role_permissions rp
where rp.feature_id = 'tickets'
on conflict (role_id, feature_id) do nothing;

-- The two verticals that have it also order their whole CRM section
-- themselves (the industry_feature_order migration), so the newcomer needs a
-- place in each — a section with some rows ordered and the rest inheriting
-- reads as two interleaved lists.
update public.industry_features as f
set sort_order = v.sort_order
from (values
	('medical-supplies', 'rmas', 1000),
	('beverage', 'rmas', 1000)
) as v (industry_id, feature_id, sort_order)
where f.industry_id = v.industry_id and f.feature_id = v.feature_id;

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------
-- The number first and searchable, the customer beside it and filterable,
-- the state filterable, the reason searched. The resolution is worth
-- searching but not a column — it is a sentence, not a value.

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('rmas', 'name', true, true, false, 100),
	('rmas', 'company', true, true, true, 200),
	('rmas', 'contact', true, true, true, 300),
	('rmas', 'status', true, false, true, 400),
	('rmas', 'requested_on', true, false, false, 500),
	('rmas', 'reason', true, true, false, 600),
	('rmas', 'resolution', false, true, false, 700),
	('rmas', 'created_at', false, false, false, 800)
on conflict (feature_id, field) do nothing;

-- Next: npm run db:reset (proves it replays onto an empty database), then
-- npm run db:types and commit the regenerated src/lib/database.types.ts.
