-- user_preferences — the account axis of settings (docs/user-preferences.md).
--
-- Three axes, three homes: the ORGANIZATION decides what exists (the feature
-- registry), the DEVICE decides how it looks on this machine (localStorage, or
-- a cookie when the server has to know before it renders), and this table is
-- the one in between — how *you* work, everywhere you sign in.
--
-- Key/value rather than a column per switch, because switches are exactly what
-- a product accumulates dozens of and a column each would mean a migration, a
-- types regeneration and a form field every time. The keys are a registry in
-- `src/lib/preferences.ts` the way `FEATURE_IDS` is a registry, so the app
-- knows every one of them at build time; the value is `jsonb` and the
-- registry's zod schema is what type-checks it, on the way in and on the way
-- out. A key with no row is not missing — it is the fallback, which is what
-- lets a new key ship to everyone with no backfill.

create table public.user_preferences (
	user_id uuid not null references auth.users (id) on delete cascade,
	-- A registry key: 'notes.dock'. The shape is checked so a typo is a
	-- refused write rather than a row nothing will ever read.
	key text not null,
	value jsonb not null,
	updated_at timestamptz not null default now(),
	primary key (user_id, key),
	constraint user_preferences_key_shape check (key ~ '^[a-z0-9]+([.-][a-z0-9]+)*$')
);

comment on table public.user_preferences is
	'One preference per row for one user, keyed by the registry in src/lib/preferences.ts. A missing row means the app''s default. Private to its owner: no policy here grants anyone another user''s rows.';

create trigger user_preferences_set_updated_at
	before update on public.user_preferences
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Yours and nobody else's. Unlike every other table here there is no org role
-- in these policies at all: an owner administers the organization, not the
-- people in it, and nothing in the product needs to read somebody's
-- preferences. Support reading one would be a service-role read, not a wider
-- policy.

alter table public.user_preferences enable row level security;

create policy "Users can view their own preferences"
	on public.user_preferences for select to authenticated
	using (user_id = (select auth.uid()));

create policy "Users can set their own preferences"
	on public.user_preferences for insert to authenticated
	with check (user_id = (select auth.uid()));

create policy "Users can change their own preferences"
	on public.user_preferences for update to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

create policy "Users can clear their own preferences"
	on public.user_preferences for delete to authenticated
	using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- Setting a preference is one upsert, and an upsert writes every column it was
-- given on both paths — so the three a client supplies are insertable AND
-- updatable, and `updated_at` is the one it may not touch, because the trigger
-- above owns it.
--
-- What keeps a row yours is not this list, it is RLS: `user_id = auth.uid()`
-- in the update policy's USING *and* WITH CHECK means a row can neither be
-- taken from someone else nor handed to them. Inside your own rows the worst a
-- forged request achieves is scrambling your own preferences, which is what
-- the settings page does anyway.

revoke insert, update on table public.user_preferences from authenticated;
grant insert (user_id, key, value) on table public.user_preferences to authenticated;
grant update (user_id, key, value) on table public.user_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- The settings page that edits them
-- ---------------------------------------------------------------------------
-- A shell page like the rest of settings: it belongs to no feature, exists for
-- every org whatever its industry or plan, and is exempt from the feature gate.

insert into public.pages (id, feature_id, path, title) values
	('settings-preferences', null, '/settings/preferences', 'Preferences')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- How to add a preference
-- ---------------------------------------------------------------------------
-- Not here. Add the key to PREFERENCES in src/lib/preferences.ts with its
-- schema, its fallback, its label and — when it belongs to a feature — that
-- feature's id. No migration, no backfill: every user is on the fallback until
-- they say otherwise, and the settings page renders the registry.
