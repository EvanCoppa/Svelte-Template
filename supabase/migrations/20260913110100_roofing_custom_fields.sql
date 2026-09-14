-- What a roofer's records carry
-- ===========================================================================
-- The industry_custom_fields migration built the mechanism and shipped the
-- two verticals that motivated it (a beverage asset's location, a merchant's
-- MID). Roofing got none, and it is the vertical with the most to say: a roof
-- is measured before it is quoted, half the money comes from a carrier rather
-- than the customer, and the paperwork that lets a crew on the roof is the
-- job.
--
-- So this is rows, and nothing else — no table, no function, no trigger. The
-- copy, the industry-change trigger and the backfill are all that migration's,
-- and the closing `create_industry_custom_fields` loop below is the same one
-- it runs, for the orgs that already exist.
--
-- Two shapes worth naming, because neither is obvious from the rows:
--
--   There is no `date` value type — the enum is text / numeric / boolean /
--   select — so a date here is `text`. A real `date` type wants a `value_date`
--   column on custom_field_values and a renderer, which is its own change
--   rather than one smuggled in behind fifty rows.
--
--   The `deal` fields are inert until `deals` is enabled for roofing
--   (docs/roofing.md, "The Jobs decision"), except on the seeded pilot org
--   that already has it. They ship now so that decision stays a rename and a
--   row instead of also being a field audit.
--
-- The list flags follow the industry_custom_fields migration's rule: `shown`
-- is a column the table opens with, so it is spent sparingly — two or three
-- per kind, not a wall. `filterable` is only offered on text, select and
-- boolean (the check enforces it), so no amount below claims it.

insert into public.industry_custom_fields
	(industry_id, entity_type, key, label, value_type, allowed_values,
		list_shown, list_searchable, list_filterable) values

	-- The homeowner. A roofer reaches a person at their house, and the list
	-- question is which of them came from which channel — a roofer lives or
	-- dies by where the work comes from, so lead source is the shown column.
	('roofing', 'contact', 'referral_source', 'How they found us', 'select',
		'["Door knock", "Storm canvass", "Referral", "Web", "Google", "Angi", "Yard sign", "Repeat customer"]',
		true, false, true),
	('roofing', 'contact', 'preferred_channel', 'Preferred channel', 'select',
		'["Call", "Text", "Email"]', false, false, true),
	('roofing', 'contact', 'best_time', 'Best time to reach', 'select',
		'["Morning", "Afternoon", "Evening", "Weekend"]', false, false, true),
	('roofing', 'contact', 'gate_code', 'Gate code', 'text', null, false, false, false),
	('roofing', 'contact', 'dog_on_property', 'Dog on property', 'boolean', null,
		false, false, true),
	('roofing', 'contact', 'hoa_name', 'HOA', 'text', null, false, true, false),

	-- The property. `assets` holds only universal columns by rule
	-- (docs/relationships.md), which is exactly why every measurement here is
	-- a field and not a column: the address is the entity link's, and who owns
	-- it is a relationship. Squares, material and age are what a roofer scans
	-- a list of roofs for.
	('roofing', 'asset', 'roof_squares', 'Squares', 'numeric', null, true, false, false),
	('roofing', 'asset', 'existing_material', 'Existing material', 'select',
		'["3-tab", "Architectural", "Wood shake", "Tile", "Metal", "Slate", "TPO", "EPDM", "Modified bitumen"]',
		true, false, true),
	('roofing', 'asset', 'roof_age_years', 'Roof age (years)', 'numeric', null,
		true, false, false),
	('roofing', 'asset', 'roof_pitch', 'Pitch', 'select',
		'["Flat", "3/12", "4/12", "6/12", "8/12", "10/12", "12/12 or steeper"]',
		false, false, true),
	('roofing', 'asset', 'stories', 'Stories', 'numeric', null, false, false, false),
	('roofing', 'asset', 'existing_layers', 'Existing layers', 'numeric', null,
		false, false, false),
	('roofing', 'asset', 'decking_type', 'Decking', 'select',
		'["OSB", "Plywood", "Plank / skip sheathing"]', false, false, true),
	('roofing', 'asset', 'year_built', 'Year built', 'numeric', null, false, false, false),
	('roofing', 'asset', 'satellite_report_url', 'Measurement report', 'text', null,
		false, false, false),
	('roofing', 'asset', 'permit_jurisdiction', 'Permit jurisdiction', 'text', null,
		false, true, true),
	('roofing', 'asset', 'access_notes', 'Access notes', 'text', null, false, true, false),
	('roofing', 'asset', 'hoa_approval_required', 'HOA approval required', 'boolean', null,
		false, false, true),

	-- The job: what kind of work, where the permit stands, and where the claim
	-- stands. Those three are the board a production manager reads.
	('roofing', 'deal', 'job_type', 'Job type', 'select',
		'["Full replacement", "Repair", "Inspection", "Maintenance", "Gutters", "Siding", "Emergency tarp"]',
		true, false, true),
	('roofing', 'deal', 'permit_status', 'Permit status', 'select',
		'["Not required", "Applied", "Issued", "Inspected", "Closed"]', true, false, true),
	('roofing', 'deal', 'lead_source', 'Lead source', 'select',
		'["Door knock", "Storm canvass", "Referral", "Web", "Google", "Angi", "Yard sign", "Repeat customer"]',
		false, false, true),
	('roofing', 'deal', 'permit_number', 'Permit number', 'text', null, false, true, false),
	('roofing', 'deal', 'material_delivery_date', 'Material delivery', 'text', null,
		false, false, false),
	('roofing', 'deal', 'dumpster_ordered', 'Dumpster ordered', 'boolean', null,
		false, false, true),
	('roofing', 'deal', 'final_inspection_passed', 'Final inspection passed', 'boolean', null,
		false, false, true),

	-- The claim, on the same kind. Storm restoration is most of the
	-- residential market and the carrier is a second payer against the same
	-- job: the homeowner owes the deductible, the carrier owes the rest, and
	-- the depreciation is withheld until the work is done. Eleven fields is a
	-- lot for one panel, and that is the argument for Claims becoming a
	-- feature — once these prove they have outgrown being fields.
	('roofing', 'deal', 'claim_status', 'Claim status', 'select',
		'["Not a claim", "Filed", "Inspected", "Approved", "Denied", "Appealing", "Paid"]',
		true, false, true),
	('roofing', 'deal', 'insurance_carrier', 'Carrier', 'text', null, false, true, true),
	('roofing', 'deal', 'claim_number', 'Claim number', 'text', null, false, true, false),
	('roofing', 'deal', 'adjuster_name', 'Adjuster', 'text', null, false, true, false),
	('roofing', 'deal', 'adjuster_phone', 'Adjuster phone', 'text', null, false, true, false),
	('roofing', 'deal', 'date_of_loss', 'Date of loss', 'text', null, false, false, false),
	('roofing', 'deal', 'deductible', 'Deductible', 'numeric', null, false, false, false),
	('roofing', 'deal', 'acv_amount', 'ACV', 'numeric', null, false, false, false),
	('roofing', 'deal', 'rcv_amount', 'RCV', 'numeric', null, false, false, false),
	('roofing', 'deal', 'depreciation_withheld', 'Depreciation withheld', 'numeric', null,
		false, false, false),
	('roofing', 'deal', 'supplement_status', 'Supplement', 'select',
		'["None", "Submitted", "Approved", "Denied"]', false, false, true),

	-- The quote option — the kind the comparison table renders, and where a
	-- roofer's options actually differ: same roof, three shingles, three
	-- warranties. A proposal option has no list page of its own, so none of
	-- these is shown, searched or filtered.
	('roofing', 'proposal_option', 'shingle_brand', 'Shingle brand', 'select',
		'["GAF", "Owens Corning", "CertainTeed", "Malarkey", "TAMKO", "Atlas"]',
		false, false, false),
	('roofing', 'proposal_option', 'shingle_line', 'Shingle line', 'text', null,
		false, false, false),
	('roofing', 'proposal_option', 'shingle_color', 'Color', 'text', null, false, false, false),
	('roofing', 'proposal_option', 'manufacturer_warranty', 'Manufacturer warranty', 'select',
		'["Standard", "System Plus", "Golden Pledge", "Platinum", "Integrity"]',
		false, false, false),
	('roofing', 'proposal_option', 'workmanship_warranty_years', 'Workmanship warranty (years)',
		'numeric', null, false, false, false),
	('roofing', 'proposal_option', 'ventilation_type', 'Ventilation', 'select',
		'["Ridge vent", "Box vents", "Turbine", "Power vent", "None"]', false, false, false),
	('roofing', 'proposal_option', 'tear_off_layers', 'Layers torn off', 'numeric', null,
		false, false, false),
	('roofing', 'proposal_option', 'decking_sheets_included', 'Decking sheets included',
		'numeric', null, false, false, false),
	('roofing', 'proposal_option', 'includes_gutters', 'Gutters included', 'boolean', null,
		false, false, false),

	-- The commercial account, the GC and the supplier: the paperwork you
	-- cannot put a crew on a roof without. An expiring COI is the one a
	-- coordinator wants in front of them.
	('roofing', 'company', 'coi_expires', 'COI expires', 'text', null, true, false, false),
	('roofing', 'company', 'license_number', 'License number', 'text', null, false, true, false),
	('roofing', 'company', 'w9_on_file', 'W-9 on file', 'boolean', null, false, false, true),
	('roofing', 'company', 'account_terms', 'Terms', 'select',
		'["COD", "Net 15", "Net 30", "Net 60"]', false, false, true),

	-- The callback: a roof that leaks after you left, and whether you are
	-- still on the hook for it. Both are what the queue is triaged by.
	('roofing', 'ticket', 'callback_reason', 'Reason', 'select',
		'["Leak", "Missing shingle", "Flashing", "Gutter", "Cosmetic", "Storm damage"]',
		true, false, true),
	('roofing', 'ticket', 'under_warranty', 'Under warranty', 'boolean', null, true, false, true),
	('roofing', 'ticket', 'warranty_type', 'Warranty type', 'select',
		'["Workmanship", "Manufacturer", "None"]', false, false, true)
on conflict (industry_id, entity_type, key) do nothing;

-- The orgs already in roofing: the trigger only fires on insert and on an
-- industry change, so the rows above reach existing orgs through the same
-- backfill loop the industry_custom_fields migration closes with. Idempotent —
-- the copy skips a key the org already has, its own edits included.
do $$
declare
	org record;
begin
	for org in select id from public.organizations where industry_id = 'roofing' loop
		perform public.create_industry_custom_fields(org.id);
	end loop;
end $$;
