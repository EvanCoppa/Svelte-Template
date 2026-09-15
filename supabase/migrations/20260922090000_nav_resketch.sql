-- Nav resketch: General leads with the day's work, Tools is what you build
-- proposals with, and two stubs hold their place in the sidebar
-- ===========================================================================
-- Three changes, all rows:
--
-- 1. TASKS AND CALENDAR MOVE INTO GENERAL. They were filed under CRM because
--    that is where they were first added, not because they are records about
--    a party — General is "where you start your day", and a to-do list and a
--    schedule belong there next to the assistant and your notes.
-- 2. PROPOSALS MOVES BACK INTO TOOLS, next to the whiteboard: the document a
--    deal is built on is a thing you work WITH, the same shelf as the fee
--    schedule it prices from, not a party record like a company or a
--    contact. The CRM section is left as the parties and the records that
--    move through a pipeline.
-- 3. BILLABLES AND QUICK PLANS MOVE TO THE WORKSPACE SECTION (the user menu,
--    where Staff already lives) and gain an entry in `settingsNav`
--    (src/lib/navigation.ts) so they are reachable from inside the Settings
--    shell too. They stay full features — gated by role and tier exactly as
--    before (`requirePermission()` in their actions is untouched) — a
--    category change moves WHERE a feature draws, never what may read or
--    write it. Nothing here weakens that.
--
-- Two new stubs — Emails and Slide Builder — are registered so they hold
-- their spot in General and Tools respectively, ahead of either screen being
-- built for real. Like the whiteboard migration, each is a `features` row, a
-- `pages` row, every industry and tier, and one `read` grant per role; there
-- is nothing to manage or delete yet.

-- ---------------------------------------------------------------------------
-- 1 + 2. Category moves
-- ---------------------------------------------------------------------------
update public.features set category = 'general' where id in ('tasks', 'calendar');
update public.features set category = 'tools' where id = 'proposals';
update public.features set category = 'workspace' where id in ('billables', 'quick-plans');

-- ---------------------------------------------------------------------------
-- General — the day: tasks, notes, mail, the assistant, then the schedule.
-- ---------------------------------------------------------------------------
update public.features as f
set sort_order = v.sort_order
from (values
	('tasks', 100),
	('notes', 200),
	('assistant', 400),
	('calendar', 500)
) as v (id, sort_order)
where f.id = v.id;

-- ---------------------------------------------------------------------------
-- CRM — renumbered now that Tasks and Calendar have left it. Same order as
-- before, just re-spaced: Companies, then the people, then the pipeline, then
-- the records with a state that moves, the graph last.
-- ---------------------------------------------------------------------------
update public.features as f
set sort_order = v.sort_order
from (values
	('companies', 100),
	('contacts', 200),
	('deals', 300),
	('partner-contacts', 400),
	('patient-map', 500),
	('assets', 600),
	('tickets', 700),
	('visits', 800),
	('graph', 900)
) as v (id, sort_order)
where f.id = v.id;

-- ---------------------------------------------------------------------------
-- Tools — what you build a proposal with: the document, the scratch canvas,
-- and (once it exists) the deck library behind it.
-- ---------------------------------------------------------------------------
update public.features as f
set sort_order = v.sort_order
from (values
	('proposals', 100),
	('whiteboard', 200)
) as v (id, sort_order)
where f.id = v.id;

-- ---------------------------------------------------------------------------
-- Commerce — the whole section renumbered onto one clean sequence. Orders,
-- shipments, categories and purchases arrived in separate migrations after
-- the section was first laid out and never got a coherent order among
-- themselves; this is the "renumber the whole section" case the
-- nav_sort_order migration calls for rather than another one-off insert.
-- ---------------------------------------------------------------------------
update public.features as f
set sort_order = v.sort_order
from (values
	('products', 100),
	('orders', 200),
	('shipments', 300),
	('rmas', 400),
	('categories', 500),
	('featured-groups', 600),
	('coupons', 700)
) as v (id, sort_order)
where f.id = v.id;

-- ---------------------------------------------------------------------------
-- Workspace — Staff already sits at 100; Billables and Quick Plans join it.
-- ---------------------------------------------------------------------------
update public.features as f
set sort_order = v.sort_order
from (values
	('billables', 200),
	('quick-plans', 300)
) as v (id, sort_order)
where f.id = v.id;

-- ---------------------------------------------------------------------------
-- Stale industry overrides
-- ---------------------------------------------------------------------------
-- Five verticals set their own position for tasks, calendar, proposals,
-- billables or quick-plans back when each sat in a different section (the
-- industry_feature_order and commerce_and_finances_sections migrations). A
-- number that described a place in the old section describes nothing in the
-- new one, so each is cleared here rather than carried over — every one of
-- these industries now inherits the General/Tools/Workspace defaults above,
-- which is the right answer until a vertical asks otherwise.
update public.industry_features
set sort_order = null
where feature_id in ('tasks', 'calendar', 'proposals', 'billables', 'quick-plans')
	and industry_id in ('dentistry', 'cosmetic', 'roofing', 'medical-supplies', 'beverage');

-- ---------------------------------------------------------------------------
-- Emails and Slide Builder: two stubs, registered the way Whiteboard was
-- ---------------------------------------------------------------------------
-- No noun for either: neither is a kind of record a list counts ("3
-- emails" is not a sentence this app has anywhere yet), so both stay null
-- like the whiteboard's.
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('emails', 'Emails', null,
		'Send and read email from the app. Not built yet.',
		'/emails', 'mail', 'general', 300),
	('slide-builder', 'Slide Builder', null,
		'A home for slide decks outside a proposal. Not built yet.',
		'/slide-builder', 'presentation', 'tools', 300)
on conflict (id) do nothing;

-- No title of their own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('emails', 'emails', '/emails', null),
	('slide-builder', 'slide-builder', '/slide-builder', null)
on conflict (id) do nothing;

-- Every industry, every plan — same reasoning as the whiteboard: nothing here
-- is a vertical's speciality, and there is nothing yet to meter.
insert into public.industry_features (industry_id, feature_id)
select i.id, f.id
from public.industries i, (values ('emails'), ('slide-builder')) as f (id)
on conflict (industry_id, feature_id) do nothing;

insert into public.tier_features (tier_id, feature_id)
select t.id, f.id
from public.tiers t, (values ('emails'), ('slide-builder')) as f (id)
on conflict (tier_id, feature_id) do nothing;

-- `read` for every role — the level the hook needs to serve the page. There
-- is nothing to manage or delete yet: neither stub owns a row.
insert into public.role_permissions (role_id, feature_id, level)
select r.id, f.id, 'read'
from public.roles r, (values ('emails'), ('slide-builder')) as f (id)
on conflict (role_id, feature_id) do nothing;
