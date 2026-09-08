-- Vocabulary by industry: the words that are not a feature's name.
--
-- The feature_names_by_industry migration lets an industry rename what a
-- feature is called ("Quotes", "Treatment plans"). Some words belong to no
-- feature: the two people on a proposal are "Presenter" and "Provider" in a
-- practice, "Estimator" and "Project manager" on a roof, "Sales rep" and
-- "Account manager" in a supply house. Those are TERMS — one row each, with
-- a default label and an industry's own where it differs — the same shape
-- as features / industry_features, minus the modes:
--
--   terms.label                 the default word
--   industry_terms.label        an industry's own; a missing row inherits
--
-- `resolveVocabulary()` (src/lib/features/vocabulary.ts) applies the org's
-- industry row and the (app) layout ships the result as `vocabulary`, the
-- way it ships `terms` for feature nouns. Reference data owned by
-- migrations, like features; nothing is settable per org — an org that
-- needs its own word asks for a migration, and no policy ever needs one.
--
-- The same migration gives the industries their word for a contact: a
-- dentist has patients, a beauty studio clients, a roofer homeowners.

create table public.terms (
	id text not null primary key,
	-- The default word, capitalised as a label is: "Presenter".
	label text not null,
	-- What the word names, for whoever adds an industry.
	description text,
	created_at timestamptz not null default now(),
	constraint terms_id_is_snake_case check (id ~ '^[a-z][a-z0-9_]*$'),
	constraint terms_label_not_blank check (length(trim(label)) > 0)
);

comment on table public.terms is
	'A word the app uses that is not a feature''s name — a role on a proposal, say — with its default label. Reference data owned by migrations; industry_terms carries an industry''s own word.';

create table public.industry_terms (
	industry_id text not null references public.industries (id) on delete cascade,
	term_id text not null references public.terms (id) on delete cascade,
	label text not null,
	created_at timestamptz not null default now(),
	primary key (industry_id, term_id),
	constraint industry_terms_label_not_blank check (length(trim(label)) > 0)
);

comment on table public.industry_terms is
	'What an industry calls a term. A missing row inherits terms.label.';

-- ---------------------------------------------------------------------------
-- The rows
-- ---------------------------------------------------------------------------

insert into public.terms (id, label, description) values
	('proposal_presenter', 'Presenter', 'The member who presents a proposal to the client.'),
	('proposal_responsible', 'Responsible',
		'The member responsible for what a proposal proposes: the one deciding on it or doing the work.')
on conflict (id) do nothing;

insert into public.industry_terms (industry_id, term_id, label) values
	('crm', 'proposal_presenter', 'Presenter'),
	('crm', 'proposal_responsible', 'Owner'),
	('roofing', 'proposal_presenter', 'Estimator'),
	('roofing', 'proposal_responsible', 'Project manager'),
	('medical-supplies', 'proposal_presenter', 'Sales rep'),
	('medical-supplies', 'proposal_responsible', 'Account manager'),
	('cosmetic', 'proposal_presenter', 'Consultant'),
	('cosmetic', 'proposal_responsible', 'Provider'),
	('dentistry', 'proposal_presenter', 'Presenter'),
	('dentistry', 'proposal_responsible', 'Provider'),
	('beverage', 'proposal_presenter', 'Sales rep'),
	('beverage', 'proposal_responsible', 'Route manager')
on conflict (industry_id, term_id) do nothing;

-- The contact — the person a proposal is for — in each industry's word.
-- The rows exist since the crm_feature_registry migration; this names them.
update public.industry_features f
set name = v.name, noun = v.noun
from (values
	('dentistry', 'Patients', 'patient'),
	('cosmetic', 'Clients', 'client'),
	('roofing', 'Homeowners', 'homeowner')
) as v (industry_id, name, noun)
where f.industry_id = v.industry_id and f.feature_id = 'contacts';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.terms enable row level security;
alter table public.industry_terms enable row level security;

-- Reference data, like the feature registry: readable by every signed-in
-- user, select-only.
create policy "Authenticated users can read the term registry"
	on public.terms for select to authenticated
	using (true);

create policy "Authenticated users can read industry terms"
	on public.industry_terms for select to authenticated
	using (true);

revoke insert, update on table public.terms from authenticated;
revoke insert, update on table public.industry_terms from authenticated;

-- ---------------------------------------------------------------------------
-- How to add a term
-- ---------------------------------------------------------------------------
-- 1. Insert its terms row (id, default label) and an industry_terms row for
--    every industry that says it differently.
-- 2. Add the id to TERM_IDS in src/lib/features/vocabulary.ts so app code
--    gets a typed key; read it with `term(page.data.vocabulary, id)`.
-- 3. npm run db:types, commit the regenerated src/lib/database.types.ts.
-- A word for a FEATURE — its list and one row of it — is not a term: it is
-- features.name / noun and the industry_features row (the
-- feature_names_by_industry migration).
