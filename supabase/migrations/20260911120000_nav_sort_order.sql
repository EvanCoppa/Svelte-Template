-- Sidebar order: renumber `features.sort_order` on a spaced convention
-- ===========================================================================
-- `sort_order` decides where a feature sits inside its sidebar section
-- (`buildNav()` in src/lib/navigation.ts sorts by category, then this, then
-- label). Every number was assigned back when the only categories were
-- 'platform' and 'library' and the nav was one long list; the
-- feature_categories migration re-filed the rows into sections but left the
-- numbers alone, so within-section order has been an accident of migration
-- history rather than a decision — Notes/Staff/Assistant read 35/50/60
-- purely because that is where they sat in the old flat sequence.
--
-- Two things change here, and only these: the numbers, and the rule behind
-- them. No row moves section, nothing is added or removed.
--
-- THE CONVENTION: sort_order is a multiple of 100, restarting at 100 inside
-- each category. The gap is the point — a feature that belongs between two
-- others takes a number between them without renumbering its neighbours, so
-- adding a page stays one insert. Values below 100 are reserved for the
-- static shell entries (`staticNavItems`: Dashboard is 0), which is what
-- keeps them above every feature in their section.
--
-- THE ORDER: within a section, the order is the order of the work — what you
-- open first, then the records you keep, then what moves through a state.
-- Never alphabetical, never ship date. A view sits directly after the
-- records it filters, so Suppliers reads as a cut of Companies rather than
-- as a page of its own.

update public.features as f
set sort_order = v.sort_order
from (values
	-- General — where you start.
	('assistant', 100),
	('notes', 200),
	('staff', 300),

	-- CRM — today, then the records you keep (each view after its source),
	-- then the things with a state that moves.
	('calendar', 100),
	('companies', 200),
	('suppliers', 300),
	('contacts', 400),
	('partner-contacts', 500),
	('patient-map', 600),
	('assets', 700),
	('deals', 800),
	('proposals', 900),
	('tasks', 1000),
	('tickets', 1100),

	-- Tools — what you sell, what you charge for, the bundles of it.
	('products', 100),
	('billables', 200),
	('quick-plans', 300),

	-- Library — reference pages.
	('components', 100),
	('best-practices', 200)
) as v (id, sort_order)
where f.id = v.id;

-- ---------------------------------------------------------------------------
-- Adding a feature, after this
-- ---------------------------------------------------------------------------
-- The checklist in the features migration still stands; this adds one line to
-- its step 2. Pick the sort_order by where the feature belongs in its
-- section's workflow:
--   * at the end of a section  -> the last number in it, plus 100
--   * between two entries      -> halfway between them (e.g. 250 between
--                                 Companies and Suppliers)
-- Only renumber a whole section when the gaps genuinely run out, and then
-- renumber the whole of it back onto multiples of 100 in one migration —
-- never leave a section half on the convention.
