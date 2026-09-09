-- Orders and shipments: the sales spine between a quote and a bill.
--
-- Purchasing is what the org buys, invoicing is what it charges for. An order
-- is the thing in between — what a customer asked for — and a shipment is the
-- physical event that satisfies it. Everything downstream hangs off these two:
-- an invoice bills an order (the `order_id` this migration finally adds), and
-- inventory will move when a shipment goes out.
--
--   orders               what one customer asked for
--   order_line_items     one thing they asked for, and who is fulfilling it
--   shipments            one box, from one source, with one tracking number
--   shipment_line_items  which order lines are in that box
--   shipment_events      the carrier's scans, in order
--
-- Four decisions:
--
-- 1. A SHIPMENT LINE HAS NO QUANTITY. A line is in the box or it is not.
--    Shipping four of ten cases is expressed by SPLITTING the order line into
--    a four and a six, not by a quantity on the shipment line — so every
--    downstream reference (an invoice line, a return, a stock movement) points
--    at one row that means exactly one thing. A quantity here would let the
--    sum of shipped quantities disagree with the line, with nothing able to
--    notice.
--
-- 2. TWO STATUS AXES, AS EVERYWHERE ELSE. `orders.status` is the human
--    lifecycle (draft, confirmed, cancelled) and `fulfillment_status` rolls up
--    from the lines, exactly as a purchase's receipt status rolls up from
--    its own. Payment is the third axis and is deliberately NOT a column here:
--    it is a fact about the order's invoices, and duplicating it would be a
--    number to keep in sync with another number.
--
-- 3. THE CARRIER OWNS SHIPPED AND DELIVERED; A HUMAN OWNS THE REST. Once a
--    line is in a shipment, its fulfillment status follows that shipment's
--    scans. But `cancelled` and `returned` are decisions a person made, and a
--    carrier scan arriving late must never overwrite one.
--
-- 4. `supplier_id` IS A COMPANY, PER LINE. A distributor fills one order from
--    several vendors — some stock, some drop-ship — so which vendor is
--    fulfilling is a property of the line, not the order, and it points at the
--    same `companies` table everything else does.
--
-- What this migration deliberately leaves out is in the closing comment.

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

-- The human lifecycle of an order. Short on purpose: everything about where
-- the goods are lives in the fulfillment axis, and everything about the money
-- lives on the invoices.
create type public.order_status as enum ('draft', 'confirmed', 'cancelled');

-- How much of a document has been fulfilled. Named like `payment_state` and
-- for the same reason: an order asks this, and a later transfer or work order
-- will ask it too, with the same three answers.
create type public.fulfillment_state as enum ('unfulfilled', 'partial', 'fulfilled');

-- Whole-line fulfillment. `shipped` and `delivered` are carrier-driven once
-- the line is in a shipment; the rest are human decisions a scan never
-- overwrites (decision 3). `backordered` is the distributor's normal case, not
-- an exception — the customer ordered ten and six are on the shelf.
create type public.line_fulfillment_status as enum (
	'pending',
	'processing',
	'backordered',
	'shipped',
	'delivered',
	'cancelled',
	'returned'
);

-- Where the box is. Mirrors what carrier APIs actually report, including the
-- unhappy paths — a shipment that failed or went back to sender is a thing
-- that happens, and having no value for it is how it ends up as 'unknown'
-- forever. `preparing` is the one value that is ours: the box exists in the
-- warehouse before any carrier has heard of it.
create type public.shipment_delivery_status as enum (
	'preparing',
	'pending',
	'pre_transit',
	'in_transit',
	'out_for_delivery',
	'available_for_pickup',
	'delivered',
	'return_to_sender',
	'failed',
	'cancelled',
	'unknown'
);

-- ---------------------------------------------------------------------------
-- orders — what one customer asked for
-- ---------------------------------------------------------------------------

create table public.orders (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	company_id uuid not null,
	-- Who asked, at that company. Null for an order taken from a company
	-- rather than a person — the party-model rule that both sides are nullable.
	contact_id uuid,
	-- Assigned by trigger from the org's counter, like a purchase and an
	-- invoice. Not grantable.
	number text not null,
	status public.order_status not null default 'draft',
	-- Rolls up from the lines. Never written by a client.
	fulfillment_status public.fulfillment_state not null default 'unfulfilled',

	currency text not null default 'USD',
	-- Both roll up from the lines, exactly as an invoice's do. Never written
	-- by a client.
	subtotal numeric(12, 2) not null default 0,
	tax numeric(12, 2) not null default 0,
	-- The only two money columns a human types on the header.
	shipping numeric(12, 2) not null default 0,
	discount numeric(12, 2) not null default 0,

	-- The customer's own purchase-order number. Free text, because it is
	-- theirs: it goes on the invoice and the packing slip so their AP team can
	-- match it, and it means nothing to us beyond that.
	customer_po text,
	-- Where it goes, frozen when the order was confirmed. jsonb rather than a
	-- pointer at `addresses`, deliberately and for the one reason jsonb is
	-- allowed here (the proposals rule): nothing queries on it, it is printed.
	-- A live, editable ship-to before confirmation is an `addresses` row
	-- pointing at the order; this is the copy that must never move again when
	-- the customer relocates.
	ship_to_snapshot jsonb,

	placed_at timestamptz,
	confirmed_at timestamptz,
	cancelled_at timestamptz,
	-- Staff estimate, used before any carrier has the box.
	estimated_ship_date date,

	-- Same guard as a payment: an order is a money document, and a
	-- double-submitted form must not create two of them.
	idempotency_key text,
	notes text,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	total numeric(12, 2) generated always as (
		round(subtotal + tax + shipping - discount, 2)
	) stored,

	-- RESTRICT, like a customer with invoices: deleting a company you have
	-- taken orders from would take the record with it.
	foreign key (company_id, org_id) references public.companies (id, org_id) on delete restrict,
	foreign key (contact_id, org_id) references public.contacts (id, org_id)
		on delete set null (contact_id),
	unique (id, org_id),
	unique (org_id, number),
	constraint orders_subtotal_nonnegative check (subtotal >= 0),
	constraint orders_tax_nonnegative check (tax >= 0),
	constraint orders_shipping_nonnegative check (shipping >= 0),
	constraint orders_discount_nonnegative check (discount >= 0),
	constraint orders_currency_is_iso4217 check (currency ~ '^[A-Z]{3}$'),
	constraint orders_ship_to_snapshot_is_object
		check (ship_to_snapshot is null or jsonb_typeof(ship_to_snapshot) = 'object'),
	constraint orders_confirmed_has_date
		check (status <> 'confirmed' or confirmed_at is not null),
	constraint orders_cancelled_has_date
		check (status <> 'cancelled' or cancelled_at is not null)
);

comment on table public.orders is
	'What one customer asked for. status is the human lifecycle, fulfillment_status rolls up from the lines; how much has been paid is a fact about its invoices, not a column here.';
comment on column public.orders.customer_po is
	'The customer''s own PO number, printed on their invoice and packing slip so their AP team can match it.';
comment on column public.orders.ship_to_snapshot is
	'Where it went, frozen at confirmation. jsonb because nothing queries it — it is printed. The editable ship-to is an addresses row.';

create index orders_org_id_idx on public.orders (org_id);
create index orders_company_id_idx on public.orders (company_id);
create index orders_contact_id_idx on public.orders (contact_id);
-- The list page: an org's orders by status, newest first.
create index orders_org_id_status_placed_at_idx
	on public.orders (org_id, status, placed_at desc);
-- The fulfillment queue: what is confirmed and not yet out the door. Partial,
-- because finished orders are most of the table and never appear in it.
create index orders_org_id_fulfillment_status_idx
	on public.orders (org_id, fulfillment_status)
	where fulfillment_status <> 'fulfilled';

create unique index orders_org_id_idempotency_key_idx
	on public.orders (org_id, idempotency_key)
	where idempotency_key is not null;

create trigger orders_set_updated_at
	before update on public.orders
	for each row execute procedure public.set_updated_at();

create function public.assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.number is null or length(trim(new.number)) = 0 then
		new.number := private.next_document_number(new.org_id, 'order', 'ORD');
	end if;
	return new;
end;
$$;

create trigger orders_assign_number
	before insert on public.orders
	for each row execute procedure public.assign_order_number();

-- ---------------------------------------------------------------------------
-- order_line_items — one thing they asked for, and who is filling it
-- ---------------------------------------------------------------------------

create table public.order_line_items (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	order_id uuid not null,
	-- Provenance only, the rule every line in this schema follows.
	product_id uuid,
	-- The vendor filling THIS line (decision 4). Null means not yet assigned,
	-- or filled from the org's own stock. Composite so it must be this org's
	-- company; SET NULL rather than cascade because losing a vendor must not
	-- delete what a customer ordered.
	supplier_id uuid,
	description text not null,
	product_sku_snapshot text,
	quantity numeric(14, 4) not null default 1,
	unit_price numeric(14, 4) not null default 0,
	discount numeric(12, 2) not null default 0,
	tax numeric(12, 2) not null default 0,
	fulfillment_status public.line_fulfillment_status not null default 'pending',
	-- When the status last moved, stamped by trigger. Not an updated_at: a
	-- price edit does not touch it, so "how long has this been backordered"
	-- has an answer.
	fulfillment_status_changed_at timestamptz,
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	-- Identical shape to an invoice line, so a line can be billed by copying
	-- it: pre-tax net for the subtotal, all-in for display.
	net_amount numeric(12, 2) generated always as (
		round(quantity * unit_price, 2) - discount
	) stored,
	line_total numeric(12, 2) generated always as (
		round(quantity * unit_price, 2) - discount + tax
	) stored,

	foreign key (order_id, org_id) references public.orders (id, org_id) on delete cascade,
	foreign key (product_id, org_id) references public.products (id, org_id)
		on delete set null (product_id),
	foreign key (supplier_id, org_id) references public.companies (id, org_id)
		on delete set null (supplier_id),
	-- Composite target for shipment_line_items.
	unique (id, org_id),
	constraint order_line_items_description_not_blank
		check (length(trim(description)) > 0),
	constraint order_line_items_quantity_positive check (quantity > 0),
	constraint order_line_items_unit_price_nonnegative check (unit_price >= 0),
	constraint order_line_items_discount_nonnegative check (discount >= 0),
	constraint order_line_items_tax_nonnegative check (tax >= 0)
);

comment on table public.order_line_items is
	'One thing a customer asked for. supplier_id is the vendor filling this line; splitting a line is how a partial shipment is expressed.';
comment on column public.order_line_items.supplier_id is
	'The company filling this line — a vendor for a drop-ship, null for the org''s own stock or not yet assigned.';
comment on column public.order_line_items.fulfillment_status_changed_at is
	'When fulfillment_status last moved. Stamped by trigger; a price edit does not touch it.';

create index order_line_items_org_id_idx on public.order_line_items (org_id);
create index order_line_items_order_id_sort_order_idx
	on public.order_line_items (order_id, sort_order);
create index order_line_items_product_id_idx on public.order_line_items (product_id);
-- The vendor's pick list: every open line assigned to one supplier.
create index order_line_items_supplier_id_fulfillment_status_idx
	on public.order_line_items (supplier_id, fulfillment_status);

create trigger order_line_items_set_updated_at
	before update on public.order_line_items
	for each row execute procedure public.set_updated_at();

create function public.stamp_line_fulfillment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' or new.fulfillment_status is distinct from old.fulfillment_status then
		new.fulfillment_status_changed_at := now();
	end if;
	return new;
end;
$$;

create trigger order_line_items_stamp_fulfillment_change
	before insert or update of fulfillment_status on public.order_line_items
	for each row execute procedure public.stamp_line_fulfillment_change();

-- ---------------------------------------------------------------------------
-- invoices learn which order they bill
-- ---------------------------------------------------------------------------

-- The invoicing migration's closing comment said this column lands with the
-- table it points at rather than as a uuid pointing at nothing. It does.
-- SET NULL, not cascade: deleting an order must never delete the bill.
alter table public.invoices
	add column order_id uuid,
	add constraint invoices_order_id_org_id_fkey
		foreign key (order_id, org_id) references public.orders (id, org_id)
		on delete set null (order_id);

create index invoices_order_id_idx on public.invoices (order_id);

comment on column public.invoices.order_id is
	'The order this bills, if any. Null for an invoice raised on its own — a service charge, a manual bill.';

grant insert (order_id), update (order_id) on table public.invoices to authenticated;

-- ---------------------------------------------------------------------------
-- shipments — one box, from one source, with one tracking number
-- ---------------------------------------------------------------------------

create table public.shipments (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	order_id uuid not null,
	-- The vendor that shipped it, when it was not the org itself. Same
	-- companies table as everything else (decision 4).
	supplier_id uuid,

	carrier text,
	tracking_number text,
	tracking_url text,
	delivery_status public.shipment_delivery_status not null default 'preparing',

	-- For a 'preparing' shipment this is the planned date; afterwards it is
	-- the day it actually went.
	ship_date date,
	estimated_delivery_date date,
	shipped_at timestamptz,
	delivered_at timestamptz,

	-- The carrier-tracking integration's handle for this shipment, whichever
	-- provider it is. Deliberately not named for one vendor: the column holds
	-- an opaque id and `tracking_error` holds why syncing stopped.
	external_tracker_id text,
	status_detail text,
	-- Latest carrier scan. Unlike updated_at, a staff edit does not move it.
	carrier_updated_at timestamptz,
	tracking_synced_at timestamptz,
	-- Non-null means live tracking is not running for this shipment.
	tracking_error text,

	notes text,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	foreign key (order_id, org_id) references public.orders (id, org_id) on delete cascade,
	foreign key (supplier_id, org_id) references public.companies (id, org_id)
		on delete set null (supplier_id),
	unique (id, org_id)
);

comment on table public.shipments is
	'One box against one order, with one tracking number. Its lines say what is inside; delivery_status is what the carrier last reported.';
comment on column public.shipments.external_tracker_id is
	'The tracking provider''s handle for this shipment. Provider-agnostic on purpose; tracking_error says why syncing stopped.';

create index shipments_org_id_idx on public.shipments (org_id);
create index shipments_order_id_idx on public.shipments (order_id);
create index shipments_supplier_id_idx on public.shipments (supplier_id);
-- The tracking board: everything still moving, and the sync job's work list.
create index shipments_org_id_delivery_status_idx
	on public.shipments (org_id, delivery_status)
	where delivery_status not in ('delivered', 'cancelled');

create unique index shipments_org_id_carrier_tracking_number_idx
	on public.shipments (org_id, carrier, tracking_number)
	where tracking_number is not null;

create trigger shipments_set_updated_at
	before update on public.shipments
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- shipment_line_items — which order lines are in that box
-- ---------------------------------------------------------------------------

-- No quantity column (decision 1). The primary key is the pair, so a line
-- cannot be in the same box twice; the partial unique index below is what
-- stops it being in two boxes at once.
create table public.shipment_line_items (
	shipment_id uuid not null,
	order_line_item_id uuid not null,
	org_id uuid not null references public.organizations (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (shipment_id, order_line_item_id),
	foreign key (shipment_id, org_id) references public.shipments (id, org_id) on delete cascade,
	foreign key (order_line_item_id, org_id) references public.order_line_items (id, org_id)
		on delete cascade
);

comment on table public.shipment_line_items is
	'Which order lines are in a shipment. No quantity on purpose: a line is in the box or it is not, and a partial shipment splits the order line instead.';

create index shipment_line_items_org_id_idx on public.shipment_line_items (org_id);

-- One line, one box, with no exceptions. Without this an order line could be
-- in two shipments and "where is my item" would have two answers — the exact
-- ambiguity decision 1 exists to prevent. Moving a line to a different box is
-- a delete and an insert, which is also what makes the carrier half restate
-- both shipments' lines correctly.
--
-- Not partial: a predicate cannot reach into `shipments` to exempt a cancelled
-- one, so cancelling a shipment does not free its lines — unpacking it does.
-- Being unique, it is also the lookup index for "which box is this line in",
-- so there is no separate plain index on the column.
create unique index shipment_line_items_order_line_item_id_idx
	on public.shipment_line_items (order_line_item_id);

-- ---------------------------------------------------------------------------
-- shipment_events — the carrier's scans, in order
-- ---------------------------------------------------------------------------

-- Append-only, the proposal_events rule: what a carrier reported is a record
-- of something that happened, so there is deliberately no update or delete
-- policy. It lives and dies with its shipment.
create table public.shipment_events (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	shipment_id uuid not null,
	-- The carrier's own words, kept as text rather than mapped into the enum:
	-- the mapped value is on the shipment, and this is the raw record of what
	-- was actually said.
	status text,
	status_detail text,
	message text not null,
	description text,
	source text,
	city text,
	region text,
	country text,
	postal_code text,
	occurred_at timestamptz not null,
	created_at timestamptz not null default now(),
	foreign key (shipment_id, org_id) references public.shipments (id, org_id) on delete cascade,
	constraint shipment_events_message_not_blank check (length(trim(message)) > 0)
);

comment on table public.shipment_events is
	'One carrier scan. Append-only: the mapped status lives on the shipment, this is the raw record of what the carrier said.';

create index shipment_events_org_id_idx on public.shipment_events (org_id);
create index shipment_events_shipment_id_occurred_at_idx
	on public.shipment_events (shipment_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Derived state: the order follows its lines, the lines follow the carrier
-- ---------------------------------------------------------------------------

-- The money half, identical in shape to the invoice rollup: pre-tax net for
-- the subtotal, per-line tax summed separately, so `total` (generated)
-- recomputes off both and nothing is counted twice.
create function public.refresh_order_line_rollups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	target uuid;
begin
	target := case tg_op when 'DELETE' then old.order_id else new.order_id end;

	update public.orders o
	set
		subtotal = coalesce((
			select sum(l.net_amount) from public.order_line_items l where l.order_id = o.id
		), 0),
		tax = coalesce((
			select sum(l.tax) from public.order_line_items l where l.order_id = o.id
		), 0)
	where o.id = target;

	return null;
end;
$$;

create trigger order_line_items_refresh_money
	after insert or delete or update of quantity, unit_price, discount, tax
	on public.order_line_items
	for each row execute procedure public.refresh_order_line_rollups();

-- The fulfillment half (decision 2). Cancelled lines are excluded from the
-- verdict rather than counted as done: an order whose every line was
-- cancelled is not 'fulfilled', it is an order with nothing left to fulfil,
-- and reading it as shipped would hide it from every queue.
create function public.refresh_order_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	target uuid;
	live integer;
	done integer;
begin
	target := case tg_op when 'DELETE' then old.order_id else new.order_id end;

	select
		count(*) filter (where l.fulfillment_status <> 'cancelled'),
		count(*) filter (where l.fulfillment_status in ('shipped', 'delivered'))
	into live, done
	from public.order_line_items l
	where l.order_id = target;

	update public.orders o
	set fulfillment_status = case
		when live = 0 or done = 0 then 'unfulfilled'::public.fulfillment_state
		when done >= live then 'fulfilled'::public.fulfillment_state
		else 'partial'::public.fulfillment_state
	end
	where o.id = target;

	return null;
end;
$$;

create trigger order_line_items_refresh_fulfillment
	after insert or delete or update of fulfillment_status
	on public.order_line_items
	for each row execute procedure public.refresh_order_fulfillment();

-- The carrier half (decision 3). A shipment's status is pushed onto the lines
-- inside it — but only onto lines that are still in play. `cancelled` and
-- `returned` are decisions a person made, and a scan arriving afterwards must
-- not quietly undo one.
--
-- Fires from both tables: the shipment's status changing is the obvious case,
-- and adding a line to an already-moving shipment is the other.
create function public.apply_shipment_status_to_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	target uuid;
	carrier_status public.shipment_delivery_status;
	line_status public.line_fulfillment_status;
begin
	-- Two statements, not one CASE: plpgsql resolves NEW's fields for the
	-- whole expression, and NEW is a shipment in one firing and a packing row
	-- (which has no `id` at all) in the other. The proposals migration's
	-- totals trigger carries the same warning.
	if tg_table_name = 'shipments' then
		target := new.id;
	else
		target := new.shipment_id;
	end if;

	select s.delivery_status into carrier_status
	from public.shipments s
	where s.id = target;

	line_status := case
		when carrier_status = 'delivered' then 'delivered'::public.line_fulfillment_status
		when carrier_status in ('pending', 'pre_transit', 'in_transit', 'out_for_delivery',
			'available_for_pickup') then 'shipped'::public.line_fulfillment_status
	end;

	-- 'preparing', 'cancelled', 'failed', 'return_to_sender' and 'unknown'
	-- say nothing about whether the customer has the goods, so they move
	-- nothing.
	if line_status is null then
		return null;
	end if;

	update public.order_line_items l
	set fulfillment_status = line_status
	from public.shipment_line_items sl
	where sl.shipment_id = target
		and l.id = sl.order_line_item_id
		and l.fulfillment_status not in ('cancelled', 'returned')
		and l.fulfillment_status is distinct from line_status;

	return null;
end;
$$;

create trigger shipments_apply_status_to_lines
	after update of delivery_status on public.shipments
	for each row execute procedure public.apply_shipment_status_to_lines();

create trigger shipment_line_items_apply_status
	after insert on public.shipment_line_items
	for each row execute procedure public.apply_shipment_status_to_lines();

-- A cancelled order is closed, exactly as a cancelled purchase is. An order
-- that is merely confirmed stays editable: goods have not moved, and a
-- customer adding a case before it ships is the normal case, not a correction.
create function public.check_order_lines_editable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	target uuid;
begin
	target := case tg_op when 'DELETE' then old.order_id else new.order_id end;

	if exists (
		select 1 from public.orders
		where id = target and status = 'cancelled'
	) then
		raise exception 'order % is cancelled and its lines can no longer change', target
			using errcode = 'check_violation';
	end if;

	if tg_op = 'DELETE' then
		return old;
	end if;
	return new;
end;
$$;

create trigger order_line_items_check_editable
	before insert or update or delete on public.order_line_items
	for each row execute procedure public.check_order_lines_editable();

-- ---------------------------------------------------------------------------
-- The shared polymorphic link learns about orders and shipments
-- ---------------------------------------------------------------------------

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
		when 'invoice' then exists (select 1 from public.invoices where id = entity and org_id = org)
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

create trigger orders_crm_entity_deleted
	after delete on public.orders
	for each row execute procedure public.on_crm_entity_deleted('order');

create trigger shipments_crm_entity_deleted
	after delete on public.shipments
	for each row execute procedure public.on_crm_entity_deleted('shipment');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Working data, the purchases and invoices shape: the members who sell and
-- pick keep these current, deletes stay owner/admin. Which member may do what
-- is the feature's role grant, checked in the load and the action.

alter table public.orders enable row level security;
alter table public.order_line_items enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_line_items enable row level security;
alter table public.shipment_events enable row level security;

create policy "Members can view orders"
	on public.orders for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create orders as themselves"
	on public.orders for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update orders"
	on public.orders for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete orders"
	on public.orders for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

create policy "Members can view order line items"
	on public.order_line_items for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can add order line items"
	on public.order_line_items for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can update order line items"
	on public.order_line_items for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Members can remove order line items"
	on public.order_line_items for delete to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can view shipments"
	on public.shipments for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create shipments as themselves"
	on public.shipments for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update shipments"
	on public.shipments for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete shipments"
	on public.shipments for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

create policy "Members can view shipment line items"
	on public.shipment_line_items for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can pack a shipment"
	on public.shipment_line_items for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can unpack a shipment"
	on public.shipment_line_items for delete to authenticated
	using (private.org_role(org_id) is not null);

-- Append-only (see the table comment): read and insert, deliberately no update
-- or delete policy. The tracking sync writes through the service-role client,
-- which ignores all of this.
create policy "Members can view shipment events"
	on public.shipment_events for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can log a shipment event"
	on public.shipment_events for insert to authenticated
	with check (private.org_role(org_id) is not null);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- Generated columns (`total`, `net_amount`, `line_total`) are unwritable by
-- definition. `number`, `subtotal`, `tax`, `fulfillment_status` on the order
-- and `fulfillment_status_changed_at` on the line are withheld because a
-- trigger owns them.
--
-- `fulfillment_status` on the LINE is granted: a person marks a line
-- backordered or cancelled, and the carrier half only ever overwrites lines
-- still in play (decision 3).

revoke insert, update on table public.orders from authenticated;
grant insert (org_id, company_id, contact_id, status, currency, shipping, discount, customer_po,
		ship_to_snapshot, placed_at, confirmed_at, cancelled_at, estimated_ship_date,
		idempotency_key, notes, created_by),
	update (company_id, contact_id, status, currency, shipping, discount, customer_po,
		ship_to_snapshot, placed_at, confirmed_at, cancelled_at, estimated_ship_date, notes)
	on table public.orders to authenticated;

revoke insert, update on table public.order_line_items from authenticated;
grant insert (org_id, order_id, product_id, supplier_id, description, product_sku_snapshot,
		quantity, unit_price, discount, tax, fulfillment_status, sort_order),
	update (product_id, supplier_id, description, product_sku_snapshot, quantity, unit_price,
		discount, tax, fulfillment_status, sort_order)
	on table public.order_line_items to authenticated;

-- `order_id` is insert-only: moving a packed box to another order would
-- restate the fulfillment of both, and repacking is a delete and a new row.
revoke insert, update on table public.shipments from authenticated;
grant insert (org_id, order_id, supplier_id, carrier, tracking_number, tracking_url,
		delivery_status, ship_date, estimated_delivery_date, shipped_at, delivered_at,
		external_tracker_id, status_detail, carrier_updated_at, tracking_synced_at,
		tracking_error, notes, created_by),
	update (supplier_id, carrier, tracking_number, tracking_url, delivery_status, ship_date,
		estimated_delivery_date, shipped_at, delivered_at, external_tracker_id, status_detail,
		carrier_updated_at, tracking_synced_at, tracking_error, notes)
	on table public.shipments to authenticated;

-- Nothing on a packing row is editable — it is a fact about which box a line
-- went in. Change it by unpacking and repacking.
revoke insert, update on table public.shipment_line_items from authenticated;
grant insert (org_id, shipment_id, order_line_item_id)
	on table public.shipment_line_items to authenticated;

revoke insert, update on table public.shipment_events from authenticated;
grant insert (org_id, shipment_id, status, status_detail, message, description, source, city,
		region, country, postal_code, occurred_at)
	on table public.shipment_events to authenticated;

-- ---------------------------------------------------------------------------
-- What this migration deliberately leaves out
-- ---------------------------------------------------------------------------
-- 1. `lot_id` on an order line. Which lot was picked for a line is the right
--    column, and it needs `lots` — which does not exist, and which lands
--    BEFORE inventory because it changes inventory's grain: you do not stock
--    500 gloves, you stock 200 of lot A expiring 2027-03 and 300 of lot B
--    expiring 2026-11. Adding a bare uuid here now would be a column pointing
--    at nothing.
-- 2. Stock movement. Shipping is what should write an inventory ledger row,
--    and `inventory_ledger` does not exist yet. When it does, the writer is
--    the shipment trigger above, not app code.
-- 3. Reservations. `quantity_reserved` only means something once stock exists
--    and something releases it; a reserved count nothing decrements is the
--    defect the reference app has.
-- 4. Splitting a line. Decision 1 makes a partial shipment a line split, and
--    the SPLIT itself is a form action (halve the quantity, insert the
--    remainder, keep the snapshots) rather than a trigger — it is a human
--    decision about how to divide an order, not a derivable fact.
-- 5. Payment status on the order. It is a fact about the order's invoices
--    (decision 2); read it through them rather than keeping a third copy.
-- 6. The `orders` and `shipments` feature rows and pages. A features row
--    renders a sidebar entry, so it ships with the route, not ahead of it.
--
-- Next: npm run db:reset (proves it replays onto an empty database), then
-- npm run db:types and commit the regenerated src/lib/database.types.ts.
