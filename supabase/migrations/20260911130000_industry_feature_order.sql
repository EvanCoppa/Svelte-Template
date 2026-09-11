-- Order by industry: the sidebar leads with what the vertical does first
-- ===========================================================================
-- `features.sort_order` is one global number, so every industry gets the same
-- sidebar order with different words on it (the feature_names_by_industry
-- migration). That is wrong for the same reason one global `name` was: a
-- practice opens its day on the Schedule and its Patients, a roofer opens on
-- Quotes, a distributor on its accounts — and today all three read Calendar,
-- Companies, Suppliers, Contacts because that is the order the CRM vertical
-- wanted.
--
-- This adds the order axis to the row that already carries the words, exactly
-- as that migration did and with the same rule — null inherits:
--
--   features.sort_order             the default position in its section
--   industry_features.sort_order    this industry's own position; null
--                                   inherits the feature's
--
-- `resolveFeatures()` (src/lib/features/resolve.ts) applies the active
-- industry's row, so the sidebar, the ⌘K palette and the feature settings
-- page follow with no change of their own: nothing outside the resolver
-- knows this column exists. Sections are NOT per-industry — a feature is
-- filed under the same heading everywhere, and only its position inside that
-- heading moves. private.feature_mode() is again untouched: it answers modes,
-- and no policy needs an order.
--
-- The convention from the nav_sort_order migration holds here too: multiples
-- of 100, restarting at 100 inside each category, so a feature can be slipped
-- between two others without renumbering an industry's whole list.

alter table public.industry_features
	add column sort_order integer
		constraint industry_features_sort_order_positive
		check (sort_order is null or sort_order > 0);

comment on column public.industry_features.sort_order is
	'Where this industry puts the feature inside its sidebar section, or null to inherit features.sort_order. Multiples of 100, restarting at 100 per category (see the nav_sort_order migration).';

-- ---------------------------------------------------------------------------
-- The verticals whose day does not start where the CRM default starts
-- ---------------------------------------------------------------------------
-- `crm` is deliberately absent: it IS the default, so every one of its rows
-- stays null and inherits. A pair named here that an industry does not have
-- simply updates nothing — the join finds no row — which is what lets this
-- list read as one statement of intent per vertical instead of a matrix that
-- has to be kept in step with which features each industry includes.

update public.industry_features as f
set sort_order = v.sort_order
from (values
	-- Dentistry — the treatment plan leads: presenting and getting one accepted
	-- is the practice's work, and the rest of the day hangs off it. Then the
	-- schedule, then the patient it is for (the map is a cut of the patients);
	-- the practices that refer to you are a supporting record, not the front
	-- door. (No deals row: the industry does not include that feature.)
	('dentistry', 'proposals', 100),
	('dentistry', 'calendar', 200),
	('dentistry', 'contacts', 300),
	('dentistry', 'patient-map', 400),
	('dentistry', 'tasks', 500),
	('dentistry', 'companies', 600),
	('dentistry', 'tickets', 700),
	('dentistry', 'assets', 800),
	-- Procedures are the catalog a practice works from; goods come second.
	('dentistry', 'billables', 100),
	('dentistry', 'quick-plans', 200),
	('dentistry', 'products', 300),

	-- Cosmetic — the same shape as dentistry, without the patient map, and
	-- with deals in place of the tickets the industry does not include.
	('cosmetic', 'calendar', 100),
	('cosmetic', 'contacts', 200),
	('cosmetic', 'proposals', 300),
	('cosmetic', 'tasks', 400),
	('cosmetic', 'companies', 500),
	('cosmetic', 'deals', 600),
	('cosmetic', 'assets', 700),
	('cosmetic', 'billables', 100),
	('cosmetic', 'quick-plans', 200),
	('cosmetic', 'products', 300),

	-- Roofing — the quote is the product, and the customer is a homeowner
	-- before it is a company (many roofing contacts belong to none at all).
	('roofing', 'proposals', 100),
	('roofing', 'contacts', 200),
	('roofing', 'companies', 300),
	('roofing', 'suppliers', 400),
	('roofing', 'calendar', 500),
	('roofing', 'tasks', 600),
	('roofing', 'assets', 700),
	('roofing', 'tickets', 800),
	-- Services are what a roof is quoted in; the parts catalog comes second.
	('roofing', 'billables', 100),
	('roofing', 'quick-plans', 200),
	('roofing', 'products', 300),

	-- Medical supplies — a distributor: the account is the record, and who
	-- you buy from sits right behind who you sell to.
	('medical-supplies', 'companies', 100),
	('medical-supplies', 'suppliers', 200),
	('medical-supplies', 'contacts', 300),
	('medical-supplies', 'deals', 400),
	('medical-supplies', 'proposals', 500),
	('medical-supplies', 'tasks', 600),
	('medical-supplies', 'tickets', 700),
	('medical-supplies', 'calendar', 800),
	('medical-supplies', 'assets', 900),

	-- Beverage — a distributor too, but the calendar is a delivery round and
	-- the assets are out in the field (taps, coolers, kegs).
	('beverage', 'companies', 100),
	('beverage', 'suppliers', 200),
	('beverage', 'contacts', 300),
	('beverage', 'deals', 400),
	('beverage', 'proposals', 500),
	('beverage', 'calendar', 600),
	('beverage', 'tasks', 700),
	('beverage', 'assets', 800),
	('beverage', 'tickets', 900)
) as v (industry_id, feature_id, sort_order)
where f.industry_id = v.industry_id and f.feature_id = v.feature_id;

-- ---------------------------------------------------------------------------
-- Adding a feature, after this
-- ---------------------------------------------------------------------------
-- Nothing becomes required: a feature with no industry sort_order sits where
-- features.sort_order puts it, in every vertical, which is the right answer
-- until a vertical says otherwise. When one does, set it on that industry's
-- row alongside its name and noun — and set it for EVERY feature in that
-- industry's section, not just the newcomer: a section with some rows ordered
-- and the rest inheriting reads as two interleaved lists.
