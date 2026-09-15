-- The unified deal timeline (docs/to-do/unified-deal-timeline-plan.md) is
-- `activities` itself, not a second table: a system-generated fact — today,
-- a deal's stage or owner changing — is an activity row like any other, with
-- the member who caused it as `author_id` for attribution.
--
-- What makes a row a SYSTEM entry is `type`, never the presence or absence
-- of an author — the deal board's drag is still someone's own action, and a
-- reader wants to know who moved it. `is_system` (the same generated-column
-- shape `relationship_types` already uses for its own system rows) is
-- derived from `type` rather than being a flag the inserting request sets,
-- so nothing posted from the browser can mark its own row permanent: the
-- vocabulary of system types is closed here, in the migration, not in a
-- grant a client request could lean on.

alter table public.activities
	add column metadata jsonb;

comment on column public.activities.metadata is
	'Structured before/after values for a system-generated activity (e.g. {"from": "<stage id>", "to": "<stage id>"}). Null for a human-logged one.';

alter table public.activities
	add column is_system boolean generated always as (
		type in ('stage_changed', 'owner_changed')
	) stored;

comment on column public.activities.is_system is
	'True for a system-generated timeline entry (stage/owner change, more to come). Derived from `type`; a system row is never user-editable, whoever is named as its author.';

-- A system row is never edited or deleted, by its author or by an owner/admin
-- — corrections are a later event, the same rule `on_crm_entity_deleted`
-- already gives a taggings row. Replaces rather than narrows the original
-- policies, so the "not is_system" guard cannot be bypassed by a grant that
-- still names the old, looser check.
drop policy "Authors and managers can update activities" on public.activities;
drop policy "Authors and managers can delete activities" on public.activities;

create policy "Authors and managers can update activities"
	on public.activities for update to authenticated
	using (
		not is_system
		and private.org_role(org_id) is not null
		and (author_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin'))
	)
	with check (
		not is_system
		and private.org_role(org_id) is not null
		and (author_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin'))
	);

create policy "Authors and managers can delete activities"
	on public.activities for delete to authenticated
	using (
		not is_system
		and (author_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin'))
	);

-- `metadata` joins the columns a member may set when logging one — including
-- a system row, since it is still written through the caller's own
-- RLS-bound client, never a service-role one.
revoke insert on table public.activities from authenticated;
grant insert (
		org_id, entity_type, entity_id, type, direction, subject, body, occurred_at,
		duration_minutes, author_id, metadata
	)
	on table public.activities to authenticated;
