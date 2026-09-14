-- The proposals list shows who it is for and what was actually chosen,
-- not how many options it has.
--
-- `options` (a count) and `recommended` (the recommended option's total) were
-- a reasonable first cut, but a reader scanning the list wants to know who
-- the proposal is for, who presents it and who owns it, and — once a client
-- has picked — what they actually chose. Those are the `contact`, `owner`,
-- `presenter` and `value` catalog keys added in src/lib/lists/catalog.ts:
-- `contact` reads the polymorphic parent link (a company, a contact or a
-- deal), `owner`/`presenter` read `responsible_id`/`presenter_id` (labelled
-- by the industry's own words for them, the proposal_people /
-- industry_vocabulary migrations), and `value` reads the selected option's
-- `computed_total` — blank until `selected_option_id` is set.
--
-- `status` moves later and `created_at` stays last, so the order reads as
-- the reader would ask it: who, who's running it, is it decided, what did
-- it come to.
delete from public.list_fields
where feature_id = 'proposals' and field in ('options', 'recommended', 'valid_until');

insert into public.list_fields (feature_id, field, shown, searchable, filterable, sort_order) values
	('proposals', 'contact', true, true, true, 200),
	('proposals', 'owner', true, true, false, 300),
	('proposals', 'created_at', true, false, false, 400),
	('proposals', 'presenter', true, true, false, 500),
	('proposals', 'status', true, false, true, 600),
	('proposals', 'value', true, false, false, 700)
on conflict (feature_id, field) do update set
	shown = excluded.shown,
	searchable = excluded.searchable,
	filterable = excluded.filterable,
	sort_order = excluded.sort_order;
