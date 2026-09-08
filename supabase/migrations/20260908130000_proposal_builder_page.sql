-- The proposal builder: creating a proposal is a page of its own, not the
-- generic record modal. A proposal is a title plus one to five priced
-- options, each made of lines from the catalog — a port of Yes Smile's
-- treatment plan form onto the shared proposal model (docs/proposals.md,
-- "The page") — so /proposals/new is a screen under the proposals feature
-- and the hook's gate on /proposals already covers it.
--
-- No title of its own: the page's load names it after the kind as the org's
-- industry words it ("New quote", "New treatment plan") — the record-title
-- exception in the pages migration — and this row is what titles it when a
-- load has no name to give.

insert into public.pages (id, feature_id, path, title) values
	('proposals-new', 'proposals', '/proposals/new', null)
on conflict (id) do nothing;
