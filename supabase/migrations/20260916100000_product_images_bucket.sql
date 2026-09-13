-- Product photos live in their own bucket, not entity-images.
--
-- entity-images is private and keyed to the polymorphic CRM entity link
-- (org_id/entity_type/entity_id/filename) — every read goes through RLS or a
-- signed URL. A product photo is different in kind: it is storefront
-- marketing material, meant to be fetched by a public storefront with no
-- session at all (see products.image_url's comment). So this is a second,
-- public bucket rather than widening entity-images' private contract or the
-- narrow asset-only check constraint on that table.
--
-- Path convention: {org_id}/{product_id}/{filename}. Same shape as
-- entity-images' path, for the same reason: the storage policies below key
-- off the first path segment being an org the caller belongs to.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Anyone can view product images"
	on storage.objects for select to public
	using (bucket_id = 'product-images');

create policy "Org members can upload product images"
	on storage.objects for insert to authenticated
	with check (
		bucket_id = 'product-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) is not null
	);

create policy "Org members can replace product images"
	on storage.objects for update to authenticated
	using (
		bucket_id = 'product-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) is not null
	)
	with check (
		bucket_id = 'product-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) is not null
	);

create policy "Owners and admins can delete product images"
	on storage.objects for delete to authenticated
	using (
		bucket_id = 'product-images'
		and private.org_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
	);
