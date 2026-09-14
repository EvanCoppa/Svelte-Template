# Email: a member's Google mailbox, read into the CRM and written from it

The brief was Attio's email sync — every conversation with a contact or a company on
their record, kept current, with replies sent from the CRM as yourself — built on this
schema's own rules: per-member connections keyed to the membership, the shared entity
link for "which records is this about", RLS deciding who reads what, and the worker
sized to Vercel's functions rather than a long-running process.

## What it does

- **Each member connects their own Google account** at `/settings/integrations`, per
  organization. The same Gmail connected in two orgs is two connections, each syncing
  against that org's contacts and with its own sharing setting.
- **The last year of mail is read in** (`BACKFILL_DAYS`), then kept current — pushed
  by Gmail through Pub/Sub when that is configured, polled by the cron otherwise.
- **Only mail that involves a record is kept.** A message is stored when an address on
  it is a contact's email (filed on the contact and their company) or sits at a
  company's own domain (filed on the company). Mail between members alone, mail at
  free-mail domains nobody is a contact at, and anything on a mailbox's exclusion
  list is never written. Adding a contact later queues a targeted backfill for their
  address, so last quarter's thread appears on a person you only just added.
- **Two members on one thread store it once.** Messages dedupe on their RFC
  `Message-ID` per org; each mailbox keeps its own copy row saying whether it sent the
  message and whether its holder flagged it private.
- **Sharing is a setting on the mailbox, private is a flag on the message.** A
  mailbox is `shared` (the org reads what it synced) or `private` (only its owner);
  any one message can be flagged private by the member whose mailbox holds it. This
  org's rule differs from Attio's in one place: **owners and admins see everything**.
- **Replies go out through Gmail as the member**, threaded under their own copy of
  the conversation, so the thread stays one thread in everyone's inbox and the sent
  message lands in their Sent folder. The sent message is filed on the record it was
  written from before Gmail's push comes round.
- **`/email`** is the feed: the org's latest conversations the reader may see, with
  the records each is filed on. The record page's Emails tab is the same list,
  narrowed to one record, with the compose form.

## The tables

`supabase/migrations/*_email_sync.sql`, top to bottom:

| Table                 | What a row is                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `mailboxes`           | A member's connected account in one org. FK onto the membership, cascade.                     |
| `mailbox_credentials` | Its tokens, sealed by app code. RLS on, **no policy, no grant** — service role only.          |
| `mailbox_exclusions`  | An address or `@domain` the mailbox never syncs.                                              |
| `email_threads`       | A conversation; counts and dates maintained by trigger from the messages.                     |
| `email_messages`      | One message per org, unique on `(org_id, rfc_message_id)`. Plain text body, capped.           |
| `mailbox_messages`    | Which mailbox holds which message: Gmail's ids, `is_sent`, `is_private`.                      |
| `email_participants`  | Every address on a message, with the contact it resolved to (set null when the contact goes). |
| `email_message_links` | The records a message is filed on, through the shared entity link; `source` says why.         |
| `email_outbox`        | Every send through the CRM, unique on `(mailbox_id, idempotency_key)`.                        |
| `mailbox_sync_jobs`   | The queue. Service role only; claimed with `claim_mailbox_sync_jobs()`.                       |

Three `private` helpers carry the visibility rule: `owns_mailbox()`,
`mailbox_link_visible(mailbox, is_private)` and `email_message_visible(message)`.
Every policy on the message-side tables reads through the last one, so the rule is
stated once.

Two triggers put work on the queue: a contact insert or email change enqueues an
`address_backfill` for every active mailbox in the org, and a mailbox delete (its own,
a member leaving, the org going) enqueues a `revoke` carrying the sealed token, so the
grant is revoked at Google after the row is gone. A third, on `mailbox_messages`
delete, removes a message nobody holds any more — the org keeps only what a current
connection vouches for.

## Where the code is

| Path                                                                                   | Owns                                                                        |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/server/integrations/google/oauth.ts`                                          | The consent URL, PKCE, code exchange, refresh, revoke                       |
| `src/lib/server/integrations/google/gmail.ts`                                          | A thin REST client over `fetch`: list, get, batch get, history, watch, send |
| `src/lib/server/integrations/google/mime.ts`                                           | Headers and bodies in; an RFC 5322 message out                              |
| `src/lib/server/integrations/google/pubsub.ts`                                         | Verifying a push subscription's OIDC token with Node's crypto               |
| `src/lib/server/mail-sync/tokens.ts`                                                   | AES-256-GCM sealing under `MAILBOX_TOKEN_KEY`                               |
| `src/lib/server/mail-sync/match.ts`                                                    | The pure matching rule (contacts, company domains, free mail, exclusions)   |
| `src/lib/server/mail-sync/threads.ts`, `ingest.ts`                                     | Which thread a message joins; one Gmail message becoming rows, idempotently |
| `src/lib/server/mail-sync/credentials.ts`                                              | A live access token, or the mailbox marked `reauthorize`                    |
| `src/lib/server/mail-sync/jobs.ts`, `worker.ts`                                        | The queue and the five jobs; `drain()` runs until a deadline                |
| `src/lib/server/mail-sync/access.ts`                                                   | What a session may do with email, for the pages the gate does not cover     |
| `src/lib/server/crm/mailboxes.ts`, `emails.ts`                                         | Request-scoped reads and the member's own writes                            |
| `src/routes/api/integrations/google/{start,callback}`                                  | The OAuth round trip                                                        |
| `src/routes/api/integrations/google/notifications`                                     | Gmail's push (Pub/Sub → enqueue)                                            |
| `src/routes/api/cron/mail-sync`                                                        | The cron tick (housekeeping + drain)                                        |
| `src/routes/(app)/settings/integrations/`                                              | Connect, share, exclude, sync now, disconnect                               |
| `src/routes/(app)/email/`                                                              | The feed                                                                    |
| `src/routes/(app)/[kind=record]/[id=guid]/email.server.ts`                             | The record page's Emails block: threads, send, flag private                 |
| `src/lib/components/detail/detail-email-threads.svelte`, `detail-compose-email.svelte` | The tab and the compose modal                                               |
| `src/lib/server/ai/tools/search-emails.ts`, `read-email-thread.ts`                     | The assistant's two tools over the same reads                               |

## How a message gets in

1. **Connect.** `/api/integrations/google/start` pins a state and a PKCE verifier to
   the browser and sends it to Google with `access_type=offline` and
   `prompt=consent` (a refresh token is only issued on a forced consent). The
   callback checks the state, exchanges the code, refuses a grant missing either
   scope, reads the profile (address + current `historyId`), seals the tokens and
   writes the mailbox through the service role — then queues a `backfill` and a
   `renew_watch`.
2. **Backfill.** One page of `messages.list` (newest first, the last year, no chats,
   spam, bin or drafts) per job run, batch-fetched 50 at a time, ingested, and the
   job requeued with the next page token. The cron's `drain()` keeps claiming it
   until the page tokens run out; the last page stamps `backfilled_at`.
3. **Incremental.** `history.list` from the stored cursor: added messages are
   fetched and ingested, deleted or binned ones let go of, the cursor moves. A cursor
   Google no longer has (404) restarts with a backfill. Triggered by a push, or by the
   cron when a mailbox has not synced in a while (`POLL_INTERVAL_MS`).
4. **Ingest.** Skip by label; parse headers; refuse anything on the exclusion list;
   match; store nothing when nothing matched or nobody external is on it; resolve the
   thread (RFC headers first, Gmail's thread id second, else new); insert the message
   (or find it); insert participants; upsert links and the mailbox's copy.

Gmail's per-user quota is 15,000 units a minute and `messages.get` is 5, so a page
of 100 is well inside it; a 429 puts the job back with Google's own `Retry-After`.
Every write is idempotent, so a page re-run after a crash lands on rows that exist.

## Google Cloud setup

1. Enable the **Gmail API** on a project.
2. **OAuth consent screen**: user type External for a product, Internal for a single
   Workspace org. Scopes `gmail.readonly` and `gmail.send`. While the app's publishing
   status is **Testing**, only listed test users (100 at most) can connect **and their
   refresh tokens expire after 7 days** — which is why the `reauthorize` state, and
   the notification that goes with it, exist from day one.
3. **Credentials → OAuth client (Web)** with `<origin>/api/integrations/google/callback`
   as an authorized redirect URI, for every origin you deploy at (localhost included).
   Put the id and secret in `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.
4. `openssl rand -base64 32` → `MAILBOX_TOKEN_KEY`.
5. **Push (optional, recommended in production)**: a Pub/Sub topic with
   `gmail-api-push@system.gserviceaccount.com` granted Publisher; a push subscription
   to `<origin>/api/integrations/google/notifications` with OIDC authentication as a
   service account of yours (grant the Pub/Sub service agent the Service Account
   Token Creator role on it) and the endpoint URL as the audience. Set
   `GOOGLE_PUBSUB_TOPIC`, `GOOGLE_PUSH_SERVICE_ACCOUNT`, `GOOGLE_PUSH_AUDIENCE`.
   Without these the cron polls instead.
6. **Cron**: `vercel.json` schedules `/api/cron/mail-sync` every minute; Vercel sends
   `CRON_SECRET` as the bearer. A per-minute schedule needs the Pro plan.

### Verification

`gmail.readonly` is one of Google's **restricted** scopes. An External app must pass
OAuth verification — brand checks, a demo video, a justification per scope — and an
annual **CASA** security assessment by a Google-empanelled lab before it can leave
Testing. `gmail.send` is only "sensitive". An Internal app skips verification but only
that Workspace's users can connect. Plan for this before the first outside customer;
until then Testing mode and the 7-day tokens are the working state.

## Locally

Pub/Sub cannot reach a laptop, so drive the queue by hand: the "Sync now" button on
`/settings/integrations` runs it for one mailbox, or

```bash
curl -H "authorization: Bearer $CRON_SECRET" http://localhost:5173/api/cron/mail-sync
```

runs the whole tick. The seed ships one `paused` mailbox for `dev@example.com` in
Acme with two threads filed on Lucius Fox and Pepper Potts, so the tab and the feed
draw with no Google account at all.

## Deferred, with the way in

- **Deals** carry mail only by hand for now (`source = 'manual'`); an automatic
  rollup of a deal's contact's threads is a branch in `matchMessage()`.
- **HTML bodies and attachments**: an on-demand endpoint rendering a sanitised
  body in a sandboxed frame, and an `email_attachments` table — never a `body_html`
  column read straight into the page.
- **Auto-creating contacts** from unmatched addresses (Attio does): a switch on the
  mailbox and a branch in `ingestMessage()` that creates the contact before matching.
- **Calendar**: the same connection with a calendar scope, feeding `calendar_events`.
- **A second provider** (Microsoft 365): a value on `mailbox_provider`, a client under
  `src/lib/server/integrations/<provider>/`, and the worker's switch.
- **Live refresh** of a page while a sync lands: a Realtime subscription on
  `mailbox_messages` invalidating `QUERY.record(...)` (docs/data-invalidation.md).
