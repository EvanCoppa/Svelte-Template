-- Storage bucket for product images, public read.
--
-- The storefront fields migration gave products an `image_url`/
-- `additional_images` columns; this is where the bytes those URLs point at
-- live. Public read (a storefront serves them with no session), scoped
-- write: an org member may upload or replace an image filed under their own
-- org's folder, and only an owner/admin may delete one.

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
