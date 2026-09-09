-- Invoicing and payments: what the org is owed, and what has settled it.
--
-- The purchasing migration built the payables side — what the org owes a
-- vendor. This is the mirror: what a customer owes the org, and the money that
-- arrives against it. It reuses that migration's machinery rather than growing
-- a parallel set (`private.next_document_number()`, `public.payment_state`,
-- the two-axis status split, the derived-state-is-the-database rule), which is
-- the whole reason those were built generically.
--
--   invoices             one bill sent to one customer
--   invoice_line_items   what is being billed for, priced per line
--   payments             one sum of money that arrived (or went back out)
--   payment_allocations  which invoices that money settled, and by how much
--
-- Four decisions worth stating:
--
-- 1. A PAYMENT IS NOT A COLUMN ON AN INVOICE. Customers pay one check against
--    six invoices, and one invoice gets paid across three instalments. That is
--    many-to-many, so it is a join table with an amount on it. An
--    `invoices.payment_id` — or a `payments.invoice_id` — cannot express the
--    normal case, and `amount_paid` without allocations is a number that
--    reconciles to nothing.
--
-- 2. TAX AND DISCOUNT ARE PER LINE, AND THE HEADER IS THEIR SUM. A distributor
--    bills taxable and exempt lines on one invoice, so a single header tax
--    rate cannot describe it. `invoices.subtotal` and `invoices.tax` are both
--    rolled up from the lines by trigger; `shipping` and an invoice-level
--    `discount` are the only money a human types on the header.
--
-- 3. ISSUING FREEZES THE LINES. An invoice that has left `draft` has been sent
--    to a customer, so its lines are closed to every writer — you void it and
--    issue a new one. That is stricter than the cancelled-only freeze on
--    purchases, deliberately: a purchase order is an internal document until
--    the goods land, an invoice is a claim on someone else's money the moment
--    it goes out. It also makes the totals triggers unable to restate a sent
--    document, which is the bug the proposals triggers have.
--
-- 4. OVERDUE IS DERIVED, NEVER STORED. `due_date < today and balance_due > 0`
--    is a query, and a stored `overdue` would need a nightly job to be true —
--    the template has no scheduler, and `proposal_status.expired` is already
--    a status with no writer. `balance_due` is generated for exactly this, so
--    the aging query is an index scan rather than a join.
--
-- What this migration deliberately leaves out is in the closing comment.

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

-- Where the document is in its own life. Money state is the second axis and
-- comes from public.payment_state (the purchasing migration), because "how
-- much of this is settled" is one question with one set of answers.
--
-- There is no 'overdue' and no 'partially_paid' here on purpose: both are
-- facts about other columns (decision 4), and a status you can derive is a
-- status that goes stale.
create type public.invoice_status as enum ('draft', 'issued', 'void');

-- How money moved. A vocabulary we own, so an enum (the pipelines rule) —
-- unlike a deal board, every org takes payment the same handful of ways.
create type public.payment_method as enum (
	'check',
	'ach',
	'wire',
	'card',
	'cash',
	'credit',
	'other'
);

-- Which way it moved. A refund is the same row shape as a payment, and giving
-- it a `kind` rather than a negative `amount` keeps "how much" and "which
-- direction" from being smuggled into one signed number a client could write
-- wrong — `signed_amount` below derives the sign so sums stay trivial.
create type public.payment_kind as enum ('payment', 'refund');

-- ---------------------------------------------------------------------------
-- Selling prices get the precision buying prices already have
-- ---------------------------------------------------------------------------

-- The purchasing migration widened `products.unit_cost` to numeric(14, 4) and
-- said why: a distributor buys at $0.0825/each. It sells the same way — per
-- each, out of a case — so a unit price rounded to cents is wrong in the same
-- digit. Each migration widens what it uses; this is the one that bills.
-- Widening numeric(12, 2) keeps every existing value and every integer digit.
alter table public.products
	alter column unit_price type numeric(14, 4);

comment on column public.products.unit_price is
	'List price of one unit, four decimals. A customer-specific price overrides it once pricing rules exist.';

-- ---------------------------------------------------------------------------
-- invoices — one bill sent to one customer
-- ---------------------------------------------------------------------------

create table public.invoices (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	company_id uuid not null,
	-- Who to bill at that company. Null is fine: plenty of invoices go to an
	-- accounts-payable inbox rather than a person (the party-model rule that
	-- both sides of a party link are nullable).
	contact_id uuid,
	-- Assigned by trigger from the org's counter, exactly like a purchase
	-- number. Not grantable: a document number a client can choose collides.
	number text not null,
	status public.invoice_status not null default 'draft',
	-- Follows the allocations, by trigger. Never written by a client.
	payment_status public.payment_state not null default 'unpaid',

	currency text not null default 'USD',
	-- Both roll up from the lines (decision 2). Never written by a client.
	subtotal numeric(12, 2) not null default 0,
	tax numeric(12, 2) not null default 0,
	-- The only two money columns a human types on the header.
	shipping numeric(12, 2) not null default 0,
	discount numeric(12, 2) not null default 0,
	-- Follows the allocations, by trigger. Negative is impossible; more than
	-- `total` is not, and shows as a negative balance.
	amount_paid numeric(12, 2) not null default 0,

	-- Snapshot of the customer's terms when the invoice was issued, the way a
	-- purchase snapshots the vendor's fee: renegotiating next quarter must not
	-- restate what this bill said.
	payment_terms_days integer,
	due_date date,
	issued_at timestamptz,
	-- Stamped by the allocation rollup when the balance reaches zero, cleared
	-- if a refund reopens it.
	paid_at timestamptz,
	voided_at timestamptz,

	billing_email text,
	-- Shown to the customer; `notes` is not.
	memo text,
	notes text,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	-- Generated, so the arithmetic cannot drift from its parts.
	total numeric(12, 2) generated always as (
		round(subtotal + tax + shipping - discount, 2)
	) stored,
	-- Generated from the base columns rather than from `total` (Postgres will
	-- not let one generated column read another), which is what makes the
	-- aging query "balance_due > 0 and due_date < current_date" an index scan.
	balance_due numeric(12, 2) generated always as (
		round(subtotal + tax + shipping - discount - amount_paid, 2)
	) stored,

	-- RESTRICT for the same reason a vendor is: deleting a customer you have
	-- billed would take the financial record with it.
	foreign key (company_id, org_id) references public.companies (id, org_id) on delete restrict,
	foreign key (contact_id, org_id) references public.contacts (id, org_id)
		on delete set null (contact_id),
	unique (id, org_id),
	unique (org_id, number),
	constraint invoices_subtotal_nonnegative check (subtotal >= 0),
	constraint invoices_tax_nonnegative check (tax >= 0),
	constraint invoices_shipping_nonnegative check (shipping >= 0),
	constraint invoices_discount_nonnegative check (discount >= 0),
	constraint invoices_amount_paid_nonnegative check (amount_paid >= 0),
	constraint invoices_payment_terms_days_nonnegative
		check (payment_terms_days is null or payment_terms_days >= 0),
	constraint invoices_currency_is_iso4217 check (currency ~ '^[A-Z]{3}$'),
	-- An issued invoice always says when. A void one always says when.
	constraint invoices_issued_has_date
		check (status <> 'issued' or issued_at is not null),
	constraint invoices_void_has_date
		check (status <> 'void' or voided_at is not null)
);

comment on table public.invoices is
	'One bill sent to one customer. subtotal and tax roll up from the lines, amount_paid from the allocations; total and balance_due are generated. Overdue is derived, never stored.';
comment on column public.invoices.balance_due is
	'What is still owed. Generated — the aging query is "balance_due > 0 and due_date < current_date", not a join.';
comment on column public.invoices.payment_terms_days is
	'The customer''s terms as they stood when the invoice was issued: 30 means net-30. Provenance, like a line''s unit_price.';

create index invoices_org_id_idx on public.invoices (org_id);
create index invoices_company_id_idx on public.invoices (company_id);
create index invoices_contact_id_idx on public.invoices (contact_id);
-- The list page: an org's invoices by status, newest first.
create index invoices_org_id_status_issued_at_idx
	on public.invoices (org_id, status, issued_at desc);
-- The aging report: what is still owed, oldest due first. Partial, because
-- settled invoices are most of the table and never appear in it.
create index invoices_org_id_due_date_outstanding_idx
	on public.invoices (org_id, due_date)
	where balance_due > 0;

create trigger invoices_set_updated_at
	before update on public.invoices
	for each row execute procedure public.set_updated_at();

create function public.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.number is null or length(trim(new.number)) = 0 then
		new.number := private.next_document_number(new.org_id, 'invoice', 'INV');
	end if;
	return new;
end;
$$;

create trigger invoices_assign_number
	before insert on public.invoices
	for each row execute procedure public.assign_invoice_number();

-- ---------------------------------------------------------------------------
-- invoice_line_items — what is being billed for
-- ---------------------------------------------------------------------------

create table public.invoice_line_items (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	invoice_id uuid not null,
	-- Provenance only, the rule every line in this schema follows: the line
	-- keeps its own label and price, so repricing the catalog never rewrites a
	-- bill that was already sent, and retiring the product only clears the
	-- citation.
	product_id uuid,
	description text not null,
	product_sku_snapshot text,
	quantity numeric(14, 4) not null default 1,
	unit_price numeric(14, 4) not null default 0,
	-- Money off this line, and tax on it. Per line because a distributor bills
	-- taxable and exempt items on one invoice (decision 2).
	discount numeric(12, 2) not null default 0,
	tax numeric(12, 2) not null default 0,
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	-- What the line is worth before tax, net of its own discount. This is what
	-- `invoices.subtotal` sums, so tax is never counted twice.
	net_amount numeric(12, 2) generated always as (
		round(quantity * unit_price, 2) - discount
	) stored,
	-- What the line adds to the invoice, all in. For display and for checking
	-- a total by eye; the header sums `net_amount` and `tax` separately.
	line_total numeric(12, 2) generated always as (
		round(quantity * unit_price, 2) - discount + tax
	) stored,

	foreign key (invoice_id, org_id) references public.invoices (id, org_id) on delete cascade,
	foreign key (product_id, org_id) references public.products (id, org_id)
		on delete set null (product_id),
	unique (id, org_id),
	constraint invoice_line_items_description_not_blank
		check (length(trim(description)) > 0),
	constraint invoice_line_items_quantity_positive check (quantity > 0),
	constraint invoice_line_items_unit_price_nonnegative check (unit_price >= 0),
	constraint invoice_line_items_discount_nonnegative check (discount >= 0),
	constraint invoice_line_items_tax_nonnegative check (tax >= 0)
);

comment on table public.invoice_line_items is
	'One billed line. net_amount is the pre-tax value the invoice subtotal sums; tax is per line, so one invoice can mix taxable and exempt items.';
comment on column public.invoice_line_items.product_id is
	'The catalog entry this line came from, if any. Provenance only — description and unit_price are snapshots taken when the line was written.';

create index invoice_line_items_org_id_idx on public.invoice_line_items (org_id);
create index invoice_line_items_invoice_id_sort_order_idx
	on public.invoice_line_items (invoice_id, sort_order);
create index invoice_line_items_product_id_idx on public.invoice_line_items (product_id);

create trigger invoice_line_items_set_updated_at
	before update on public.invoice_line_items
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments — one sum of money that arrived
-- ---------------------------------------------------------------------------

create table public.payments (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	company_id uuid not null,
	kind public.payment_kind not null default 'payment',
	method public.payment_method not null default 'check',
	-- Always positive; direction lives in `kind`.
	amount numeric(12, 2) not null,
	currency text not null default 'USD',
	-- The check number, the ACH trace, the card authorisation.
	reference text,
	received_at timestamptz not null default now(),
	-- The one guard against a double-submitted payment form creating money
	-- that never arrived. Unique per org when set; the form action passes the
	-- token it minted with the page, so a retry collides instead of inserting.
	idempotency_key text,
	notes text,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	-- Sums over payments and allocations stay a plain SUM instead of a CASE
	-- repeated at every call site.
	signed_amount numeric(12, 2) generated always as (
		case kind when 'refund' then -amount else amount end
	) stored,

	foreign key (company_id, org_id) references public.companies (id, org_id) on delete restrict,
	unique (id, org_id),
	constraint payments_amount_positive check (amount > 0),
	constraint payments_currency_is_iso4217 check (currency ~ '^[A-Z]{3}$')
);

comment on table public.payments is
	'One sum of money that arrived from a customer, or went back to them. Which invoices it settled is payment_allocations — a payment is never tied to one invoice.';
comment on column public.payments.signed_amount is
	'amount, negated for a refund. Generated, so direction can never disagree with kind.';

create index payments_org_id_idx on public.payments (org_id);
create index payments_company_id_idx on public.payments (company_id);
-- The payments list, and a customer's payment history.
create index payments_org_id_received_at_idx on public.payments (org_id, received_at desc);

create unique index payments_org_id_idempotency_key_idx
	on public.payments (org_id, idempotency_key)
	where idempotency_key is not null;

create trigger payments_set_updated_at
	before update on public.payments
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payment_allocations — which invoices the money settled
-- ---------------------------------------------------------------------------

create table public.payment_allocations (
	payment_id uuid not null,
	invoice_id uuid not null,
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- Always positive: the direction is the payment's, not the allocation's.
	amount numeric(12, 2) not null,
	created_at timestamptz not null default now(),
	primary key (payment_id, invoice_id),
	-- Both composite: money can only ever be applied within one org. Deleting
	-- either end drops the allocation and the rollup below restates the
	-- invoice, so no orphan can leave an invoice looking paid.
	foreign key (payment_id, org_id) references public.payments (id, org_id) on delete cascade,
	foreign key (invoice_id, org_id) references public.invoices (id, org_id) on delete cascade,
	constraint payment_allocations_amount_positive check (amount > 0)
);

comment on table public.payment_allocations is
	'How much of one payment settled one invoice. The many-to-many that lets one check clear six invoices and one invoice take three instalments.';

create index payment_allocations_org_id_idx on public.payment_allocations (org_id);
create index payment_allocations_invoice_id_idx on public.payment_allocations (invoice_id);

-- ---------------------------------------------------------------------------
-- Derived state: the invoice follows its lines and its allocations
-- ---------------------------------------------------------------------------

-- The lines half. `subtotal` is the sum of pre-tax net amounts and `tax` the
-- sum of per-line tax, so the header never double-counts and `total` (a
-- generated column) recomputes off both.
create function public.refresh_invoice_line_rollups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	target uuid;
begin
	target := case tg_op when 'DELETE' then old.invoice_id else new.invoice_id end;

	update public.invoices i
	set
		subtotal = coalesce((
			select sum(l.net_amount) from public.invoice_line_items l where l.invoice_id = i.id
		), 0),
		tax = coalesce((
			select sum(l.tax) from public.invoice_line_items l where l.invoice_id = i.id
		), 0)
	where i.id = target;

	return null;
end;
$$;

create trigger invoice_line_items_refresh_rollups
	after insert or delete or update of quantity, unit_price, discount, tax
	on public.invoice_line_items
	for each row execute procedure public.refresh_invoice_line_rollups();

-- The money half. `amount_paid` is the signed sum of what has been applied, so
-- a refund allocation reduces it and a fully refunded invoice reads 'unpaid'
-- again with no extra state. Clamped at zero: refunding more than was ever
-- paid is a data error, not a negative amount_paid the check constraint would
-- reject halfway through a legitimate write.
--
-- Fires from BOTH tables: an allocation changing is the obvious case, but so
-- is a payment flipping from 'payment' to 'refund', which moves every invoice
-- that payment touched without any allocation row changing.
create function public.refresh_invoice_payment_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	targets uuid[];
begin
	if tg_table_name = 'payment_allocations' then
		targets := array[case tg_op when 'DELETE' then old.invoice_id else new.invoice_id end];
	else
		select coalesce(array_agg(distinct a.invoice_id), '{}')
		into targets
		from public.payment_allocations a
		where a.payment_id = case tg_op when 'DELETE' then old.id else new.id end;
	end if;

	update public.invoices i
	set
		amount_paid = paid.applied,
		payment_status = case
			when paid.applied <= 0 then 'unpaid'::public.payment_state
			when paid.applied >= round(i.subtotal + i.tax + i.shipping - i.discount, 2)
				then 'paid'::public.payment_state
			else 'partial'::public.payment_state
		end,
		paid_at = case
			when paid.applied >= round(i.subtotal + i.tax + i.shipping - i.discount, 2)
				then coalesce(i.paid_at, now())
		end
	from (
		select
			target.id as invoice_id,
			greatest(coalesce((
				select sum(a.amount * sign(p.signed_amount))
				from public.payment_allocations a
				join public.payments p on p.id = a.payment_id
				where a.invoice_id = target.id
			), 0), 0) as applied
		from unnest(targets) as target(id)
	) paid
	where i.id = paid.invoice_id;

	return null;
end;
$$;

create trigger payment_allocations_refresh_invoice
	after insert or delete or update of amount, invoice_id
	on public.payment_allocations
	for each row execute procedure public.refresh_invoice_payment_state();

create trigger payments_refresh_invoices
	after update of kind, amount on public.payments
	for each row execute procedure public.refresh_invoice_payment_state();

-- Money that was never received cannot settle anything. A CHECK cannot see
-- across rows, so the sum is guarded here — without it, allocating $500 of a
-- $100 check marks four invoices paid out of money that does not exist.
create function public.check_payment_not_over_allocated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	target uuid;
	allocated numeric(12, 2);
	available numeric(12, 2);
begin
	-- Fires from both sides, because there are two ways to break the rule:
	-- allocating more of a payment, and shrinking the payment under what is
	-- already allocated.
	if tg_table_name = 'payment_allocations' then
		target := case tg_op when 'DELETE' then old.payment_id else new.payment_id end;
	else
		target := new.id;
	end if;

	select coalesce(sum(a.amount), 0) into allocated
	from public.payment_allocations a
	where a.payment_id = target;

	select p.amount into available
	from public.payments p
	where p.id = target;

	if available is not null and allocated > available then
		raise exception
			'payment % has % allocated but is only %', target, allocated, available
			using errcode = 'check_violation';
	end if;

	return null;
end;
$$;

-- AFTER ROW, which in Postgres means "queued to the end of the statement": a
-- multi-row insert is therefore checked once, against the complete set, rather
-- than rejected halfway through a batch that balances by its last row. A
-- statement-level trigger would read better and cannot be used — OLD and NEW
-- are not assigned there, and the sum needs to know which payment moved.
create trigger payment_allocations_check_total
	after insert or update or delete on public.payment_allocations
	for each row execute procedure public.check_payment_not_over_allocated();

create trigger payments_check_allocation_total
	after update of amount on public.payments
	for each row execute procedure public.check_payment_not_over_allocated();

-- Issuing closes the lines (decision 3). Stricter than the purchases freeze on
-- purpose: a purchase order is internal until the goods land, an invoice is a
-- claim on someone else's money the moment it is sent. Correcting one is a
-- void and a reissue, which leaves both documents in the record.
create function public.check_invoice_lines_editable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	target uuid;
	parent_status public.invoice_status;
begin
	target := case tg_op when 'DELETE' then old.invoice_id else new.invoice_id end;

	select i.status into parent_status
	from public.invoices i
	where i.id = target;

	if parent_status is not null and parent_status <> 'draft' then
		raise exception
			'invoice % is % and its lines can no longer change; void it and issue a new one',
			target, parent_status
			using errcode = 'check_violation';
	end if;

	if tg_op = 'DELETE' then
		return old;
	end if;
	return new;
end;
$$;

create trigger invoice_line_items_check_editable
	before insert or update or delete on public.invoice_line_items
	for each row execute procedure public.check_invoice_lines_editable();

-- ---------------------------------------------------------------------------
-- The shared polymorphic link learns about invoices
-- ---------------------------------------------------------------------------

-- The 'invoice' value shipped in the previous migration; this is the branch
-- that makes it resolvable, so an activity, an address, a tag or a custom
-- field can point at an invoice.
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
		when 'product' then exists (select 1 from public.products where id = entity and org_id = org)
		when 'proposal' then exists (select 1 from public.proposals where id = entity and org_id = org)
		when 'proposal_option' then exists (select 1 from public.proposal_options where id = entity and org_id = org)
		when 'purchase' then exists (select 1 from public.purchases where id = entity and org_id = org)
		when 'task' then exists (select 1 from public.tasks where id = entity and org_id = org)
		when 'ticket' then exists (select 1 from public.support_tickets where id = entity and org_id = org)
		else false
	end
$$;

create trigger invoices_crm_entity_deleted
	after delete on public.invoices
	for each row execute procedure public.on_crm_entity_deleted('invoice');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Working data, the purchases shape exactly: the members who bill keep the
-- invoices current, deletes stay owner/admin. Who may issue one or apply money
-- is the `invoicing` feature's role grant, checked in the load and the action —
-- not a subquery in a policy (CLAUDE.md: RLS is for security boundaries, app
-- code for workflow).

alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;

create policy "Members can view invoices"
	on public.invoices for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create invoices as themselves"
	on public.invoices for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update invoices"
	on public.invoices for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete invoices"
	on public.invoices for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- Lines follow their invoice; the draft-only trigger above is what closes an
-- issued one to every writer, so the policies stay the plain member shape.
create policy "Members can view invoice line items"
	on public.invoice_line_items for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can add invoice line items"
	on public.invoice_line_items for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can update invoice line items"
	on public.invoice_line_items for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Members can remove invoice line items"
	on public.invoice_line_items for delete to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can view payments"
	on public.payments for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can record payments as themselves"
	on public.payments for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update payments"
	on public.payments for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete payments"
	on public.payments for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

create policy "Members can view payment allocations"
	on public.payment_allocations for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can allocate payments"
	on public.payment_allocations for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can change an allocation"
	on public.payment_allocations for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Members can unallocate payments"
	on public.payment_allocations for delete to authenticated
	using (private.org_role(org_id) is not null);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- Generated columns (`total`, `balance_due`, `net_amount`, `line_total`,
-- `signed_amount`) are unwritable by definition. `number`, `subtotal`, `tax`,
-- `amount_paid` and `payment_status` are withheld because a trigger owns them:
-- an invoice whose totals a client can type is an invoice whose totals do not
-- match its lines.

revoke insert, update on table public.invoices from authenticated;
grant insert (org_id, company_id, contact_id, status, currency, shipping, discount,
		payment_terms_days, due_date, issued_at, voided_at, billing_email, memo, notes,
		created_by),
	update (company_id, contact_id, status, currency, shipping, discount, payment_terms_days,
		due_date, issued_at, voided_at, billing_email, memo, notes)
	on table public.invoices to authenticated;

revoke insert, update on table public.invoice_line_items from authenticated;
grant insert (org_id, invoice_id, product_id, description, product_sku_snapshot, quantity,
		unit_price, discount, tax, sort_order),
	update (product_id, description, product_sku_snapshot, quantity, unit_price, discount, tax,
		sort_order)
	on table public.invoice_line_items to authenticated;

-- `kind` is insert-only: a payment that can be flipped into a refund in place
-- rewrites history on every invoice it touched. Issue the opposite row instead.
revoke insert, update on table public.payments from authenticated;
grant insert (org_id, company_id, kind, method, amount, currency, reference, received_at,
		idempotency_key, notes, created_by),
	update (method, amount, currency, reference, received_at, notes)
	on table public.payments to authenticated;

-- `payment_id` is insert-only for the same reason: moving money between
-- payments is a delete and a new row, so both invoices get restated.
revoke insert, update on table public.payment_allocations from authenticated;
grant insert (org_id, payment_id, invoice_id, amount),
	update (invoice_id, amount)
	on table public.payment_allocations to authenticated;

-- ---------------------------------------------------------------------------
-- What this migration deliberately leaves out
-- ---------------------------------------------------------------------------
-- 1. `order_id`. An invoice bills an order, but `orders` does not exist yet.
--    The column and its composite FK land with that table rather than as a
--    nullable uuid pointing at nothing.
-- 2. Credit memos. A refund is a payment with kind = 'refund' and settles the
--    money question. A credit MEMO is a different thing — a document that
--    reduces what is owed without money moving — and it is a sibling of
--    `invoices`, not a column on it. It arrives with RMAs, which is what
--    usually causes one.
-- 3. Tax calculation. Lines carry a tax AMOUNT, which is enough to bill and to
--    report. Deciding what that amount should be needs `tax_rates`,
--    jurisdictions and exemption certificates — a migration of its own, and
--    the one place a customer's exempt status belongs.
-- 4. Dunning and statements. Overdue is a query against `balance_due` and
--    `due_date` (decision 4). Acting on it — reminder emails on a schedule —
--    needs a scheduler the template does not have, and inventing a per-invoice
--    `last_reminded_at` before there is anything to send it from would be a
--    column nothing writes.
-- 5. The `invoicing` feature rows and the page. A features row renders a
--    sidebar entry, so it ships with the route, not ahead of it.
--
-- Next: npm run db:reset (proves it replays onto an empty database), then
-- npm run db:types and commit the regenerated src/lib/database.types.ts.
