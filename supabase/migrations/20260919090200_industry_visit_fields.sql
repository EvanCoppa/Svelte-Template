-- What each vertical asks about a visit
-- ===========================================================================
-- The visits migration ships the shape every field business shares: who was
-- visited, when, how it went, where the visitor was. What is ASKED at the
-- door is not shared at all — a roofer wants the roof's age, a technician
-- wants which lines were cleaned, a rep wants whether the buyer stocks the
-- line — and that is a fact about the VERTICAL, so it is an
-- `industry_custom_fields` row (the industry_custom_fields migration), copied
-- into every org in the industry as its own definition and editable from
-- there.
--
-- This is the half Yes Smile's `field_visits` table held as columns:
-- `practice_size`, `retails_products`, `gt_interest`, `ys_interest`,
-- `ll_interest`. Five columns that are null for every business that is not a
-- dental-supplies field rep, and five more the next vertical would have
-- wanted. Here each one is a row, and because every definition carries its
-- own list flags, each is also a column of the visits list with no code at
-- all (docs/lists.md).
--
-- Kept short on purpose: two or three questions a vertical actually sorts its
-- day by, not a form. An org adds its own on top.

insert into public.industry_custom_fields
	(industry_id, entity_type, key, label, value_type, allowed_values,
		list_shown, list_searchable, list_filterable) values

	-- The roofer walks the roof before quoting it, and the two things that
	-- decide whether there is a job are its age and whether the weather has
	-- already made the case.
	('roofing', 'visit', 'roof_age_years', 'Roof age (years)', 'numeric', null,
		true, false, false),
	('roofing', 'visit', 'storm_damage', 'Storm damage seen', 'boolean', null,
		true, false, true),
	('roofing', 'visit', 'access_notes', 'Access', 'text', null, false, true, false),

	-- The technician's round. What was done is the reason the visit is
	-- billable, and a machine left down is the one thing a manager scans for.
	('beverage', 'visit', 'work_done', 'Work done', 'select',
		'["Line clean", "Keg change", "Repair", "Install", "Removal", "Inspection"]',
		true, false, true),
	('beverage', 'visit', 'equipment_working', 'Left working', 'boolean', null,
		true, false, true),
	('beverage', 'visit', 'kegs_delivered', 'Kegs delivered', 'numeric', null,
		false, false, false),

	-- The rep calling on a buyer. Who was actually seen decides whether the
	-- call counted, which is the number a field team is managed by.
	('medical-supplies', 'visit', 'seen_role', 'Who was seen', 'select',
		'["Buyer", "Practice manager", "Clinician", "Front desk", "Nobody"]',
		true, false, true),
	('medical-supplies', 'visit', 'samples_left', 'Samples left', 'boolean', null,
		false, false, true),
	('medical-supplies', 'visit', 'competitor_stocked', 'Competitor stocked', 'text', null,
		false, true, false),

	-- The showing. How many came and what they said is the whole report.
	('real-estate', 'visit', 'attendee_count', 'Attendees', 'numeric', null,
		true, false, false),
	('real-estate', 'visit', 'interest_level', 'Interest', 'select',
		'["Making an offer", "Interested", "Undecided", "Not for them"]',
		true, false, true),
	('real-estate', 'visit', 'feedback', 'Feedback', 'text', null, false, true, false),

	-- The account manager at the counter. A terminal that is not taking
	-- payments is the visit that has to happen next.
	('merchant-services', 'visit', 'terminal_working', 'Terminals working', 'boolean', null,
		true, false, true),
	('merchant-services', 'visit', 'staff_trained', 'Staff trained', 'boolean', null,
		false, false, true),
	('merchant-services', 'visit', 'competitor_offer', 'Competing offer seen', 'text', null,
		false, true, false)

on conflict (industry_id, entity_type, key) do nothing;

-- Hand them to the orgs that already exist. `create_industry_custom_fields`
-- is idempotent on (org, kind, key), so an org that already declared one of
-- these keeps its own label and flags.
do $$
declare
	org record;
begin
	for org in select id from public.organizations loop
		perform public.create_industry_custom_fields(org.id);
	end loop;
end $$;

-- Next: npm run db:reset, then npm run db:types and commit the regenerated
-- src/lib/database.types.ts.
