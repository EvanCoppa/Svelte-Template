-- The graph shows presenter, responsible and a proposal's parent link.
-- ===========================================================================
-- Three facts about a proposal already exist as columns
-- (`presenter_id`/`responsible_id`, added by the proposal_people migration,
-- and the `entity_type`/`entity_id` polymorphic link from the proposals
-- migration itself) but never appeared on /graph, because `describeGraph()`
-- only ever reads the `relationships` table.
--
-- They stay columns: each is genuinely single-valued per proposal (the
-- proposal_people migration's own reasoning, same as `deals.assigned_to`),
-- and the `relationships` table's uniqueness index only dedupes an exact
-- (type, from, to) triple, not "at most one of this type from this record" —
-- writing real rows would let the generic Relationships card silently
-- edit or delete them with no path back to the column, so the two would
-- drift. `describeGraph()` instead reads the columns directly and draws
-- synthetic edges at request time (src/lib/server/crm/graph.ts), never
-- writing to `relationships`. The two new types below exist only to source
-- those edges' labels the same way every real edge gets its label; nothing
-- else changes here, and no policy needs to know.
--
-- ---------------------------------------------------------------------------
-- Two more system relationship types
-- ---------------------------------------------------------------------------
-- `responsible_for` (f0000000-…-000000000013) already fits responsible_id
-- as-is: source 'member', target null. These two are new.
insert into public.relationship_types (id, key, forward_label, inverse_label, source_type, target_type) values
	('f0000000-0000-0000-0000-000000000031', 'presents', 'presents', 'presented by', 'member', 'proposal'),
	('f0000000-0000-0000-0000-000000000032', 'proposed_to', 'proposed to', 'has proposal', 'proposal', null)
on conflict (id) do nothing;
