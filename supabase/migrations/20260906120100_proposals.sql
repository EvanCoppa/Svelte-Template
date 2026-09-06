-- Proposals: the universal "compare priced options and decide" entity every
-- vertical shares — a dental treatment plan, a roofing package quote, an
-- architecture design scheme, a CRM proposal, a medical supply order, a
-- plastics tooling quote. One proposal owns its proposal_options (Good /
-- Better / Best), and the options are what the comparison-table and
-- investment-summary slides render, so the shape is a side-by-side grid
-- with no per-industry code in the way. docs/proposals.md is the long form
-- of the three rules this schema encodes:
--
--   1. Universal attributes are typed columns, never jsonb. Price, fee,
--      discount, duration, financing — every vertical has them and the app
--      filters, sums and sorts on them. A vertical that lacks one leaves the
--      column null. jsonb (base_config, custom_fields, details) is the
--      escape hatch for what genuinely does not generalize: procedure
--      lists, roof pitch, mold cavity counts. The test: would two unrelated
--      industries ever query on it? If yes, it is a column.
--   2. The parent is a polymorphic link (entity_type + entity_id), never a
--      patient_id / job_id / deal_id column, so a new vertical needs no
--      change here. The kinds are the CRM records every vertical attaches
--      to — a dental patient is a client, a roofing job is a deal. Triggers
--      stand in for the foreign key Postgres cannot express.
--   3. Values are enforced where they belong. Fixed sets we own are enums.
--      Org-definable sets are a lookup table (custom_field_definitions) plus
--      a foreign key, so a value cannot exist without its definition. The
--      delimited strings the slides consume are validated by Zod in the
--      form action (src/lib/schemas/proposals.ts), parsed shape not raw text.
--
-- Money is server-owned: proposal_options.computed_total is maintained by
-- trigger and proposal_line_items.total is a generated column, so client
-- math is never trusted. Only the post-acceptance step (execution_records)
-- is allowed to differ per vertical; everything upstream of the decision is
-- shared.
--
-- Tenancy follows crm_core exactly. Every table carries org_id with the
-- canonical cascade, composite foreign keys tie each child to a parent in
-- the same org (a row can never point across tenants — this is how
-- proposal_events and execution_records inherit the proposal's org scope),
-- RLS is on everywhere, working data is member-writable and deletes are
-- owner/admin. Column-level grants keep org_id, authorship and every
-- server-computed column out of the browser's reach.

-- Fixed vocabularies we own: enums, like the crm_core statuses. Adding a
-- value is one `alter type ... add value` migration, never a column.
create type public.proposal_entity_type as enum ('client', 'contact', 'deal');
create type public.proposal_status as enum ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');
create type public.duration_unit as enum ('visits', 'days', 'weeks', 'months', 'sec');
create type public.custom_field_value_type as enum ('text', 'numeric', 'boolean', 'select');
create type public.proposal_event_type as enum ('sent', 'viewed', 'option_selected', 'accepted', 'declined', 'expired');
create type public.execution_type as enum ('appointment_schedule', 'work_order', 'purchase_order', 'production_run');

-- ---------------------------------------------------------------------------
-- private helpers
-- ---------------------------------------------------------------------------
-- Same schema and rationale as org_role: never exposed as RPC, SECURITY
-- DEFINER where they read other tables (a member inserting a proposal has
-- no business needing select on every parent kind), empty search_path
-- forcing qualified names.

-- The foreign key a polymorphic link cannot have: does this entity exist in
-- this org? One case per kind; a new kind is one more branch.
create function private.proposal_entity_exists(org uuid, kind public.proposal_entity_type, entity uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select case kind
		when 'client' then exists (select 1 from public.clients where id = entity and org_id = org)
		when 'contact' then exists (select 1 from public.client_contacts where id = entity and org_id = org)
		when 'deal' then exists (select 1 from public.deals where id = entity and org_id = org)
	end
$$;

-- The one formula behind computed_total, so a change to the pricing rule is
-- one edit. Discounts apply to the work (base price + line items); the fee
-- (the option's override, else the proposal's default) is added after them;
-- tax applies to everything. Each step rounds to cents.
create function private.proposal_option_total(
	option_id uuid,
	proposal uuid,
	base_price numeric,
	fee_override numeric,
	discount_amount numeric,
	discount_pct numeric
)
returns numeric
language plpgsql stable
security definer
set search_path = ''
as $$
declare
	proposal_fee numeric;
	proposal_tax_rate numeric;
	work numeric;
	pre_tax numeric;
begin
	select p.default_fee, p.tax_rate
	into proposal_fee, proposal_tax_rate
	from public.proposals p
	where p.id = proposal;

	select coalesce(base_price, 0) + coalesce(sum(li.total), 0)
	into work
	from public.proposal_line_items li
	where li.proposal_option_id = option_id;

	pre_tax := greatest(
		work - coalesce(discount_amount, 0) - round(work * coalesce(discount_pct, 0) / 100, 2),
		0
	) + coalesce(fee_override, proposal_fee, 0);

	return round(pre_tax + round(pre_tax * coalesce(proposal_tax_rate, 0) / 100, 2), 2);
end;
$$;

-- For the allowed_values check: a jsonb array whose every element is a
-- string. CASE (not AND) so a non-array never reaches jsonb_array_elements.
create function private.jsonb_is_string_array(value jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
	select case
		when jsonb_typeof(value) = 'array' then not exists (
			select 1 from jsonb_array_elements(value) element where jsonb_typeof(element) <> 'string'
		)
		else false
	end
$$;

-- ---------------------------------------------------------------------------
-- proposals — the decision, with its shared terms
-- ---------------------------------------------------------------------------

create table public.proposals (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- The polymorphic parent. Both null means an unattached draft; deleting
	-- the parent detaches (see the triggers below) rather than destroying
	-- a commercial record.
	entity_type public.proposal_entity_type,
	entity_id uuid,
	title text not null,
	-- Vertical-specific setup shared by every option (the base case): a
	-- dental diagnosis, a roof's measurements, a mold's part geometry.
	base_config jsonb not null default '{}'::jsonb,
	status public.proposal_status not null default 'draft',
	-- Terms every option inherits unless it overrides them. tax_rate is a
	-- percentage (8.25 = 8.25%).
	default_fee numeric(12, 2),
	tax_rate numeric(5, 2),
	valid_until timestamptz,
	-- The option the client chose. The foreign key is added after
	-- proposal_options exists; it is composite so the selection can only
	-- ever be one of this proposal's own options.
	selected_option_id uuid,
	-- Which deck presents this proposal. A deck is a reusable template that
	-- holds no proposal data (see the slide_decks migration), so this is a
	-- plain pointer, not a join table: a proposal is presented through one
	-- deck, and null means "the org's default". Composite, so the deck must
	-- belong to this org; dropping the deck falls the proposal back to the
	-- default rather than deleting it.
	deck_id uuid,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (deck_id, org_id) references public.slide_decks (id, org_id)
		on delete set null (deck_id),
	-- Composite target for child-table FKs, same trick as clients.
	unique (id, org_id),
	constraint proposals_entity_link_complete
		check ((entity_type is null) = (entity_id is null)),
	constraint proposals_base_config_is_object
		check (jsonb_typeof(base_config) = 'object'),
	constraint proposals_default_fee_nonnegative
		check (default_fee is null or default_fee >= 0),
	constraint proposals_tax_rate_is_percent
		check (tax_rate is null or tax_rate between 0 and 100),
	-- An accepted proposal always records what was accepted.
	constraint proposals_accepted_has_selection
		check (status <> 'accepted' or selected_option_id is not null)
);

comment on table public.proposals is
	'A set of priced options offered to a client record for a decision. Universal across verticals; the parent is a polymorphic (entity_type, entity_id) link.';

create index proposals_org_id_idx on public.proposals (org_id);
-- The list page: an org's proposals by status.
create index proposals_org_id_status_idx on public.proposals (org_id, status);
-- The record page: every proposal attached to one client / contact / deal.
create index proposals_org_id_entity_idx on public.proposals (org_id, entity_type, entity_id);
create index proposals_selected_option_id_idx on public.proposals (selected_option_id);
create index proposals_deck_id_idx on public.proposals (deck_id);

create trigger proposals_set_updated_at
	before update on public.proposals
	for each row execute procedure public.set_updated_at();

-- Referential integrity for the polymorphic link. SECURITY DEFINER because
-- the helper lives in `private`, which only stored expressions (policies,
-- checks) may reach as the calling user; raising with the foreign-key
-- errcode keeps app-side error mapping uniform.
create function public.check_proposal_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	-- A half-set link is the check constraint's to report; this only asks
	-- whether a complete link points at something real.
	if new.entity_type is not null and new.entity_id is not null
		and not private.proposal_entity_exists(new.org_id, new.entity_type, new.entity_id)
	then
		raise exception 'proposal parent % % does not exist in organization %',
			new.entity_type, new.entity_id, new.org_id
			using errcode = 'foreign_key_violation';
	end if;
	return new;
end;
$$;

create trigger proposals_check_entity
	before insert or update of org_id, entity_type, entity_id on public.proposals
	for each row execute procedure public.check_proposal_entity();

-- The `on delete set null` half of that foreign key: when a parent record
-- goes, its proposals stay, detached — the tickets rule from crm_core, not
-- the cascade one, because an accepted proposal is a commercial record.
-- One function, parameterised by the kind, attached to every parent table.
create function public.detach_proposals_from_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.proposals
	set entity_type = null, entity_id = null
	where org_id = old.org_id
		and entity_type = tg_argv[0]::public.proposal_entity_type
		and entity_id = old.id;
	return old;
end;
$$;

create trigger clients_detach_proposals
	after delete on public.clients
	for each row execute procedure public.detach_proposals_from_entity('client');

create trigger client_contacts_detach_proposals
	after delete on public.client_contacts
	for each row execute procedure public.detach_proposals_from_entity('contact');

create trigger deals_detach_proposals
	after delete on public.deals
	for each row execute procedure public.detach_proposals_from_entity('deal');

-- ---------------------------------------------------------------------------
-- proposal_options — the Good / Better / Best rows
-- ---------------------------------------------------------------------------

create table public.proposal_options (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	proposal_id uuid not null,
	label text not null,
	sort_order integer not null default 0,
	is_recommended boolean not null default false,

	-- Pricing. Money as numeric, never float (the deals rule).
	base_price numeric(12, 2) not null default 0,
	-- null = inherit proposals.default_fee.
	fee_override numeric(12, 2),
	discount_amount numeric(12, 2) not null default 0,
	discount_pct numeric(5, 2),
	currency text not null default 'USD',
	-- Maintained by trigger from the columns above, the option's line items
	-- and the proposal's fee/tax; never written by a client.
	computed_total numeric(12, 2),

	-- Duration. A dental plan counts visits, a roof counts days, a
	-- production run counts seconds of cycle time.
	duration_value numeric,
	duration_unit public.duration_unit,
	start_offset_days integer,

	-- Financing.
	financing_available boolean not null default false,
	financing_term_months integer,
	financing_apr numeric(5, 2),

	primary_image_url text,
	-- The escape hatch: what only this vertical's renderer reads.
	custom_fields jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (proposal_id, org_id) references public.proposals (id, org_id) on delete cascade,
	-- Composite targets: (id, proposal_id) for the proposal's selection and
	-- execution records, (id, org_id) for the option's own children.
	unique (id, proposal_id),
	unique (id, org_id),
	constraint proposal_options_base_price_nonnegative
		check (base_price >= 0),
	constraint proposal_options_fee_override_nonnegative
		check (fee_override is null or fee_override >= 0),
	constraint proposal_options_discount_amount_nonnegative
		check (discount_amount >= 0),
	constraint proposal_options_discount_pct_is_percent
		check (discount_pct is null or discount_pct between 0 and 100),
	constraint proposal_options_currency_is_iso4217
		check (currency ~ '^[A-Z]{3}$'),
	constraint proposal_options_duration_complete
		check ((duration_value is null) = (duration_unit is null)),
	constraint proposal_options_duration_nonnegative
		check (duration_value is null or duration_value >= 0),
	constraint proposal_options_start_offset_nonnegative
		check (start_offset_days is null or start_offset_days >= 0),
	constraint proposal_options_financing_term_positive
		check (financing_term_months is null or financing_term_months > 0),
	constraint proposal_options_financing_apr_nonnegative
		check (financing_apr is null or financing_apr >= 0),
	constraint proposal_options_custom_fields_is_object
		check (jsonb_typeof(custom_fields) = 'object')
);

comment on table public.proposal_options is
	'One column of the comparison grid: a priced, timed, financeable choice within a proposal. computed_total is server-owned.';

create index proposal_options_org_id_idx on public.proposal_options (org_id);
-- The grid, in order.
create index proposal_options_proposal_id_sort_order_idx
	on public.proposal_options (proposal_id, sort_order);

create trigger proposal_options_set_updated_at
	before update on public.proposal_options
	for each row execute procedure public.set_updated_at();

-- computed_total on every write. SECURITY DEFINER for the `private` reach
-- explained on check_proposal_entity; assigning to NEW needs no grant, so a
-- client can never smuggle a total in — this overwrites whatever it sent.
create function public.set_proposal_option_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	new.computed_total := private.proposal_option_total(
		new.id, new.proposal_id, new.base_price, new.fee_override, new.discount_amount, new.discount_pct
	);
	return new;
end;
$$;

create trigger proposal_options_set_computed_total
	before insert or update on public.proposal_options
	for each row execute procedure public.set_proposal_option_total();

-- Now that both tables exist: the selection FK. Composite, so the chosen
-- option must belong to this very proposal; deleting the option clears the
-- selection (PG15+ column list, as in crm_core).
alter table public.proposals
	add foreign key (selected_option_id, id) references public.proposal_options (id, proposal_id)
		on delete set null (selected_option_id);

-- ---------------------------------------------------------------------------
-- custom_field_definitions — the org-definable vocabulary
-- ---------------------------------------------------------------------------

-- The lookup table behind rule 3: an org declares the comparison rows its
-- vertical needs (warranty years, material grade, cavity count) once, typed,
-- and proposal_custom_field_values can only ever reference a declared one.
-- Org configuration, so owner/admin-writable like organization_disabled_features.
create table public.custom_field_definitions (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- Stable machine name (snake_case), what app code and imports use.
	key text not null,
	-- What the comparison grid shows.
	label text not null,
	value_type public.custom_field_value_type not null,
	-- The choices for a select field, a jsonb array of strings; null for
	-- every other type. A value must be one of them (trigger below).
	allowed_values jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (org_id, key),
	-- Composite target for proposal_custom_field_values.
	unique (id, org_id),
	constraint custom_field_definitions_key_is_snake_case
		check (key ~ '^[a-z][a-z0-9_]*$'),
	constraint custom_field_definitions_allowed_values_for_select_only
		check ((value_type = 'select') = (allowed_values is not null)),
	constraint custom_field_definitions_allowed_values_are_strings
		check (allowed_values is null or (
			private.jsonb_is_string_array(allowed_values)
			and jsonb_array_length(allowed_values) > 0
		))
);

comment on table public.custom_field_definitions is
	'An org-defined, typed attribute its proposal options carry (a comparison row). The lookup table a custom value must reference.';

create trigger custom_field_definitions_set_updated_at
	before update on public.custom_field_definitions
	for each row execute procedure public.set_updated_at();

-- A definition cannot change out from under its values: the type is fixed
-- once a value exists, and shrinking a select's choices must not strand a
-- stored choice. SECURITY DEFINER to count values across every proposal.
create function public.check_custom_field_definition_values()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.value_type <> old.value_type and exists (
		select 1 from public.proposal_custom_field_values where field_definition_id = new.id
	) then
		raise exception 'custom field % has values; its type cannot change', new.key
			using errcode = 'check_violation';
	end if;

	if new.value_type = 'select' and exists (
		select 1 from public.proposal_custom_field_values
		where field_definition_id = new.id and not new.allowed_values ? value_text
	) then
		raise exception 'custom field % has values outside its new allowed values', new.key
			using errcode = 'check_violation';
	end if;

	return new;
end;
$$;

create trigger custom_field_definitions_check_values
	before update of value_type, allowed_values on public.custom_field_definitions
	for each row execute procedure public.check_custom_field_definition_values();

-- ---------------------------------------------------------------------------
-- proposal_custom_field_values — one typed cell per option per definition
-- ---------------------------------------------------------------------------

create table public.proposal_custom_field_values (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	proposal_option_id uuid not null,
	field_definition_id uuid not null,
	value_text text,
	value_numeric numeric,
	value_boolean boolean,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (proposal_option_id, org_id) references public.proposal_options (id, org_id) on delete cascade,
	-- Rule 3: no definition, no value. Both composite FKs also pin the
	-- definition and the option to the same org.
	foreign key (field_definition_id, org_id) references public.custom_field_definitions (id, org_id) on delete cascade,
	unique (proposal_option_id, field_definition_id),
	-- Exactly one typed column carries the value; which one is the
	-- definition's business (trigger below).
	constraint proposal_custom_field_values_exactly_one_value
		check (num_nonnulls(value_text, value_numeric, value_boolean) = 1)
);

comment on table public.proposal_custom_field_values is
	'The value an option holds for one custom field definition, in the column that matches the definition''s type.';

create index proposal_custom_field_values_org_id_idx on public.proposal_custom_field_values (org_id);
create index proposal_custom_field_values_field_definition_id_idx
	on public.proposal_custom_field_values (field_definition_id);

create trigger proposal_custom_field_values_set_updated_at
	before update on public.proposal_custom_field_values
	for each row execute procedure public.set_updated_at();

-- The value must sit in the column its definition's type names, and a
-- select value must be one of the definition's choices. A missing
-- definition is left for the foreign key to report.
create function public.check_proposal_custom_field_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	definition record;
begin
	select value_type, allowed_values
	into definition
	from public.custom_field_definitions
	where id = new.field_definition_id;

	if not found then
		return new;
	end if;

	if (definition.value_type in ('text', 'select') and new.value_text is null)
		or (definition.value_type = 'numeric' and new.value_numeric is null)
		or (definition.value_type = 'boolean' and new.value_boolean is null)
	then
		raise exception 'custom field % expects a % value', new.field_definition_id, definition.value_type
			using errcode = 'check_violation';
	end if;

	if definition.value_type = 'select' and not definition.allowed_values ? new.value_text then
		raise exception 'value "%" is not an allowed value of custom field %', new.value_text, new.field_definition_id
			using errcode = 'check_violation';
	end if;

	return new;
end;
$$;

create trigger proposal_custom_field_values_check_value
	before insert or update on public.proposal_custom_field_values
	for each row execute procedure public.check_proposal_custom_field_value();

-- ---------------------------------------------------------------------------
-- proposal_line_items — itemised work inside an option
-- ---------------------------------------------------------------------------

create table public.proposal_line_items (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	proposal_option_id uuid not null,
	label text not null,
	quantity numeric not null default 1,
	unit_cost numeric(12, 2) not null default 0,
	sort_order integer not null default 0,
	-- Server-owned: Postgres computes it, nobody writes it.
	total numeric(12, 2) generated always as (round(quantity * unit_cost, 2)) stored,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (proposal_option_id, org_id) references public.proposal_options (id, org_id) on delete cascade,
	constraint proposal_line_items_quantity_nonnegative
		check (quantity >= 0),
	constraint proposal_line_items_unit_cost_nonnegative
		check (unit_cost >= 0)
);

comment on table public.proposal_line_items is
	'One priced line inside an option (a procedure, a material, a unit at a volume tier). total is generated.';

create index proposal_line_items_org_id_idx on public.proposal_line_items (org_id);
create index proposal_line_items_proposal_option_id_sort_order_idx
	on public.proposal_line_items (proposal_option_id, sort_order);

create trigger proposal_line_items_set_updated_at
	before update on public.proposal_line_items
	for each row execute procedure public.set_updated_at();

-- Anything that moves a total that is not the option row itself — its line
-- items, or the proposal's shared fee and tax — pushes the recompute down
-- to the option. SECURITY DEFINER: computed_total is not in any grant, so
-- the update must run as the owner, not as the member editing a line.
create function public.refresh_proposal_option_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	option_id uuid;
begin
	-- Two statements, not one with a CASE: plpgsql resolves NEW's fields per
	-- statement, and NEW is a proposal in one firing and a line item in the
	-- other.
	if tg_table_name = 'proposal_line_items' then
		option_id := case tg_op when 'DELETE' then old.proposal_option_id else new.proposal_option_id end;
		update public.proposal_options o
		set computed_total = private.proposal_option_total(
			o.id, o.proposal_id, o.base_price, o.fee_override, o.discount_amount, o.discount_pct
		)
		where o.id = option_id;
	else
		update public.proposal_options o
		set computed_total = private.proposal_option_total(
			o.id, o.proposal_id, o.base_price, o.fee_override, o.discount_amount, o.discount_pct
		)
		where o.proposal_id = new.id;
	end if;
	return null;
end;
$$;

create trigger proposal_line_items_refresh_option_total
	after insert or delete or update of quantity, unit_cost on public.proposal_line_items
	for each row execute procedure public.refresh_proposal_option_totals();

create trigger proposals_refresh_option_totals
	after update of default_fee, tax_rate on public.proposals
	for each row execute procedure public.refresh_proposal_option_totals();

-- ---------------------------------------------------------------------------
-- proposal_events — what happened to a proposal, in order
-- ---------------------------------------------------------------------------

-- Append-only. Members log what they did as themselves; the client-facing
-- view (a public link, no member session) logs through the service-role
-- client with a null actor. Deliberately no update or delete policy: the
-- record of a decision is not editable, and it lives and dies with its
-- proposal.
create table public.proposal_events (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	proposal_id uuid not null,
	event_type public.proposal_event_type not null,
	-- Which option an option_selected / accepted event refers to. A typed
	-- column, not metadata, because every vertical reports on it.
	proposal_option_id uuid,
	actor uuid references auth.users (id) on delete set null default auth.uid(),
	occurred_at timestamptz not null default now(),
	-- Free detail: user agent, the page viewed, the decline reason.
	metadata jsonb not null default '{}'::jsonb,
	foreign key (proposal_id, org_id) references public.proposals (id, org_id) on delete cascade,
	foreign key (proposal_option_id, proposal_id) references public.proposal_options (id, proposal_id)
		on delete set null (proposal_option_id),
	constraint proposal_events_metadata_is_object
		check (jsonb_typeof(metadata) = 'object')
);

comment on table public.proposal_events is
	'Append-only timeline of a proposal: sent, viewed, an option selected, accepted, declined, expired.';

create index proposal_events_org_id_idx on public.proposal_events (org_id);
-- The timeline: newest first for one proposal.
create index proposal_events_proposal_id_occurred_at_idx
	on public.proposal_events (proposal_id, occurred_at desc);
create index proposal_events_proposal_option_id_idx on public.proposal_events (proposal_option_id);

-- ---------------------------------------------------------------------------
-- execution_records — what happens after acceptance (vertical-specific)
-- ---------------------------------------------------------------------------

-- Rule 6: the one table allowed to differ per industry. The kind of record
-- is a fixed set we own (enum); its status vocabulary and shape are the
-- vertical's (text + details jsonb) — an appointment schedule and a
-- production run share nothing past "which option, for which proposal".
create table public.execution_records (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	proposal_id uuid not null,
	proposal_option_id uuid not null,
	execution_type public.execution_type not null,
	status text not null default 'pending',
	details jsonb not null default '{}'::jsonb,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (proposal_id, org_id) references public.proposals (id, org_id) on delete cascade,
	-- The executed option must be one of this proposal's own.
	foreign key (proposal_option_id, proposal_id) references public.proposal_options (id, proposal_id)
		on delete cascade,
	constraint execution_records_status_not_blank
		check (length(trim(status)) > 0),
	constraint execution_records_details_is_object
		check (jsonb_typeof(details) = 'object')
);

comment on table public.execution_records is
	'The vertical-specific follow-through on an accepted option: appointments, a work order, a purchase order, a production run.';

create index execution_records_org_id_idx on public.execution_records (org_id);
create index execution_records_proposal_id_idx on public.execution_records (proposal_id);
create index execution_records_proposal_option_id_idx on public.execution_records (proposal_option_id);

create trigger execution_records_set_updated_at
	before update on public.execution_records
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.proposals enable row level security;
alter table public.proposal_options enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.proposal_custom_field_values enable row level security;
alter table public.proposal_line_items enable row level security;
alter table public.proposal_events enable row level security;
alter table public.execution_records enable row level security;

-- proposals ----------------------------------------------------------------

create policy "Members can view proposals"
	on public.proposals for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create proposals as themselves"
	on public.proposals for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update proposals"
	on public.proposals for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete proposals"
	on public.proposals for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- proposal_options ---------------------------------------------------------

create policy "Members can view proposal options"
	on public.proposal_options for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create proposal options"
	on public.proposal_options for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can update proposal options"
	on public.proposal_options for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete proposal options"
	on public.proposal_options for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- custom_field_definitions -------------------------------------------------
-- Org configuration: everyone reads it (the grid renders from it), only
-- owners/admins shape it — the canonical block, not the crm_core extension.

create policy "Members can view custom field definitions"
	on public.custom_field_definitions for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners and admins can create custom field definitions"
	on public.custom_field_definitions for insert to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update custom field definitions"
	on public.custom_field_definitions for update to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can delete custom field definitions"
	on public.custom_field_definitions for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- proposal_custom_field_values ---------------------------------------------

create policy "Members can view custom field values"
	on public.proposal_custom_field_values for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create custom field values"
	on public.proposal_custom_field_values for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can update custom field values"
	on public.proposal_custom_field_values for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete custom field values"
	on public.proposal_custom_field_values for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- proposal_line_items ------------------------------------------------------

create policy "Members can view line items"
	on public.proposal_line_items for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create line items"
	on public.proposal_line_items for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can update line items"
	on public.proposal_line_items for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete line items"
	on public.proposal_line_items for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- proposal_events ----------------------------------------------------------
-- Append-only: select and insert-as-self, nothing else (see the table).

create policy "Members can view proposal events"
	on public.proposal_events for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can log proposal events as themselves"
	on public.proposal_events for insert to authenticated
	with check (private.org_role(org_id) is not null and actor = (select auth.uid()));

-- execution_records --------------------------------------------------------

create policy "Members can view execution records"
	on public.execution_records for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create execution records as themselves"
	on public.execution_records for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update execution records"
	on public.execution_records for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete execution records"
	on public.execution_records for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a member may write, these decide which COLUMNS —
-- the crm_core mechanism. Excluded everywhere: org_id from updates (rows
-- never move between orgs), authorship (created_by, actor), the parent
-- link of a child row (an option stays with its proposal, a line with its
-- option), and every server-computed column (computed_total, total,
-- occurred_at). selected_option_id is update-only because no option can
-- exist before its proposal does. The service-role client ignores all of
-- this.

revoke insert, update on table public.proposals from authenticated;
grant insert (org_id, entity_type, entity_id, title, base_config, status, default_fee, tax_rate,
		valid_until, deck_id, created_by),
	update (entity_type, entity_id, title, base_config, status, default_fee, tax_rate, valid_until,
		selected_option_id, deck_id)
	on table public.proposals to authenticated;

revoke insert, update on table public.proposal_options from authenticated;
grant insert (org_id, proposal_id, label, sort_order, is_recommended, base_price, fee_override,
		discount_amount, discount_pct, currency, duration_value, duration_unit, start_offset_days,
		financing_available, financing_term_months, financing_apr, primary_image_url, custom_fields),
	update (label, sort_order, is_recommended, base_price, fee_override, discount_amount,
		discount_pct, currency, duration_value, duration_unit, start_offset_days,
		financing_available, financing_term_months, financing_apr, primary_image_url, custom_fields)
	on table public.proposal_options to authenticated;

-- value_type is fixed at creation from the browser (the trigger guards the
-- service-role path too): values already stored depend on it.
revoke insert, update on table public.custom_field_definitions from authenticated;
grant insert (org_id, key, label, value_type, allowed_values),
	update (key, label, allowed_values)
	on table public.custom_field_definitions to authenticated;

revoke insert, update on table public.proposal_custom_field_values from authenticated;
grant insert (org_id, proposal_option_id, field_definition_id, value_text, value_numeric, value_boolean),
	update (value_text, value_numeric, value_boolean)
	on table public.proposal_custom_field_values to authenticated;

revoke insert, update on table public.proposal_line_items from authenticated;
grant insert (org_id, proposal_option_id, label, quantity, unit_cost, sort_order),
	update (label, quantity, unit_cost, sort_order)
	on table public.proposal_line_items to authenticated;

-- Append-only, so no update grant at all; occurred_at is always now().
revoke insert, update on table public.proposal_events from authenticated;
grant insert (org_id, proposal_id, event_type, proposal_option_id, actor, metadata)
	on table public.proposal_events to authenticated;

revoke insert, update on table public.execution_records from authenticated;
grant insert (org_id, proposal_id, proposal_option_id, execution_type, status, details, created_by),
	update (status, details)
	on table public.execution_records to authenticated;
