-- A custom field can put itself on the list, and say whether it starts shown.
--
-- The list_fields migration lets an INDUSTRY put a custom field on a table by
-- key. That leaves the field an org declared on its own — the one no
-- migration knows about — off every list until someone ships a row for it,
-- which is exactly the field the org most wants to see. So the definition
-- carries the answer itself:
--
--   is_default_shown   true: the field is a column the table shows from the
--                      start; false (the default): it is still a column of
--                      the kind's list, hidden until the reader switches it
--                      on from the table's View menu
--
-- Either way the field is part of the list (docs/lists.md, "Extra custom
-- fields"): the resolver appends every custom field of the kind that no
-- list_fields / industry_list_fields row already names, after the listed
-- fields, in label order — not searched and not filtered, since neither is
-- a thing a definition can promise; an industry row can still say
-- otherwise, and when one names the field, the row wins and this flag is
-- not consulted.
--
-- Members write it like the label: it is a fact about the org's field, not
-- a per-user preference (docs/user-preferences.md — a colleague who never
-- touched it sees the same table).

alter table public.custom_field_definitions
	add column is_default_shown boolean not null default false;

comment on column public.custom_field_definitions.is_default_shown is
	'Whether the kind''s list shows this field as a column from the start. False keeps it a hidden column the reader can switch on. Ignored when a list_fields or industry_list_fields row names the field.';

-- The org's own say, alongside the label.
revoke insert, update on table public.custom_field_definitions from authenticated;
grant insert (org_id, entity_type, key, label, value_type, allowed_values, is_default_shown),
	update (key, label, allowed_values, is_default_shown)
	on table public.custom_field_definitions to authenticated;
