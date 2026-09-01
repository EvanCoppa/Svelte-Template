-- CRM core: clients (+ contacts), deals, tasks, notes, support tickets
-- (+ comments) and per-user notifications. Every table is tenant-scoped per
-- the canonical shape in the organizations migration: org_id → cascade,
-- RLS on, membership via private.org_role(), an index on org_id.
--
-- One deliberate extension of that shape, applied consistently here: the
-- canonical block gates ALL writes to owner/admin, which fits config-like
-- tables but would make the member role useless in a CRM — members are the
-- people who add clients, log notes and work tickets. So working data is
-- member-writable, while the destructive/authored boundaries stay strict:
--
--   select              any member of the org
--   insert              any member (authored rows must be authored as self)
--   update              any member for working data (clients, contacts,
--                       deals, tasks, tickets); author or owner/admin for
--                       authored content (notes, ticket comments)
--   delete              owner/admin; author may delete their own authored
--                       content; notifications are the recipient's alone
--
-- Role checks still live in RLS, always. Column-level grants (bottom of the
-- file) keep org_id and authorship columns immutable from the browser, the
-- same mechanism the organizations migration uses for tier_id.

-- Statuses are enums, not lookup tables: they are code-level vocabulary
-- (matched in switches, rendered as badges), unlike tiers which billing
-- reshapes at runtime.
create type public.client_status as enum ('lead', 'prospect', 'active', 'inactive');
create type public.ticket_status as enum ('open', 'pending', 'resolved', 'closed');
create type public.ticket_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.deal_stage as enum ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost');

-- ---------------------------------------------------------------------------
-- clients — the account/company a CRM revolves around
-- ---------------------------------------------------------------------------

create table public.clients (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	name text not null,
	email text,
	phone text,
	company text,
	website text,
	status public.client_status not null default 'lead',
	-- Who created the row. Defaults to the caller so app code never sets it;
	-- `set null` keeps the client when that user leaves.
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Composite target for child-table FKs: referencing (id, org_id) makes it
	-- impossible for a child row to point at a client in a different org than
	-- its own org_id claims, without any trigger machinery.
	unique (id, org_id)
);

comment on table public.clients is
	'A CRM account (company or person the org does business with). Tenant-scoped.';

create index clients_org_id_idx on public.clients (org_id);

create trigger clients_set_updated_at
	before update on public.clients
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_contacts — people at a client
-- ---------------------------------------------------------------------------

create table public.client_contacts (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	client_id uuid not null,
	name text not null,
	email text,
	phone text,
	title text,
	is_primary boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (client_id, org_id) references public.clients (id, org_id) on delete cascade
);

comment on table public.client_contacts is
	'A person at a client (name card + role). Rows live and die with their client.';

create index client_contacts_org_id_idx on public.client_contacts (org_id);
create index client_contacts_client_id_idx on public.client_contacts (client_id);

create trigger client_contacts_set_updated_at
	before update on public.client_contacts
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- deals — the sales pipeline
-- ---------------------------------------------------------------------------

create table public.deals (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	client_id uuid not null,
	title text not null,
	-- Money as numeric, never float; currency handling is app-level until a
	-- real billing requirement shows up.
	amount numeric(12, 2),
	stage public.deal_stage not null default 'lead',
	expected_close_date date,
	assigned_to uuid,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (client_id, org_id) references public.clients (id, org_id) on delete cascade,
	-- Assignees must be members of this org — the composite FK makes
	-- cross-org assignment impossible at the constraint level, and losing
	-- membership clears the assignment instead of dangling it.
	foreign key (org_id, assigned_to) references public.organization_members (org_id, user_id)
		on delete set null (assigned_to)
);

comment on table public.deals is
	'A sales opportunity with a client, tracked through pipeline stages.';

create index deals_org_id_idx on public.deals (org_id);
create index deals_client_id_idx on public.deals (client_id);
create index deals_assigned_to_idx on public.deals (assigned_to);

create trigger deals_set_updated_at
	before update on public.deals
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks — follow-ups and to-dos, optionally tied to a client
-- ---------------------------------------------------------------------------

create table public.tasks (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	client_id uuid,
	title text not null,
	details text,
	due_at timestamptz,
	-- A timestamp doubles as the "done" flag and records when.
	completed_at timestamptz,
	assigned_to uuid,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- PG15+ column list: deleting the client detaches the task (client_id
	-- alone goes null) instead of deleting it or nulling org_id.
	foreign key (client_id, org_id) references public.clients (id, org_id)
		on delete set null (client_id),
	-- Same org-membership guarantee as deals.assigned_to.
	foreign key (org_id, assigned_to) references public.organization_members (org_id, user_id)
		on delete set null (assigned_to)
);

comment on table public.tasks is
	'A follow-up or to-do, optionally attached to a client and assignable to a member.';

create index tasks_org_id_idx on public.tasks (org_id);
create index tasks_client_id_idx on public.tasks (client_id);
create index tasks_assigned_to_idx on public.tasks (assigned_to);

create trigger tasks_set_updated_at
	before update on public.tasks
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notes — free-form notes, org-wide or pinned to a client
-- ---------------------------------------------------------------------------

create table public.notes (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	client_id uuid,
	author_id uuid references auth.users (id) on delete set null default auth.uid(),
	body text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (client_id, org_id) references public.clients (id, org_id)
		on delete set null (client_id)
);

comment on table public.notes is
	'Free-form note by a member; client_id null means an org-level note.';

create index notes_org_id_idx on public.notes (org_id);
create index notes_client_id_idx on public.notes (client_id);

create trigger notes_set_updated_at
	before update on public.notes
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- support_tickets — the support desk
-- ---------------------------------------------------------------------------

create table public.support_tickets (
	id uuid not null primary key default gen_random_uuid(),
	-- Human-facing ticket number ("#42"). Globally sequential is fine — the
	-- point is a short handle for conversation, not per-org bookkeeping.
	number bigint generated always as identity unique,
	org_id uuid not null references public.organizations (id) on delete cascade,
	client_id uuid,
	subject text not null,
	description text,
	status public.ticket_status not null default 'open',
	priority public.ticket_priority not null default 'normal',
	assigned_to uuid,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Deleting a client keeps its ticket history, detached.
	foreign key (client_id, org_id) references public.clients (id, org_id)
		on delete set null (client_id),
	-- Same org-membership guarantee as deals.assigned_to.
	foreign key (org_id, assigned_to) references public.organization_members (org_id, user_id)
		on delete set null (assigned_to),
	-- Composite target for ticket_comments, same trick as clients.
	unique (id, org_id)
);

comment on table public.support_tickets is
	'A support request worked by the org, usually on behalf of a client.';

create index support_tickets_org_id_idx on public.support_tickets (org_id);
create index support_tickets_client_id_idx on public.support_tickets (client_id);
create index support_tickets_assigned_to_idx on public.support_tickets (assigned_to);

create trigger support_tickets_set_updated_at
	before update on public.support_tickets
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ticket_comments — the conversation on a ticket
-- ---------------------------------------------------------------------------

create table public.ticket_comments (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	ticket_id uuid not null,
	author_id uuid references auth.users (id) on delete set null default auth.uid(),
	body text not null,
	-- Internal notes stay inside the org when tickets grow a client-facing
	-- surface; until then the flag is just faithfully stored.
	is_internal boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (ticket_id, org_id) references public.support_tickets (id, org_id) on delete cascade
);

comment on table public.ticket_comments is
	'One comment in a ticket''s thread; is_internal marks org-only notes.';

create index ticket_comments_org_id_idx on public.ticket_comments (org_id);
create index ticket_comments_ticket_id_idx on public.ticket_comments (ticket_id);

create trigger ticket_comments_set_updated_at
	before update on public.ticket_comments
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications — per-user in-app inbox
-- ---------------------------------------------------------------------------

create table public.notifications (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	user_id uuid not null,
	-- Free-text discriminator ('ticket_assigned', 'mention', …): notification
	-- kinds change too often to be worth an enum migration each time.
	type text not null,
	title text not null,
	body text,
	-- App-relative destination only. Slightly stricter than the `next` guard:
	-- it also rejects a leading '/\', which browsers normalize to '//'.
	link text,
	read_at timestamptz,
	created_at timestamptz not null default now(),
	-- Recipients must be members of this org, so even service-role code
	-- cannot deliver one org's data to an outsider; leaving the org (or
	-- deleting the user, which cascades through memberships) clears the
	-- inbox rows carrying that org's data.
	foreign key (org_id, user_id) references public.organization_members (org_id, user_id)
		on delete cascade,
	constraint notifications_link_is_relative
		check (link is null or link ~ '^/($|[^/\\])')
);

comment on table public.notifications is
	'In-app notification addressed to one member. Created server-side (service role); the recipient can only read it, mark it read, or delete it.';

create index notifications_org_id_idx on public.notifications (org_id);
-- The inbox query: newest first for one user.
create index notifications_user_id_created_at_idx
	on public.notifications (user_id, created_at desc);

-- No updated_at trigger: rows are immutable except read_at, which the column
-- grants below limit updates to.

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.deals enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.notifications enable row level security;

-- clients ------------------------------------------------------------------

create policy "Members can view clients"
	on public.clients for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create clients as themselves"
	on public.clients for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update clients"
	on public.clients for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete clients"
	on public.clients for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- client_contacts ----------------------------------------------------------

create policy "Members can view contacts"
	on public.client_contacts for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create contacts"
	on public.client_contacts for insert to authenticated
	with check (private.org_role(org_id) is not null);

create policy "Members can update contacts"
	on public.client_contacts for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete contacts"
	on public.client_contacts for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- deals --------------------------------------------------------------------

create policy "Members can view deals"
	on public.deals for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create deals as themselves"
	on public.deals for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update deals"
	on public.deals for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete deals"
	on public.deals for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- tasks --------------------------------------------------------------------

create policy "Members can view tasks"
	on public.tasks for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create tasks as themselves"
	on public.tasks for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update tasks"
	on public.tasks for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete tasks"
	on public.tasks for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- notes --------------------------------------------------------------------

create policy "Members can view notes"
	on public.notes for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create notes as themselves"
	on public.notes for insert to authenticated
	with check (private.org_role(org_id) is not null and author_id = (select auth.uid()));

create policy "Authors and managers can update notes"
	on public.notes for update to authenticated
	using (
		author_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	)
	with check (
		author_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	);

create policy "Authors and managers can delete notes"
	on public.notes for delete to authenticated
	using (
		author_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	);

-- support_tickets ----------------------------------------------------------

create policy "Members can view tickets"
	on public.support_tickets for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can create tickets as themselves"
	on public.support_tickets for insert to authenticated
	with check (private.org_role(org_id) is not null and created_by = (select auth.uid()));

create policy "Members can update tickets"
	on public.support_tickets for update to authenticated
	using (private.org_role(org_id) is not null)
	with check (private.org_role(org_id) is not null);

create policy "Owners and admins can delete tickets"
	on public.support_tickets for delete to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

-- ticket_comments ----------------------------------------------------------

create policy "Members can view ticket comments"
	on public.ticket_comments for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Members can comment as themselves"
	on public.ticket_comments for insert to authenticated
	with check (private.org_role(org_id) is not null and author_id = (select auth.uid()));

create policy "Authors and managers can update ticket comments"
	on public.ticket_comments for update to authenticated
	using (
		author_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	)
	with check (
		author_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	);

create policy "Authors and managers can delete ticket comments"
	on public.ticket_comments for delete to authenticated
	using (
		author_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	);

-- notifications ------------------------------------------------------------
-- Recipient-only, and deliberately no INSERT policy: notifications are
-- created server-side through the service-role client
-- (src/lib/server/crm/notifications.ts), never by a browser.

create policy "Users can view their own notifications"
	on public.notifications for select to authenticated
	using (user_id = (select auth.uid()));

create policy "Users can mark their own notifications read"
	on public.notifications for update to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

create policy "Users can delete their own notifications"
	on public.notifications for delete to authenticated
	using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a member may write, these decide which COLUMNS —
-- exactly the organizations/tier_id mechanism. Excluding org_id from every
-- update grant makes rows unmovable between orgs; excluding created_by /
-- author_id (and support_tickets.number) makes authorship and ticket numbers
-- immutable once written. The service-role client ignores all of this.

revoke insert, update on table public.clients from authenticated;
grant insert (org_id, name, email, phone, company, website, status, created_by),
	update (name, email, phone, company, website, status)
	on table public.clients to authenticated;

revoke insert, update on table public.client_contacts from authenticated;
grant insert (org_id, client_id, name, email, phone, title, is_primary),
	update (client_id, name, email, phone, title, is_primary)
	on table public.client_contacts to authenticated;

revoke insert, update on table public.deals from authenticated;
grant insert (org_id, client_id, title, amount, stage, expected_close_date, assigned_to, created_by),
	update (client_id, title, amount, stage, expected_close_date, assigned_to)
	on table public.deals to authenticated;

revoke insert, update on table public.tasks from authenticated;
grant insert (org_id, client_id, title, details, due_at, assigned_to, created_by),
	update (client_id, title, details, due_at, completed_at, assigned_to)
	on table public.tasks to authenticated;

revoke insert, update on table public.notes from authenticated;
grant insert (org_id, client_id, author_id, body),
	update (body)
	on table public.notes to authenticated;

revoke insert, update on table public.support_tickets from authenticated;
grant insert (org_id, client_id, subject, description, priority, assigned_to, created_by),
	update (client_id, subject, description, status, priority, assigned_to)
	on table public.support_tickets to authenticated;

revoke insert, update on table public.ticket_comments from authenticated;
grant insert (org_id, ticket_id, author_id, body, is_internal),
	update (body, is_internal)
	on table public.ticket_comments to authenticated;

-- Recipients can only flip read_at; creation is service-role only.
revoke insert, update on table public.notifications from authenticated;
grant update (read_at) on table public.notifications to authenticated;
