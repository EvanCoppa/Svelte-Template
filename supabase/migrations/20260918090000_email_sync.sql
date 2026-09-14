-- Email sync: a member's Google mailbox, read into the CRM and written from it
-- ===========================================================================
-- Attio's model, on this schema. Each member connects their OWN Google
-- account (per membership, so the same Gmail connected in two organizations
-- is two independent connections); the worker reads the mailbox through
-- Gmail's API, keeps only the messages that involve one of the org's
-- contacts or companies, and files each one on the records it is about
-- through the shared entity link. The record page shows the thread; a reply
-- goes out through Gmail AS the member, so it lands in their own Sent folder
-- and the thread stays one thread in everybody's inbox.
--
-- Why not `activities` rows with type 'email': an activity is one authored
-- moment with one entity link, read by every member. A synced email is none
-- of those — it is deduplicated across mailboxes (two members on one thread
-- store it once), it names many participants and so many records, it threads
-- by RFC headers, and who may read it depends on whose mailbox it came from.
-- `activities.type = 'email'` stays for a hand-logged email; the tables here
-- are the synced kind.
--
-- The shape, top to bottom:
--
--   mailboxes             a member's connected account inside one org
--   mailbox_credentials   its refresh token, sealed in app code; service role only
--   mailbox_exclusions    addresses and domains one mailbox never syncs
--   email_threads         a conversation, as the org sees it
--   email_messages        one row per RFC message per org — the dedupe point
--   mailbox_messages      which mailbox holds which message (direction, privacy)
--   email_participants    every address on a message, resolved to a contact
--   email_message_links   the records a message is filed on (the entity link)
--   email_outbox          the idempotency ledger for sends
--   mailbox_sync_jobs     the queue the worker drains
--
-- Sharing is Attio's, decided once in RLS: a mailbox is `shared` or
-- `private`, any one message can be flagged private by the member whose
-- mailbox holds it, the holder always sees their own, and — this org's
-- choice — an owner or admin sees everything. `private.mailbox_link_visible()`
-- is the one place that says so; every table below reads through it.

-- ---------------------------------------------------------------------------
-- Vocabularies we own are enums (the pipelines migration's rule)
-- ---------------------------------------------------------------------------

create type public.mailbox_provider as enum ('google');

-- active: syncing. reauthorize: Google refused the refresh token (revoked,
-- or expired — an app still in Testing status issues 7-day tokens) and the
-- member must connect again. paused: kept, not read — the seed's state, and
-- what an operator sets to stop a mailbox without losing its history.
create type public.mailbox_status as enum ('active', 'reauthorize', 'paused');

create type public.mailbox_visibility as enum ('shared', 'private');

create type public.email_participant_role as enum ('from', 'to', 'cc', 'bcc', 'reply_to');

-- How a message came to be filed on a record: a participant matched a
-- contact (and so the contact's company), a participant's domain matched a
-- company, or a person filed it by hand.
create type public.email_link_source as enum ('participant', 'domain', 'manual');

create type public.email_outbox_status as enum ('queued', 'sent', 'failed');

create type public.mailbox_sync_kind as enum (
	'backfill',
	'incremental',
	'address_backfill',
	'renew_watch',
	'revoke'
);

create type public.mailbox_sync_status as enum ('queued', 'running', 'done', 'failed');

-- ---------------------------------------------------------------------------
-- mailboxes
-- ---------------------------------------------------------------------------

create table public.mailboxes (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- Whose it is. A composite key onto the membership, like `deals.assigned_to`,
	-- so nobody outside the org can hold one — and, unlike a deal's assignee,
	-- the cascade: leaving the org takes the connection with it (and the
	-- revoke trigger below tells Google).
	user_id uuid not null,
	provider public.mailbox_provider not null default 'google',
	email_address text not null,
	visibility public.mailbox_visibility not null default 'shared',
	status public.mailbox_status not null default 'active',
	-- Gmail's cursor: the historyId the next incremental sync starts from.
	-- Null means "start over with a backfill".
	history_id text,
	-- When Gmail stops pushing unless `users.watch` is called again (7 days).
	watch_expires_at timestamptz,
	-- When the initial backfill finished; null while it is still paging.
	backfilled_at timestamptz,
	last_synced_at timestamptz,
	last_error text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (org_id, user_id) references public.organization_members (org_id, user_id)
		on delete cascade,
	unique (org_id, user_id, provider, email_address),
	-- The target of the composite keys below, so a dependent row can never
	-- name a mailbox from another org.
	unique (id, org_id),
	constraint mailboxes_email_address_lower check (email_address = lower(email_address))
);

comment on table public.mailboxes is
	'A member''s connected email account inside one organization. Rows are created by the OAuth callback through the service role; a member may change visibility and disconnect their own.';
comment on column public.mailboxes.visibility is
	'shared: the org reads what this mailbox synced. private: only its owner (and the org''s owners and admins) do.';

create index mailboxes_org_id_idx on public.mailboxes (org_id);
-- The push notification names an address; every active connection of it
-- (one per org) gets a job.
create index mailboxes_provider_address_idx on public.mailboxes (provider, email_address);

create trigger mailboxes_set_updated_at
	before update on public.mailboxes
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- mailbox_credentials — service role only
-- ---------------------------------------------------------------------------
-- The refresh token is the mailbox. It is sealed by app code before it lands
-- here (AES-256-GCM under MAILBOX_TOKEN_KEY; src/lib/server/mail-sync/tokens.ts),
-- and the table has RLS on with no policy and no grant, so even a leaked
-- publishable key reads nothing. The notifications table established the
-- shape: a table only the service role writes; this one it also only reads.

create table public.mailbox_credentials (
	mailbox_id uuid not null primary key references public.mailboxes (id) on delete cascade,
	refresh_token_sealed text not null,
	access_token_sealed text,
	access_token_expires_at timestamptz,
	scopes text[] not null default '{}',
	-- Which MAILBOX_TOKEN_KEY sealed it, so a key can be rotated row by row.
	key_version smallint not null default 1,
	updated_at timestamptz not null default now()
);

comment on table public.mailbox_credentials is
	'OAuth tokens for a mailbox, sealed in app code. No policies and no grants: only the service role reads or writes it.';

create trigger mailbox_credentials_set_updated_at
	before update on public.mailbox_credentials
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- mailbox_exclusions
-- ---------------------------------------------------------------------------
-- A member's own blocklist: an address (`someone@example.com`) or a whole
-- domain (`@example.com`) whose mail is never read into the org from this
-- mailbox, whatever it matches. Attio's "blocklist", per mailbox.

create table public.mailbox_exclusions (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	mailbox_id uuid not null,
	pattern text not null,
	created_at timestamptz not null default now(),
	foreign key (mailbox_id, org_id) references public.mailboxes (id, org_id) on delete cascade,
	unique (mailbox_id, pattern),
	constraint mailbox_exclusions_pattern_shape check (
		pattern = lower(pattern)
		and length(pattern) between 3 and 320
		and pattern ~ '^(@[^@\s]+|[^@\s]+@[^@\s]+)$'
	)
);

comment on table public.mailbox_exclusions is
	'Addresses (a@b.com) and domains (@b.com) one mailbox never syncs. The mailbox''s owner keeps the list.';

create index mailbox_exclusions_mailbox_id_idx on public.mailbox_exclusions (mailbox_id);
create index mailbox_exclusions_org_id_idx on public.mailbox_exclusions (org_id);

-- ---------------------------------------------------------------------------
-- email_threads / email_messages
-- ---------------------------------------------------------------------------

create table public.email_threads (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- The first message's subject with its Re:/Fwd: prefixes stripped.
	subject text,
	-- Maintained by trigger from the messages, so a thread is never counted
	-- by hand and an empty one does not survive its last message.
	first_message_at timestamptz,
	last_message_at timestamptz,
	message_count integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (id, org_id)
);

comment on table public.email_threads is
	'A conversation as the organization sees it: messages joined by their RFC headers first, Gmail''s thread id second.';

create index email_threads_org_last_message_idx
	on public.email_threads (org_id, last_message_at desc);

create trigger email_threads_set_updated_at
	before update on public.email_threads
	for each row execute procedure public.set_updated_at();

create table public.email_messages (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	thread_id uuid not null,
	-- The Message-ID header, angle brackets stripped. Unique per org: two
	-- members on the same thread store the message once, and re-running any
	-- sync page is a no-op. A message with no header gets a synthetic id
	-- (`gmail:<mailbox>:<id>`), which dedupes within its mailbox only.
	rfc_message_id text not null,
	in_reply_to text,
	-- The References header — not `references`, a reserved word.
	reference_ids text[] not null default '{}',
	subject text,
	snippet text,
	-- Plain text only, capped; the editor never shows HTML it did not write.
	body_text text,
	from_address text not null,
	from_name text,
	-- Gmail's internalDate: when the message was received or sent.
	sent_at timestamptz not null,
	attachment_count integer not null default 0,
	size_estimate integer,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (thread_id, org_id) references public.email_threads (id, org_id) on delete cascade,
	unique (org_id, rfc_message_id),
	unique (id, org_id),
	constraint email_messages_from_address_lower check (from_address = lower(from_address)),
	constraint email_messages_body_length check (body_text is null or length(body_text) <= 200000)
);

comment on table public.email_messages is
	'One synced email per organization, deduplicated on its Message-ID. Held by one or more mailboxes (mailbox_messages); gone when the last of them lets go.';

create index email_messages_org_thread_sent_idx
	on public.email_messages (org_id, thread_id, sent_at);
create index email_messages_org_sent_idx on public.email_messages (org_id, sent_at desc);

create trigger email_messages_set_updated_at
	before update on public.email_messages
	for each row execute procedure public.set_updated_at();

-- The thread's count and dates are a fold over its messages, recomputed on
-- every change rather than nudged, so nothing drifts. A thread whose last
-- message goes, goes.
create function private.email_thread_sync_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	target uuid;
	stats record;
begin
	if tg_op = 'DELETE' then
		target := old.thread_id;
	else
		target := new.thread_id;
	end if;

	select count(*) as n, min(sent_at) as first_at, max(sent_at) as last_at
	into stats
	from public.email_messages
	where thread_id = target;

	if stats.n = 0 then
		delete from public.email_threads where id = target;
	else
		update public.email_threads
		set message_count = stats.n,
			first_message_at = stats.first_at,
			last_message_at = stats.last_at
		where id = target;
	end if;

	return null;
end;
$$;

create trigger email_messages_sync_thread
	after insert or delete on public.email_messages
	for each row execute procedure private.email_thread_sync_stats();

-- ---------------------------------------------------------------------------
-- mailbox_messages — who holds a message
-- ---------------------------------------------------------------------------
-- Direction is PER MAILBOX: the same message is outbound in the sender's
-- mailbox and inbound in a colleague's who was copied. So is privacy.

create table public.mailbox_messages (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	mailbox_id uuid not null,
	message_id uuid not null,
	gmail_message_id text not null,
	gmail_thread_id text not null,
	label_ids text[] not null default '{}',
	-- The SENT label: this mailbox wrote it.
	is_sent boolean not null default false,
	-- Flagged by the holder: hidden from ordinary members even on a shared
	-- mailbox. Owners and admins still see it (this org's rule).
	is_private boolean not null default false,
	synced_at timestamptz not null default now(),
	foreign key (mailbox_id, org_id) references public.mailboxes (id, org_id) on delete cascade,
	foreign key (message_id, org_id) references public.email_messages (id, org_id) on delete cascade,
	unique (mailbox_id, gmail_message_id),
	unique (mailbox_id, message_id)
);

comment on table public.mailbox_messages is
	'A mailbox''s copy of a synced message: Gmail''s ids for it, whether this mailbox sent it, and whether its holder keeps it private.';

create index mailbox_messages_message_id_idx on public.mailbox_messages (message_id);
create index mailbox_messages_org_id_idx on public.mailbox_messages (org_id);

-- The org keeps only what a current connection vouches for. When the last
-- mailbox holding a message lets go — a disconnect, a member leaving, the
-- message deleted at Google — the message goes with it; the thread trigger
-- above then folds the thread.
create function private.on_mailbox_message_unlinked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	delete from public.email_messages m
	where m.id = old.message_id
		and not exists (
			select 1 from public.mailbox_messages mm where mm.message_id = old.message_id
		);
	return null;
end;
$$;

create trigger mailbox_messages_on_unlinked
	after delete on public.mailbox_messages
	for each row execute procedure private.on_mailbox_message_unlinked();

-- ---------------------------------------------------------------------------
-- email_participants
-- ---------------------------------------------------------------------------

create table public.email_participants (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	message_id uuid not null,
	role public.email_participant_role not null,
	address text not null,
	display_name text,
	-- The contact this address belonged to when the message was filed. A
	-- contact that goes leaves the address behind (set null), so the message
	-- still reads.
	contact_id uuid,
	created_at timestamptz not null default now(),
	foreign key (message_id, org_id) references public.email_messages (id, org_id) on delete cascade,
	foreign key (contact_id, org_id) references public.contacts (id, org_id)
		on delete set null (contact_id),
	constraint email_participants_address_lower check (address = lower(address))
);

comment on table public.email_participants is
	'Every address on a synced message, with the contact it resolved to.';

create index email_participants_message_id_idx on public.email_participants (message_id);
create index email_participants_org_address_idx on public.email_participants (org_id, address);
create index email_participants_org_contact_idx on public.email_participants (org_id, contact_id);

-- ---------------------------------------------------------------------------
-- email_message_links — the records a message is filed on
-- ---------------------------------------------------------------------------
-- The shared entity link, exactly as activities and addresses use it. Only
-- the party kinds and deals can carry mail for now; the check is the list.

create table public.email_message_links (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	message_id uuid not null,
	entity_type public.crm_entity_type not null,
	entity_id uuid not null,
	source public.email_link_source not null,
	created_by uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now(),
	foreign key (message_id, org_id) references public.email_messages (id, org_id) on delete cascade,
	unique (message_id, entity_type, entity_id),
	constraint email_message_links_kind check (entity_type in ('company', 'contact', 'deal'))
);

comment on table public.email_message_links is
	'Which CRM records a synced message shows on. Written by the sync worker (participant, domain) or by hand (manual).';

create index email_message_links_entity_idx
	on public.email_message_links (org_id, entity_type, entity_id, message_id);
create index email_message_links_message_id_idx on public.email_message_links (message_id);

create trigger email_message_links_check_entity
	before insert or update of org_id, entity_type, entity_id on public.email_message_links
	for each row execute procedure public.check_crm_entity_link();

-- The one place that answers "what happens when a CRM record goes" grows a
-- branch (the party-model migration's rule): the message is no longer ABOUT
-- that record, and stays — it is still somebody's mail. Participants keep
-- their address and lose the contact through the foreign key above.
create or replace function private.on_crm_entity_gone(org uuid, deleted_kind public.crm_entity_type, entity uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.proposals
	set entity_type = null, entity_id = null
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	update public.notes
	set entity_type = null, entity_id = null
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	update public.calendar_events
	set entity_type = null, entity_id = null
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.addresses
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.activities
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.taggings
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.custom_field_values
	where org_id = org and entity_type = deleted_kind and entity_id = entity;

	delete from public.relationships
	where org_id = org
		and ((from_type = deleted_kind and from_id = entity)
			or (to_type = deleted_kind and to_id = entity));

	delete from public.email_message_links
	where org_id = org and entity_type = deleted_kind and entity_id = entity;
end;
$$;

-- ---------------------------------------------------------------------------
-- email_outbox — the idempotency ledger for sends
-- ---------------------------------------------------------------------------
-- An email cannot be unsent, so a send is guarded the way a payment is: the
-- record page mints a key into the compose form, and a double submit
-- collides here instead of mailing twice. The row is also the audit of what
-- left through the CRM.

create table public.email_outbox (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	mailbox_id uuid not null,
	user_id uuid not null default auth.uid(),
	idempotency_key uuid not null,
	to_addresses text[] not null,
	cc_addresses text[] not null default '{}',
	bcc_addresses text[] not null default '{}',
	subject text not null,
	body_text text not null,
	-- The message being replied to, when it is a reply.
	in_reply_to_message_id uuid references public.email_messages (id) on delete set null,
	status public.email_outbox_status not null default 'queued',
	gmail_message_id text,
	error text,
	created_at timestamptz not null default now(),
	sent_at timestamptz,
	foreign key (mailbox_id, org_id) references public.mailboxes (id, org_id) on delete cascade,
	unique (mailbox_id, idempotency_key),
	constraint email_outbox_recipients check (cardinality(to_addresses) > 0),
	constraint email_outbox_body_length check (length(body_text) <= 50000)
);

comment on table public.email_outbox is
	'Every email sent through the CRM, keyed for idempotency. Inserted by the sender; its status is written by the service role as Gmail answers.';

create index email_outbox_mailbox_id_idx on public.email_outbox (mailbox_id);
create index email_outbox_org_id_idx on public.email_outbox (org_id);

-- ---------------------------------------------------------------------------
-- mailbox_sync_jobs — the queue
-- ---------------------------------------------------------------------------
-- The worker (src/lib/server/mail-sync/worker.ts, driven by a Vercel cron
-- and by Gmail's push notifications) claims rows here with
-- `claim_mailbox_sync_jobs()` below. Service role only: nothing in the
-- browser ever sees or writes a job.

create table public.mailbox_sync_jobs (
	id uuid not null primary key default gen_random_uuid(),
	-- Nullable for a `revoke` job, which outlives the mailbox and — when the
	-- whole org is being deleted — the org.
	org_id uuid references public.organizations (id) on delete cascade,
	mailbox_id uuid,
	kind public.mailbox_sync_kind not null,
	status public.mailbox_sync_status not null default 'queued',
	-- A backfill's page token, an address_backfill's address, a revoke's
	-- sealed token.
	payload jsonb not null default '{}',
	attempts integer not null default 0,
	next_run_at timestamptz not null default now(),
	claimed_at timestamptz,
	claimed_by text,
	last_error text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (mailbox_id, org_id) references public.mailboxes (id, org_id) on delete cascade
);

comment on table public.mailbox_sync_jobs is
	'Work for the mail sync worker. Claimed with claim_mailbox_sync_jobs(); service role only.';

-- One pending sync of a kind per mailbox: a burst of push notifications (up
-- to one a second) folds into one incremental job.
create unique index mailbox_sync_jobs_one_pending_idx
	on public.mailbox_sync_jobs (mailbox_id, kind)
	where status in ('queued', 'running') and kind in ('incremental', 'backfill', 'renew_watch');
create index mailbox_sync_jobs_due_idx on public.mailbox_sync_jobs (status, next_run_at);
create index mailbox_sync_jobs_org_id_idx on public.mailbox_sync_jobs (org_id);

create trigger mailbox_sync_jobs_set_updated_at
	before update on public.mailbox_sync_jobs
	for each row execute procedure public.set_updated_at();

-- Claim the next due jobs for one worker, skipping rows another worker holds.
-- A job left `running` past its lease (ten minutes — longer than any
-- invocation lives) is reclaimed. In `public` because PostgREST cannot call
-- into `private`; executable by the service role alone.
create function public.claim_mailbox_sync_jobs(worker text, batch integer)
returns setof public.mailbox_sync_jobs
language sql
volatile
security invoker
set search_path = ''
as $$
	update public.mailbox_sync_jobs j
	set status = 'running',
		claimed_at = now(),
		claimed_by = worker,
		attempts = j.attempts + 1
	where j.id in (
		select id
		from public.mailbox_sync_jobs
		where (status = 'queued' and next_run_at <= now())
			or (status = 'running' and claimed_at < now() - interval '10 minutes')
		order by next_run_at
		for update skip locked
		limit batch
	)
	returning j.*;
$$;

revoke execute on function public.claim_mailbox_sync_jobs(text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Two triggers that put work on the queue
-- ---------------------------------------------------------------------------

-- A contact added or given an email today has a history in every connected
-- mailbox: queue a targeted backfill for the address, so "add the person,
-- see last year's emails" needs no app-module coupling — the generic form,
-- an import and the assistant's tool all get it.
create function private.enqueue_address_backfill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.email is null or new.email = '' then
		return null;
	end if;
	if tg_op = 'UPDATE' and new.email is not distinct from old.email then
		return null;
	end if;

	insert into public.mailbox_sync_jobs (org_id, mailbox_id, kind, payload)
	select m.org_id, m.id, 'address_backfill', jsonb_build_object('address', lower(new.email))
	from public.mailboxes m
	where m.org_id = new.org_id and m.status = 'active' and m.backfilled_at is not null;

	return null;
end;
$$;

create trigger contacts_enqueue_address_backfill
	after insert or update of email on public.contacts
	for each row execute procedure private.enqueue_address_backfill();

-- Disconnecting — or leaving the org, or the org going — must reach Google:
-- the token is revoked and the watch stopped. The credentials are read
-- BEFORE the delete, while they still exist, into a job that names no
-- mailbox and no org, so it survives both cascades.
create function private.enqueue_mailbox_revoke()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.mailbox_sync_jobs (org_id, mailbox_id, kind, payload)
	select null, null, 'revoke',
		jsonb_build_object(
			'email_address', old.email_address,
			'refresh_token_sealed', c.refresh_token_sealed,
			'access_token_sealed', c.access_token_sealed
		)
	from public.mailbox_credentials c
	where c.mailbox_id = old.id;

	return old;
end;
$$;

create trigger mailboxes_enqueue_revoke
	before delete on public.mailboxes
	for each row execute procedure private.enqueue_mailbox_revoke();

-- ---------------------------------------------------------------------------
-- Visibility helpers — SECURITY DEFINER, never API-exposed
-- ---------------------------------------------------------------------------

-- The mailbox is the caller's own.
create function private.owns_mailbox(mailbox uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.mailboxes m
		where m.id = mailbox and m.user_id = (select auth.uid())
	)
$$;

-- May the caller read what a mailbox holds? Its owner always; an owner or
-- admin of the org always (this org's rule — Attio hides a private mailbox
-- from admins too); anyone else only when the mailbox is shared and the
-- particular message is not flagged private.
create function private.mailbox_link_visible(mailbox uuid, is_private boolean)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.mailboxes m
		where m.id = mailbox
			and (
				m.user_id = (select auth.uid())
				or private.org_role(m.org_id) in ('owner', 'admin')
				or (m.visibility = 'shared' and not is_private)
			)
	)
$$;

-- A message is visible when any mailbox holding it is.
create function private.email_message_visible(message uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.mailbox_messages mm
		where mm.message_id = message
			and private.mailbox_link_visible(mm.mailbox_id, mm.is_private)
	)
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.mailboxes enable row level security;
alter table public.mailbox_credentials enable row level security;
alter table public.mailbox_exclusions enable row level security;
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;
alter table public.mailbox_messages enable row level security;
alter table public.email_participants enable row level security;
alter table public.email_message_links enable row level security;
alter table public.email_outbox enable row level security;
alter table public.mailbox_sync_jobs enable row level security;

-- mailboxes: the roster is the org's to see; the connection is its owner's
-- to set and to end (an owner/admin may end anyone's). No insert policy —
-- a row is born in the OAuth callback, through the service role, from what
-- Google answered, the way an invite is accepted.
create policy "Members can view their org's mailboxes"
	on public.mailboxes for select to authenticated
	using (private.org_role(org_id) is not null);

create policy "Owners can update their own mailbox"
	on public.mailboxes for update to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

create policy "Owners and managers can disconnect a mailbox"
	on public.mailboxes for delete to authenticated
	using (
		user_id = (select auth.uid())
		or private.org_role(org_id) in ('owner', 'admin')
	);

-- mailbox_credentials, mailbox_sync_jobs: no policies. RLS on and every
-- grant revoked below.

create policy "Mailbox owners can view their exclusions"
	on public.mailbox_exclusions for select to authenticated
	using (private.owns_mailbox(mailbox_id));

create policy "Mailbox owners can add exclusions"
	on public.mailbox_exclusions for insert to authenticated
	with check (private.owns_mailbox(mailbox_id));

create policy "Mailbox owners can remove exclusions"
	on public.mailbox_exclusions for delete to authenticated
	using (private.owns_mailbox(mailbox_id));

-- A thread exists for a reader when at least one of its messages does; the
-- inner select is itself filtered by the messages policy, so a thread whose
-- every message is somebody else's private mail is not there.
create policy "Members can view threads with a visible message"
	on public.email_threads for select to authenticated
	using (
		private.org_role(org_id) is not null
		and exists (select 1 from public.email_messages m where m.thread_id = email_threads.id)
	);

create policy "Members can view visible messages"
	on public.email_messages for select to authenticated
	using (private.org_role(org_id) is not null and private.email_message_visible(id));

create policy "Members can view visible mailbox copies"
	on public.mailbox_messages for select to authenticated
	using (
		private.org_role(org_id) is not null
		and private.mailbox_link_visible(mailbox_id, is_private)
	);

create policy "Mailbox owners can flag their copies private"
	on public.mailbox_messages for update to authenticated
	using (private.owns_mailbox(mailbox_id))
	with check (private.owns_mailbox(mailbox_id));

create policy "Members can view participants of visible messages"
	on public.email_participants for select to authenticated
	using (private.org_role(org_id) is not null and private.email_message_visible(message_id));

create policy "Members can view links of visible messages"
	on public.email_message_links for select to authenticated
	using (private.org_role(org_id) is not null and private.email_message_visible(message_id));

-- Filing by hand: any member, on a message they can read, as themselves.
create policy "Members can file a visible message on a record"
	on public.email_message_links for insert to authenticated
	with check (
		private.org_role(org_id) is not null
		and source = 'manual'
		and created_by = (select auth.uid())
		and private.email_message_visible(message_id)
	);

create policy "Authors and managers can unfile a manual link"
	on public.email_message_links for delete to authenticated
	using (
		source = 'manual'
		and (created_by = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin'))
	);

-- The outbox is the sender's: they insert the row (through their own
-- mailbox only) and read their own; the service role writes the outcome.
create policy "Senders can view their own outbox"
	on public.email_outbox for select to authenticated
	using (user_id = (select auth.uid()));

create policy "Senders can queue mail through their own mailbox"
	on public.email_outbox for insert to authenticated
	with check (
		user_id = (select auth.uid())
		and private.org_role(org_id) is not null
		and private.owns_mailbox(mailbox_id)
	);

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a client may write, these decide which COLUMNS.

revoke all on table public.mailbox_credentials from anon, authenticated;
revoke all on table public.mailbox_sync_jobs from anon, authenticated;

-- A member changes how their mailbox is shared and nothing else: the cursor,
-- the status and the watch are the worker's.
revoke insert, update on table public.mailboxes from authenticated;
grant update (visibility) on table public.mailboxes to authenticated;

revoke insert, update on table public.mailbox_exclusions from authenticated;
grant insert (org_id, mailbox_id, pattern) on table public.mailbox_exclusions to authenticated;

revoke insert, update, delete on table public.email_threads from authenticated;
revoke insert, update, delete on table public.email_messages from authenticated;
revoke insert, update, delete on table public.email_participants from authenticated;

revoke insert, update, delete on table public.mailbox_messages from authenticated;
grant update (is_private) on table public.mailbox_messages to authenticated;

revoke insert, update on table public.email_message_links from authenticated;
grant insert (org_id, message_id, entity_type, entity_id, source, created_by)
	on table public.email_message_links to authenticated;

revoke insert, update, delete on table public.email_outbox from authenticated;
grant insert (
	org_id, mailbox_id, user_id, idempotency_key, to_addresses, cc_addresses, bcc_addresses,
	subject, body_text, in_reply_to_message_id
) on table public.email_outbox to authenticated;

-- ---------------------------------------------------------------------------
-- The registry rows: /email exists, and Settings gains Integrations
-- ---------------------------------------------------------------------------
-- The migration that adds a route registers it (the features migration's
-- closing checklist). Filed under CRM after Tickets (1100) and before the
-- graph (1200): mail is read against the records, and you open the feed to
-- see what has been said, not to start the day. The connect-and-manage
-- screen is NOT here: it is a settings page (below), because it exists for
-- every org — what it offers is what the feature's mode and the caller's
-- grant allow, checked by that page's own load since /settings is exempt
-- from the gate.

insert into public.features (id, name, noun, description, route, icon, category, sort_order) values
	('email', 'Emails', 'email',
		'Every conversation with a contact or a company, synced from the mailboxes your team connected.',
		'/email', 'mail', 'crm', 1150)
on conflict (id) do nothing;

insert into public.pages (id, feature_id, path, title) values
	-- No title of its own: named by the feature, as the org's industry says it.
	('email', 'email', '/email', null),
	-- A shell page: every org has it, whatever its plan.
	('settings-integrations', null, '/settings/integrations', 'Integrations')
on conflict (id) do nothing;

-- Every vertical writes email, and none calls it anything else, so the rows
-- are derived; the ordered sections then each place it just before their
-- graph (the graph migration's positions), on the ledger migration's
-- precedent of a value between two hundreds. `crm` inherits 1150.
insert into public.industry_features (industry_id, feature_id)
select i.id, 'email'
from public.industries i
on conflict (industry_id, feature_id) do nothing;

update public.industry_features as f
set sort_order = v.sort_order
from (values
	('dentistry', 850),
	('cosmetic', 750),
	('roofing', 850),
	('medical-supplies', 950),
	('beverage', 950),
	('merchant-services', 1150)
) as v (industry_id, sort_order)
where f.industry_id = v.industry_id and f.feature_id = 'email';

-- Pro and up. The free plan sees the entry locked with the upgrade prompt;
-- a synced mailbox is a real cost per seat, and it is the pitch.
insert into public.tier_features (tier_id, feature_id) values
	('pro', 'email'),
	('enterprise', 'email')
on conflict (tier_id, feature_id) do nothing;

-- Grants follow the contacts feature, rung for rung, in every industry:
-- whoever may work a contact may connect a mailbox and write to them
-- (`manage`), whoever may remove one may hold the top rung, and everyone
-- else who is in the industry at all may read what was said. Derived rather
-- than listed, so an industry added later inherits it; a role holding
-- nothing on contacts still reads — the Viewer's rung.
insert into public.role_permissions (role_id, feature_id, level)
select
	r.id,
	'email',
	case
		when bool_or(rp.feature_id = 'contacts' and rp.level = 'delete') then 'delete'
		when bool_or(rp.feature_id = 'contacts' and rp.level in ('manage', 'delete')) then 'manage'
		else 'read'
	end::public.permission_level
from public.roles r
join public.industry_features f on f.industry_id = r.industry_id and f.feature_id = 'email'
left join public.role_permissions rp on rp.role_id = r.id
group by r.id
on conflict (role_id, feature_id) do nothing;

-- ---------------------------------------------------------------------------
-- Adding to this, after
-- ---------------------------------------------------------------------------
-- A kind of record that should carry mail: add it to
-- `email_message_links_kind` and give `matchMessage()`
-- (src/lib/server/mail-sync/match.ts) a reason to file on it.
-- A second provider: a value on `mailbox_provider`, a client under
-- src/lib/server/integrations/<provider>/, and the worker's switch.
-- HTML bodies and attachments: an `email_attachments` table and an
-- on-demand endpoint — never a `body_html` column read into the page.
