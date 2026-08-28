# SvelteKit best practices

The conventions this template is built around, with the reasoning. Sources: the
[SvelteKit docs](https://svelte.dev/docs/kit), the [Svelte 5 docs](https://svelte.dev/docs/svelte),
and the [Supabase server-side auth guide](https://supabase.com/docs/guides/auth/server-side).
When this file and the official docs disagree, the docs win — they track the installed version.

## 1. Mutations: form actions by default

**If a mutation is triggered from the page it lives on and the data comes from form
inputs, it must be a form action** (`+page.server.ts` `actions` + `use:enhance`).
Actions give you progressive enhancement (the form works before JS loads), automatic
`form`/`page.status` updates, error re-rendering with the user's input preserved, and
colocation with the page that owns the mutation.

Use a `+server.ts` endpoint only when the shape of the request genuinely isn't a form:

1. **JS-triggered GET reads** — search-as-you-type, lazy tab content.
2. **Bodies born in JS memory** — canvas exports, blob URLs converted to Files.
3. **Cross-page mutations** — the action saves to a different domain entity than the
   page owns.
4. **Multi-verb REST paths** — one path handling GET + POST + PATCH + DELETE.
5. **Binary/streaming responses** — file downloads, AI streaming.

Action mechanics:

- Validate on the server, always; client `required` attributes are UX, not security.
- Failure: `return fail(400, { message, email })` — echo the input back so the form
  re-renders filled in.
- Success with navigation: `redirect(303, ...)` (303 specifically: it turns the POST
  into a GET, so refresh doesn't resubmit).
- Multiple actions per page (`?/login`, `?/reset`) beat multiple pages for closely
  related operations; a second submit button with `formaction` can reuse the same form.

## 2. Data loading

- **Server data comes from load functions, not `onMount` fetches.** Loads run during
  SSR (no waterfall, no layout shift) and integrate with invalidation.
- `+page.server.ts` load for anything touching the database or secrets;
  `+page.ts` (universal) only when the result is buildable on the client too.
- **Use the `fetch` passed to the load**, never the global one: it forwards cookies,
  resolves relative URLs on the server, and inlines the response into the HTML so
  hydration doesn't refetch.
- **Loads are side-effect free.** They rerun on invalidation at unpredictable times.
  No writes, no logging-as-business-logic.
- Loads in a layout run for every page beneath it — keep root-layout loads cheap;
  page-specific data belongs in the page's load.
- Return promises (unawaited) from a server load to **stream** slow, non-critical data;
  await the critical path.
- Freshness is managed with named dependencies — see `docs/data-invalidation.md`.

## 3. The server/client boundary

- Secrets, admin clients, and privileged helpers live in `*.server.ts` files or
  `src/lib/server/`. SvelteKit **fails the build** if client code imports them —
  that's the point; don't work around it, restructure.
- Environment variables: `$env/static/private` for build-time secrets,
  `$env/dynamic/private` for values that may be absent at build time (this template's
  service-role key), `$env/static/public` + `PUBLIC_` prefix for anything the browser
  may see.
- **Everything returned from a load or action is serialized into the page.** Audit it
  like a public API. Refresh tokens, service keys, and internal flags don't belong in
  `PageData`.
- Never store per-request state in module scope on the server — modules are shared
  across requests and users. Request state lives in `event.locals` (typed in
  `src/app.d.ts`).
- **Database queries are typed from the generated schema.** Every Supabase client is
  `SupabaseClient<Database>`; run `npm run db:types` after each migration and commit
  `src/lib/database.types.ts`. An untyped `.from()` should never exist — the shipped
  placeholder schema makes that a compile error rather than a convention.

## 4. Auth (the template's contract)

- **Default-deny routing.** `hooks.server.ts` guards every route; a page is public only
  if listed in `PUBLIC_PATHS`. New pages are private by accident-proof default.
- **`safeGetSession()` for every server-side auth decision.** It validates the JWT with
  the Auth server (`getUser()`) instead of trusting the cookie's claims. `getSession()`
  alone is acceptable only client-side, or for non-authorization uses (token expiry).
- **RLS stays on** for every table even though the app has its own guard — the guard
  protects routes, RLS protects data, and they fail independently.
- The service-role client (`src/lib/supabase.server.ts`) bypasses RLS: create it per
  request, only inside server files, and never return its results to the client without
  an explicit authorization check of your own.
- Redirect flows carry a `next` param; **only internal paths may pass**
  (`next.startsWith('/') && !next.startsWith('//')`) — anything else is an open
  redirect.
- Auth failures stay vague on purpose ("Invalid email or password", "If that email has
  an account…"): specific errors are a user-enumeration oracle.

## 5. Svelte 5: runes, not legacy

- `$state`/`$derived`/`$props`/`$effect`; never `export let`, `$:`, stores-for-component-state,
  or `<slot>` (snippets + `{@render}` instead).
- **Compute with `$derived`; don't sync with `$effect`.** An effect that writes state
  is almost always a `$derived` in disguise. Effects are for the outside world
  (subscriptions, imperative libraries).
- Keyed each blocks, keyed by identity: `{#each items as item (item.id)}` — never the
  index.
- `page` from `$app/state`, not `$app/stores` (deprecated).
- Big immutable payloads (API responses) → `$state.raw` to skip proxying.
- Event attributes (`onclick={...}`), `<svelte:window>` for global listeners — not
  `addEventListener` in `onMount`.
- Cross-component reactive state → a class with `$state` fields in a `.svelte.ts`
  module, or context when it must be scoped per-request for SSR safety.

## 6. Errors and redirects

- `error(404, ...)` / `redirect(303, ...)` — and remember both **throw**; code after
  them is dead. In `catch` blocks, re-throw control-flow objects: use `isRedirect(e)` /
  `isHttpError(e)` from `@sveltejs/kit` rather than shape-sniffing.
- `handleError` in `hooks.server.ts` returns an opaque code to the user and logs the
  detail server-side. Clients never see stack traces or query text.
- API-style routes return status codes (`error(401)`), pages redirect to `/login` —
  the hook already makes this distinction; keep it when adding routes.

## 7. Structure & UI conventions

- `src/lib/components/ui/` is **vendored** shadcn-svelte source — edit it in place,
  commit the diff. Add new primitives with `npx shadcn-svelte@latest add <name>`.
- One navigation config (`src/lib/navigation.ts`) drives the sidebar and ⌘K palette.
- Icons: `@lucide/svelte/icons/<name>` one-per-file imports only — the barrel import
  (`import { X } from '@lucide/svelte'`) drags the whole icon set through the dev
  server and bundler.
- Route groups organize by access level: `(app)` is the authenticated shell; auth
  pages (`/login`, `/reset-password`) live outside it. A new protected page goes under
  `(app)` and inherits the sidebar + guard with zero wiring.
- `npm run check` must stay at zero errors/warnings — it's the strict-TS + a11y +
  template-correctness gate. Don't cast or `@ts-ignore` your way past it; fix the
  contract.
