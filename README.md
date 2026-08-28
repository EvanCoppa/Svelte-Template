# SvelteKit + Supabase + shadcn-svelte Template

An opinionated, production-shaped starting point for new software projects:

- **SvelteKit 2 + Svelte 5** (runes), **TypeScript strict**, **Tailwind CSS v4**
- **Supabase** auth done the way the official SSR guide says to do it — server-verified
  sessions, a default-deny route guard, login + password reset out of the box
- **shadcn-svelte** primitives vendored in `src/lib/components/ui/` (button, input,
  select, combobox, dialog, dropdown, table, tabs, sidebar, command palette, …)
- The **app shell**: collapsible sidebar with hover-peek, sticky blurred header,
  ⌘K navigation palette, dark mode — all driven by one config file
- **Vercel** adapter preconfigured
- Written-down conventions in [`docs/`](docs/) so every project starts aligned

Sign in and you land on a dashboard with sample pages, including a component showcase
at `/components` and the house rules at `/best-practices`.

## Quick start

Two ways to get a database. **Local** needs Docker but no account, gives you a
throwaway you can reset at will, and seeds a user to sign in as — start there if
you just want to see the thing run:

```bash
npm install
npm run db:start     # boots Postgres + Auth + Studio in Docker
npm run db:reset     # applies supabase/migrations, then supabase/seed.sql
npm run db:env       # writes .env.local pointing at the local stack
npm run dev          # sign in as dev@example.com / password123
```

**Hosted** is the path to an actual deployment, and is what the rest of this
section covers. The two coexist: `.env.local` (local) overrides `.env` (hosted)
while it exists, so `rm .env.local` switches back.

### 1. Create a Supabase project

At [database.new](https://database.new). Then in the dashboard:

- **Project Settings → API keys**: copy the project URL and the `sb_publishable_...` key.
- **Authentication → URL Configuration**: set the Site URL (your production domain;
  `http://localhost:5173` while developing) and add redirect URLs for every
  environment you'll use:
  - `http://localhost:5173/auth/confirm`
  - `https://your-domain.com/auth/confirm`
  - `https://*-your-team.vercel.app/auth/confirm` (Vercel preview deploys)
- **Authentication → Emails → Reset password**: replace the magic-link template with the
  token-hash form so recovery links verify server-side (works from any device or mail
  client):

  ```html
  <h2>Reset your password</h2>
  <p>Follow the link below to choose a new one.</p>
  <p>
  	<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">
  		Reset password
  	</a>
  </p>
  ```

  (`/auth/confirm` also accepts the default PKCE `?code=` links, so nothing breaks
  before you change the template — the token-hash form is just more robust.)

### 2. Apply the starter schema

`supabase/migrations/20260828000000_profiles.sql` creates a `profiles` table (one row
per auth user, auto-created by trigger on signup, backfilled for existing users) with
RLS policies — it's also the reference pattern for every table you add later. Apply it
either way:

```bash
npx supabase login                      # once per machine
npx supabase link --project-ref <ref>   # once per project
npx supabase db push
```

…or paste the file into the dashboard's **SQL Editor** and run it.

### 3. Configure and run

```bash
cp .env.example .env    # fill in your project URL + publishable key
npm install
npm run dev
```

### 4. Create a user

This template deliberately ships **no public signup page** (most internal tools don't
want one). Create users from the Supabase dashboard (**Authentication → Users → Add
user**), or add a signup route later with `supabase.auth.signUp()`.

Sign in at `http://localhost:5173` — you'll be redirected to `/login` first, which is
the point.

## How auth works

```
Browser ──► hooks.server.ts
            ├─ supabase handle: per-request server client (@supabase/ssr, cookies)
            │    └─ locals.safeGetSession(): getSession() + getUser() JWT validation
            └─ authGuard handle: DEFAULT-DENY — only PUBLIC_PATHS (/login, /auth)
               are reachable without a verified session; everything else 303s to
               /login?next=<original-url> (APIs get 401 instead)
```

| File                                  | Role                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `src/hooks.server.ts`                 | Client creation, `safeGetSession`, route guard, error shielding               |
| `src/app.d.ts`                        | Types for `locals` / `PageData` (strict — no `any` session blobs)             |
| `src/routes/+layout.server.ts`        | Passes verified `session`/`user` + cookies down                               |
| `src/routes/+layout.ts`               | Browser/server Supabase client for load functions, `depends('supabase:auth')` |
| `src/routes/+layout.svelte`           | `onAuthStateChange` → targeted `invalidate('supabase:auth')`                  |
| `src/routes/login/`                   | Sign-in + "forgot password" actions (user-enumeration safe)                   |
| `src/routes/auth/confirm/+server.ts`  | Verifies emailed links (`token_hash` **and** PKCE `code`)                     |
| `src/routes/reset-password/`          | Pinned new-password form (see below)                                          |
| `src/routes/logout/+server.ts`        | POST-only sign-out                                                            |
| `src/lib/server/password-recovery.ts` | Recovery-pin cookie + password validation                                     |
| `src/lib/supabase.server.ts`          | Service-role admin client (RLS bypass — server only)                          |

Details worth knowing:

- **Recovery pinning.** Clicking a reset link signs the user in (that's how Supabase
  recovery works) — under the password they forgot. A short-lived cookie pins that
  browser to `/reset-password` until a new password is set, so the emailed link can't
  be used as a standing magic sign-in.
- **`safeGetSession()` everywhere.** Server code never trusts the session cookie's
  claims without JWT validation. See `docs/sveltekit-best-practices.md` §4.
- **Keep RLS on.** The route guard protects pages; Row Level Security protects data.
  You want both, independently.
- **Security headers on every response.** `src/lib/server/security-headers.ts` sets a
  Content-Security-Policy (origins derived from `PUBLIC_SUPABASE_URL`, never
  hardcoded), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`,
  and a `Permissions-Policy`. Add new external origins there as you adopt services.

## Local development database

`supabase/config.toml` describes a full Supabase stack — Postgres, Auth, Studio
and a mail catcher — that runs in Docker on your machine. Nothing in it affects
your hosted project; hosted settings live in the dashboard.

```bash
npm run db:start     # boot it (first run pulls images, so it takes a while)
npm run db:reset     # drop, re-apply every migration, re-run the seed
npm run db:status    # ports, URLs and keys
npm run db:env       # write .env.local so the app talks to it
npm run db:new name  # scaffold supabase/migrations/<timestamp>_name.sql
npm run db:stop      # shut it down
```

Worth knowing:

- **Studio** is at <http://127.0.0.1:54323> — browse and edit local rows.
- **Emails are never delivered.** Password-reset and confirmation mail lands in
  the catcher at <http://127.0.0.1:54324>, which is how you exercise the
  `/auth/confirm` flow without a real inbox.
- **`db:reset` is the point of having this.** Migrations get tested by being
  applied to an empty database over and over, which is the one thing you cannot
  safely do to a hosted project.
- **`npm run db:types` follows whichever database you are pointed at** — it uses
  `--local` when `PUBLIC_SUPABASE_URL` is on 127.0.0.1 and the project ref
  otherwise. Force it with `-- --local` or `-- --remote`.
- **`major_version` in config.toml must match your hosted Postgres**, or a
  migration can pass locally and fail on deploy.

### Seed data

`supabase/seed.sql` runs after the migrations on every `db:reset`. It creates
two users — `dev@example.com` and `e2e@example.com`, both with password
`password123` — by writing the `auth.users` and `auth.identities` rows GoTrue
expects, then lets the `profiles` trigger from the starter migration do its job.

These credentials are fixed and public on purpose: they only ever exist in a
throwaway local database. **Never put a real credential in that file** — it is
committed. Add a row to the `seed_users` list to add a user; add your own tables'
sample rows underneath, following the same `on conflict do nothing` shape so the
file stays re-runnable.

## Database types (generated)

The Supabase client is typed end to end: `locals.supabase`, the layout-load client, and
the admin client are all `SupabaseClient<Database>`, with `Database` generated from your
real schema into `src/lib/database.types.ts`.

```bash
npx supabase login   # once per machine
npm run db:types     # regenerate after every migration, then commit the file
```

The script derives your project ref from `PUBLIC_SUPABASE_URL` in `.env` (set
`SUPABASE_PROJECT_ID` instead if you use a custom domain). The committed file matches
the starter migration (the `profiles` table), so the settings page's profile query is
typed out of the box — and any table that _isn't_ in the generated types makes
`.from('that_table')` a compile error, which beats rows silently typing as `any`. The
settings page demonstrates the full loop: migration → generated types → typed load +
form action behind RLS.

Row types come from the generated aliases:

```ts
import type { Tables, TablesInsert } from '$lib/database.types';

type Profile = Tables<'profiles'>;
type NewProfile = TablesInsert<'profiles'>;
```

## The app shell

`src/lib/navigation.ts` is the single source of truth: the sidebar sections and the
⌘K palette both render from it. Adding a page:

1. Create `src/routes/(app)/reports/+page.svelte` — it's automatically protected and
   gets the sidebar/header shell.
2. Add one entry to `navItems` with a one-per-file lucide icon import.

That's the whole checklist.

The sidebar (ported from the Yes-Smile apps) collapses with **⌘B**, the trigger button,
or dragging the rail; when collapsed, moving the cursor to the screen edge **peeks** it
out as a floating overlay. Collapse state persists via cookie (read back server-side —
no flash on reload). On mobile it becomes a sheet drawer.

## Components

Vendored shadcn-svelte lives in `src/lib/components/ui/` — it's your source code, not a
dependency. Browse them live at `/components`. Add more with:

```bash
npx shadcn-svelte@latest add <component>
```

(`components.json` at the repo root is what makes that command resolve this project's
aliases — it does not describe a theme, so the CLI never touches `src/app.css`.)

Notable: `ui/combobox` is a house-grown searchable picker (single/multi-select, posts
in forms via hidden inputs) that this codebase prefers over raw native selects for
anything user-facing.

Feedback convention: successes **toast** (`svelte-sonner`, `Toaster` mounted in the
root layout); validation errors render **inline** next to the form through
`FormAlert` (`ui/alert`) — `<FormAlert message={form?.message} />`, which renders
nothing when there is no message and carries `role="alert"` so failures are
announced. The settings page shows both halves working together.

## Testing

The security-critical auth surface is unit-tested with Vitest: the `/auth/confirm`
token exchange, the pinned `/reset-password` flow, the recovery-cookie and password
helpers, and the login action's open-redirect guard and enumeration defenses.

```bash
npm test          # run once
npm run test:watch
```

Tests live next to the code they cover (`*.test.ts`). If you change the auth routes,
keep these green and extend them — they encode the flows' security properties.

### End-to-end tests

Playwright drives a real browser against a real dev server. Specs live in
`tests/` (SvelteKit's generated tsconfig already type-checks that directory, so
`npm run check` covers them).

```bash
npx playwright install chromium   # once per machine
npm run test:e2e
npm run test:e2e:ui               # pick and watch individual specs
```

The suite is split by what it needs:

- **`tests/guest.spec.ts` runs anywhere, with no configuration at all.** An
  unauthenticated request never reaches Supabase — the guard redirects before
  any network call — so these cover the default-deny contract, the `?next=`
  round trip, the recovery-link error and the security headers on a bare clone.
- **`tests/auth.spec.ts` signs in, so it needs a live stack.** Each test skips
  itself with an explanatory message until one is reachable:

  ```bash
  npm run db:start && npm run db:env && npm run test:e2e
  ```

  It uses the seeded `e2e@example.com`; override with `E2E_USER_EMAIL` /
  `E2E_USER_PASSWORD` to point at a different project.

Two things to copy when writing more specs. **Wait for hydration before
clicking** — Playwright considers a server-rendered button clickable the moment
it is visible, which is before Svelte has attached its handlers, and that click
is silently dropped; `clickWhenLive()` in `tests/auth.spec.ts` retries until the
effect appears. And **`Card.Title` renders a `<div>`**, so pages built from
cards have no heading to target — assert on `<title>` or a `data-slot` instead.

**CI** (`.github/workflows/ci.yml`) runs `lint` (prettier + eslint), `check`,
the unit tests, and the production build on every pull request and push to
`main`, plus a second job running the Playwright specs that need no database.
To cover the signed-in specs there too, add a `npx supabase start && npm run
db:env` step to the `e2e` job before `npm run test:e2e`.

## Development auto-login

Automated agents (and humans) spinning the app up to look at a feature hit the auth
guard before they can see anything. `DEV_AUTO_LOGIN` removes that blocker without any
committed credentials: it mints a Supabase magic link with the service-role key and
redeems it server-side, so the request continues as a genuinely authenticated session.

```bash
# .env
DEV_AUTO_LOGIN=true
DEV_AUTO_LOGIN_EMAIL=you@example.com
SUPABASE_SERVICE_ROLE_KEY=...
```

Then `npm run dev` lands you straight on the dashboard, signed in. The account is
created if it doesn't exist. Safety properties (all unit-tested): inert unless the flag
is set, hard-refuses on `VERCEL_ENV=production`, `/logout` still signs out (an opt-out
cookie stops instant re-login; clear it by visiting any page with `?autologin=1`), and
the `/auth` emailed-link flows keep their signed-out behavior.

## Conventions

- [`docs/sveltekit-best-practices.md`](docs/sveltekit-best-practices.md) — form actions
  vs endpoints, load-function rules, server/client boundary, Svelte 5 runes discipline,
  error handling.
- [`docs/data-invalidation.md`](docs/data-invalidation.md) — the query-key convention:
  naming load dependencies with `depends('app:thing')` and refreshing them with
  targeted `invalidate()` instead of `invalidateAll()`.

## Deploying to Vercel

The Vercel adapter is already configured. Import the repo in Vercel, then set the
environment variables from `.env.example` (at minimum `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_PUBLISHABLE_KEY`) for Production and Preview. Add your Vercel domains
to the Supabase redirect-URL allowlist (step 1 above).

## Scripts

```bash
npm run dev            # dev server
npm run build          # production build (Vercel adapter)
npm run preview        # preview the production build
npm run check          # svelte-check: strict types, a11y, unused CSS — keep at zero
npm run lint           # prettier --check + eslint — keep at zero
npm test               # vitest — the auth surface's unit tests
npm run test:e2e       # playwright — the auth surface through a real browser
npm run db:start       # boot the local Supabase stack (Docker)
npm run db:reset       # re-apply every migration, then supabase/seed.sql
npm run db:env         # write .env.local pointing at the local stack
npm run db:types       # regenerate src/lib/database.types.ts (local or hosted)
npm run format         # prettier (svelte + tailwind class sorting)
```
