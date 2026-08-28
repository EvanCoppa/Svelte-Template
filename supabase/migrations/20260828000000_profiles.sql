-- Starter schema: a `profiles` row per auth user, RLS on, auto-created on
-- signup. Apply it with `npx supabase link` + `npx supabase db push`, or paste
-- it into the dashboard's SQL editor. Then run `npm run db:types`.
--
-- This is also the reference pattern for every table you add later:
--   1. create table
--   2. enable row level security
--   3. write policies (wrap auth.uid() in a SELECT — it runs once per query
--      instead of once per row)
--   4. regenerate types

create table public.profiles (
	id uuid not null primary key references auth.users (id) on delete cascade,
	display_name text,
	avatar_url text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

comment on table public.profiles is
	'Application profile data for each auth user. One row per user, created by trigger on signup.';

-- RLS: users see and edit only their own row. There is deliberately no INSERT
-- or DELETE policy — the trigger below owns creation, and deletion cascades
-- from auth.users.
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
	on public.profiles
	for select
	to authenticated
	using ((select auth.uid()) = id);

create policy "Users can update their own profile"
	on public.profiles
	for update
	to authenticated
	using ((select auth.uid()) = id)
	with check ((select auth.uid()) = id);

-- Create the profile row when a user signs up. SECURITY DEFINER because the
-- trigger fires as the signing-up user, who has no INSERT policy; the empty
-- search_path forces fully qualified names inside the function.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.profiles (id, display_name, avatar_url)
	values (
		new.id,
		new.raw_user_meta_data ->> 'full_name',
		new.raw_user_meta_data ->> 'avatar_url'
	);
	return new;
end;
$$;

create trigger on_auth_user_created
	after insert on auth.users
	for each row execute procedure public.handle_new_user();

-- Keep updated_at honest on every write.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

create trigger profiles_set_updated_at
	before update on public.profiles
	for each row execute procedure public.set_updated_at();

-- Backfill: users created before this migration (e.g. added from the
-- dashboard while setting up) get their profile row here.
insert into public.profiles (id, display_name, avatar_url)
select
	u.id,
	u.raw_user_meta_data ->> 'full_name',
	u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;
