-- Record-attached notes become private to their author.
--
-- The notes migration gave every note in the org the activities rule: anyone
-- reads it, the author or an owner/admin edits and removes it. That is right
-- for the freestanding note dock — the point of jotting something down for
-- the org is that the person covering for you can read it, and it is exactly
-- the "shared scratchpad" the notes migration describes.
--
-- A note attached to a specific record (entity_type/entity_id set) is a
-- different thing in practice: it is personal working notes about that
-- record — the messy draft-thinking a rep leaves themselves on a deal, not a
-- statement meant for the team. That wants the `user_preferences` model
-- (CLAUDE.md: "one row per key, private to its owner — no policy grants
-- anyone else's, not even an org owner's"), not the activities model.
--
-- This is a deliberate exception carved out of the otherwise-shared `notes`
-- table, keyed on `entity_type is not null`, rather than a second table: the
-- row shape, the columns, and the detach-on-entity-deleted behavior
-- (`on_crm_entity_deleted` / `private.on_crm_entity_gone`) all stay exactly
-- as they are for both kinds of note. Only RLS visibility splits by whether
-- the note is attached.
--
-- The entity link is updatable (a note can be attached to a record after it
-- was written, or detached), so the update policy has to gate on BOTH the
-- pre-update row (`using`, entity_type of the existing row) and the
-- post-update row (`with check`, entity_type of the incoming row) — otherwise
-- attaching or detaching a note could be used to dodge the authorship rule
-- for one side of the edit.

drop policy "Members can view notes" on public.notes;
drop policy "Authors and managers can update notes" on public.notes;
drop policy "Authors and managers can delete notes" on public.notes;

-- Freestanding notes (entity_type null) stay the shared scratchpad, visible
-- to the whole org. A note attached to a record is personal working notes:
-- only the author who wrote it may see it, full stop — not even an
-- owner/admin.
create policy "Members can view notes"
	on public.notes for select to authenticated
	using (
		private.org_role(org_id) is not null
		and (entity_type is null or author_id = (select auth.uid()))
	);

comment on policy "Members can view notes" on public.notes is
	'Freestanding notes (entity_type null) are the org-shared scratchpad. A note attached to a record is private working notes: visible only to its author, never to other members or an owner/admin.';

-- Freestanding notes keep the exact existing rule: the author or an
-- owner/admin may edit. A note attached to a record — on either side of the
-- edit, so attaching or detaching cannot be used to escape the rule — may
-- only be edited by its author.
create policy "Authors and managers can update notes"
	on public.notes for update to authenticated
	using (
		private.org_role(org_id) is not null
		and (
			(entity_type is null and (author_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin')))
			or (entity_type is not null and author_id = (select auth.uid()))
		)
	)
	with check (
		private.org_role(org_id) is not null
		and (
			(entity_type is null and (author_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin')))
			or (entity_type is not null and author_id = (select auth.uid()))
		)
	);

comment on policy "Authors and managers can update notes" on public.notes is
	'Freestanding notes: author or owner/admin. A note attached to a record, on either side of the edit: author only — attaching or detaching a note can never be used to dodge that.';

-- Same split for delete: freestanding stays author-or-manager, attached is
-- author-only.
create policy "Authors and managers can delete notes"
	on public.notes for delete to authenticated
	using (
		(entity_type is null and (author_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin')))
		or (entity_type is not null and author_id = (select auth.uid()))
	);

comment on policy "Authors and managers can delete notes" on public.notes is
	'Freestanding notes: author or owner/admin. A note attached to a record: author only.';
