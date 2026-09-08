-- Assistant: an AI chat over the org's data, built on the Vercel AI SDK.
--
-- Two tables in the canonical tenant shape from the organizations migration,
-- with the crm_core "authored content" extension taken one step further: a
-- conversation is private to the member who started it, inside an org they
-- belong to. Nothing here is a security boundary of its own — the feature
-- gate in hooks.server.ts decides who may open /assistant, and every tool the
-- assistant runs goes through the CRM data modules under the caller's own
-- RLS — so these policies only need to keep one member's threads from
-- another's.
--
-- Messages are stored in the AI SDK's own UIMessage shape (`role` + `parts`
-- + `metadata`), verbatim, as the SDK's persistence guide recommends: the
-- client hydrates its Chat from these rows without conversion, and tool parts
-- keep their typed input and output so a reloaded thread renders exactly as
-- it streamed. `src/lib/server/ai/conversations.ts` is the one module that
-- reads and writes these tables.

-- ---------------------------------------------------------------------------
-- assistant_conversations — one thread
-- ---------------------------------------------------------------------------

create table public.assistant_conversations (
	id uuid not null primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations (id) on delete cascade,
	-- The member who started the thread. Defaults to the caller; the policies
	-- below make it the only user who can ever read or write the row.
	user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
	-- Generated from the first exchange; null until then.
	title text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

comment on table public.assistant_conversations is
	'One assistant thread. Private to the member who started it, scoped to the org it was started in.';

create index assistant_conversations_org_id_idx on public.assistant_conversations (org_id);
-- The history rail: a member's threads, newest first.
create index assistant_conversations_user_id_updated_at_idx
	on public.assistant_conversations (user_id, updated_at desc);

create trigger assistant_conversations_set_updated_at
	before update on public.assistant_conversations
	for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- assistant_messages — the thread's UIMessages
-- ---------------------------------------------------------------------------

create table public.assistant_messages (
	conversation_id uuid not null references public.assistant_conversations (id) on delete cascade,
	-- The UIMessage id, minted by the SDK (client for user messages, server for
	-- assistant messages). Keyed together with the conversation on purpose: a
	-- global key on a client-minted id would let one blank or duplicated id in
	-- one member's thread collide with — and block — every other member's
	-- writes.
	id text not null,
	role text not null check (role in ('system', 'user', 'assistant')),
	-- Order within the thread. The SDK hands the whole array back on every
	-- turn and this is its index, so a regenerated answer always sorts after
	-- the prompt it replaces the answer to.
	position integer not null check (position >= 0),
	-- UIMessage.parts, verbatim.
	parts jsonb not null check (jsonb_typeof(parts) = 'array'),
	-- UIMessage.metadata, verbatim (timestamps, model, token usage).
	metadata jsonb,
	created_at timestamptz not null default now(),
	primary key (conversation_id, id)
);

comment on table public.assistant_messages is
	'One AI SDK UIMessage in a thread, stored verbatim. Rows live and die with their conversation.';

create index assistant_messages_conversation_id_position_idx
	on public.assistant_messages (conversation_id, position);

-- A thread is "recent" when it was last written to, and the history rail sorts
-- by that: every message the endpoint saves bumps its conversation. The
-- function runs as its owner because `authenticated` is granted no update on
-- updated_at (see the grants below) — the trigger is the one writer of it.
create function private.touch_assistant_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.assistant_conversations
	set updated_at = now()
	where id = new.conversation_id;
	return null;
end;
$$;

create trigger assistant_messages_touch_conversation
	after insert on public.assistant_messages
	for each row execute function private.touch_assistant_conversation();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

-- A conversation is its author's, inside an org they belong to. Membership is
-- folded in so a thread stops being readable the moment its author leaves the
-- org, even though the row survives until the org does.
create policy "Members can view their own conversations"
	on public.assistant_conversations for select to authenticated
	using (user_id = (select auth.uid()) and private.org_role(org_id) is not null);

create policy "Members can start conversations as themselves"
	on public.assistant_conversations for insert to authenticated
	with check (user_id = (select auth.uid()) and private.org_role(org_id) is not null);

create policy "Members can update their own conversations"
	on public.assistant_conversations for update to authenticated
	using (user_id = (select auth.uid()) and private.org_role(org_id) is not null)
	with check (user_id = (select auth.uid()) and private.org_role(org_id) is not null);

create policy "Members can delete their own conversations"
	on public.assistant_conversations for delete to authenticated
	using (user_id = (select auth.uid()) and private.org_role(org_id) is not null);

-- Messages follow their conversation. The subselect reads a sibling table,
-- not organization_members, so it cannot recurse — and that table's own
-- policies already fold membership in.
create policy "Members can view messages in their own conversations"
	on public.assistant_messages for select to authenticated
	using (exists (
		select 1 from public.assistant_conversations c
		where c.id = conversation_id and c.user_id = (select auth.uid())
	));

create policy "Members can add messages to their own conversations"
	on public.assistant_messages for insert to authenticated
	with check (exists (
		select 1 from public.assistant_conversations c
		where c.id = conversation_id and c.user_id = (select auth.uid())
	));

create policy "Members can update messages in their own conversations"
	on public.assistant_messages for update to authenticated
	using (exists (
		select 1 from public.assistant_conversations c
		where c.id = conversation_id and c.user_id = (select auth.uid())
	))
	with check (exists (
		select 1 from public.assistant_conversations c
		where c.id = conversation_id and c.user_id = (select auth.uid())
	));

create policy "Members can delete messages in their own conversations"
	on public.assistant_messages for delete to authenticated
	using (exists (
		select 1 from public.assistant_conversations c
		where c.id = conversation_id and c.user_id = (select auth.uid())
	));

-- ---------------------------------------------------------------------------
-- Column-level grants
-- ---------------------------------------------------------------------------
-- RLS decides which ROWS a member may write, these decide which COLUMNS: a
-- conversation's org and author are set once and never change from the
-- browser, and a message never moves between conversations — the same
-- mechanism crm_core uses for org_id and authorship. The service-role client
-- ignores all of this.

revoke insert, update on table public.assistant_conversations from authenticated;
grant insert (id, org_id, user_id, title), update (title)
	on table public.assistant_conversations to authenticated;

revoke update on table public.assistant_messages from authenticated;
grant update (role, position, parts, metadata)
	on table public.assistant_messages to authenticated;

-- ---------------------------------------------------------------------------
-- The feature: how the assistant exists for an org
-- ---------------------------------------------------------------------------
-- Registered like every other feature (see "How to add a feature" in the
-- features migration): the hook gates /assistant on these rows, the sidebar
-- and ⌘K palette render from them, and the page's title comes from `pages`.
-- In every industry; unlocked by Pro and Enterprise, so a Free org sees the
-- entry locked and gets the upgrade prompt.

insert into public.features (id, name, description, route, icon, category, sort_order) values
	('assistant', 'Assistant', 'Ask questions and get work done across your data.',
		'/assistant', 'sparkles', 'platform', 60)
on conflict (id) do nothing;

insert into public.pages (id, feature_id, path, title) values
	('assistant', 'assistant', '/assistant', 'Assistant')
on conflict (id) do nothing;

-- Every industry gets the assistant: it is a way of working with whatever
-- data an org already has, not a capability of one vertical. Derived from
-- the catalog, so an industry added later cannot silently miss it.
insert into public.industry_features (industry_id, feature_id)
select i.id, 'assistant'
from public.industries i
on conflict (industry_id, feature_id) do nothing;

insert into public.tier_features (tier_id, feature_id) values
	('pro', 'assistant'),
	('enterprise', 'assistant')
on conflict (tier_id, feature_id) do nothing;

-- Plain members may open the assistant. What it can DO for them is decided
-- tool by tool from the grants they already hold on the features the tools
-- touch (src/lib/server/ai/tools/index.ts) — this row grants nothing beyond
-- the page itself. Derived from the companies grants the way the CRM feature
-- registry derives contacts: whoever a role lets read the CRM may ask the
-- assistant about it, in every industry, including roles added after this
-- migration was written.
insert into public.role_permissions (role_id, feature_id, level)
select rp.role_id, 'assistant', 'read'::public.permission_level
from public.role_permissions rp
where rp.feature_id = 'companies'
on conflict (role_id, feature_id) do nothing;
