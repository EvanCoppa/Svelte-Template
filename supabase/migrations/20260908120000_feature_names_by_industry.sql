-- Names by industry: a feature's row is where a thing is named, and the
-- industry axis can rename it.
--
-- A proposal is a "quote" to a roofer and a "treatment plan" to a dentist,
-- and the sidebar entry, the tab title, the heading, the "Add …" button and
-- the record page all have to say the industry's word. Nothing here changes
-- what exists for whom — modes still resolve from industry_features and
-- tier_features exactly as the features migration describes — it only says
-- what the thing is CALLED:
--
--   features.name / features.noun       the default words
--   industry_features.name / .noun      an industry's own words; null inherits
--   pages.title null                    "the owning feature's name, as the
--                                        org's industry says it"
--
-- src/lib/features/resolve.ts applies the active industry's row, so every
-- surface that reads a resolved feature follows with no change of its own,
-- and the (app) layout ships the words as `terms` for the surfaces that name
-- one record ("Add quote", "Quote not found"). private.feature_mode() is
-- deliberately NOT extended: it answers modes only, and no policy ever needs
-- a name. Names never live in app constants.

-- ---------------------------------------------------------------------------
-- features.noun — what one row of the feature's list is called
-- ---------------------------------------------------------------------------

alter table public.features
	add column noun text
		constraint features_noun_is_lower_case
		check (noun is null or (length(trim(noun)) > 0 and noun = lower(noun)));

comment on column public.features.noun is
	'Lower-case singular for one record in the feature''s list ("deal"): the "Add …" button, the record page eyebrow and the row count. Null for a feature that is not a list of records.';

update public.features set noun = v.noun
from (values
	('companies', 'company'),
	('contacts', 'contact'),
	('products', 'product'),
	('deals', 'deal'),
	('tasks', 'task'),
	('tickets', 'ticket')
) as v (id, noun)
where features.id = v.id and features.noun is null;

-- ---------------------------------------------------------------------------
-- industry_features.name / noun — the industry's own words, null to inherit
-- ---------------------------------------------------------------------------

alter table public.industry_features
	add column name text
		constraint industry_features_name_not_blank
		check (name is null or length(trim(name)) > 0),
	add column noun text
		constraint industry_features_noun_is_lower_case
		check (noun is null or (length(trim(noun)) > 0 and noun = lower(noun)));

comment on column public.industry_features.name is
	'What this industry calls the feature ("Quotes"), or null to inherit features.name. Renames the nav entry, the palette, the upgrade prompt, feature settings and every page title that follows the feature.';
comment on column public.industry_features.noun is
	'What this industry calls one record of it ("quote"), lower-case singular, or null to inherit features.noun.';

-- ---------------------------------------------------------------------------
-- pages.title — null means "the owning feature's name"
-- ---------------------------------------------------------------------------

alter table public.pages alter column title drop not null;
alter table public.pages
	add constraint pages_title_or_feature_named
		check (title is not null or feature_id is not null);

comment on column public.pages.title is
	'The browser title, in full — app code appends nothing to it. Null (only on a feature''s page) means the owning feature''s name as the org''s industry says it; visiblePages() fills it in.';

-- A feature's own list page carried the feature's name a second time, and
-- that copy would not follow an industry's rename. The row stays — the path
-- is what registers the screen — the duplicated word goes.
update public.pages p
set title = null
from public.features f
where p.feature_id = f.id and p.path = f.route and p.title = f.name;

-- ---------------------------------------------------------------------------
-- How to name a feature
-- ---------------------------------------------------------------------------
-- The features migration's checklist still applies; the naming steps are:
-- 1. features.name is the default list name; features.noun the lower-case
--    singular when the feature is a list of records (null otherwise).
-- 2. An industry that calls it something else sets name and/or noun on its
--    industry_features row; null inherits.
-- 3. The feature's own list page gets a pages row with title null, so it
--    follows the feature. A page that is NOT the list (a sub-screen) keeps
--    a title of its own.
-- 4. Nothing in app code: resolveFeatures() applies the industry's words,
--    the layout ships `terms`, and recordTerms() / <PageHeader.Title /> read
--    them. A kind's words are never a constant in src/.
