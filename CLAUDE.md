# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## What this repo is

This is a **starter template**. It exists to be cloned and converted into whatever the
project at hand needs to be — rename the app, add domains, delete sample pages freely.
The skeleton is disposable; the discipline is not:

1. **The #1 rule of this project is consistency and code quality.** Before writing
   anything, find how the codebase already does it (a page, a form action, a query, a
   nav entry, a ui component) and match that pattern exactly. One established way per
   problem — never introduce a second pattern for something that already has one. If a
   pattern needs to change, change it everywhere, not in one new spot.
2. **Stick to the official best practices of SvelteKit, shadcn-svelte, and Supabase —
   and actually read their documentation rather than answering from memory.** All three
   move fast; the live docs match the installed versions, your training may not:
   - SvelteKit / Svelte: the `llms.txt` routes (see "Svelte reference docs" below)
   - Supabase: <https://supabase.com/docs> — especially the server-side auth guide at
     <https://supabase.com/docs/guides/auth/server-side> and the RLS docs
   - shadcn-svelte: <https://shadcn-svelte.com/docs> for component APIs and the CLI

   When this repo's conventions and the official docs conflict, surface it — don't
   silently pick one.

Every rule below applies with equal force after the template has become a real project;
extend the rules rather than fighting them.

## Commands

```bash
npm run dev            # dev server
npm run build          # production build (Vercel adapter)
npm run check          # svelte-check (strict types, a11y, unused CSS) — keep at ZERO
npm run lint           # prettier --check + eslint (flat config) — keep at ZERO
npm run lint:oxlint    # oxlint + vendored anti-slop rules (tools/oxlint/anti-slop) — keep at ZERO
npm run knip           # unused files / exports / dependencies (knip.jsonc) — keep at ZERO
npm test               # vitest (server-side unit tests)
npm run test:e2e       # playwright (real browser, tests/) — see "E2E tests" below
npm run db:start       # boot the local Supabase stack in Docker
npm run db:reset       # re-apply every migration, then supabase/seed.sql
npm run db:env         # write .env.local pointing at the local stack
npm run db:new <name>  # scaffold a migration file
npm run db:types       # regenerate src/lib/database.types.ts (local or hosted)
npm run db:types:check # fail if the committed types disagree with the schema (CI)
npm run db:lint        # schema static analysis — keep at ZERO
npm run format         # prettier (svelte + tailwind plugins)
```

## Tech stack

- **SvelteKit 2 + Svelte 5** (runes only), TypeScript strict, Tailwind CSS v4
- **Supabase** (`@supabase/ssr`) for auth + Postgres; **Vercel** for hosting
- **shadcn-svelte** primitives vendored in `src/lib/components/ui/` — they are project
  source, not a dependency; edit them in place. Add more with
  `npx shadcn-svelte@latest add <name>`.

## Auth contract (do not weaken)

- `src/hooks.server.ts` is **default-deny**: every route requires a verified session
  unless its prefix is in `PUBLIC_PATHS` (currently `/login`, `/auth`). New protected
  pages go under the `(app)` route group and need zero auth wiring.
- Server-side auth decisions use `locals.safeGetSession()` (validates the JWT via
  `getUser()`). Never trust `getSession()` alone in server code, and never put access
  or refresh tokens into data returned from a load or action.
- Password recovery pins the browser to `/reset-password` via the cookie in
  `src/lib/server/password-recovery.ts` until a new password is set.
- `next` redirect params must stay guarded: only `startsWith('/') && !startsWith('//')`.
- Auth failure messages stay vague on purpose (user-enumeration defense). Keep the
  reset action's "if that email has an account…" phrasing.
- The service-role client (`src/lib/supabase.server.ts`) bypasses RLS: create it per
  request in server files only. RLS stays enabled on every table regardless.
- Every response carries the security headers from
  `src/lib/server/security-headers.ts`. The CSP's origins derive from
  `PUBLIC_SUPABASE_URL` — when adding an external service, add its origin there
  as a parameter or documented constant, never a hardcoded project ref.
- The auth surface has unit tests (`src/routes/auth/confirm/server.test.ts`,
  `src/routes/reset-password/page.server.test.ts`, `src/routes/login/page.server.test.ts`,
  plus `src/lib/server/*.test.ts`). Changes to those routes must keep the tests
  green and extend them.

## E2E tests

Playwright specs live in `tests/` (`*.spec.ts`); vitest owns `src/**` and the two
never overlap. Split by what a spec needs:

- **No database** → `tests/guest.spec.ts`. An unauthenticated request never reaches
  Supabase, so these run on a bare clone and in CI. New assertions about the route
  guard, `?next=` handling or security headers belong here.
- **Signed in** → `tests/auth.spec.ts`. Gated on `authStackReachable()` from
  `tests/env.ts`, so it skips with an explanation rather than failing when no stack
  is up. Run it with `npm run db:start && npm run db:env && npm run test:e2e`.

Two rules that are easy to get wrong:

- **Wait for hydration before clicking.** Playwright treats a server-rendered button
  as clickable while it is still inert HTML, and the click is silently dropped —
  which looks exactly like a broken handler. Use `clickWhenLive()` in
  `tests/auth.spec.ts`; never "fix" this with a bare `waitForTimeout`.
- **Scope selectors.** The signed-in user's email renders in the page body _and_ in
  the sidebar user menu, so an unscoped `getByText(email)` trips strict mode. And
  `Card.Title` renders a `<div>`, so card-based pages expose no heading role —
  assert on `<title>` or a `data-slot`.

**Testing against a dev server without hitting the login page:** set
`DEV_AUTO_LOGIN=true` and `DEV_AUTO_LOGIN_EMAIL` in `.env` (requires
`SUPABASE_SERVICE_ROLE_KEY`). `src/lib/server/dev-auto-login.ts` then signs that
user in on the first request, so `npm run dev` lands straight in the app. It
refuses to run on production deployments, `/logout` still works (sets an opt-out
cookie; clear it with `?autologin=1`), and the emailed-link flows under `/auth`
stay testable as a signed-out browser.

## Multi-tenancy (the default data model)

This template is **multi-tenant by default**: `organizations` is the root entity, and
application data is scoped to an organization, never to a bare user. The
`organizations` migration is the reference; the moving parts:

- **Tables**: `organizations` (with `tier_id` → the `tiers` lookup table),
  `organization_members` (`org_id`, `user_id`, `role public.org_role` —
  owner/admin/member). `profiles` stays per-user identity (display name, avatar) —
  the one deliberate exception.
- **Every new tenant-scoped table copies the canonical shape** (also in the comment
  block at the bottom of the organizations migration):
  `org_id uuid not null references public.organizations (id) on delete cascade`,
  RLS enabled, select policy `using (private.org_role(org_id) is not null)`, write
  policies `with check (private.org_role(org_id) in ('owner','admin'))`, and an
  index on `org_id`. Never write a policy that queries `organization_members`
  directly — that recurses; always go through the `private.*` helpers.
- **Role checks live in RLS, always**, via `private.org_role(org_id)` (SECURITY
  DEFINER, not API-exposed). **Tier gating lives in app code by default** — loads
  and actions read `activeOrg.tierId` from layout data and branch (upsell states,
  limits, disabled buttons). Add `private.org_tier(org_id) in (...)` to a policy
  only when a tier boundary is a _security_ boundary. Quota counting belongs in the
  form action, never in a per-row policy subquery.
- **`tiers` is reference data**: rows are inserted by migration, readable by every
  authenticated user, written only by billing/service-role code. Members can never
  change their own org's `tier_id` (column-level grants enforce this — org writes
  from the browser are limited to `name`).
- **Every user always has ≥1 org**: `handle_new_user` creates a personal free org
  with an owner membership on signup, so no screen needs an empty-org state. Don't
  break that invariant without building onboarding to replace it.
- **The active org is a cookie** (`src/lib/server/active-org.ts`), resolved and
  repaired in `src/routes/(app)/+layout.server.ts`, which gives every `(app)` page
  `{ organizations, activeOrg }` (`activeOrg` carries `role` + tier) under
  `QUERY.org`. Child loads filter by `locals.activeOrgId`; it is a UI preference,
  not an auth decision — RLS is the boundary, a forged cookie yields zero rows.
  Switching goes through `PUT /api/org` (the team switcher) + `invalidate(QUERY.org)`.
- **CRM working data is member-writable** — a documented extension of the canonical
  shape, not a drift. The `crm_core` migration is the reference: members create and
  edit clients/contacts/deals/tasks/tickets, authored content (notes, ticket
  comments) is editable by its author or owner/admin, deletes stay owner/admin, and
  notifications belong to their recipient (created server-side only, via
  `src/lib/server/crm/notifications.ts` + the service-role client). Column-level
  grants keep `org_id`, authorship columns and ticket numbers immutable from the
  browser. Data access for these tables lives in `src/lib/server/crm/` — loads and
  actions go through those modules (passing `locals.supabase` + `locals.activeOrgId`),
  never through ad-hoc `.from()` chains in routes.

## Database

- Schema changes are SQL migrations in `supabase/migrations/` (see the `profiles`
  and `organizations` migrations for the house pattern: create table → enable RLS →
  policies with `(select auth.uid())` / `private.org_role()` → triggers). Never
  change schema without a migration file.
- **Develop against the local stack** (`npm run db:start`), not the hosted project.
  `npm run db:reset` re-applies every migration onto an empty database and re-runs
  `supabase/seed.sql` — that round trip is how a migration gets proven, and it is the
  one thing you must never do to a hosted project. `supabase/config.toml` and
  `supabase/seed.sql` are committed; everything else the CLI writes is ignored.
- Seed data goes in `supabase/seed.sql`, following the shape already there: fixed
  ids, `on conflict do nothing`, re-runnable. Its credentials are deliberately
  public because that database is disposable — **never put a real one there.**
- **Quickstart for testing locally or in a cloud/web session:**
  `npm run db:start && npm run db:env && npm run db:reset && npm run dev`, then sign
  in as a seeded user — e.g. `evancoppa@gmail.com` / `password123` (also
  `dev@example.com` and `e2e@example.com`, same password). These are local-only
  fixture credentials from `supabase/seed.sql`, not a real account's password, and
  `db:reset` re-runs after every migration so the seeded users/orgs/CRM fixtures
  always match the current schema.
- `db.major_version` in `config.toml` must match the hosted Postgres, or a migration
  can pass locally and fail on deploy.
- After every migration: `npm run db:types` and **commit the regenerated
  `src/lib/database.types.ts`**. That script follows whichever database
  `PUBLIC_SUPABASE_URL` points at. Every Supabase client is `SupabaseClient<Database>`;
  an untyped `.from()` should never exist. Row types come from the `Tables<'name'>`
  aliases in that file. CI runs `npm run db:types:check` and fails the PR when the
  committed file disagrees with the migrations, so the two cannot silently drift.
- The Supabase CLI is pinned in `devDependencies`. Always invoke it as `npx supabase`
  so it resolves to that pinned binary — generated types differ between CLI versions,
  and a globally installed one fails the CI type check for no real reason.
- **Production migrations are applied by CI on merge to `main`**
  (`.github/workflows/db-deploy.yml`). Never `supabase db push` from a laptop: it can
  apply a migration whose file is not committed, and the remote history then disagrees
  with the repo with nothing to detect it.
- Cloud preview branches are **opt-in per PR** via the `db:preview` label, never
  automatic. They are separately billed (~$0.32/day), Compute Credits do not apply, and
  they are excluded from the org spend cap. The free `database` CI job already replays
  every migration against a disposable Postgres, so only ask for a branch when you need
  hosted Auth/Storage/Realtime or a real project URL. The deploy pipeline, the branch
  lifecycle and the one-time setup are `docs/database-workflow.md`.

## Server actions vs API endpoints

Default to **form actions** (`+page.server.ts` + `use:enhance`) for all mutations. Use a
`+server.ts` endpoint only for: JS-triggered GET reads (search-as-you-type), request
bodies born in JS memory (canvas/blob), cross-page mutations, multi-verb REST paths, or
binary/streaming responses. If a mutation is triggered from the page it lives on and the
data comes from form inputs, it **must** be a form action. `fail(400, {...})` with the
input echoed back; `redirect(303, ...)` on success.

## Forms

Every form is built with **sveltekit-superforms + zod v4** — schema at module top
level in a colocated `schema.ts` (schemas shared across routes live in
`src/lib/schemas/`), `superValidate` with the `zod4` adapter in both load and action
(import from `sveltekit-superforms/server`), `fail(400, { form })` on invalid,
`superForm` with `zod4Client` validators and its `enhance` on the client, errors
rendered inline from `$errors` and form-level messages through `FormAlert`. Never
parse `request.formData()` by hand or hand-roll validation, and blank sensitive
fields (passwords) before returning a form from an action — superforms echoes
`form.data` back to the browser. The full convention, including multiple forms per
page, nested data, and how to test actions, is the `sveltekit-superforms` skill
(`.claude/skills/sveltekit-superforms/SKILL.md`); /login, /reset-password and
/settings are the reference implementations.

## Data loading & invalidation

Server data comes from load functions (never `onMount` fetches), using the load-provided
`fetch`. Loads are side-effect free. Freshness uses **named query keys** — constants in
`src/lib/queries.ts`, declared with `depends(QUERY.x)` and refreshed with
`invalidate(QUERY.x)` at the event source. `invalidateAll()` is a code smell. The full
convention is `docs/data-invalidation.md`; the general rules are
`docs/sveltekit-best-practices.md`.

The vendored `sveltekit-data-flow` skill reaches for `invalidateAll()` after client-side
auth. **This rule wins** — reach for a named key instead. The rest of that skill (load
functions, form actions, `fail`/`redirect`/`error`, `+page.server.ts` vs `+page.ts`)
matches how this repo already works.

## Email

All outgoing email goes through `sendEmail()` in `src/lib/server/email.ts` (Resend;
server-only, never throws — it returns `{ ok, id | error }`). Every email is a template
function in `src/lib/server/email-templates.ts` returning `{ subject, html, text }`,
spread into the send call from a form action or endpoint:
`await sendEmail({ to, ...welcomeEmail({ name, appName, appUrl }) })`. New email = new
template function built on `emailLayout()`/`paragraph()`/`button()`; escape every
interpolated value with `escapeHtml()` in the HTML version, hand-write the `text`
version, keep styles inline. Set `idempotencyKey` on any send a user can re-trigger.
Config is env-only (`RESEND_API_KEY`, `EMAIL_FROM`, optional `EMAIL_REPLY_TO` — see
`.env.example`); unconfigured sends log to the console instead. Both modules have
tests — keep them green and extend them.

## Navigation

`src/lib/navigation.ts` drives both the sidebar and the ⌘K palette. Adding a page =
create the route under `(app)` + add one `navItems` entry. Icons are one-per-file
imports (`@lucide/svelte/icons/<name>`) — never the barrel import.

## Svelte reference docs

**Always look Svelte docs up rather than answering from memory** — the runes API,
snippets, attachments and async support have all changed across 5.x, and the live docs
match the installed version. In order of preference:

1. **The `llms.txt` routes on svelte.dev** — append `/llms.txt` to any docs URL for that
   page as plain text, e.g. `https://svelte.dev/docs/svelte/$state/llms.txt`, or
   `https://svelte.dev/docs/kit/<topic>/llms.txt` for SvelteKit.
2. **The Svelte MCP server** — `list-sections` to discover pages, `get-documentation`
   to fetch them.
3. **<https://svelte.dev/docs/svelte>** — the rendered site.

Two gotchas worth repeating: slots are deprecated in favour of snippets, and `await` in
components is experimental — it requires `compilerOptions.experimental.async`, which is
**not** enabled in `svelte.config.js`.

## UI primitives — never hand-roll, never go native

The shadcn-svelte primitives in `src/lib/components/ui/` are the vocabulary for building screens.
**Never hand-roll a primitive, and never fall back to a native control when one exists.** A bespoke
div-and-`onclick` widget loses keyboard navigation, focus management, ARIA wiring and portalling,
and it breaks rule 1 by introducing a second way to do a solved job.

- **Every picker is `Combobox`** (`ui/combobox`), never `<select>`. A native select can't be
  styled, can't show a second line, can't be searched, and renders as a full-screen wheel on iOS.
  Combobox grows a search box on its own past `searchThreshold`, and with `name` it posts through
  a hidden input exactly like a native select would, so it drops into a form action unchanged.
  `ui/select` is vendored but referenced only by the `/components` showcase — don't start using it
  for real screens.
- `<input type="checkbox">` → `ui/checkbox`. A styled `<button>` → `ui/button`. A bare `<input>` or
  `<textarea>` → `ui/input` / `ui/textarea`. `title="…"` as a tooltip → `ui/tooltip`. Hand-built
  menus, popovers, modals and side panels → `ui/dropdown-menu`, `ui/popover`, `ui/dialog`,
  `ui/sheet`.
- Success feedback is a **toast**, per "Mutation feedback" below — never a hand-rolled banner.
- An inline form message is `FormAlert` from `ui/alert` — `<FormAlert message={form?.message} />`,
  with `variant="success"` for the rare non-toast confirmation. Never a `<p>` with tinted
  border/background classes: that loses `role="alert"`, and the class string then gets copied.

Need something not vendored yet? Add it with `npx shadcn-svelte@latest add <name>` rather than
writing it yourself. These files are project source, so extend one in place — a new variant or
prop — before creating a parallel component. `/components` renders the full inventory; check it
before you build.

### Enhanced primitives

`src/lib/components/enhanced/` is the second shelf: richer, motion-aware controls ported from
[Solid Core](https://github.com/EvanCoppa/solid-core)'s `src/lib/primitives/interior/` collection.
`/components` renders the full inventory of both shelves together, grouped so a `ui/` primitive
and its `enhanced/` counterpart sit next to each other for comparison — there is no separate
`/enhanced` route.

**`ui/` first, always.** Reach for `enhanced/` only when `ui/` has no answer for the job — a
one-time-code field, a tag field, a password meter, a button that owns its own pending state, a
sliding segmented control. Where the two overlap, `ui/` wins: this shelf exists to cover gaps, not
to become a second vocabulary for solved problems. That is why the first batch deliberately skips
the interior takes on tabs, modals, popovers and dropdowns — `ui/` already answers those.

- Every animation goes through `$lib/motion.js`, which is where `prefers-reduced-motion` is
  honoured. Never call Motion's `animate` straight from a component.
- These paint from the same `src/app.css` tokens as `ui/`, so they follow the light/dark toggle
  with no extra wiring. A new one must too — no hardcoded greys, and any raw palette colour
  (`emerald-500`, `amber-600`) needs its `dark:` pair.
- To add another: port the folder from Solid Core, point its imports at `$lib/utils.js` and
  `$lib/motion.js`, add the two lines to the folder's `index.ts` and the barrel, and give it a
  card on `/components`. Keep the file naming this repo uses (`<name>/<name>.svelte`), not Solid
  Core's PascalCase.

## Compound components — the preferred shape for reusable multi-part UI

When a reusable component has more than one visual region, build it as a **compound
component**: a folder of small parts exported as a namespace and composed directly in
page markup, like `Card.Root` / `Card.Header` / `Card.Content`. The point of the
pattern is that **the page owns all the data** — it arrives from the load function and
flows into each part as a visible prop right where that part is rendered, so reading
`+page.svelte` tells you what data exists, which region shows it, and what every
handler does. Never build the two alternatives: a monolithic component that drills
props into private children, or a config-object "god prop" that encodes structure as
data.

The full convention — the two tiers (structural like `ui/card` vs. stateful with a
runes-class context like `ui/sidebar`), file anatomy, `index.ts` namespace exports,
and the page-owns-data rules — is the `compound-components` skill
(`.claude/skills/compound-components/SKILL.md`); the `compound-component-builder`
agent owns this work. App-level compounds live in `src/lib/components/<name>/`;
context carries coordination state only (open/active/selection), never fetched data.

## Key patterns

- Server-only code: `*.server.ts` files or `src/lib/server/`
- Private env: `$env/static/private` / `$env/dynamic/private`; public env must be
  prefixed `PUBLIC_` (see `.env.example`)
- Svelte 5 runes only: `$state`/`$derived`/`$props`, snippets + `{@render}`, `page`
  from `$app/state`. Compute with `$derived`, don't sync with `$effect`. Keyed each
  blocks, keyed by identity.
- Mutation feedback: successes **toast** (`toast.success(...)` from `svelte-sonner`;
  the `Toaster` from `ui/sonner` is mounted in the root layout), validation errors
  render **inline** next to the form via `fail(400, { ... })` + `FormAlert`. Don't mix
  the two.
- Do not silence a `check` finding with a cast or ignore comment; fix the contract.
