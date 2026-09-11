-- The ledger: what every customer owes, what they have paid, and the two
-- features that put it on screen.
--
-- The invoicing migration built the tables — `invoices`, `invoice_line_items`,
-- `payments` — and stopped short of the feature rows, because "a features row
-- renders a sidebar entry, so it ships with the route, not ahead of it". This
-- is that route, twice over, plus the one schema change the tables needed
-- before a practice or a roofer could use them at all:
--
--   invoices   the documents: one bill to one customer, drafted, issued, void
--   ledger     the account: every charge and every payment, per customer and
--              org-wide, with the balance that falls out of them
--
-- Three decisions worth stating:
--
-- 1. A CUSTOMER IS A PARTY, NOT A COMPANY. The invoicing migration made
--    `company_id` NOT NULL on both tables, which is right for a distributor
--    and wrong for everyone the party-model migration was written for: a
--    dental patient and a homeowner are contacts with no company, and a bill
--    they cannot be named on is a bill the practice cannot send. Both tables
--    now follow the party-model rule the rest of the schema follows — a
--    company, a person, or both, each nullable — with a check that at least
--    one is named, because a bill to nobody is not a bill. The `on delete`
--    behaviour is unchanged: RESTRICT on the company, SET NULL on the contact.
--    For a person who is the customer, that SET NULL now trips the check, so
--    the delete fails — which is the RESTRICT a financial record wants, arrived
--    at without a second foreign key.
--
-- 2. THE LEDGER IS A READ, NOT A TABLE. A ledger row is an issued invoice or
--    a payment, read in date order; the balance is their signed sum. Storing
--    a `ledger_entries` table would mean a second copy of every invoice total
--    and every payment that a trigger has to keep true, and the invoicing
--    migration already spent its effort making the invoice's own columns the
--    truth (`balance_due` is generated, `amount_paid` is a rollup). The app
--    reads the two tables and folds them (`src/lib/server/crm/ledger.ts`);
--    nothing here materialises what a query can answer.
--
-- 3. TWO FEATURES, NOT ONE. Invoices are documents you write and send; the
--    ledger is the account you read and take money against. They are gated
--    together (the same roles derive both, below) but registered apart, so
--    each has its own sidebar entry, its own industry name ("Patient ledger"
--    in a practice) and its own opt-out — a roofer who bills from other
--    software can switch invoices off and still see what is owed.

-- ---------------------------------------------------------------------------
-- A customer is a party: a company, a person, or both
-- ---------------------------------------------------------------------------

alter table public.invoices
	alter column company_id drop not null;

alter table public.invoices
	add constraint invoices_has_customer
		check (company_id is not null or contact_id is not null);

comment on column public.invoices.company_id is
	'The company billed, if the customer is one. Null for a bill to a person (a patient, a homeowner); the check requires one of the two.';
comment on column public.invoices.contact_id is
	'The person billed — the customer themselves, or who to bill at the company. Null is fine for a company billed at an inbox; the check requires one of the two.';

alter table public.payments
	alter column company_id drop not null,
	add column contact_id uuid;

alter table public.payments
	add constraint payments_contact_id_org_id_fkey
		foreign key (contact_id, org_id) references public.contacts (id, org_id)
		on delete set null (contact_id),
	add constraint payments_has_customer
		check (company_id is not null or contact_id is not null);

comment on column public.payments.contact_id is
	'The person the money came from, when the customer is one. Mirrors invoices.contact_id; the check requires a company or a contact.';

create index payments_contact_id_idx on public.payments (contact_id);
-- Unapplied money per person, the partial the company already has.
create index payments_org_id_contact_id_unapplied_idx
	on public.payments (org_id, contact_id)
	where invoice_id is null;

-- The browser names the person it took money from, the way it names the
-- company — and, like the company, only when the payment is written: who
-- paid is a fact of record, so neither column is in the update grant.
-- Everything else the invoicing migration granted stands.
grant insert (contact_id) on table public.payments to authenticated;

-- The number is the trigger's, and the column is not grantable — so an
-- insert must be able to leave it out. A blank default says so in the schema
-- (and in the generated types, where the column stops being required);
-- assign_invoice_number() already treats blank as "assign the next".
alter table public.invoices alter column number set default '';

-- ---------------------------------------------------------------------------
-- Voiding hands its money back to the account
-- ---------------------------------------------------------------------------

-- A void invoice asks for nothing any more, so every payment applied to it
-- falls back to the customer's account, unapplied — the money still moved,
-- and it is there to put against the reissued bill. The database does it,
-- not the app, so a void is one guarded write and the two facts cannot come
-- apart halfway (a detach that lands while the status change does not
-- would leave an issued invoice reading unpaid). AFTER the update, so the
-- payment rollup that this fires can restate the row the change just wrote;
-- a BEFORE trigger would collide with its own statement.
create function public.detach_payments_from_void_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.payments
	set invoice_id = null
	where invoice_id = new.id;
	return null;
end;
$$;

create trigger invoices_void_detaches_payments
	after update of status on public.invoices
	for each row
	when (new.status = 'void' and old.status is distinct from 'void')
	execute procedure public.detach_payments_from_void_invoice();

-- ---------------------------------------------------------------------------
-- The features
-- ---------------------------------------------------------------------------

-- Filed under CRM, between the proposals they follow from (900) and the tasks
-- that follow them (1000), on the nav_sort_order convention: an invoice is
-- the bill a quote becomes, and the ledger is where the money it asks for
-- lands.
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('invoices', 'Invoices', 'invoice',
		'Bills sent to customers: drafted from lines, issued, paid or voided.',
		'/invoices', 'receipt', 'crm', 950),
	('ledger', 'Ledger', null,
		'Every charge and every payment, per customer and for the whole organization — and what is still owed.',
		'/ledger', 'wallet', 'crm', 975)
on conflict (id) do nothing;

-- No title of their own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('invoices', 'invoices', '/invoices', null),
	('ledger', 'ledger', '/ledger', null)
on conflict (id) do nothing;

-- Every industry bills someone, so both features go to the whole catalog.
-- "Invoices" reads the same everywhere; the ledger is named for who is on
-- it where that matters (null inherits "Ledger"). Listed rather than derived
-- because the rows carry words — and a place in the sidebar, since every
-- vertical but crm orders its CRM section itself (the industry_feature_order
-- migration) and a pair left to inherit 950/975 would read as a second list
-- after the ordered one. The bill sits where the money is handled: right
-- after the quote where the quote is the product, after the patient where
-- the patient is, after the proposal in a distributor's sequence. An
-- industry added later adds its two rows here with its own words and place.
insert into public.industry_features (industry_id, feature_id, name, noun, sort_order) values
	('crm', 'invoices', null, null, null),
	('crm', 'ledger', null, null, null),
	('roofing', 'invoices', null, null, 150),
	('roofing', 'ledger', null, null, 175),
	('medical-supplies', 'invoices', null, null, 550),
	('medical-supplies', 'ledger', 'Accounts receivable', null, 575),
	('cosmetic', 'invoices', null, null, 350),
	('cosmetic', 'ledger', 'Client ledger', null, 375),
	('dentistry', 'invoices', null, null, 450),
	('dentistry', 'ledger', 'Patient ledger', null, 475),
	('beverage', 'invoices', null, null, 550),
	('beverage', 'ledger', 'Accounts receivable', null, 575)
on conflict (industry_id, feature_id) do nothing;

-- Every plan, like proposals: getting paid is not an upgrade.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'invoices'),
	('pro', 'invoices'),
	('enterprise', 'invoices'),
	('free', 'ledger'),
	('pro', 'ledger'),
	('enterprise', 'ledger')
on conflict (tier_id, feature_id) do nothing;

-- The front line that takes money, listed first so the derivation below
-- cannot lower them: a practice's front desk bills and takes payment at the
-- counter, so it manages both; the desks that look accounts up read both.
insert into public.role_permissions (role_id, feature_id, level) values
	-- dentistry / Front Desk
	('b0000000-0000-0000-0005-000000000002', 'invoices', 'manage'),
	('b0000000-0000-0000-0005-000000000002', 'ledger', 'manage'),
	-- medical-supplies / Customer Service
	('b0000000-0000-0000-0003-000000000002', 'invoices', 'read'),
	('b0000000-0000-0000-0003-000000000002', 'ledger', 'read'),
	-- beverage / Account Support
	('b0000000-0000-0000-0006-000000000004', 'invoices', 'read'),
	('b0000000-0000-0000-0006-000000000004', 'ledger', 'read')
on conflict (role_id, feature_id) do nothing;

-- Whoever a role lets work proposals may bill and take payment at the same
-- level — derived, the way billables inherited proposals: the quote is what
-- the invoice is written from, and the ladder rungs (Viewer, Manager,
-- Director) come along with it.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, f.feature_id, rp.level
from public.role_permissions rp
cross join (values ('invoices'), ('ledger')) as f (feature_id)
where rp.feature_id = 'proposals'
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- What this migration deliberately leaves out
-- ---------------------------------------------------------------------------
-- 1. Statements and dunning. The ledger page IS the statement, read live; a
--    PDF of it and a reminder sent on a schedule need the scheduler and the
--    document rendering the invoicing migration also left out.
-- 2. A payment across several invoices. Still one row per invoice sharing a
--    `reference` (the invoicing migration's decision 1); the ledger groups
--    nothing by it yet. Splitting payments from allocations is the change to
--    make when someone needs it.
-- 3. Credit memos and write-offs. A refund moves money; a write-off reduces
--    what is owed without any moving, and is a document of its own (a sibling
--    of `invoices`), not a payment with a special method.
-- 4. Contact-level terms. A new invoice takes its terms from
--    `companies.payment_terms_days` when the customer is a company and none
--    were typed (the generic create form); a person's terms are typed on
--    the invoice, since a contact carries none.
--
-- Next: npm run db:reset (proves it replays onto an empty database), then
-- npm run db:types and commit the regenerated src/lib/database.types.ts.
