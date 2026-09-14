-- Two more kinds of CRM record, shipped alone: Postgres refuses to use an
-- enum value in the transaction that added it (the party-model migration
-- explains), so the values land here and the next migration adds what makes
-- them resolvable — the `properties` and `leases` tables, and the
-- `private.crm_entity_exists()` branches for both.
--
--   property  a building or a rentable unit inside one. ONE table for both,
--             joined by a self-reference: a unit is a property row with a
--             parent. See the properties_and_leases migration for why.
--   lease     a tenancy: who rents a property, for how long, at what rent.
--
-- Positioned to keep each new value alphabetical among its neighbours, the
-- order the generated types list them in.
alter type public.crm_entity_type add value if not exists 'lease' after 'invoice';
alter type public.crm_entity_type add value if not exists 'property' after 'product';
