-- Slide decks: the presentation a proposal is shown through. This is the
-- minimum the proposals migration needs in order to link a proposal to a
-- deck (its proposal_decks join table): identity, ownership and a title.
-- How a deck's slides are stored — a slides table, ordered jsonb, template
-- references — is the slide builder's decision and lands with it; nothing
-- here presumes it.
--
-- Tenant-scoped per the canonical shape in the organizations migration, and
-- member-writable per the crm_core extension of it: members build decks,
-- owners/admins delete them.

create table public.slide_decks (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	title text not null,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Composite target for child-table FKs, same trick as clients: a child
	-- row cannot point at a deck in a different org than its own org_id.
	unique (id, org_id)
);

comment on table public.slide_decks is
	'A presentation (ordered slides) an org builds and shows. Tenant-scoped; the slide content model is added by the slide builder.';

create index slide_decks_org_id_idx on public.slide_decks (org_id);

create trigger slide_decks_set_updated_at
	before update on public.slide_decks
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.slide_decks enable row level security;

create policy "Members can view slide decks"
	on public.slide_decks for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create slide decks as themselves"
	on public.slide_decks for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update slide decks"
	on public.slide_decks for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete slide decks"
	on public.slide_decks for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a member may write, these decide which COLUMNS:
-- org_id and created_by are immutable from the browser, exactly as in
-- crm_core. The service-role client ignores all of this.

revoke insert, update on table public.slide_decks from authenticated;
grant insert (org_id, title, created_by),
	update (title)
	on table public.slide_decks to authenticated;
