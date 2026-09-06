-- pages — the titled screens a feature is made of.
--
-- `features` says which capabilities exist and which route prefix each one
-- owns; this table says which pages actually sit under that prefix and what
-- each is called. A page's title IS the browser <title>: the `(app)` layout
-- resolves it from the current pathname and renders it once for the whole
-- group (`src/lib/features/pages.ts`), so no page file hardcodes a title and
-- renaming a page is a data change, not a deploy.
--
-- Shell pages — the dashboard and settings, the screens every org has
-- regardless of industry, tier or role — belong to no feature and carry
-- `feature_id` null. Same split as `staticNavItems` in
-- `src/lib/navigation.ts`; nothing about them is gated.
--
-- Reference data owned by migrations, exactly like `features`: every
-- signed-in user reads it, no client ever writes it.

create table public.pages (
	id text not null primary key,
	-- The feature this page is part of, or null for a shell page. Cascades:
	-- a feature that goes takes its pages with it.
	feature_id text references public.features (id) on delete cascade,
	-- The exact pathname the page is served at. A feature's pages sit under
	-- its route (the gate matches that prefix, this matches the page), and
	-- unique so two rows can never claim the same screen.
	path text not null unique check (path like '/%'),
	-- The browser title, in full — app code appends nothing to it.
	title text not null,
	created_at timestamptz not null default now()
);

comment on table public.pages is
	'Registry of the app''s pages and their titles, keyed by pathname. Reference data owned by migrations / the service role; clients only read it. Rows with a null feature_id are the shell pages that belong to no feature.';

create index pages_feature_id_idx on public.pages (feature_id);

-- The reference rows ship with the schema, like the features they belong to.
-- Idempotent so a re-apply is a no-op.
insert into public.pages (id, feature_id, path, title) values
	('dashboard', null, '/', 'Dashboard'),
	('settings', null, '/settings', 'Settings'),
	('settings-features', null, '/settings/features', 'Features'),
	('clients', 'clients', '/clients', 'Clients'),
	('deals', 'deals', '/deals', 'Deals'),
	('tasks', 'tasks', '/tasks', 'Tasks'),
	('tickets', 'tickets', '/tickets', 'Tickets'),
	('staff', 'staff', '/staff', 'Staff'),
	('components', 'components', '/components', 'Components'),
	('best-practices', 'best-practices', '/best-practices', 'Best Practices')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.pages enable row level security;

-- Reference data, like the feature registry: readable by every signed-in
-- user (the shell titles whatever page it lands on), select-only — no write
-- policies, so only migrations / the service role change it.
create policy "Authenticated users can read the page registry"
	on public.pages for select to authenticated
	using (true);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a client may write, these decide which COLUMNS.
-- Reference data: no client writes at all.

revoke insert, update on table public.pages from authenticated;

-- ---------------------------------------------------------------------------
-- How to add a page
-- ---------------------------------------------------------------------------
-- 1. Create the route under src/routes/(app)/<path>/.
-- 2. In a migration: insert into public.pages (id, feature_id, path, title) —
--    feature_id is the feature the page belongs to, or null for a shell page.
--    A brand new feature also needs its own rows; see the features
--    migration's closing comment.
-- 3. npm run db:types, commit the regenerated src/lib/database.types.ts.
-- No <title> in the page file, and no nav edit: the (app) layout renders the
-- title from this table and the sidebar renders from the feature registry.
--
-- A title that depends on a record (a client's name) is the one exception:
-- the page's load returns `title`, which wins over the registry — see
-- src/routes/(app)/+layout.svelte. Register the page here anyway: the row is
-- what titles it when the load has no name to give.
