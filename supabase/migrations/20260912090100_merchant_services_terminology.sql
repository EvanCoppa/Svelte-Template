-- Merchant services: the words, as the customer says them
-- ===========================================================================
-- The merchant_services_industry migration shipped this vertical's words as
-- DEFAULTS rather than decisions — nobody had asked an ISO yet, and
-- docs/industry-merchant-services.md marked each guess with a ⚠️ and a
-- question. A real brief has since answered most of them
-- (docs/discovery/gsp-brief-gap-analysis.md), so this migration is those
-- answers: three feature names, two vocabulary terms and one role the ladder
-- was missing.
--
-- Config only, like the migration it corrects: no table, no column, no enum
-- value, so `npm run db:types` produces no diff and nothing in src/ changes.
-- That is the point of a word being a row — getting one wrong costs an
-- update, never a refactor.

-- ---------------------------------------------------------------------------
-- industry_features — three names
-- ---------------------------------------------------------------------------
-- Null does not mean "unnamed", it means "inherit the feature's own word"
-- (the feature_names_by_industry migration), so two of these three are a
-- retreat to the default rather than a new name:
--
--   deals      'Applications' collided with a STAGE. The brief calls the
--              record a deal throughout ("every open deal must have an owner,
--              stage, next action…") and "Application Sent" is one step of
--              its funnel — so the board and the record would have worn the
--              same word for two different things.
--   proposals  'Rate proposals' was our phrase. Theirs is the plain one.
--   tickets    'Support cases' was ours too; the brief says "support issues",
--              in the activity list and again in the onboarding handoff.

update public.industry_features f
set name = v.name, noun = v.noun
from (values
	('deals', null::text, null::text),
	('proposals', null, null),
	('tickets', 'Support issues', 'support issue')
) as v (feature_id, name, noun)
where f.industry_id = 'merchant-services' and f.feature_id = v.feature_id;

-- ---------------------------------------------------------------------------
-- industry_terms — the two people on a proposal
-- ---------------------------------------------------------------------------
-- 'Rep' and 'Relationship manager' were plausible; the brief's own handoff
-- fields are "Sales rep owner" and "Onboarding owner", and the office is
-- built around that split — the rep sells, someone else takes the merchant
-- from a signature to a first batch.
--
-- An upsert rather than an update because a term is a row that may not exist
-- yet: the same statement then seeds it or corrects it.

insert into public.industry_terms (industry_id, term_id, label) values
	('merchant-services', 'proposal_presenter', 'Sales rep'),
	('merchant-services', 'proposal_responsible', 'Onboarding owner')
on conflict (industry_id, term_id) do update set label = excluded.label;

-- ---------------------------------------------------------------------------
-- roles — the rung the ladder was missing
-- ---------------------------------------------------------------------------
-- Every office in this vertical has someone who is not a closer: they work a
-- phone list, qualify the business, collect the statement and book the
-- appointment the rep walks into. The six-rung ladder had no shape for that
-- person — Sales Rep hands out proposals they will never present, Viewer
-- cannot create the lead they just found.
--
-- The id follows the catalog's scheme (b0000000-0000-0000-00II-0000000000RR):
-- industry 0007, role 0007, after the Principal at 0006. The three
-- whole-industry rungs are DERIVED from industry_features and so already
-- cover any feature this vertical gains; only the specialists are listed.

insert into public.roles (id, industry_id, name, description) values
	('b0000000-0000-0000-0007-000000000007', 'merchant-services', 'Prospector',
		'Works the list: finds businesses, qualifies them, collects statements and books the appointments.')
on conflict (id) do nothing;

-- Joined to industry_features so a pair naming a feature this vertical does
-- not have grants nothing — the guard the catalog uses.
--
-- `deals` is `read` on purpose: a prospector's work becomes a deal, but the
-- rep who will run it creates it, and the handover is the point at which the
-- lead stops being theirs. An office that lets its prospectors open deals
-- themselves changes one row here, not a policy.
--
-- `read` on `assistant` is not decorative: a tool is withdrawn from the model
-- unless the caller holds the level its feature needs (docs/assistant.md).
insert into public.role_permissions (role_id, feature_id, level)
select grants.role_id, f.feature_id, grants.level
from (values
	('b0000000-0000-0000-0007-000000000007'::uuid, 'companies', 'manage'::public.permission_level),
	('b0000000-0000-0000-0007-000000000007', 'contacts', 'manage'),
	('b0000000-0000-0000-0007-000000000007', 'tasks', 'manage'),
	('b0000000-0000-0000-0007-000000000007', 'calendar', 'manage'),
	('b0000000-0000-0000-0007-000000000007', 'notes', 'manage'),
	('b0000000-0000-0000-0007-000000000007', 'deals', 'read'),
	('b0000000-0000-0000-0007-000000000007', 'prospects', 'read'),
	('b0000000-0000-0000-0007-000000000007', 'merchant-map', 'read'),
	('b0000000-0000-0000-0007-000000000007', 'referral-partners', 'read'),
	('b0000000-0000-0000-0007-000000000007', 'assistant', 'read')
) as grants (role_id, feature_id, level)
join public.industry_features f
	on f.industry_id = 'merchant-services' and f.feature_id = grants.feature_id
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- What the brief answered that this migration CANNOT carry
-- ---------------------------------------------------------------------------
-- The funnel. The brief names ten stages — Prospect, Contacted, Waiting on
-- Statements, Presentation Scheduled, Proposal Sent, Application Sent,
-- Underwriting, Approved, Installed / Live, Lost — and a pipeline is per-org
-- working data, not industry reference data, so there is nowhere in an
-- industry's rows to put them. supabase/seed.sql gives the two fixture orgs
-- that board so the vertical demonstrates the real funnel after a reset; a
-- real org onboarded tomorrow still gets the generic "Sales" board from
-- `create_default_pipeline()`.
--
-- That is the same hole the previous migration's closing comment describes
-- for custom fields, and it has the same fix: a table of per-industry
-- defaults and one trigger, beside the pipeline trigger that already exists.
-- Deliberately not done here — it changes behaviour for every industry, and
-- this migration changes none.
