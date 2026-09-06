# Features: the registry and the gate

One deployment serves organizations whose products only partially overlap. Some
capabilities are universal, some belong to one vertical, some are shared by several,
and a plan decides how much of a vertical's set an org gets. The **feature registry**
says which is which, and the **gate** in `src/hooks.server.ts` enforces it, so a page
is protected by existing rather than by remembering a check in its load.

## The tables

All in the `features` migration except `pages`, which has its own; all reference data
except the two per-org tables.

| table                            | one row means                                           | written by                     |
| -------------------------------- | ------------------------------------------------------- | ------------------------------ |
| `features`                       | a navigable capability owning a route prefix            | migration                      |
| `industry_features`              | this industry includes the feature at all               | migration                      |
| `tier_features`                  | this plan unlocks the feature                           | migration                      |
| `organization_feature_overrides` | for this org, force `enabled`/`locked_visible`/`hidden` | operators (SQL / service role) |
| `organization_disabled_features` | this org switched the feature off itself                | owner/admin (RLS)              |
| `pages`                          | a titled screen a feature is made of                    | migration                      |

Overrides are the escape hatch for pilots and one-off deals; a trial is just another
`tiers` row with its own `tier_features`. Members can read their org's rows of both
per-org tables, and column grants make sure the browser can only ever insert or delete
an opt-out row.

`role_permissions` grants a level on a **feature** (the old `permissions` catalog is gone):
`read` < `manage` < `delete`, each implying the ones below, owner/admin holding `delete`
on everything. So one catalog drives navigation, the gate, plan/industry availability and
role grants. `staff` (the roster and invitations) is a feature like any other — in every
industry and every tier, so what a member sees of it is decided by their grant alone.

## Resolution

`resolveFeatures()` in `src/lib/features/resolve.ts` is pure and client-safe; the
database mirrors it in `private.feature_mode(org, feature)` for policies that need a
security boundary. First match wins:

| #   | condition                                        | mode                                                  |
| --- | ------------------------------------------------ | ----------------------------------------------------- |
| 1   | override says `hidden` or `locked_visible`       | that mode                                             |
| 2   | override says `enabled`, or in industry AND tier | `disabled` if the org switched it off, else `enabled` |
| 3   | in industry, not in tier                         | `locked_visible`                                      |
| 4   | otherwise                                        | `hidden`                                              |

`locked_visible` vs `hidden` is the whole point: the tier axis teases an upgrade, the
industry axis makes the feature not exist.

`loadOrgContext()` (`src/lib/server/org-context.ts`) runs once per signed-in page
request from the hook: memberships with the active org's override and opt-out rows
embedded, the registry, then a plain member's grants (owners/admins bypass grants and
skip the query). It puts `{ organizations, activeOrg, features, access }` on
`locals.org`, repairs the active-org cookie, and the `(app)` layout returns the parts
the browser needs. Grants never leave the server: the nav arrives already filtered.

## The gate

`featureGateFor(pathname, features, canRead)` in `src/lib/features/gate.ts` finds the
feature owning a path (longest route prefix wins, `/` is exact-only) and answers:

| mode                     | result                                            |
| ------------------------ | ------------------------------------------------- |
| `enabled`, readable      | allowed                                           |
| `enabled`, no read grant | 403                                               |
| `locked_visible`         | 303 → `/?upgrade=<id>` — the upgrade prompt opens |
| `disabled`               | 303 → `/settings/features?feature=<id>`           |
| `hidden`                 | 404 — never a 403 that confirms the page exists   |

`/settings`, `/api/` and `/logout` are exempt so a user can always respond to a
decision; unregistered paths pass through. A redirect cannot open a dialog, so a locked
route lands on the dashboard with `?upgrade=<id>`, which `UpgradePrompt` (mounted by the
`(app)` layout) consumes to open the pitch; inside the app, locked entries call
`showUpgrade()` from `$lib/upgrade.svelte` and never navigate. Errors thrown from the hook render
`src/error.html` (no route has matched yet); client-side navigations get the in-shell
`+error.svelte`. The same matcher builds the nav, so nothing is ever linked that the
server would bounce.

## Pages and titles

A feature is made of **pages**, and a page has a **title**. `pages` is the registry of
those screens: `path` (the exact pathname it is served at), `title` (the browser
`<title>`, in full — app code appends nothing to it), and the `feature_id` it belongs
to. The dashboard and settings belong to no feature, so their rows carry `feature_id`
null — the same split as `staticNavItems` in `src/lib/navigation.ts`.

Nothing renders a title itself. The `(app)` layout load ships the pages this session
may see — `visiblePages()` filters them by exactly the predicate `buildNav()` uses, so
a title never names a page the sidebar hides — and `(app)/+layout.svelte` matches the
current pathname with `matchPage()` and renders the one `<title>` for the whole group,
re-resolving it on every navigation with no extra round trip. Matching works like the
gate's: exact path, else the longest registered path it sits under (so `/clients/42`
inherits Clients until that route registers a page of its own), with `/` matched
exactly.

Two consequences worth knowing:

- **A page file never contains `<svelte:head><title>`.** Renaming a page is a data
  change, not a deploy. A page with no row gets no title at all — that is the nudge to
  register it.
- **A title that depends on a record** (a client's name) is the one exception: that
  page's load returns `title`, and page data wins over the layout's. Register the page
  anyway; its row is what titles the screen when the load has no name to give.

`+error.svelte` still renders its own title, and the layout stands down while an error
is showing — two `<title>` tags in one head and the first one wins.

The public screens (`/login`, `/reset-password`, `/invite/[token]` and the pre-route
`src/error.html`) keep static titles on purpose: they render before a session or an org
exists, and `pages` is readable by signed-in users only.

## Adding a feature

1. Create the route under `src/routes/(app)/<route>/`.
2. A migration inserts its `features` row (id, name, description, route, icon slug,
   category, sort_order), its `industry_features` rows and its `tier_features` rows —
   plus `role_permissions` grants if plain members need it.
3. The same migration inserts a `pages` row per screen the feature is made of
   (`feature_id`, `path`, `title`).
4. Add the id to `FEATURE_IDS` in `src/lib/features/types.ts`; make sure the icon slug
   is in `src/lib/features/icons.ts`.
5. `npm run db:types`, commit `src/lib/database.types.ts`.

No nav edit, no `<title>`, no per-page check. Writes inside the page still open with
`requirePermission(locals.org.access, '<id>', 'manage')`, destructive ones with `'delete'`.

## Seed fixtures

`supabase/seed.sql` makes every mode visible locally:

- **Acme Inc** (pro, general): clients, deals, tickets, staff, components enabled; **tasks**
  switched off by the org (`disabled`); **best-practices** enterprise-only
  (`locked_visible`). `e2e@example.com` holds general Support, which grants nothing on
  deals — so `/deals` answers 403 for that user.
- **Globex** (free, construction): **deals** is outside both its industry and its tier
  but an operator override enables it (a pilot); **best-practices** is not in
  construction (`hidden`).
