-- The `partner-contacts` view's default label reads oddly next to the
-- other view names ("Suppliers", "Patient map") — shorten it to "Partners".
-- The noun stays `contact` (it counts contacts: "17 contacts"); only the
-- feature's display name changes. No `industry_features` row overrides the
-- name today, so every industry that has this view inherits it from here.
update public.features
set name = 'Partners'
where id = 'partner-contacts';
