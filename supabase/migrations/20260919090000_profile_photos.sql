-- Your profile photo, and what stands in for it.
--
-- `profiles.avatar_url` has existed since the starter migration, but nothing
-- ever wrote it: it was filled once from the auth provider's metadata on
-- signup and never again. This migration is the other half — the bucket the
-- bytes live in, and the one column an avatar needs that the table did not
-- already have.
--
-- Four ways to answer "what does this person look like", all of them ending in
-- these two columns, so nothing downstream has to know which was used:
--
--   * upload a file      -> avatar_url = the object's public URL
--   * a generated avatar -> avatar_url = an api.dicebear.com URL
--   * Gravatar           -> avatar_url = a gravatar.com URL
--   * your initials      -> avatar_url = null, avatar_tint = the colour
--
-- There is deliberately no `avatar_kind` discriminator: which door a URL came
-- through is not a fact anything reads, and a column nothing reads is dead
-- weight (the reasoning the commerce migrations spell out about a coupon's
-- `times_redeemed`).

-- ---------------------------------------------------------------------------
-- The colour behind a set of initials
-- ---------------------------------------------------------------------------

-- `avatarTint()` in src/lib/components/ui/avatar/avatar-tint.ts has always
-- picked one of these by hashing the user id, so a roster of initials reads as
-- a set of people rather than a column of grey circles. This column is that
-- choice made by hand instead, and null keeps the hash — so no backfill, and a
-- user who never opens the setting looks exactly as they did before.
--
-- The values are the badge tones minus `neutral` (the grey a fallback already
-- wears), which is the app's one colour vocabulary. The constraint is spelled
-- out rather than made an enum for the same reason `tasks.status` is an enum
-- and a pipeline's stages are rows: this list is ours, it is short, and adding
-- to it is a migration either way — but an enum here would be a second
-- vocabulary alongside the badge tones, which are already just text.
alter table public.profiles
	add column avatar_tint text
		constraint profiles_avatar_tint_known check (
			avatar_tint is null
			or avatar_tint in (
				'success', 'info', 'warning', 'error',
				'violet', 'orange', 'cyan', 'rose', 'indigo'
			)
		);

comment on column public.profiles.avatar_tint is
	'Chosen colour for this user''s initials when they have no avatar_url. Null means the colour is derived from the user id instead (see avatarTint()).';

-- Column-level grants: the staff_management migration narrowed browser writes
-- on this table to display_name and avatar_url, so a new column is unwritable
-- until it is named here.
grant update (avatar_tint) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------

-- Public read, unlike `entity-images`. An avatar is drawn for everyone who
-- shares an org with its owner — a roster row, a notification's actor, a
-- comment's author — and `avatar_url` is stored as a plain URL that those
-- screens render directly, exactly as a dicebear or gravatar URL is. Signing
-- would mean either a per-request round trip on every screen that names a
-- person, or a durable cache of signed URLs; both are worse than a bucket
-- whose contents are already being shown to anyone who can see the profile.
-- The images in it are the ones users chose to be identified by.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Writes are scoped by folder, and the folder is the owner's user id:
-- `{user_id}/{filename}`. The same shape `entity-images` uses for an org,
-- so the first path segment is load-bearing here too.
create policy "Anyone can view avatars"
	on storage.objects for select to public
	using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
	on storage.objects for insert to authenticated
	with check (
		bucket_id = 'avatars'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

create policy "Users can replace their own avatar"
	on storage.objects for update to authenticated
	using (
		bucket_id = 'avatars'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	)
	with check (
		bucket_id = 'avatars'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

create policy "Users can delete their own avatar"
	on storage.objects for delete to authenticated
	using (
		bucket_id = 'avatars'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

-- ---------------------------------------------------------------------------
-- Checklist for a further avatar source
-- ---------------------------------------------------------------------------
--
--   1. Nothing here changes: a source that yields a URL writes avatar_url.
--   2. Add its origin to AVATAR_URL_HOSTS in
--      src/routes/(app)/settings/profile/schema.ts — the action refuses a URL
--      from anywhere else.
--   3. Add the same origin to `img-src` in
--      src/lib/server/security-headers.ts, or the browser will not load it.
--   4. Add a tab to src/routes/(app)/settings/profile/profile-photo.svelte.
