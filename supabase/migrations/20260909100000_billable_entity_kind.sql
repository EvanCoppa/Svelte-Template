-- Billables become a kind of CRM record (the billables migration that
-- follows creates the table). The enum value ships alone here because
-- Postgres refuses to use a value in the transaction that added it, exactly
-- as the party-model migration explains — the next file adds the table and
-- the `private.crm_entity_exists()` branch that makes the value resolvable.
--
-- `before 'company'` keeps the enum in alphabetical order, which is the
-- order the generated types list it in.
alter type public.crm_entity_type add value if not exists 'billable' before 'company';
