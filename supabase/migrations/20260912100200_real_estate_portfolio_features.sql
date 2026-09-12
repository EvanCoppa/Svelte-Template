-- Real estate gets its two real tables
-- ===========================================================================
-- The real_estate_industry migration turned the vertical on by BORROWING:
-- `assets` was renamed "Properties" and a tenancy had nowhere to live at all.
-- The properties_and_leases migration replaced the first half of that with a
-- purpose-built pair, so this migration moves the industry onto them.
--
-- Separate from both because of ordering: industry_features has a foreign key
-- to features, and the `properties` / `leases` rows do not exist until the
-- migration before this one has run.
--
-- The interesting part is how little this costs. A word is a row, so undoing
-- yesterday's naming is an `update`; the borrowed features stay exactly as
-- they were; and `assets` does not leave the vertical, it goes back to
-- meaning what it always meant — the dishwasher, the mower, the snow blower —
-- which is a better fit than the one it was standing in for.

-- ---------------------------------------------------------------------------
-- The portfolio and the rent roll join the industry
-- ---------------------------------------------------------------------------
-- Real-estate only: a dental practice has no leases, so every other industry
-- resolves both `hidden` by the absence of a row.

insert into public.industry_features (industry_id, feature_id, name, noun, sort_order) values
	('real-estate', 'properties', null, null, 100),
	('real-estate', 'leases', null, null, 200)
on conflict (industry_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- The CRM section, renumbered
-- ---------------------------------------------------------------------------
-- A vertical that sets an order sets it for EVERY feature in that section, so
-- inserting two at the top means restating the rest rather than leaving a
-- section that reads as two interleaved lists.
--
-- The order is still the order of the work, now that the work has a portfolio
-- at the front of it: what you own, who is in it and on what terms, what
-- broke, the day, who you pay, what you own that is not a building, and the
-- next building.

update public.industry_features set sort_order = 300 where industry_id = 'real-estate' and feature_id = 'contacts';
update public.industry_features set sort_order = 400 where industry_id = 'real-estate' and feature_id = 'tickets';
update public.industry_features set sort_order = 500 where industry_id = 'real-estate' and feature_id = 'calendar';
update public.industry_features set sort_order = 600 where industry_id = 'real-estate' and feature_id = 'tasks';
update public.industry_features set sort_order = 700 where industry_id = 'real-estate' and feature_id = 'companies';
update public.industry_features set sort_order = 900 where industry_id = 'real-estate' and feature_id = 'deals';

-- `assets` stops standing in for the portfolio and becomes the appliances,
-- tools and machines a portfolio contains — which is what that table was
-- built for. The `located_at` relationship type from the previous migration
-- is how a dishwasher names the unit it sits in.
update public.industry_features
set name = 'Equipment', noun = 'equipment item', sort_order = 800
where industry_id = 'real-estate' and feature_id = 'assets';

-- ---------------------------------------------------------------------------
-- The grants
-- ---------------------------------------------------------------------------
-- The three whole-industry rungs were DERIVED from industry_features when
-- they were created, which means they cover what the map held THEN. Re-running
-- the same derivation is what keeps that promise true for rows added later —
-- the conflict clause makes it a no-op for everything already granted.

insert into public.role_permissions (role_id, feature_id, level)
select ladder.role_id, f.feature_id, ladder.level
from (values
	('b0000000-0000-0000-0008-000000000001'::uuid, 'read'::public.permission_level),
	('b0000000-0000-0000-0008-000000000005', 'manage'),
	('b0000000-0000-0000-0008-000000000006', 'delete')
) as ladder (role_id, level)
join public.industry_features f
	on f.industry_id = 'real-estate'
on conflict (role_id, feature_id) do nothing;

-- The specialists, for the two new features only.
--
-- Accountant gets `properties` and NOT `leases`, which is the same line the
-- role drew on day one: a lease names its tenant, and the CPA's login exists
-- to see the portfolio and what it spends without learning who lives in Unit
-- 2. Rents received will reach them through transactions, which carry an
-- amount and a property and no person.
insert into public.role_permissions (role_id, feature_id, level)
select grants.role_id, f.feature_id, grants.level
from (values
	-- Bookkeeper — reads the portfolio and the rent roll it will reconcile against.
	('b0000000-0000-0000-0008-000000000002'::uuid, 'properties', 'read'::public.permission_level),
	('b0000000-0000-0000-0008-000000000002', 'leases', 'read'),

	-- Accountant — the portfolio only.
	('b0000000-0000-0000-0008-000000000003', 'properties', 'read'),

	-- Property Manager — owns both outright. This is the role the product is
	-- for.
	('b0000000-0000-0000-0008-000000000004', 'properties', 'manage'),
	('b0000000-0000-0000-0008-000000000004', 'leases', 'manage')
) as grants (role_id, feature_id, level)
join public.industry_features f
	on f.industry_id = 'real-estate' and f.feature_id = grants.feature_id
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- What this vertical still does not have
-- ---------------------------------------------------------------------------
-- The accounting spine, deliberately out of scope for this round: a chart of
-- accounts carrying `schedule_e_line`, and a categorised transactions table.
-- Until they exist this is a property MANAGEMENT product — portfolio, rent
-- roll, tenants, maintenance, schedule — and not the landlord tax tool the
-- reference workbook was. Those are adjacent, and they are not the same
-- product; docs/industry-real-estate.md says which is which.
--
-- When transactions do land, decision 1 is what makes them cheap: one
-- `property_id` column pointing at whichever level the cost belongs to, and
-- `coalesce(parent_id, id)` to roll a unit's utilities up to the building
-- that carries the mortgage.
--
-- One thing this round does NOT fix, and it is worth knowing before it is
-- promised: the relationship graph is still READ-ONLY in the app.
-- `createRelationship()` has exactly one caller (task assignment), and the
-- record page has no action that writes one — so "who services this building"
-- and "which unit is this dishwasher in" are expressible in the schema and
-- not yet enterable in the UI.
