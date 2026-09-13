-- Slides: one deck per organization, presented for every proposal.
--
-- The slide_decks migration allowed many decks per org and gave proposals
-- a `deck_id` to pick one. That was a collection nobody needed: what an org
-- has is ONE slideshow — how its presentation is put together — and a
-- proposal is shown through it. A proposal is never presented through a
-- different deck, so nothing points at a deck, and no screen lists or names
-- decks. This migration makes the table say so:
--
--   * `slide_decks` is one row per org (`unique (org_id)`), so the builder
--     upserts on the org and the presenter reads by it. The org that has not
--     saved a deck yet has no row: the app's built-in default deck stands in
--     (src/lib/slides/default-deck.ts), and the first save creates the row.
--     Nothing inserts a row on signup — a load never writes.
--   * `name` goes: there is nothing to pick from, so nothing to name.
--   * `proposals.deck_id` goes, with the composite key it needed. Dropping
--     the column drops its foreign key and index with it; the column grants
--     are re-issued without it, the proposal_people pattern.
--
-- The deck's shape (deck_json) is unchanged: { version, slides: [{ id,
-- templateId, content }] }, validated on save by slideDeckSchema
-- (src/lib/schemas/decks.ts). `content.variables[key].sourceField` is a dot
-- path resolved against the proposal being presented ("client.name",
-- "presenter.name"), and an option-shaped slide is repeated once per
-- proposal option at present time — both in src/lib/slides/present.ts.
--
-- Two more things the builder needs: its page row, and somewhere to put the
-- images a slide shows — the `slides` storage bucket at the bottom.

-- ---------------------------------------------------------------------------
-- proposals: no deck pointer
-- ---------------------------------------------------------------------------

alter table public.proposals drop column deck_id;

revoke insert, update on table public.proposals from authenticated;
grant insert (org_id, entity_type, entity_id, title, base_config, status, default_fee, tax_rate,
		valid_until, presenter_id, responsible_id, created_by),
	update (entity_type, entity_id, title, base_config, status, default_fee, tax_rate, valid_until,
		selected_option_id, presenter_id, responsible_id)
	on table public.proposals to authenticated;

-- ---------------------------------------------------------------------------
-- slide_decks: one per org, unnamed
-- ---------------------------------------------------------------------------

-- The composite target existed only for proposals.deck_id.
alter table public.slide_decks drop constraint slide_decks_id_org_id_key;
alter table public.slide_decks drop column name;
-- The unique index serves the lookup the plain index did.
drop index public.slide_decks_org_id_idx;
alter table public.slide_decks add constraint slide_decks_org_id_key unique (org_id);

comment on table public.slide_decks is
	'The one slideshow an organization presents its proposals through: which slides, in what order, with what design. Holds no proposal data — that is injected at present time. An org with no row uses the built-in default deck.';

revoke insert, update on table public.slide_decks from authenticated;
grant insert (org_id, deck_json, created_by, updated_by),
	update (deck_json, updated_by)
	on table public.slide_decks to authenticated;

-- ---------------------------------------------------------------------------
-- The builder page
-- ---------------------------------------------------------------------------
-- A screen under the proposals feature, so the hook's gate on /proposals
-- already covers it and it is reachable only where the feature is; the page
-- itself asks for `manage`. Titled here, not by a record: "Slides" is what
-- the screen is in every industry.

insert into public.pages (id, feature_id, path, title) values
	('proposals-slides', 'proposals', '/proposals/slides', 'Slides')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The images slides show
-- ---------------------------------------------------------------------------
-- A public bucket: a slide's image URL is written into deck_json and read by
-- an <img> on every presentation, so a signed URL would expire inside the
-- document. Objects live under `<org_id>/<file>`, and the policies key on
-- that first path segment: members of the org write there (through the
-- upload endpoint, with their own session), owners and admins delete, and
-- nobody writes into another org's folder. Reads need no policy — the bucket
-- is public, and the URL is the only secret there is not.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
	('slides', 'slides', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Members can upload slide images to their org's folder"
	on storage.objects for insert to authenticated
	with check (
		bucket_id = 'slides'
		and private.org_role(((storage.foldername(name))[1])::uuid) is not null
	);

create policy "Owners and admins can delete slide images"
	on storage.objects for delete to authenticated
	using (
		bucket_id = 'slides'
		and private.org_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
	);
