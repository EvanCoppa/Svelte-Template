-- Notifications become an inbox you can read
-- ===========================================================================
-- The `notifications` table has existed since crm_core: one row addressed to
-- one member, created server-side through the service-role client, with a
-- title, an optional body and an app-relative link. Nothing ever drew it.
--
-- The bell in the app header does, and reading a stream of them asks five
-- things of a row that a `title` alone cannot answer:
--
--   WHO did it       an activity line reads "Tunde requested a reversal", not
--                    "A reversal was requested" — and the face beside it is
--                    how a stream is scanned. `actor_id`, nullable: plenty of
--                    notifications are the system's own and have no face.
--   WHICH STREAM     what is addressed to YOU (someone needs you, someone
--                    acted on your work) and what merely happened around you
--                    (a rule changed, a setting moved) are two different
--                    reading habits, and mixing them is how an inbox becomes
--                    something people stop opening. `channel`, two values.
--   WHAT ABOUT       the short word after the timestamp — "Risk", "RQ1001",
--                    "Transactions". `context`: one nullable label, not a
--                    taxonomy, because the sender already knows the word and
--                    no screen ever groups by it.
--   WHAT TO DO       some notifications are an ask ("Review"), most are a
--                    statement. `action_label` is the button's words when
--                    there is something to do, null when there is not — so
--                    the row draws its own affordance instead of the panel
--                    guessing from `type`.
--   IS IT DONE WITH  `read_at` says it has been seen; that is not the same as
--                    dealt with. `archived_at` is the reader putting it away,
--                    which is what the panel's Dismiss does and what its
--                    Archived tab lists.
--
-- All five are columns rather than a `jsonb` payload: every one of them is
-- read by the panel on every render, three of them filter the query, and a
-- payload would put the shape of a notification beyond the reach of the type
-- generator. `type` stays the free-text discriminator it always was — it says
-- what happened for code that cares, and nothing on screen reads it.
--
-- No policy changes: the three notifications policies are already
-- recipient-only, and every column here is written by the same service-role
-- code that writes the row. The one grant below is what lets a reader put one
-- away, exactly as the existing `read_at` grant lets them mark one read.

-- ---------------------------------------------------------------------------
-- The two streams
-- ---------------------------------------------------------------------------
-- An enum, not a lookup table, by the rule in CLAUDE.md: org-definable sets
-- are rows, vocabularies we own are enums. "Addressed to me" and "happened
-- around me" is the same split in every vertical — nobody's dental practice
-- needs a third stream — and both values are matched in code (the panel's
-- tabs, the unread counts) the way `stage_outcome` is.
create type public.notification_channel as enum ('inbox', 'general');

comment on type public.notification_channel is
	'Which stream a notification belongs to: inbox (addressed to the recipient) or general (organization activity).';

alter table public.notifications
	-- Defaulted, so every existing row and every existing caller of
	-- createNotification() lands in the stream that is actually about them.
	add column channel public.notification_channel not null default 'inbox',
	-- The person whose doing it was. References profiles rather than
	-- auth.users for two reasons: PostgREST can then embed the actor's name
	-- and avatar in the inbox query (there is no route to auth.users), and the
	-- profiles policy already lets a member read the profile of anyone they
	-- share an org with — which is exactly who can appear here. `set null`
	-- keeps the notification when that person's account goes; the sentence
	-- simply loses its name.
	add column actor_id uuid references public.profiles (id) on delete set null,
	-- The label after the timestamp. Free text because the sender is the only
	-- one who knows the word, and it is never queried, only printed.
	add column context text,
	-- The words on the row's button, when the row is an ask. Null is the
	-- common case and means the row is a statement.
	add column action_label text,
	-- Put away by its recipient. Distinct from read_at on purpose: seen and
	-- dealt with are different facts, and only one of them empties a list.
	add column archived_at timestamptz;

comment on column public.notifications.actor_id is
	'The member whose action produced this notification, for the face and the name on the row. Null for notifications the system raises itself.';
comment on column public.notifications.context is
	'Short label printed after the timestamp ("Risk", "RQ1001"). Display only — never filtered or grouped on.';
comment on column public.notifications.action_label is
	'The words on the row''s action button when the notification is an ask ("Review"). Null means the row is a statement with nothing to do.';
comment on column public.notifications.archived_at is
	'When the recipient put this notification away. Independent of read_at: seen is not the same as dealt with.';

alter table public.notifications
	-- A button with nowhere to go is a dead control, and the panel would have
	-- to decide at render time what to do about it. The database refuses the
	-- row instead.
	add constraint notifications_action_needs_link
		check (action_label is null or link is not null),
	-- Both render in chrome a few hundred pixels wide, so the cap is the
	-- layout's, stated where it can be enforced. Long enough for "Transactions"
	-- and "Review anomaly", short enough that neither can push a row apart.
	add constraint notifications_context_length
		check (context is null or char_length(context) between 1 and 40),
	add constraint notifications_action_label_length
		check (action_label is null or char_length(action_label) between 1 and 24);

-- The panel's query: one recipient, one org, one archive state, newest first.
-- Partial on the open rows because that is the read that happens on every
-- page load, while the Archived tab is opened rarely and by hand. The
-- existing notifications_user_id_created_at_idx still serves that one.
create index notifications_open_idx
	on public.notifications (user_id, org_id, created_at desc)
	where archived_at is null;

-- Dismiss is an update by the recipient, so it needs the same column-level
-- grant read_at has (crm_core revoked update wholesale and grants it back one
-- column at a time). Additive: the read_at grant stands.
grant update (archived_at) on table public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Writing one
-- ---------------------------------------------------------------------------
-- Nothing else to register: notifications are not a feature. They have no
-- route, no nav entry and no grant — the bell is shell chrome like the theme
-- toggle, and a notification is addressed to a person rather than filed under
-- a capability, so the feature gate has nothing to say about it. Which also
-- means there is no `pages` row and no `features` row to add here.
--
-- Creating one is still `createNotification()` in
-- src/lib/server/crm/notifications.ts, through the service-role client, from
-- the action or endpoint that caused it. The five columns above are
-- optional there; a caller that sets none of them writes the same
-- notification it wrote before this migration.
