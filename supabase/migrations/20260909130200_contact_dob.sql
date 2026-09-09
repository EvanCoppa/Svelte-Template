-- A contact gets a date of birth.
--
-- This is the column side of the rule the party-model migration states: a
-- column if two unrelated industries would ever query on it, a custom field
-- otherwise. A birth date clears that bar comfortably — a practice books
-- recalls by it, an insurer rates on it, and a plain CRM sends a birthday
-- card — and it is identity rather than clinical data: it is how you tell two
-- people with the same name apart. The industry-specific attributes that hang
-- off a person (an allergy, a policy number, a tooth chart) stay custom
-- fields, which is what the migration before this one made usable.
--
-- Nullable, because the same table holds a patient and the buyer at a
-- 500-person account, and only one of them has ever been asked.
alter table public.contacts add column dob date;

comment on column public.contacts.dob is
	'The person''s date of birth. A calendar day, so a `date` — never shifted into a viewer''s time zone.';

-- Re-issued in full rather than patched: see the party-model migration.
revoke insert, update on table public.contacts from authenticated;
grant insert (org_id, company_id, name, email, phone, title, dob, is_primary, status, created_by),
	update (company_id, name, email, phone, title, dob, is_primary, status)
	on table public.contacts to authenticated;
