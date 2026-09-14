-- Sections: Insights goes, the graph joins the CRM, Staff moves to the menu
-- ===========================================================================
-- Three decisions about where the nav files things, and all three are rows.
--
-- 1. INSIGHTS DOES NOT EXIST, in any industry. The feature_categories
--    migration shipped the section empty, reserving it for pages that read
--    across the records rather than keeping any, and the only row ever filed
--    under it was the graph. A section with one page in it is not a section;
--    it is a heading above a link. The category is retired here rather than
--    left standing for a future dashboard to justify — when a vertical's
--    portfolio reporting is actually built (docs/industry-merchant-services.md,
--    gap 7), it brings its own section back with more than one page in it.
--
-- 2. THE GRAPH IS PART OF THE CRM. It draws the records and the relationships
--    between them, which is exactly what that section is; it reads across
--    them, but so does a view, and views sit with the records they filter.
--    It goes at the END of the section, after the things with a state that
--    moves: you open it to see how what you keep hangs together, not to start
--    the day.
--
-- 3. STAFF IS NOT A PLACE YOU WORK. The sidebar lists the places you work;
--    who is in the organization, what they may do and who is still invited is
--    administering the workspace, which is what the user menu in the sidebar
--    footer already is — Settings is there. So Staff moves into a new
--    `workspace` category whose section renders in that menu, directly under
--    Settings (NAV_CATEGORIES in src/lib/navigation.ts carries the surface;
--    `userMenuNav()` is the read). It stays a feature in every other respect:
--    the gate, the three levels (staff_management migration), the industry's
--    word for it and the ⌘K palette are untouched, because none of them ever
--    asked which section it was in.
--
-- Rows only: no table, policy or type changes, and the resolver, the gate and
-- private.feature_mode() are all untouched — a category says where a feature
-- draws, and no policy has ever needed to know.

-- Dropped first so the two updates below can move rows onto a value the old
-- constraint never allowed ('workspace') and off one it required
-- ('insights') — the same order the feature_categories migration used when it
-- retired 'platform'.
alter table public.features drop constraint features_category_check;

-- ---------------------------------------------------------------------------
-- 1 + 2. The graph joins the CRM
-- ---------------------------------------------------------------------------
-- After tickets (1100), on the nav_sort_order convention: multiples of 100,
-- restarting at 100 per category.
update public.features
set category = 'crm', sort_order = 1200
where id = 'graph';

-- Every vertical but `crm` orders its own CRM section (the
-- industry_feature_order migration), and a row left to inherit would land the
-- graph at 100 — the top of a list it should close. So each ordered section
-- gets the graph's place in it explicitly, last, exactly as the ledger
-- migration did for the pair it added. `crm` is absent on purpose: its rows
-- are null and inherit the 1200 above, which is what makes that industry the
-- default.
update public.industry_features as f
set sort_order = v.sort_order
from (values
	('dentistry', 'graph', 900),
	('cosmetic', 'graph', 800),
	('roofing', 'graph', 900),
	('medical-supplies', 'graph', 1000),
	('beverage', 'graph', 1000),
	('merchant-services', 'graph', 1200)
) as v (industry_id, feature_id, sort_order)
where f.industry_id = v.industry_id and f.feature_id = v.feature_id;

-- ---------------------------------------------------------------------------
-- 3. Staff moves to the user menu
-- ---------------------------------------------------------------------------
-- First (and so far only) row in its section, so 100. General keeps Assistant
-- (100) and Notes (200); the gap Staff leaves at 300 is the convention
-- working — nothing is renumbered to close it.
update public.features
set category = 'workspace', sort_order = 100
where id = 'staff';

-- No industry sets a sort_order for staff (every vertical inherits it, the
-- general section having set none), so nothing to re-place: the industry rows
-- carry only words, and those words are still what the menu draws.

-- ---------------------------------------------------------------------------
-- The vocabulary, re-stated
-- ---------------------------------------------------------------------------
-- Mirrors NAV_CATEGORIES in src/lib/navigation.ts, which is also where a
-- category's surface (sidebar or user menu) is declared. Adding a section is
-- still one entry there and the same value here.
alter table public.features
	add constraint features_category_check
		check (category is null or category in
			('general', 'crm', 'tools', 'workspace', 'library', 'other'));
