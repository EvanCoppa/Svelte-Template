-- Two new activity_type values for the deal timeline (docs/to-do/unified-deal-timeline-plan.md).
--
-- Split into its own migration, ahead of the one that uses these values in a
-- generated column's expression: adding an enum value and referencing it in
-- the same transaction is the one thing Postgres still refuses.

alter type public.activity_type add value 'stage_changed';
alter type public.activity_type add value 'owner_changed';
