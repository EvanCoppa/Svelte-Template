-- Vendors and purchasing: what the org buys, from whom, at what cost.
--
-- A distributor's money has two sides. Everything the template ships today is
-- the sell side — a catalog, a proposal, a decision. This is the buy side, and
-- it is deliberately the mirror image of the sell side rather than a new
-- vocabulary:
--
--   companies (vendor terms)  a supplier is NOT a second party table. It is a
--                             company you happen to buy from, so the terms you
--                             buy on are three nullable columns on the row you
--                             already have.
--   company_relationships     every role a company plays for this org, as a
--                             SET — one company is often both a customer and a
--                             supplier, which a single enum column cannot say.
--   purchases                 one order placed with one vendor.
--   purchase_line_items       what was ordered, and how much of it actually
--                             showed up.
--
-- Three decisions worth stating, because copying them is cheaper than
-- rediscovering them:
--
-- 1. COST IS FOUR DECIMALS, MONEY IS TWO. A distributor buys at $0.0825/each
--    and sells at $1.19; rounding the cost to cents at the line makes margin
--    reporting wrong in the fourth digit and nobody ever finds out why. So
--    `unit_cost` is numeric(14, 4) everywhere (including `products.unit_cost`,
--    widened below) and every extended total is numeric(12, 2), rounded once.
--
-- 2. A LINE KEEPS ITS OWN LABEL AND COST. `product_id` is provenance, exactly
--    as `proposal_line_items.product_id` is (the product-catalog migration):
--    repricing the catalog in April must not rewrite a PO placed in March.
--    Retiring the product clears the citation and leaves the line intact.
--
-- 3. DERIVED STATE IS THE DATABASE'S. `subtotal` follows the lines and the
--    receipt status follows what arrived, both by trigger; `total` is a
--    generated column. None of the three is grantable, so no client can write
--    a number that disagrees with the rows under it.
--
-- What this migration deliberately does NOT do is listed in the closing
-- comment — read it before adding to this file.

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

-- Where the goods are. `partially_received` exists because a distributor's
-- normal case is a split delivery, not an exception: without it, a PO with
-- nine of ten cases on the shelf is indistinguishable from one nobody has
-- touched. Vocabularies we own stay enums (the pipelines rule) — every org
-- receives goods the same way, unlike a deal board.
create type public.purchase_status as enum (
	'draft',
	'ordered',
	'partially_received',
	'received',
	'cancelled'
);

-- How much of a document is settled. Deliberately a second axis from where the
-- goods are: they arrive and the bill gets paid on unrelated clocks, and
-- collapsing the two is how you end up unable to answer "what have we received
-- but not paid for".
--
-- Not named for purchases: an invoice, and later an order, ask exactly this
-- question of exactly these three answers, and one vocabulary beats three
-- identical ones (CLAUDE.md rule 1). Anything above `total` still reads as
-- 'paid'; the overage shows as a negative balance rather than a fourth state
-- nothing would branch on.
create type public.payment_state as enum ('unpaid', 'partial', 'paid');

-- ---------------------------------------------------------------------------
-- companies learns the terms you buy on
-- ---------------------------------------------------------------------------

-- Nullable columns on `companies`, not a `suppliers` table and not a
-- `company_supplier_profiles` side table. The party-model migration's rule is
-- that a company is one row whichever side of the business it sits on, and the
-- product catalog's precedent is that the attributes only one kind of row uses
-- (`track_inventory`, `quantity_on_hand`) are nullable columns on the shared
-- table. Three columns do not earn a join.
--
-- They carry no CHECK tying them to `relationship = 'supplier'` on purpose: a
-- company you buy from today may be one you sell to tomorrow, and the moment
-- relationships become a set (see the closing comment) a check written against
-- that single column would have to be dropped again.
alter table public.companies
	add column vendor_account_number text,
	add column payment_terms_days integer,
	add column distribution_fee_pct numeric(6, 4),
	add constraint companies_payment_terms_days_nonnegative
		check (payment_terms_days is null or payment_terms_days >= 0),
	add constraint companies_distribution_fee_pct_is_fraction
		check (distribution_fee_pct is null or distribution_fee_pct between 0 and 1);

comment on column public.companies.vendor_account_number is
	'The account number this vendor knows the org by. Null for a company the org does not buy from.';
comment on column public.companies.payment_terms_days is
	'Net terms the vendor bills on: 30 means net-30. Used to derive a purchase due date.';
comment on column public.companies.distribution_fee_pct is
	'The vendor''s distribution fee, as a FRACTION (0.0250 = 2.5%) — every rate in this schema is a fraction, never a percent.';

-- Cost gets two more decimals, for the reason in the header. Widening
-- numeric(12, 2) to numeric(14, 4) keeps every existing value and every
-- existing integer digit, so no data is at risk and the check constraint on
-- the column stands unchanged.
alter table public.products
	alter column unit_cost type numeric(14, 4);

comment on column public.products.unit_cost is
	'Default landed cost of one unit, four decimals. A per-vendor cost belongs on a product/vendor table when sourcing needs one.';

-- ---------------------------------------------------------------------------
-- company_relationships — every role a company plays for this org
-- ---------------------------------------------------------------------------

-- A company is not one thing to you. A distributor buys gloves from a company
-- that also buys gauze from it; a freight broker is a supplier and a partner.
-- `companies.relationship` is a single enum column and therefore cannot say
-- that, so the roles become a SET: one row per role a company plays.
--
-- Deliberately a mapping table rather than the roles being columns or an
-- array: a role is a thing you filter and join on ("every supplier"), an array
-- needs a GIN index and its own operators to do that, and a column per role
-- grows forever.
--
-- The vocabulary stays `public.company_relationship` — the enum this template
-- already owns (the pipelines rule: sets an org defines are rows, vocabularies
-- we own are enums). Adding a role a distributor needs — carrier, manufacturer,
-- broker — is one `alter type ... add value` in its own migration, so none are
-- invented here on speculation.
create table public.company_relationships (
	company_id uuid not null,
	relationship public.company_relationship not null,
	org_id uuid not null references public.organizations (id) on delete cascade,
	created_at timestamptz not null default now(),
	-- The pair IS the fact, so it is the key: a company cannot hold the same
	-- role twice, and no surrogate id is needed to say so.
	primary key (company_id, relationship),
	foreign key (company_id, org_id) references public.companies (id, org_id) on delete cascade
);

comment on table public.company_relationships is
	'Every role a company plays for this org — customer, supplier, partner. A set, because one company is often several of them.';

create index company_relationships_org_id_idx on public.company_relationships (org_id);
-- "every supplier", "every customer" — the query this table exists for.
create index company_relationships_org_id_relationship_idx
	on public.company_relationships (org_id, relationship);

-- ---------------------------------------------------------------------------
-- Backfill, and the sync that keeps the two in step until the column goes
-- ---------------------------------------------------------------------------

-- Expand/contract, deliberately paused at expand. `companies.relationship` is
-- read in 23 app files — including the `views` filter compiler, which offers
-- both a `relationship` condition and a `company.relationship` hop — so
-- dropping it now would be a refactor of a subsystem this change has no other
-- reason to touch.
--
-- Until then the COLUMN is authoritative and this table mirrors it, so there
-- is exactly one place a role is written and no chance of the two disagreeing.
-- The contract step is: rework the views filter and `listCompanies` to read
-- this table, then drop the column, this trigger and this function together.
insert into public.company_relationships (company_id, relationship, org_id)
select c.id, c.relationship, c.org_id
from public.companies c
on conflict (company_id, relationship) do nothing;

create function public.sync_company_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.company_relationships (company_id, relationship, org_id)
	values (new.id, new.relationship, new.org_id)
	on conflict (company_id, relationship) do nothing;
	return null;
end;
$$;

comment on function public.sync_company_relationship() is
	'Mirrors companies.relationship into company_relationships. Temporary: drop it with the column when the app reads the table instead.';

create trigger companies_sync_relationship
	after insert or update of relationship on public.companies
	for each row execute procedure public.sync_company_relationship();

-- ---------------------------------------------------------------------------
-- Purchase order numbers
-- ---------------------------------------------------------------------------

-- A sequence, not a per-org counter table. The number is a FACADE: every
-- foreign key in this schema targets `id`, nothing joins on `number`, and the
-- label exists so a person can say it on the phone. What it must be is unique,
-- stable once sent, and sequential enough for an accountant — which a sequence
-- gives for the price of one line.
--
-- The tradeoff, stated: a sequence is a global object, so a second org's first
-- purchase order continues this org's numbering rather than starting at one.
-- That matters when two orgs share a database and not before; per-org
-- numbering is a counter table, and it can replace this without touching a
-- column, a grant or a trigger signature.
create sequence public.purchase_number_seq start with 1;

-- ---------------------------------------------------------------------------
-- purchases — one order placed with one vendor
-- ---------------------------------------------------------------------------

create table public.purchases (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	company_id uuid not null,
	-- Assigned by trigger from the org's counter. Not grantable: a document
	-- number a client can choose is a document number that collides.
	number text not null,
	status public.purchase_status not null default 'draft',
	payment_status public.payment_state not null default 'unpaid',
	-- The vendor's own reference — their order number or invoice number, so a
	-- statement can be reconciled without opening the PO.
	reference text,

	currency text not null default 'USD',
	-- Follows the line items, by trigger. Never written by a client.
	subtotal numeric(12, 2) not null default 0,
	freight numeric(12, 2) not null default 0,
	-- Snapshot of the vendor's fee at the moment the PO was placed, and the
	-- money it came to. Both stored, for the reason `proposal_options` keeps
	-- `fee_override`: renegotiating the vendor's rate next quarter must not
	-- restate what this order cost.
	distribution_fee_pct numeric(6, 4),
	distribution_fee numeric(12, 2) not null default 0,
	tax numeric(12, 2) not null default 0,

	ordered_at timestamptz,
	-- What the vendor promised. Null until they say.
	expected_at timestamptz,
	-- Stamped by the receipt rollup when the last line lands; cleared if a
	-- correction takes the order back to partially received.
	received_at timestamptz,
	due_date date,
	paid_at timestamptz,

	notes text,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	-- Generated, so the arithmetic cannot drift from the parts. Recomputes
	-- whenever the trigger moves `subtotal` or a client edits a fee.
	total numeric(12, 2) generated always as (
		round(subtotal + freight + distribution_fee + tax, 2)
	) stored,

	-- RESTRICT, not cascade: deleting a vendor you have bought from would take
	-- the financial record with it. The vendor has to be emptied of history
	-- first, which is the point.
	foreign key (company_id, org_id) references public.companies (id, org_id) on delete restrict,
	unique (id, org_id),
	unique (org_id, number),
	constraint purchases_freight_nonnegative check (freight >= 0),
	constraint purchases_distribution_fee_nonnegative check (distribution_fee >= 0),
	constraint purchases_tax_nonnegative check (tax >= 0),
	constraint purchases_subtotal_nonnegative check (subtotal >= 0),
	constraint purchases_distribution_fee_pct_is_fraction
		check (distribution_fee_pct is null or distribution_fee_pct between 0 and 1),
	constraint purchases_currency_is_iso4217 check (currency ~ '^[A-Z]{3}$')
);

comment on table public.purchases is
	'One order placed with one vendor. subtotal follows its lines and total is generated; status is where the goods are, payment_status where the money is.';
comment on column public.purchases.distribution_fee_pct is
	'The vendor fee rate as a FRACTION, snapshotted when the order was placed. Provenance, like a line''s unit_cost.';
comment on column public.purchases.received_at is
	'When the last outstanding line landed. Maintained by the receipt rollup, not by hand.';

create index purchases_org_id_idx on public.purchases (org_id);
create index purchases_company_id_idx on public.purchases (company_id);
-- The list page: an org's orders by status, newest first.
create index purchases_org_id_status_ordered_at_idx
	on public.purchases (org_id, status, ordered_at desc);
-- The payables view: what is owed and when.
create index purchases_org_id_payment_status_due_date_idx
	on public.purchases (org_id, payment_status, due_date);

create trigger purchases_set_updated_at
	before update on public.purchases
	for each row execute procedure public.set_updated_at();

create function public.assign_purchase_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.number is null or length(trim(new.number)) = 0 then
		new.number := 'PO-' || lpad(nextval('public.purchase_number_seq')::text, 5, '0');
	end if;
	return new;
end;
$$;

-- BEFORE INSERT, so the NOT NULL on `number` is satisfied by the time the
-- constraint is checked and a client never has to name the column.
create trigger purchases_assign_number
	before insert on public.purchases
	for each row execute procedure public.assign_purchase_number();

-- ---------------------------------------------------------------------------
-- purchase_line_items — what was ordered, and what arrived
-- ---------------------------------------------------------------------------

create table public.purchase_line_items (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	purchase_id uuid not null,
	-- Provenance only (header, decision 2). Null for a line typed in by hand —
	-- a pallet fee, a one-off part the catalog has never heard of.
	product_id uuid,
	-- Snapshots. `description` is the line's own label and is NOT NULL, so a
	-- line always says what it is even after the product behind it is gone.
	description text not null,
	product_sku_snapshot text,
	quantity_ordered numeric(14, 4) not null default 1,
	-- Deliberately unbounded above `quantity_ordered`: vendors over-ship, and
	-- a constraint that calls the real world invalid just moves the lie into
	-- a second adjustment line.
	quantity_received numeric(14, 4) not null default 0,
	unit_cost numeric(14, 4) not null default 0,
	-- This line's share of purchases.freight, for landed cost. The two are not
	-- reconciled by constraint — a cross-table sum is not expressible as a
	-- CHECK — so the allocation is the form action's job.
	freight_allocation numeric(12, 2) not null default 0,
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	-- Rounded once, here, so every downstream sum agrees to the cent.
	line_total numeric(12, 2) generated always as (
		round(quantity_ordered * unit_cost, 2)
	) stored,
	-- What a unit actually cost once freight is spread over it. Null on a
	-- zero-quantity line rather than a division error.
	landed_unit_cost numeric(14, 4) generated always as (
		case when quantity_ordered > 0
			then round((round(quantity_ordered * unit_cost, 2) + freight_allocation) / quantity_ordered, 4)
		end
	) stored,

	foreign key (purchase_id, org_id) references public.purchases (id, org_id) on delete cascade,
	foreign key (product_id, org_id) references public.products (id, org_id)
		on delete set null (product_id),
	-- Composite target for the receipt rows a later migration will hang here.
	unique (id, org_id),
	constraint purchase_line_items_description_not_blank
		check (length(trim(description)) > 0),
	constraint purchase_line_items_quantity_ordered_positive
		check (quantity_ordered > 0),
	constraint purchase_line_items_quantity_received_nonnegative
		check (quantity_received >= 0),
	constraint purchase_line_items_unit_cost_nonnegative
		check (unit_cost >= 0),
	constraint purchase_line_items_freight_allocation_nonnegative
		check (freight_allocation >= 0)
);

comment on table public.purchase_line_items is
	'One line of a purchase order. quantity_received is what actually arrived; a discrepancy is the difference, not a separate table.';
comment on column public.purchase_line_items.product_id is
	'The catalog entry this line came from, if any. Provenance only — description and unit_cost are snapshots taken when the line was written.';
comment on column public.purchase_line_items.landed_unit_cost is
	'unit_cost plus this line''s share of freight, per unit. Generated; what inventory should be valued at on receipt.';

create index purchase_line_items_org_id_idx on public.purchase_line_items (org_id);
create index purchase_line_items_purchase_id_sort_order_idx
	on public.purchase_line_items (purchase_id, sort_order);
create index purchase_line_items_product_id_idx on public.purchase_line_items (product_id);

create trigger purchase_line_items_set_updated_at
	before update on public.purchase_line_items
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Derived state: the purchase follows its lines
-- ---------------------------------------------------------------------------

-- One function, not two, because both answers come from the same scan of the
-- same rows: what the lines add up to, and how much of them arrived.
--
-- The status half only ever moves an order that is already in flight. `draft`
-- is a human decision (you place the order; receiving does not place it for
-- you) and `cancelled` is terminal, so neither is advanced here — but their
-- subtotal still follows, because a draft whose total disagrees with its lines
-- is a bug you find at the worst moment.
create function public.refresh_purchase_rollups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	target uuid;
	current_status public.purchase_status;
	next_status public.purchase_status;
	line_count integer;
	all_received boolean;
	any_received boolean;
	line_subtotal numeric(12, 2);
begin
	target := case tg_op when 'DELETE' then old.purchase_id else new.purchase_id end;

	select p.status into current_status
	from public.purchases p
	where p.id = target;

	-- The parent went first (a cascading delete of the whole order).
	if current_status is null then
		return null;
	end if;

	select
		count(*),
		coalesce(bool_and(l.quantity_received >= l.quantity_ordered), false),
		coalesce(bool_or(l.quantity_received > 0), false),
		coalesce(sum(l.line_total), 0)
	into line_count, all_received, any_received, line_subtotal
	from public.purchase_line_items l
	where l.purchase_id = target;

	if current_status not in ('ordered', 'partially_received', 'received') then
		update public.purchases
		set subtotal = line_subtotal
		where id = target;
		return null;
	end if;

	next_status := case
		when line_count = 0 then 'ordered'
		when all_received then 'received'
		when any_received then 'partially_received'
		else 'ordered'
	end;

	update public.purchases
	set
		subtotal = line_subtotal,
		status = next_status,
		-- Stamped on the way in, cleared if a correction takes it back out.
		received_at = case when next_status = 'received' then coalesce(received_at, now()) end
	where id = target;

	return null;
end;
$$;

-- `freight_allocation` is absent from the column list on purpose: it divides
-- purchases.freight across the lines and must never be added into subtotal, or
-- freight is counted twice in `total`.
create trigger purchase_line_items_refresh_rollups
	after insert or delete or update of quantity_ordered, quantity_received, unit_cost
	on public.purchase_line_items
	for each row execute procedure public.refresh_purchase_rollups();

-- A cancelled order is closed. Correcting a *received* one is left open on
-- purpose — receiving errors are real and get fixed — and is gated in the form
-- action with requirePermission(access, 'purchasing', 'manage') like every
-- other workflow rule (CLAUDE.md: RLS is for security boundaries, app code for
-- workflow).
create function public.check_purchase_lines_editable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	target uuid;
begin
	target := case tg_op when 'DELETE' then old.purchase_id else new.purchase_id end;

	if exists (
		select 1 from public.purchases
		where id = target and status = 'cancelled'
	) then
		raise exception 'purchase % is cancelled and its lines can no longer change', target
			using errcode = 'check_violation';
	end if;

	if tg_op = 'DELETE' then
		return old;
	end if;
	return new;
end;
$$;

create trigger purchase_line_items_check_editable
	before insert or update or delete on public.purchase_line_items
	for each row execute procedure public.check_purchase_lines_editable();

-- ---------------------------------------------------------------------------
-- The shared polymorphic link learns about purchases
-- ---------------------------------------------------------------------------

-- The 'purchase' value shipped in the previous migration; this is the branch
-- that makes it resolvable, so an activity, an address, a tag or a custom
-- field can point at a purchase order.
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
		when 'purchase' then exists (select 1 from public.purchases where id = entity and org_id = org)
		when 'task' then exists (select 1 from public.tasks where id = entity and org_id = org)
		when 'ticket' then exists (select 1 from public.support_tickets where id = entity and org_id = org)
		else false
	end
$$;

create trigger purchases_crm_entity_deleted
	after delete on public.purchases
	for each row execute procedure public.on_crm_entity_deleted('purchase');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Working data, the products and billables shape exactly: the members who buy
-- keep the sourcing table and the orders current, deletes stay owner/admin.
-- Purchasing is money but it is not a security boundary (the `staff` feature
-- is the one that is, because invite rows carry join tokens), so who may open
-- and edit a purchase is the `purchasing` feature's role grant, checked in the
-- load and the action — not a subquery in a policy.

alter table public.company_relationships enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_line_items enable row level security;

-- A role is a fact about a company, so it follows the companies policies: any
-- member reads and writes them, owner/admin removes one. There is no update
-- policy because there is nothing to update — the pair IS the row, so changing
-- a role is a delete and an insert.
create policy "Members can view company relationships"
	on public.company_relationships for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can give a company a role"
	on public.company_relationships for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can remove a company's role"
	on public.company_relationships for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

create policy "Members can view purchases"
	on public.purchases for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create purchases as themselves"
	on public.purchases for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update purchases"
	on public.purchases for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete purchases"
	on public.purchases for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- A line changes whenever the order is edited, so members may add and remove
-- them; the order row is what deletes are gated on, and the cancelled-order
-- trigger above is what closes a finished one.
create policy "Members can view purchase line items"
	on public.purchase_line_items for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can add purchase line items"
	on public.purchase_line_items for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can update purchase line items"
	on public.purchase_line_items for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Members can remove purchase line items"
	on public.purchase_line_items for delete to authenticated
	using (private.org_role(org_id) is not null);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS, these decide which COLUMNS. Generated columns
-- (`total`, `line_total`, `landed_unit_cost`) are unwritable by definition and
-- need no grant; `subtotal`, `number` and `next_value` are withheld here
-- because a trigger or a function owns them.

-- Nothing on a role row is editable — the pair is the whole fact. The sync
-- trigger writes as the owner, so it is unaffected by the missing update grant.
revoke insert, update on table public.company_relationships from authenticated;
grant insert (org_id, company_id, relationship)
	on table public.company_relationships to authenticated;

revoke insert, update on table public.purchases from authenticated;
grant insert (org_id, company_id, status, payment_status, reference, currency, freight,
		distribution_fee_pct, distribution_fee, tax, ordered_at, expected_at, due_date, paid_at,
		notes, created_by),
	update (company_id, status, payment_status, reference, currency, freight,
		distribution_fee_pct, distribution_fee, tax, ordered_at, expected_at, due_date, paid_at,
		notes)
	on table public.purchases to authenticated;

revoke insert, update on table public.purchase_line_items from authenticated;
grant insert (org_id, purchase_id, product_id, description, product_sku_snapshot,
		quantity_ordered, quantity_received, unit_cost, freight_allocation, sort_order),
	update (product_id, description, product_sku_snapshot, quantity_ordered, quantity_received,
		unit_cost, freight_allocation, sort_order)
	on table public.purchase_line_items to authenticated;

-- The three vendor columns join what the browser may already write on a
-- company. GRANT is additive per column, so this widens the party-model grant
-- rather than replacing it.
grant insert (vendor_account_number, payment_terms_days, distribution_fee_pct),
	update (vendor_account_number, payment_terms_days, distribution_fee_pct)
	on table public.companies to authenticated;

-- ---------------------------------------------------------------------------
-- What this migration deliberately leaves out
-- ---------------------------------------------------------------------------
-- 1. Dropping `companies.relationship`. The mapping table above is the shape
--    the roles want, but the column is read in 23 app files — including the
--    `views` filter compiler, which offers a `relationship` condition AND a
--    `company.relationship` hop. Cutting over is a refactor of a subsystem
--    this change has no other reason to touch, so the column stays
--    authoritative and the trigger mirrors it. Contract step, as one change:
--    move the views filter and `listCompanies` onto the table, teach the
--    generic record form a multi-value field (it posts one string per field
--    today, so "Add company" can still only set one role), then drop the
--    column, the trigger and `public.sync_company_relationship()` together.
-- 2. A product/vendor sourcing table. Which vendor sells you a given product,
--    under what part number, at what cost and lead time is a fact about the
--    PAIR, not about the company, so it is a real typed table when sourcing
--    needs one — not a role here and not jsonb on a mapping row.
-- 3. Receiving into stock. `quantity_received` records what arrived; it moves
--    no inventory, because `inventory_ledger` does not exist yet. When it
--    does, the receipt writes a ledger row with reason 'receipt' valued at
--    `landed_unit_cost` — which is why that column is generated here.
-- 4. Lot and expiry. A received line of a medical product needs a lot number
--    and an expiration date, and both belong on a `lots` row the receipt
--    points at — not columns here. Lots land before inventory, because they
--    change inventory's grain.
-- 5. Soft delete. Purchases are owner/admin-deletable like every other table
--    today. Financial-record retention is a convention that has to be decided
--    once and applied to every document table (and to
--    public.on_crm_entity_deleted), not invented for this one.
-- 6. The `purchasing` feature rows and the page. A features row renders a
--    sidebar entry, so it ships with the route, not ahead of it — the
--    features migration's closing comment is that checklist.
--
-- Next: npm run db:reset (proves it replays onto an empty database), then
-- npm run db:types and commit the regenerated src/lib/database.types.ts.
