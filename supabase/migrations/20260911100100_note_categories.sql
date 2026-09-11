-- note_categories — the shelves the notes page groups by.
--
-- The notes migration gave a note two ways to be found: the record it is
-- about (the shared entity link) and the search box. Both answer "where is
-- the note about X". Neither answers "where is everything I wrote about
-- onboarding", because that pile is not a record and never will be — it is a
-- heading the org invented, and the only place it can live is a row.
--
-- So a category is a row, not an enum: a vocabulary the ORG defines is rows,
-- and no two orgs file their writing the same way. That is the same call the
-- pipelines migration made for deal stages, and the opposite of the one the
-- task_workflow migration just made for task_status — a board's states are
-- ours, a filing cabinet's drawers are theirs.
--
-- A category is a heading, not a permission and not a feature: it groups
-- notes on the notes page and does nothing else. `notes.category_id` is
-- nullable and always will be — a note jotted down in a hurry belongs to no
-- shelf, which is the common case and why the page's first group is the
-- unfiled one rather than an empty state telling you to make a category
-- first.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table public.note_categories (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	name text not null,
	-- The same ten tones the notes themselves are written on (the activities
	-- migration promoted them from BadgeTone), so a shelf and the paper on it
	-- speak one colour vocabulary. Neutral by default: a heading earns a
	-- colour by being given one.
	color public.badge_tone not null default 'neutral',
	-- Where the shelf sits on the page, ascending — so a new category lands at
	-- the bottom where it was added, rather than above everything. A double
	-- for the same reason notes.position is one: dropping a category between
	-- two others writes the midpoint and renumbers nothing.
	position double precision not null default extract(epoch from now()),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Composite target, the companies trick, so notes.category_id can be
	-- pinned to a category in the same org.
	unique (id, org_id),
	constraint note_categories_name_not_blank check (length(trim(name)) > 0),
	constraint note_categories_name_length check (length(name) <= 80)
);

comment on table public.note_categories is
	'A heading the org invented to file notes under. Org-defined rows, not an enum: no two orgs group their writing the same way.';
comment on column public.note_categories.position is
	'Where the category sits on the notes page, ascending. A move writes the midpoint between the new neighbours.';

create index note_categories_org_id_position_idx
	on public.note_categories (org_id, position);

-- One name per org, however it is cased: two shelves called "Onboarding" and
-- "onboarding" are one shelf somebody typed twice.
create unique index note_categories_org_id_name_idx
	on public.note_categories (org_id, lower(name));

create trigger note_categories_set_updated_at
	before update on public.note_categories
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- A category is org furniture rather than authored content: everyone reads
-- the same shelves and any member may add one or rename it, which is what
-- keeps filing something a one-step act instead of a request to an admin.
-- Deleting is owner/admin, like every other delete here — it unfiles every
-- note on the shelf at once, and that is not an undo away.

alter table public.note_categories enable row level security;

create policy "Members can view note categories"
	on public.note_categories for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create note categories"
	on public.note_categories for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can update note categories"
	on public.note_categories for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete note categories"
	on public.note_categories for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------

revoke insert, update on table public.note_categories from authenticated;
grant insert (org_id, name, color, position),
	update (name, color, position)
	on table public.note_categories to authenticated;

-- ---------------------------------------------------------------------------
-- The note's shelf
-- ---------------------------------------------------------------------------

-- Nullable forever: an unfiled note is a note, not a note with something
-- missing. Deleting a category unfiles its notes rather than taking them with
-- it — the writing outlives the heading it was filed under, which is the same
-- call `on_crm_entity_gone()` makes when the record a note is about is
-- deleted.
alter table public.notes
	add column category_id uuid,
	add constraint notes_category_id_org_id_fkey
		foreign key (category_id, org_id) references public.note_categories (id, org_id)
		on delete set null (category_id);

comment on column public.notes.category_id is
	'The shelf the note is filed on, or null for unfiled. Deleting the category unfiles the note.';

-- The page's read: one org's notes, a shelf at a time.
create index notes_org_id_category_id_idx on public.notes (org_id, category_id);

-- Filing a note is editing it, so it joins the update grant RLS already
-- guards — the author of a note (or an owner/admin) moves it between shelves,
-- exactly as they recolour or archive it.
grant update (category_id) on table public.notes to authenticated;
