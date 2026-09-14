-- content_chunks — what a model is allowed to read, in pieces it can read
-- ===========================================================================
-- Retrieval, built into the schema rather than bolted onto one feature.
--
-- The documents migration gave the app somewhere for prose to live and an
-- index of what that prose NAMES (`entity_references`). This is the other
-- index: what the prose SAYS, cut into passages and embedded, so the
-- assistant can answer "what did we agree about the north elevation?" without
-- being handed every page in the org.
--
-- WHY IT IS NOT `document_chunks`. CLAUDE.md: "one polymorphic link, not one
-- per table." A chunk table keyed to `document_id` would be the second
-- mechanism the first time a note, a ticket thread or a visit's write-up
-- wanted the same treatment — and every one of them will. So a chunk points
-- at its source through the link the whole CRM already shares, which buys
-- three things for nothing: `private.crm_entity_exists()` validates the
-- pointer, `private.on_crm_entity_gone()` cleans up when the source is
-- deleted, and a new kind joins retrieval by being chunked in app code with
-- no migration at all. Documents are simply the first source.
--
-- WHAT IS A CHUNK. Not a block: a block is a paragraph, and a paragraph on
-- its own is usually too small to answer anything. `chunkDocument()` in
-- `$lib/ai/chunks.ts` accumulates blocks into passages under a character
-- budget, breaking at headings and prefixing each passage with the heading
-- trail above it, so a passage read on its own still says what it is about.
-- **That is deterministic code and a model never does it** — the same line
-- the notes plan draws around arithmetic, for the same reasons: correctness,
-- latency and testability.
--
-- WHAT IS NOT HERE, on purpose:
--
--   a chunk per kind    the shape is the same for prose wherever it comes
--                       from. What differs is how a source is CUT, and that
--                       is a function in app code, not a column.
--   a rerank stage      a second model pass over the top matches. It is a
--                       real improvement and an easy one to add later
--                       (`rerank()` ships in the AI SDK); it earns its cost
--                       when there is enough content for the top 8 to be the
--                       wrong 8, which is not yet true of any org here.
--   a summary column    a model-written precis of each page, stored. That is
--                       generated content presented as fact, refreshed on a
--                       cadence nothing here runs, and it goes stale
--                       silently. The passages ARE the page's own words.
--   a job queue         nothing in this app runs background work, and
--                       inventing a worker for this would be a second
--                       infrastructure. Instead the write path stores the
--                       TEXT (cheap, synchronous, never lost) and leaves
--                       `embedding` null; the read path tops up what is
--                       pending, capped, before it searches. Typing costs no
--                       embedding calls at all, and the index is
--                       self-healing after an outage or a model change.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- The dimension is pinned, and that is a decision with a cost
-- ---------------------------------------------------------------------------
-- A vector column has a fixed width, so the embedding model's output size is
-- part of the schema. 1536 is `text-embedding-3-small`, and it is also what
-- `text-embedding-3-large` produces when asked for 1536 dimensions — which
-- `embeddingCallOptions()` in src/lib/server/ai/provider.ts always asks for.
-- So `AI_EMBEDDING_MODEL` can move between those without a migration.
--
-- A model with a different native width DOES need a migration, and the rows
-- carry `embedding_model` so the ones written by the old model can be found
-- and re-embedded rather than quietly compared against vectors they do not
-- share a space with. Comparing embeddings from two models is not an error
-- Postgres can raise — it just returns nonsense — which is why the column is
-- here at all.

create table public.content_chunks (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- What this passage came out of. The shared polymorphic link, NOT NULL on
	-- both halves: a chunk of nothing cannot be cited, and citing the source
	-- is the whole point of retrieval.
	entity_type public.crm_entity_type not null,
	entity_id uuid not null,
	-- Where the passage sits in its source, so the reader can be given them
	-- in the order they were written.
	chunk_index integer not null,
	-- The passage as the model sees it, heading trail included.
	content text not null,
	-- What decides whether this passage needs embedding again. Hashing the
	-- CONTENT rather than the document means editing paragraph three
	-- re-embeds paragraph three, not the other forty.
	content_hash text not null,
	embedding extensions.vector(1536),
	-- Which model produced the vector, and when. Both null is "written but
	-- not embedded yet", which is the normal state for a second or two after
	-- a save and the state the top-up pass looks for.
	embedding_model text,
	embedded_at timestamptz,
	-- The fallback, and a genuinely better answer for names and codes: an
	-- exact word beats a nearby one when somebody searches for "MID" or a
	-- part number. Also what makes the whole feature work with no AI provider
	-- configured at all.
	search_text tsvector generated always as (to_tsvector('english', content)) stored,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (org_id, entity_type, entity_id, chunk_index),
	constraint content_chunks_index_not_negative check (chunk_index >= 0),
	constraint content_chunks_content_not_blank check (length(trim(content)) > 0),
	-- Far above any chunk `chunkDocument()` emits; this catches a hand-made
	-- row, not a long paragraph.
	constraint content_chunks_content_length check (length(content) <= 8000),
	constraint content_chunks_hash_length check (length(content_hash) between 16 and 128),
	-- A vector with no model beside it cannot be re-embedded on a model
	-- change, and a model with no vector is a lie about what is indexed.
	constraint content_chunks_embedding_complete check (
		(embedding is null) = (embedding_model is null)
		and (embedding is null) = (embedded_at is null)
	)
);

comment on table public.content_chunks is
	'Passages of an org''s own writing, embedded for retrieval. Points at its source through the shared (crm_entity_type, entity_id) link, so any kind can be indexed without a table of its own. Rows are DERIVED — rebuilt from the source on save, never authored.';
comment on column public.content_chunks.content_hash is
	'Hash of `content`. The one thing that says whether this passage needs embedding again, so an edit re-embeds the paragraph that changed rather than the page.';
comment on column public.content_chunks.embedding is
	'Null means written but not embedded yet — the state the top-up pass looks for. Never an error: the row is still searchable by text.';

create index content_chunks_org_id_idx on public.content_chunks (org_id);
-- One source's passages: what a rewrite replaces and what a citation reads.
create index content_chunks_entity_idx
	on public.content_chunks (org_id, entity_type, entity_id, chunk_index);
-- The top-up pass: everything this org has written but not yet embedded.
create index content_chunks_pending_idx
	on public.content_chunks (org_id) where embedding is null;
-- Nearest-neighbour search. HNSW rather than IVFFlat: it needs no training
-- pass over existing rows, which matters when an org's first page is also the
-- first thing in the index.
create index content_chunks_embedding_idx
	on public.content_chunks using hnsw (embedding extensions.vector_cosine_ops);
-- The text half, for the fallback and for exact words.
create index content_chunks_search_text_idx
	on public.content_chunks using gin (search_text);

create trigger content_chunks_set_updated_at
	before update on public.content_chunks
	for each row execute procedure public.set_updated_at();

create trigger content_chunks_check_entity
	before insert or update of org_id, entity_type, entity_id on public.content_chunks
	for each row execute procedure public.check_crm_entity_link();

-- ---------------------------------------------------------------------------
-- Searching
-- ---------------------------------------------------------------------------
-- An RPC because PostgREST has no vector operator; `security invoker` because
-- RLS is the boundary and should stay the boundary — the caller sees exactly
-- the chunks their membership lets them see, and `match_org` narrows within
-- that rather than granting anything. A forged org id matches zero rows.
--
-- Cosine distance (`<=>`) to match the index's opclass, returned as
-- similarity (1 - distance) because that is the number a threshold reads
-- naturally in.

create function public.match_content_chunks(
	query_embedding extensions.vector(1536),
	match_org uuid,
	match_kinds public.crm_entity_type[] default null,
	match_count integer default 8,
	min_similarity double precision default 0
)
returns table (
	id uuid,
	entity_type public.crm_entity_type,
	entity_id uuid,
	chunk_index integer,
	content text,
	similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
	select
		c.id,
		c.entity_type,
		c.entity_id,
		c.chunk_index,
		c.content,
		1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
	from public.content_chunks c
	where c.org_id = match_org
		and c.embedding is not null
		and (match_kinds is null or c.entity_type = any (match_kinds))
		and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= min_similarity
	order by c.embedding operator(extensions.<=>) query_embedding
	limit least(greatest(coalesce(match_count, 8), 1), 50)
$$;

comment on function public.match_content_chunks is
	'Nearest passages to a query vector, within one org. security invoker, so RLS decides what is visible and this only narrows.';

revoke all on function public.match_content_chunks(
	extensions.vector(1536), uuid, public.crm_entity_type[], integer, double precision
) from public;
grant execute on function public.match_content_chunks(
	extensions.vector(1536), uuid, public.crm_entity_type[], integer, double precision
) to authenticated;

-- ---------------------------------------------------------------------------
-- A source's passages go when the source does
-- ---------------------------------------------------------------------------
-- The writing detaches, the DERIVED indexes are deleted — the asymmetry the
-- notes migration set and the documents migration followed. A passage of a
-- page that no longer exists is worse than no passage: it is text the
-- assistant would quote as current.

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

	delete from public.content_chunks
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

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

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- The same call `entity_references` makes, for the same reason: these rows
-- are a PROJECTION of writing the member could already edit, so letting them
-- write the projection grants nothing they did not have. A forged chunk can
-- only name a record of their own org (the trigger above) and can only ever
-- be read back by people who can already read the page it claims to come
-- from.
--
-- What it is NOT is a way to see other orgs' writing: select is membership,
-- and the search function runs as the invoker so it inherits exactly this.

alter table public.content_chunks enable row level security;

create policy "Members can view content chunks"
	on public.content_chunks for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can write content chunks"
	on public.content_chunks for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can refresh content chunks"
	on public.content_chunks for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Members can clear content chunks"
	on public.content_chunks for delete to authenticated
	using (private.org_role(org_id) is not null);

-- The columns a rewrite may touch, on both verbs.
--
-- The entity pair is in the UPDATE list and that is not an oversight: an
-- upsert is `insert ... on conflict do update set col = excluded.col` for
-- every column sent, so leaving them out makes the whole statement
-- `permission denied` — which Postgres tells you, and which is how this list
-- got written the first time. They are also harmless there: the conflict
-- target IS `(org_id, entity_type, entity_id, chunk_index)`, so a DO UPDATE
-- can only ever match a row that already holds those values.
--
-- What the narrower list would have bought is nothing anyway. These rows are
-- a projection of writing the member can already edit, and the delete policy
-- above lets them clear and rewrite a chunk regardless.
revoke insert, update on table public.content_chunks from authenticated;
grant insert (org_id, entity_type, entity_id, chunk_index, content, content_hash,
		embedding, embedding_model, embedded_at),
	update (org_id, entity_type, entity_id, chunk_index, content, content_hash,
		embedding, embedding_model, embedded_at)
	on table public.content_chunks to authenticated;

-- Next: npm run db:reset (proves it replays onto an empty database), then
-- npm run db:types and commit the regenerated src/lib/database.types.ts.
--
-- Adding a source:
--   1. a chunker for that kind in src/lib/ai/chunks.ts (pure, tested)
--   2. one call to `indexEntity()` where that kind is saved
--   3. the kind in the tool's filter, if it should be searchable separately
-- No migration. That is what the polymorphic link bought.
