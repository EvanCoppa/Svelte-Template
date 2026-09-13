-- The graph page: every relationship in the organization, drawn.
-- ===========================================================================
-- The relationships migration laid a graph over the CRM — one row per link
-- between two records of any kind, typed by a row the org can extend — and
-- until now that graph was only ever read one record at a time, in the
-- Relationships card on a record page. This registers the page that reads
-- it whole: every record that stands in a relationship, and every
-- relationship between them, as a force-directed map the reader can pull on
-- (src/routes/(app)/graph, src/lib/server/crm/graph.ts).
--
-- The page is registered, never wired: a `features` row, its `pages` row,
-- the industries and tiers that include it, and the roles that read it —
-- the registry checklist from the features migration. The hook gates
-- /graph on the feature and the read grant like any other page; nothing in
-- navigation.ts changes.
--
-- What the page draws is decided by the SAME predicate as everything else
-- that names a record — `getRecord()` through `recordLinks()`, hence the
-- feature gate. A kind the reader may not open is not on the map, and every
-- word on it is the industry's: the legend names each kind of record through
-- its feature's terms ("Patients", "Merchants"), and an edge is labelled by
-- its relationship type. So the graph needs no rows of its own per
-- industry: whatever an industry's feature set is, that is what appears.
--
-- Nothing changes in the tables the graph reads; no policy needs a graph.

-- ---------------------------------------------------------------------------
-- The feature and its page
-- ---------------------------------------------------------------------------
-- No noun: the graph is not a list of records. Filed under Insights — the
-- section shipped empty by the feature_categories migration for exactly a
-- page that reads across the records rather than keeping any — and first in
-- it, on the spaced scale (multiples of 100, restarting per section).
insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('graph', 'Graph', null,
		'Every record and how it relates to the others, drawn as a map you can pull on.',
		'/graph', 'waypoints', 'insights', 100)
on conflict (id) do nothing;

-- No title of its own: named by the feature, as the org's industry says it.
insert into public.pages (id, feature_id, path, title) values
	('graph', 'graph', '/graph', null)
on conflict (id) do nothing;

-- Every vertical has a graph: whatever relationships it draws, this reads
-- them. Derived rather than listed, the way assets went to the catalog — an
-- industry added later inherits the page. The Insights section carries no
-- per-industry order yet (nothing else is in it), so every row inherits the
-- feature's position; an industry that renames it ("Connections",
-- "Referral map") adds its own words on this row, as with any feature.
insert into public.industry_features (industry_id, feature_id)
select i.id, 'graph'
from public.industries i
on conflict (industry_id, feature_id) do nothing;

-- Every plan, like assets and relationships themselves: the graph is a read
-- of what the org already keeps, not an upgrade.
insert into public.tier_features (tier_id, feature_id) values
	('free', 'graph'),
	('pro', 'graph'),
	('enterprise', 'graph')
on conflict (tier_id, feature_id) do nothing;

-- Every role reads the graph. What a member SEES on it is already decided
-- record by record — a kind they may not open is not drawn — so the page
-- itself withholds nothing a grant on the kinds does not; the row only
-- keeps the page off the sidebar of nobody. There is no manage level: the
-- page draws, and a relationship is drawn or removed where its record is.
insert into public.role_permissions (role_id, feature_id, level)
select r.id, 'graph', 'read'
from public.roles r
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- The one word the graph needs that no feature owns
-- ---------------------------------------------------------------------------
-- A member (the 'member' kind: someone who works here, keyed by their
-- membership) stands in relationships — the laptop assigned to dev — but is
-- no kind of record and belongs to no list page, so no feature's terms name
-- the kind. The legend's word for it is a term, as every word that is not a
-- feature's name is (the industry_vocabulary migration): the default follows
-- the staff feature, and an industry that calls its people something else
-- says so here.
insert into public.terms (id, label, description) values
	('graph_member', 'Staff', 'What the graph calls the people who work here, as one kind of record.')
on conflict (id) do nothing;

insert into public.industry_terms (industry_id, term_id, label) values
	('crm', 'graph_member', 'Staff'),
	('roofing', 'graph_member', 'Crew'),
	('medical-supplies', 'graph_member', 'Staff'),
	('cosmetic', 'graph_member', 'Team'),
	('dentistry', 'graph_member', 'Staff'),
	('beverage', 'graph_member', 'Team'),
	('merchant-services', 'graph_member', 'Agents')
on conflict (industry_id, term_id) do nothing;

-- ---------------------------------------------------------------------------
-- Adding to the graph
-- ---------------------------------------------------------------------------
-- A kind of record joins the map by joining the CRM: a `crm_entity_type`
-- value, a `crm_entity_exists()` branch, a delete trigger (the party-model
-- checklist) and a list page with an entry in RECORD_KINDS — the moment
-- `getRecord()` can name it, the graph draws it, coloured and named by its
-- feature. A relationship type joins by existing: system or the org's own,
-- its forward label is the edge's label. An industry that wants the page
-- called something else adds `name` on its industry_features row above.
