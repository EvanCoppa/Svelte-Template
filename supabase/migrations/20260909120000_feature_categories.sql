-- Sidebar sections: the categories a feature is filed under
-- ===========================================================================
-- `features.category` has been the sidebar's section key since the features
-- migration, but with only two values ('platform', 'library') the nav was one
-- long list of everything an org does. This widens it into the vocabulary the
-- sidebar actually needs — General, CRM, Tools, Insights, Library — and makes
-- the column nullable: a feature that says nothing about where it belongs is
-- filed under Other, by the app (`navCategoryOf()` in src/lib/navigation.ts),
-- rather than by a default this migration would have to guess.
--
-- The values mirror NAV_CATEGORIES in src/lib/navigation.ts; adding one is a
-- migration here plus an entry there, in the order the sections should render.
-- Empty sections are omitted, so a category may ship before the features that
-- will live in it ('insights' does).

alter table public.features drop constraint features_category_check;

alter table public.features
	alter column category drop default,
	alter column category drop not null;

alter table public.features
	add constraint features_category_check
		check (category is null or category in
			('general', 'crm', 'tools', 'insights', 'library', 'other'));

comment on column public.features.category is
	'Sidebar section; mirrors NavCategoryKey in src/lib/navigation.ts. Null means the app files it under Other.';

-- The registry as it stands, re-filed. Everything not named here keeps
-- whatever it has, and an unknown value would not have passed the old check.
update public.features set category = 'general'
	where id in ('assistant', 'notes', 'staff');

update public.features set category = 'crm'
	where id in ('companies', 'contacts', 'deals', 'proposals', 'tasks', 'tickets');

update public.features set category = 'tools'
	where id in ('products', 'billables', 'quick-plans');

-- 'library' keeps the two reference pages it already had (components,
-- best-practices); anything still on the retired 'platform' value goes to the
-- explicit Other bucket rather than silently into a section it was never
-- filed under.
update public.features set category = 'other' where category = 'platform';
