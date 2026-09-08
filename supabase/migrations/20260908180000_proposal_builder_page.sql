-- The proposal builder: the page that creates a proposal with its options
-- side by side (src/routes/(app)/proposals/new). A proposal is born with its
-- options, so it is a screen of its own rather than a row in the generic
-- "Add …" form — the staff page's invite is the other such screen.
--
-- No title of its own: like the record page, this one is named by its load
-- ("New quote", "New treatment plan" — the feature's noun as the org's
-- industry says it), which page data wins over. The row is what registers
-- the screen; the fallback while a title is missing is the feature's name.
-- Sitting under /proposals, the existing feature row gates it.

insert into public.pages (id, feature_id, path, title) values
	('proposals-new', 'proposals', '/proposals/new', null)
on conflict (id) do nothing;
