-- Documents: the writing that has a title
-- ===========================================================================
-- The notes migration told two kinds of writing apart — an activity is a
-- MOMENT that happened, a note is a DOCUMENT that stays open — and then took
-- the second name for a sticky note. This table is the thing that name was
-- really pointing at, and the three now line up as a ladder:
--
--   note      "I need somewhere to put this right now."  Would you mind if it
--             vanished in a month? Named by its first line, kept on a rail,
--             capped at 20 000 characters of plain text.
--   document  "I am writing something down."  Does it have a title somebody
--             else would search for? The account strategy, the inspection
--             write-up, the scope of work, the onboarding runbook.
--   record    "The business tracks this."  Does anything sum, sort or filter
--             on it? Then it is a company, a deal, an invoice — a row with
--             columns, not prose.
--
-- A document is the missing middle, and the app has had nowhere for prose to
-- live: notes are a textarea, proposals are priced line items, a custom field
-- is one value. Nothing held the PARAGRAPH — the reasoning, the write-up, the
-- thing a colleague reads to understand an account before they call it.
--
-- WHAT MAKES IT THIS APP'S DOCUMENT rather than a wiki bolted on: every noun
-- in that prose can be a live reference to a record that already exists, with
-- its own page, its own feature gate and its own name in the org's industry.
-- `entity_references` below is that index, and it is what turns "writing"
-- into "part of the data" — a company's record page can answer "what have we
-- written about this account", which is a question no note, activity or
-- custom field has ever been able to answer.
--
-- WHAT IS NOT HERE, on purpose:
--
--   a block table      One row per block buys ordering machinery, a position
--                      column, a reorder transaction and a cascade, for a
--                      thing that is never read a row at a time. `slide_decks`
--                      already settled this: a body that is always read,
--                      written and versioned as a unit is jsonb. Apply the
--                      proposals test — would two unrelated industries ever
--                      query on it? — to a paragraph, and the answer is no.
--   a database block   Notion's model is "a database is a page of pages".
--                      This app's model is the opposite and stronger: a record
--                      is a row with a type, RLS, an industry name and a list
--                      its industry chose. A table-inside-a-document would be
--                      a second, untyped, ungated record system living in
--                      jsonb. Embedding a `views` row (a real, gate-checked
--                      query) is the honest version, and it lands with the
--                      `/view` block.
--   per-page sharing   Who may read a document is the `documents` feature's
--                      grant and this org's RLS, exactly like every other
--                      table here. A per-page ACL would be a second
--                      permission system, which is how leaks happen.
--   version history    `updated_at` and nothing else. Snapshots are cheap to
--                      add later (a `document_versions` table written by
--                      trigger) and expensive to design badly now.
--   co-editing         A whole-body jsonb save is last-write-wins, which is
--                      right for the documents people actually write here.
--                      Real co-editing is CRDTs, a presence channel and a
--                      different storage model — a rewrite entered
--                      deliberately, not a v1 that gets extended into.
--   templates          A vertical's own starting points ("Inspection report",
--                      "Treatment plan narrative") are the obvious next
--                      thing, and they are the `industry_custom_fields`
--                      shape: rows, copied into an org on creation. They land
--                      with the screen that offers them.

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

create table public.documents (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- Nesting, the one piece of Notion's page tree that earns its place: a
	-- runbook with a page per procedure, an account with a page per site.
	-- Cascades, because a child of a deleted page has no home to go back to.
	-- Deeper cycles are not refused here — the same call `product_categories`
	-- made: the pure fold that draws the tree surfaces a cycle as a root
	-- rather than dropping the rows, which is the failure a reader can act on.
	parent_id uuid references public.documents (id) on delete cascade,
	-- What the document is ABOUT, when it is about one record — the shared
	-- polymorphic link, nullable in both halves exactly as a note's is. A
	-- standalone page (the company handbook) is the common case and why.
	-- This is not the same fact as a reference below: a document is about one
	-- record and mentions many.
	entity_type public.crm_entity_type,
	entity_id uuid,
	-- Never null so a document being typed into is a row like any other, and
	-- blank is a legitimate state: a page is created untitled and named
	-- afterwards. What an untitled one is CALLED on screen is
	-- `documentTitle()` in src/lib/crm/documents.ts, the way `noteLabel()`
	-- names a note — never a placeholder written into the column.
	title text not null default '',
	-- One emoji, the way a Notion page wears one. Not a lucide slug: a
	-- feature's icon is the product's, and this one is the author's.
	icon text,
	-- The body, whole. The envelope is OURS, not the editor's: `blocks` holds
	-- what the editor emits verbatim, but `version` is this schema's number,
	-- so swapping the editor library is a renderer change rather than a
	-- migration. `documentBodySchema` (src/lib/schemas/documents.ts) validates
	-- the inside on save — the freeform-content tier of the proposals
	-- three-tier rule — and the database guarantees only the envelope, so an
	-- unknown block type is the renderer's problem rather than a refused save
	-- that loses somebody's writing.
	body jsonb not null default '{"version": 1, "blocks": []}'::jsonb,
	-- Out of the way without being gone, like a note's. Nullable rather than a
	-- boolean so the row records WHEN it was filed away.
	archived_at timestamptz,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint documents_entity_link_complete
		check ((entity_type is null) = (entity_id is null)),
	constraint documents_title_length check (length(title) <= 200),
	constraint documents_icon_length check (icon is null or length(icon) <= 16),
	constraint documents_not_own_parent check (parent_id is distinct from id),
	-- The envelope, and only the envelope — split and key-guarded exactly as
	-- `slide_decks` does it. The `?` is load-bearing: `jsonb_typeof` of a
	-- missing key is NULL, and a check constraint only fails on FALSE, so
	-- without it a body with no `version` at all would sail through.
	constraint documents_body_is_object
		check (jsonb_typeof(body) = 'object'),
	constraint documents_body_has_version
		check (body ? 'version' and jsonb_typeof(body -> 'version') = 'number'),
	constraint documents_body_has_blocks
		check (body ? 'blocks' and jsonb_typeof(body -> 'blocks') = 'array'),
	-- A document is long-form, not a file store: a megabyte of JSON is a
	-- novel. Images are objects in the bucket below and the body holds their
	-- URLs, so this bounds prose rather than content.
	constraint documents_body_size check (length(body::text) <= 1048576)
);

comment on table public.documents is
	'Writing with a title — the account strategy, the write-up, the runbook. Between a note (scratch, named by its first line) and a record (a row the business counts). Body is jsonb because it is always read and written whole; what it MENTIONS is lifted out into entity_references, because that is the one thing you cannot query from inside jsonb.';
comment on column public.documents.entity_type is
	'What the document is about, when it is about one record. Not the same fact as a reference: a document is about one thing and mentions many.';
comment on column public.documents.body is
	'{ version: number, blocks: [] } — our envelope, the editor''s blocks. Validated by documentBodySchema on save; the database guarantees only the envelope so an unreadable block never costs somebody their writing.';

create index documents_org_id_idx on public.documents (org_id);
-- The list: every open page in the org, most recently worked on first.
create index documents_org_updated_at_idx on public.documents (org_id, updated_at desc);
-- One record's pages, the way a record page's Pages tab reads them.
create index documents_entity_idx on public.documents (org_id, entity_type, entity_id);
create index documents_parent_id_idx on public.documents (parent_id);
create index documents_created_by_idx on public.documents (created_by);

create trigger documents_set_updated_at
	before update on public.documents
	for each row execute procedure public.set_updated_at();

create trigger documents_check_entity
	before insert or update of org_id, entity_type, entity_id on public.documents
	for each row execute procedure public.check_crm_entity_link();

-- A page's parent must be a page of the same org: the composite the
-- self-reference cannot express, and the tenant boundary a forged id would
-- otherwise cross.
create function public.check_document_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.parent_id is not null and not exists (
		select 1 from public.documents
		where id = new.parent_id and org_id = new.org_id
	) then
		raise exception 'document % does not exist in organization %',
			new.parent_id, new.org_id
			using errcode = 'foreign_key_violation';
	end if;
	return new;
end;
$$;

create trigger documents_check_parent
	before insert or update of org_id, parent_id on public.documents
	for each row execute procedure public.check_document_parent();

-- ---------------------------------------------------------------------------
-- entity_references — what a piece of writing points at
-- ---------------------------------------------------------------------------
-- The body is opaque jsonb, and a backlink is the one question you cannot ask
-- of it: "which documents mention this company" has to be an index. So the
-- editor extracts every reference on save and rewrites these rows — the same
-- split `proposals` makes between freeform content and the one queried thing
-- lifted out of it.
--
-- It reuses the shared polymorphic link on BOTH sides rather than inventing
-- `source_type`/`target_type` vocabularies of its own, which is CLAUDE.md's
-- "one polymorphic link, not one per table": a second enum meaning almost the
-- same thing would drift from `crm_entity_type` the first time a kind is
-- added, and this way a note becomes a source and any record a target with no
-- further work.
--
-- NOT the `relationships` table, and the difference is the point: a
-- relationship is CURATED — somebody chose a type with a forward and inverse
-- label, at most one open per pair, ended rather than deleted so a handover
-- stays history. A reference is DERIVED from text somebody typed, rewritten
-- wholesale on every save, and carries no meaning beyond "this was named
-- here". Putting derived rows in the curated table would make the graph noise
-- and fight its uniqueness rule.

-- `mention` is a name inside the prose; `embed` is a block that renders the
-- target. Only `mention` is written today. The second value ships now rather
-- than later because adding one costs a PAIRED migration (Postgres refuses to
-- use a value in the transaction that added it), and the `/view` block is a
-- named, planned writer rather than speculative headroom.
create type public.reference_kind as enum ('mention', 'embed');

create table public.entity_references (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- The writing doing the pointing — a document today, a note next.
	source_type public.crm_entity_type not null,
	source_id uuid not null,
	-- What it points at. Any kind: that is what makes a paragraph part of the
	-- data rather than a wall of text beside it.
	target_type public.crm_entity_type not null,
	target_id uuid not null,
	kind public.reference_kind not null default 'mention',
	created_at timestamptz not null default now(),
	-- Naming the same record twice in one page is one backlink, not two.
	unique (org_id, source_type, source_id, target_type, target_id, kind),
	constraint entity_references_not_self
		check (not (source_type = target_type and source_id = target_id))
);

comment on table public.entity_references is
	'The index of what a piece of writing names — derived from a body on save, never typed. Both ends are the shared (crm_entity_type, id) link. Not `relationships`: those are curated, typed and ended; these are extracted and rewritten.';

-- The two questions this table exists to answer, one index each.
create index entity_references_target_idx
	on public.entity_references (org_id, target_type, target_id);
create index entity_references_source_idx
	on public.entity_references (org_id, source_type, source_id);

-- Both ends exist in the reference's own org — the integrity a foreign key
-- cannot express, raised with the errcode `check_crm_entity_link` uses so app
-- -side error mapping stays uniform.
create function public.check_entity_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not private.crm_entity_exists(new.org_id, new.source_type, new.source_id) then
		raise exception 'crm record % % does not exist in organization %',
			new.source_type, new.source_id, new.org_id
			using errcode = 'foreign_key_violation';
	end if;

	if not private.crm_entity_exists(new.org_id, new.target_type, new.target_id) then
		raise exception 'crm record % % does not exist in organization %',
			new.target_type, new.target_id, new.org_id
			using errcode = 'foreign_key_violation';
	end if;

	return new;
end;
$$;

create trigger entity_references_check
	before insert or update of org_id, source_type, source_id, target_type, target_id
	on public.entity_references
	for each row execute procedure public.check_entity_reference();

-- ---------------------------------------------------------------------------
-- The shared polymorphic link learns about documents
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
		when 'document' then exists (select 1 from public.documents where id = entity and org_id = org)
		when 'invoice' then exists (select 1 from public.invoices where id = entity and org_id = org)
		when 'lease' then exists (select 1 from public.leases where id = entity and org_id = org)
		when 'member' then exists (select 1 from public.organization_members where user_id = entity and org_id = org)
		when 'order' then exists (select 1 from public.orders where id = entity and org_id = org)
		when 'product' then exists (select 1 from public.products where id = entity and org_id = org)
		when 'property' then exists (select 1 from public.properties where id = entity and org_id = org)
		when 'proposal' then exists (select 1 from public.proposals where id = entity and org_id = org)
		when 'proposal_option' then exists (select 1 from public.proposal_options where id = entity and org_id = org)
		when 'purchase' then exists (select 1 from public.purchases where id = entity and org_id = org)
		when 'rma' then exists (select 1 from public.rmas where id = entity and org_id = org)
		when 'shipment' then exists (select 1 from public.shipments where id = entity and org_id = org)
		when 'task' then exists (select 1 from public.tasks where id = entity and org_id = org)
		when 'ticket' then exists (select 1 from public.support_tickets where id = entity and org_id = org)
		when 'visit' then exists (select 1 from public.visits where id = entity and org_id = org)
		else false
	end
$$;

-- What happens when a record goes. Documents follow the asymmetry the notes
-- migration established and for the same reason: the WRITING stays and
-- detaches — deleting a company must not delete the strategy somebody spent
-- an afternoon on — while the INDEX entry goes, because a backlink pointing
-- at nothing is worse than no backlink at all.
create or replace function private.on_crm_entity_gone(org uuid, deleted_kind public.crm_entity_type, entity uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.proposals
	set entity_type = null, entity_id = null
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	update public.notes
	set entity_type = null, entity_id = null
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	update public.documents
	set entity_type = null, entity_id = null
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	update public.calendar_events
	set entity_type = null, entity_id = null
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	-- Before the generic deletes below: each visit's own trigger runs this
	-- function again for the visit, clearing its activities, tags, custom
	-- values and relationships.
	delete from public.visits
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	-- Both directions in one place: a deleted record's backlinks go, and a
	-- deleted document's own index goes with it (its delete trigger below
	-- calls this function with kind = 'document').
	delete from public.entity_references
	where org_id = org
		and ((source_type = deleted_kind and source_id = entity)
			or (target_type = deleted_kind and target_id = entity));

	delete from public.addresses
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.activities
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.taggings
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.custom_field_values
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.entity_images
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.relationships
	where org_id = org
		and ((from_type = deleted_kind and from_id = entity)
			or (to_type = deleted_kind and to_id = entity));
end;
$$;

create trigger documents_crm_entity_deleted
	after delete on public.documents
	for each row execute procedure public.on_crm_entity_deleted('document');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Working data, like visits and tickets — deliberately NOT the authored-
-- content shape a note takes. A note is one person's sticky note and only its
-- author may rewrite it; a document is the team's file on the account, and the
-- whole point of writing the handover down is that whoever covers for you can
-- correct it. Deletes stay owner/admin, as everywhere.

alter table public.documents enable row level security;

create policy "Members can view documents"
	on public.documents for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create documents as themselves"
	on public.documents for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update documents"
	on public.documents for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete documents"
	on public.documents for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

revoke insert, update on table public.documents from authenticated;
grant insert (org_id, parent_id, entity_type, entity_id, title, icon, body, archived_at, created_by),
	update (parent_id, entity_type, entity_id, title, icon, body, archived_at)
	on table public.documents to authenticated;

-- The index is derived from a body the member could already rewrite, so it is
-- writable by any member and interesting to none of them: a forged row can
-- only name two records of this org (the trigger above), and what a reader is
-- allowed to SEE of a reference is decided at read time by the same feature
-- gate the rest of the record page uses.
alter table public.entity_references enable row level security;

create policy "Members can view entity references"
	on public.entity_references for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can write entity references"
	on public.entity_references for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can clear entity references"
	on public.entity_references for delete to authenticated
	using (private.org_role(org_id) is not null);

-- No update policy and none wanted: rewriting a document's index is a delete
-- and an insert, so a row is never edited into meaning something else.
revoke insert, update on table public.entity_references from authenticated;
grant insert (org_id, source_type, source_id, target_type, target_id, kind)
	on table public.entity_references to authenticated;

-- ---------------------------------------------------------------------------
-- Where the pictures live
-- ---------------------------------------------------------------------------
-- An image block holds a URL, and this is the bucket those URLs point at.
-- Private, unlike `product-images`: a storefront serves a product photo to
-- anyone, while a page's screenshot of an account's rate sheet is the org's.
-- Reads therefore go through a signed URL minted server-side, and the folder
-- is the org id so the policies can check membership the same way.

insert into storage.buckets (id, name, public)
values ('document-images', 'document-images', false)
on conflict (id) do nothing;

create policy "Org members can view document images"
	on storage.objects for select to authenticated
	using (
		bucket_id = 'document-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) is not null
	);

create policy "Org members can upload document images"
	on storage.objects for insert to authenticated
	with check (
		bucket_id = 'document-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) is not null
	);

create policy "Org members can replace document images"
	on storage.objects for update to authenticated
	using (
		bucket_id = 'document-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) is not null
	)
	with check (
		bucket_id = 'document-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) is not null
	);

create policy "Owners and admins can delete document images"
	on storage.objects for delete to authenticated
	using (
		bucket_id = 'document-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
	);

-- ---------------------------------------------------------------------------
-- The feature
-- ---------------------------------------------------------------------------
-- `public.pages` is the route/title registry, so the TABLE could not be
-- called pages — but the screen still can be, and that is what
-- `features.name` / `noun` are for. Ship "Pages" as the default word and an
-- industry renames it with one `industry_features` column, exactly as it
-- renames Visits to Showings. Nothing in src/ ever hardcodes either word:
-- `recordTerms(page.data.terms, 'document')` is the accessor.
--
-- Filed under General beside Notes and after it — the order of the work: you
-- jot something down, then you write it up.

insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('documents', 'Pages', 'page',
		'Long-form writing that links to the records it is about.',
		'/documents', 'notebook-text', 'general', 300)
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
-- The page itself (/documents/<id>) has no row — its title is the document's
-- name, which is the record-page exception.
insert into public.pages (id, feature_id, path, title) values
	('documents', 'documents', '/documents', null)
on conflict (id) do nothing;

-- Every vertical writes things up, so the rows are derived rather than listed
-- (an industry added later inherits the feature instead of silently missing
-- it). The words, though, are each vertical's own — this is the feature whose
-- name differs most from industry to industry, which is exactly why the
-- rename mechanism exists.
insert into public.industry_features (industry_id, feature_id, name, noun)
select i.id, 'documents', v.name, v.noun
from public.industries i
left join (values
	-- A roofer's page is the file on the job: the scope, the measurements,
	-- what the crew found up there.
	('roofing', 'Job files', 'job file'),
	-- A practice writes up the patient, not the project.
	('dentistry', 'Chart notes', 'chart note'),
	('cosmetic', 'Client notes', 'client note'),
	-- A distributor's is the account plan behind the order.
	('medical-supplies', 'Account plans', 'account plan'),
	-- A technician's is the service write-up for the site.
	('beverage', 'Service notes', 'service note'),
	-- An agent's is the listing write-up and the tenancy file.
	('real-estate', 'Property files', 'property file'),
	-- An underwriter's is the memo behind the merchant.
	('merchant-services', 'Account memos', 'account memo')
) as v (industry_id, name, noun) on v.industry_id = i.id
on conflict (industry_id, feature_id) do nothing;

-- Every plan, including free: a product whose free tier cannot hold a written
-- page is not holding much (the notes migration's argument, unchanged).
insert into public.tier_features (tier_id, feature_id)
select t.id, 'documents'
from public.tiers t
on conflict (tier_id, feature_id) do nothing;

-- Whoever a role lets write a note may write a page, at the same level:
-- writing things down is not a specialty, it is what everyone with a job to
-- do needs, and every industry's ladder already answers it for notes. Derived
-- rather than listed so the two can never drift.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'documents', rp.level
from public.role_permissions rp
where rp.feature_id = 'notes'
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------
-- The title first and searchable (it is the link into the page), then what it
-- is about — the column that makes this a CRM's pages and not a wiki — then
-- who wrote it and when it was last touched. `created_at` is carried but not
-- shown: for a document the interesting date is the last edit, not the birth.

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('documents', 'name', true, true, false, 100),
	('documents', 'about', true, true, true, 200),
	('documents', 'author', true, false, true, 300),
	('documents', 'updated_at', true, false, false, 400),
	('documents', 'created_at', false, false, false, 500)
on conflict (feature_id, field) do nothing;

-- Next: npm run db:reset (proves it replays onto an empty database), then
-- npm run db:types and commit the regenerated src/lib/database.types.ts.
--
-- Adding to it:
--   a block type       app code only — a renderer and a zod branch in
--                      src/lib/schemas/documents.ts. Never a migration, and
--                      never one per industry (a `/roof-measurement` block
--                      would be the first crack; industry specifics are a
--                      custom field or a `views` row).
--   an embed           writes an `entity_references` row with kind = 'embed'
--                      so "what shows this view" stays answerable.
--   templates          a `document_templates` table plus
--                      `industry_document_templates`, copied into an org on
--                      creation by trigger — the `industry_custom_fields`
--                      shape exactly.
