-- Storefront-facing fields on products.
--
-- The catalog migration built products for the proposal builder: a name, a
-- price, whether it tracks inventory. Guaranteeth's import brings a second
-- kind of consumer entirely — a SKU-keyed product a public storefront reads
-- directly, with a longer body, imagery, a subscription option, tags, a
-- Stripe mapping, and an open metadata bag for per-product extras. None of
-- that is proposal-builder concern, so it rides in as plain nullable columns
-- rather than reshaping what is already there.

alter table public.products
	add column long_description text,
	add column image_url text,
	add column additional_images jsonb not null default '[]'::jsonb,
	add column tags text[],
	add column metadata jsonb not null default '{}'::jsonb,
	add column msrp numeric(12, 2),
	add column is_subscription boolean not null default false,
	add column subscription_interval text,
	add column subscription_interval_count integer,
	add column stripe_product_id text,
	add column stripe_price_id text,
	add constraint products_msrp_nonnegative check (msrp is null or msrp >= 0),
	add constraint products_subscription_interval_requires_flag
		check (subscription_interval is null or is_subscription),
	add constraint products_subscription_interval_count_positive
		check (subscription_interval_count is null or subscription_interval_count > 0);

comment on column public.products.long_description is
	'The storefront body copy, as opposed to description''s short pitch. Blank lines separate paragraphs.';
comment on column public.products.additional_images is
	'Extra storefront gallery images beyond image_url, as a JSON array of URLs.';
comment on column public.products.metadata is
	'Open bag for storefront-only extras (slug, tagline, accent, specs, usage, ingredients, badges, rating, review count, featured flags) that do not warrant their own column.';
comment on column public.products.msrp is
	'List price shown struck through beside unit_price, when the storefront runs a promotion.';
comment on column public.products.stripe_product_id is
	'The Stripe Product this catalog entry bills through, if any. Set by billing code, not the generic record form.';
comment on column public.products.stripe_price_id is
	'The Stripe Price this catalog entry bills through, if any. Set by billing code, not the generic record form.';

-- Column-level grants: extend the same insert/update lists the catalog
-- migration set up, rather than re-declaring them.
revoke insert, update on table public.products from authenticated;
grant insert (org_id, category_id, kind, sku, name, description, long_description, unit_price,
		unit_cost, currency, unit, is_active, track_inventory, quantity_on_hand, image_url,
		additional_images, tags, metadata, msrp, is_subscription, subscription_interval,
		subscription_interval_count, created_by),
	update (category_id, kind, sku, name, description, long_description, unit_price, unit_cost,
		currency, unit, is_active, track_inventory, quantity_on_hand, image_url,
		additional_images, tags, metadata, msrp, is_subscription, subscription_interval,
		subscription_interval_count)
	on table public.products to authenticated;

-- stripe_product_id / stripe_price_id are deliberately absent from both lists
-- above: they are billing code's to set, never the generic record form's.
