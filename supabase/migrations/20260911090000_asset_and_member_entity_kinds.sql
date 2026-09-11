-- Two more kinds of CRM record, shipped alone: Postgres refuses to use an
-- enum value in the transaction that added it (the party-model migration
-- explains), so the values land here and the next two migrations add what
-- makes them resolvable — the `assets` table, and the `private.crm_entity_exists()`
-- branches for both.
--
--   asset   a thing an org owns, uses, leases or tracks (the assets migration)
--   member  a person who works HERE — an organization_members row, keyed by
--           its user_id — so a relationship can name the employee a laptop is
--           assigned to without confusing them with a contact (a person you
--           work FOR) or a bare auth user. A member exists as an entity for
--           exactly as long as the membership does.
--
-- Positioned to keep the enum alphabetical, the order the generated types
-- list it in.
alter type public.crm_entity_type add value if not exists 'asset' before 'billable';
alter type public.crm_entity_type add value if not exists 'member' after 'deal';
