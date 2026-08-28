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
npm test               # vitest (server-side unit tests)
npm run db:types       # regenerate src/lib/database.types.ts from the live schema
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

**Testing against a dev server without hitting the login page:** set
`DEV_AUTO_LOGIN=true` and `DEV_AUTO_LOGIN_EMAIL` in `.env` (requires
`SUPABASE_SERVICE_ROLE_KEY`). `src/lib/server/dev-auto-login.ts` then signs that
user in on the first request, so `npm run dev` lands straight in the app. It
refuses to run on production deployments, `/logout` still works (sets an opt-out
cookie; clear it with `?autologin=1`), and the emailed-link flows under `/auth`
stay testable as a signed-out browser.

## Database

- Schema changes are SQL migrations in `supabase/migrations/` (see the `profiles`
  migration for the house pattern: create table → enable RLS → policies with
  `(select auth.uid())` → triggers). Never change schema without a migration file.
- After every migration: `npm run db:types` and **commit the regenerated
  `src/lib/database.types.ts`**. Every Supabase client is `SupabaseClient<Database>`;
  an untyped `.from()` should never exist. Row types come from the `Tables<'name'>`
  aliases in that file.

## Server actions vs API endpoints

Default to **form actions** (`+page.server.ts` + `use:enhance`) for all mutations. Use a
`+server.ts` endpoint only for: JS-triggered GET reads (search-as-you-type), request
bodies born in JS memory (canvas/blob), cross-page mutations, multi-verb REST paths, or
binary/streaming responses. If a mutation is triggered from the page it lives on and the
data comes from form inputs, it **must** be a form action. `fail(400, {...})` with the
input echoed back; `redirect(303, ...)` on success.

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

Need something not vendored yet? Add it with `npx shadcn-svelte@latest add <name>` rather than
writing it yourself. These files are project source, so extend one in place — a new variant or
prop — before creating a parallel component. `/components` renders the full inventory; check it
before you build.

## Key patterns

- Server-only code: `*.server.ts` files or `src/lib/server/`
- Private env: `$env/static/private` / `$env/dynamic/private`; public env must be
  prefixed `PUBLIC_` (see `.env.example`)
- Svelte 5 runes only: `$state`/`$derived`/`$props`, snippets + `{@render}`, `page`
  from `$app/state`. Compute with `$derived`, don't sync with `$effect`. Keyed each
  blocks, keyed by identity.
- Mutation feedback: successes **toast** (`toast.success(...)` from `svelte-sonner`;
  the `Toaster` from `ui/sonner` is mounted in the root layout), validation errors
  render **inline** next to the form via `fail(400, { ... })`. Don't mix the two.
- Do not silence a `check` finding with a cast or ignore comment; fix the contract.
