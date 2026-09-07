-- Slide decks: the presentation a proposal is shown through.
--
-- A deck is a REUSABLE TEMPLATE, not a per-proposal artifact. It says which
-- slides appear, in what order, on which template, with what design and
-- static copy — and holds no proposal data at all. The proposal's own data
-- is injected when the deck is presented: the presenter loads the proposal
-- with its options, expands the option-shaped slides (one authored pricing
-- slide becomes one slide per proposal option), and binds each option's
-- figures into the template's props. That is why the same deck can present
-- every proposal an org sends, and why nothing here references `proposals`.
--
-- The whole slide list lives in one `deck_json` column rather than a slides
-- table. A deck is always read, written and versioned as a unit — the editor
-- loads it whole, saves it whole, and nothing ever queries across slides —
-- so rows per slide would buy ordering and referential machinery for a
-- document that is never accessed a row at a time. jsonb here is the right
-- call for exactly the reason docs/proposals.md gives for rejecting it
-- elsewhere: no two industries will ever query on the innards of a slide.
--
-- Shape (validated on save by slideDeckSchema in src/lib/schemas/decks.ts,
-- the freeform-content tier of the three-tier rule in docs/proposals.md):
--
--   {
--     "version": 1,
--     "slides": [
--       {
--         "id": "s1",
--         "templateId": "comparison-table",
--         "content": {
--           "text":   { "heading": "Compare Your Options" },
--           "images": { "logo": "https://…" },
--           "colors": { "accentColor": "#2563eb" },
--           "styles": { "textAlign": "center" },
--           "variables": { "heading": { "sourceField": "client.name" } }
--         }
--       }
--     ]
--   }
--
-- `variables` is the runtime binding: a key names a `text` entry, and its
-- `sourceField` is a dot path resolved against the live proposal at present
-- time ("client.name", "option.computed_total"), with the authored text as
-- the fallback when the path is missing.
--
-- Tenant-scoped per the canonical shape in the organizations migration, and
-- member-writable per the crm_core extension of it: members build decks,
-- owners/admins delete them.

create table public.slide_decks (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- A real column, not a field inside deck_json: the deck picker lists and
	-- orders by it, and one name in two places would need keeping in sync.
	name text not null,
	deck_json jsonb not null default '{"version": 1, "slides": []}'::jsonb,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	-- Decks are edited far more than they are created, and "who last touched
	-- this" is the question a shared template raises.
	updated_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Composite target for proposals.deck_id: a proposal can never point at a
	-- deck belonging to another org.
	unique (id, org_id),
	-- The database guarantees the envelope; Zod (slideDeckSchema) guarantees
	-- the slide shapes. Each key's presence is asserted before its type
	-- because `->` yields SQL NULL for a missing key and a CHECK passes on
	-- NULL — without the `?`, a deck with no slides key at all would be
	-- accepted and every reader would then have to cope with its absence.
	constraint slide_decks_deck_json_is_object
		check (jsonb_typeof(deck_json) = 'object'),
	constraint slide_decks_deck_json_has_version
		check (deck_json ? 'version' and jsonb_typeof(deck_json -> 'version') = 'number'),
	constraint slide_decks_deck_json_has_slides
		check (deck_json ? 'slides' and jsonb_typeof(deck_json -> 'slides') = 'array')
);

comment on table public.slide_decks is
	'A reusable presentation template: which slides, in what order, with what design. Holds no proposal data — that is injected at present time.';

comment on column public.slide_decks.deck_json is
	'The ordered slide list: { version, slides: [{ id, templateId, content }] }. Validated on save by slideDeckSchema.';

create index slide_decks_org_id_idx on public.slide_decks (org_id);

create trigger slide_decks_set_updated_at
	before update on public.slide_decks
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.slide_decks enable row level security;

create policy "Members can view slide decks"
	on public.slide_decks for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create slide decks as themselves"
	on public.slide_decks for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update slide decks as themselves"
	on public.slide_decks for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null and updated_by = (select auth.uid()));

create policy "Owners and admins can delete slide decks"
	on public.slide_decks for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a member may write, these decide which COLUMNS:
-- org_id and created_by are immutable from the browser, exactly as in
-- crm_core. `updated_by` is writable because the update policy pins it to
-- the caller. The service-role client ignores all of this.

revoke insert, update on table public.slide_decks from authenticated;
grant insert (org_id, name, deck_json, created_by, updated_by),
	update (name, deck_json, updated_by)
	on table public.slide_decks to authenticated;
