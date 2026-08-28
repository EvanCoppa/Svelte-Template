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

Notable: `ui/combobox` is a house-grown searchable picker (single/multi-select, posts
in forms via hidden inputs) that this codebase prefers over raw native selects for
anything user-facing.

Feedback convention: successes **toast** (`svelte-sonner`, `Toaster` mounted in the
root layout); validation errors render **inline** next to the form. The settings page
shows both halves working together.

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

**CI** (`.github/workflows/ci.yml`) runs four parallel jobs on every pull
request and push to `main`: `check` (svelte-check — Svelte + TS correctness),
`lint:oxlint` (oxlint's standard rules plus the vendored
[anti-slop](https://github.com/dmmulroy/anti-slop) rules), `knip` (unused
files, exports, and dependencies), and the tests. `lint` (prettier + eslint)
and the production build remain local commands.

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
npm run db:types       # regenerate src/lib/database.types.ts from your live schema
npm run format         # prettier (svelte + tailwind class sorting)
```
