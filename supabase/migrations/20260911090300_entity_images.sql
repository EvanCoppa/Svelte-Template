-- Pictures attached to a CRM record — a truck's photo, a chair's before/after,
-- a unit's condition report at move-out. Assets are the first (and, today,
-- only) kind that wants this, but the mechanism is the same one `addresses`
-- already uses to hang off "some CRM record": the shared `crm_entity_type` +
-- `entity_id` link, not a second one invented for images. The table is named
-- `entity_images`, not `asset_images`, on purpose — a narrow check constraint
-- pins it to `'asset'` for now, the same way `addresses_entity_is_party` pins
-- addresses to company/contact, and widening it later is dropping/replacing
-- that one constraint, never adding a second table or a second mechanism.
--
-- The files themselves live in Supabase Storage, not the database: this table
-- is the row that says which org, which record, and which object in the
-- bucket. `entity-images` is a private bucket (this migration creates it) so
-- every read goes through a signed URL or a request the storage policies
-- below allow — never a public bucket URL.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table public.entity_images (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	entity_type public.crm_entity_type not null,
	entity_id uuid not null,
	-- The path inside the `entity-images` bucket:
	-- `{org_id}/{entity_type}/{entity_id}/{filename}`. The storage RLS policies
	-- below key off the first path segment being an org the caller belongs to,
	-- so this shape is load-bearing, not just a convention.
	storage_path text not null,
	caption text,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	-- Only an asset has pictures today. Narrow on purpose, like
	-- addresses_entity_is_party — widen by replacing this constraint, never by
	-- adding a second mechanism.
	constraint entity_images_entity_is_asset check (entity_type = 'asset'),
	constraint entity_images_storage_path_not_blank check (length(trim(storage_path)) > 0)
);

comment on table public.entity_images is
	'A picture attached to a CRM record via the shared polymorphic link. The file lives in the entity-images storage bucket; storage_path names it there.';
comment on column public.entity_images.storage_path is
	'Path inside the entity-images bucket: {org_id}/{entity_type}/{entity_id}/{filename}.';

create index entity_images_org_id_entity_idx
	on public.entity_images (org_id, entity_type, entity_id);

create trigger entity_images_check_entity
	before insert or update of org_id, entity_type, entity_id on public.entity_images
	for each row execute procedure public.check_crm_entity_link();

-- ---------------------------------------------------------------------------
-- Cleanup when the asset goes
-- ---------------------------------------------------------------------------
-- No new trigger on assets itself: assets_crm_entity_deleted already calls
-- on_crm_entity_deleted('asset') after delete. A picture is part of the
-- record, not a record of its own — like an address — so it is deleted, not
-- detached.

create or replace function public.on_crm_entity_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	deleted_kind public.crm_entity_type := tg_argv[0]::public.crm_entity_type;
begin
	update public.proposals
	set entity_type = null, entity_id = null
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.addresses
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	delete from public.entity_images
	where org_id = old.org_id and entity_type = deleted_kind and entity_id = old.id;

	return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Working data, like addresses: members keep the record's pictures current,
-- deletes stay owner/admin.

alter table public.entity_images enable row level security;

create policy "Members can view entity images"
	on public.entity_images for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can attach entity images as themselves"
	on public.entity_images for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update entity image captions"
	on public.entity_images for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete entity images"
	on public.entity_images for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- storage_path is writable on insert only: replacing a picture is a delete
-- and a re-upload (a new row, a new object), never an edit of the path an
-- existing storage object was written to. Only the caption may change.

revoke insert, update on table public.entity_images from authenticated;
grant insert (org_id, entity_type, entity_id, storage_path, caption, created_by),
	update (caption)
	on table public.entity_images to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: the entity-images bucket
-- ---------------------------------------------------------------------------
-- Private bucket — nothing here is public, every read goes through RLS (or,
-- from the server, the service-role client). The first path segment of every
-- object is the org id (see storage_path above), so membership is checked the
-- same way every table-level policy checks it: private.org_role() on the org
-- named by that segment. This is the first bucket and the first
-- storage.objects policy in the repo; there is no existing pattern to match
-- beyond the table-level RLS convention this mirrors.

insert into storage.buckets (id, name, public)
values ('entity-images', 'entity-images', false)
on conflict (id) do nothing;

create policy "Org members can view their entity images"
	on storage.objects for select to authenticated
	using (
		bucket_id = 'entity-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) is not null
	);

create policy "Org members can upload entity images"
	on storage.objects for insert to authenticated
	with check (
		bucket_id = 'entity-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) is not null
	);

create policy "Owners and admins can delete entity images from storage"
	on storage.objects for delete to authenticated
	using (
		bucket_id = 'entity-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
	);
