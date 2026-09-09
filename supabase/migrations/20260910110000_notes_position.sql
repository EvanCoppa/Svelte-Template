-- notes.position — where a note sits on the rail.
--
-- The notes migration ordered the rail by `created_at desc` and its docs said
-- that drag-to-reorder "would need a position column and nothing yet asks for
-- one". The dock now asks: a tab can be picked up and dropped between two
-- others, and the order has to be a column or the drop is forgotten on the
-- next load.
--
-- A double rather than an integer, so a move writes ONE row: the moved note
-- takes the midpoint between its new neighbours and nothing else is
-- renumbered (the way a sorted list of stickies on a desk works — you move the
-- one, not all of them). The default is the epoch of now(), which sorts a new
-- note to the top of the rail exactly as `created_at desc` did, so existing
-- rows are backfilled from `created_at` and the order nobody has touched is
-- the order it always was.
--
-- The order is the org's, like the notes: RLS already says who may change a
-- note (its author, or an owner/admin), and moving one is changing it, so a
-- member reorders their own notes among everybody's and a manager reorders
-- any. No new policy; the column simply joins the update grant.

alter table public.notes
	add column position double precision not null default extract(epoch from now());

comment on column public.notes.position is
	'Where the note sits on the rail; higher is nearer the top. A move writes the midpoint between the new neighbours, so only the moved row changes.';

update public.notes set position = extract(epoch from created_at);

-- The rail reads (org_id, position desc); the created_at index served only that.
drop index if exists public.notes_org_created_at_idx;
create index notes_org_position_idx on public.notes (org_id, position desc);

grant update (position) on table public.notes to authenticated;
