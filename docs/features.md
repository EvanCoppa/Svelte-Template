# Features: the registry and the gate

One deployment serves organizations whose products only partially overlap. Some
capabilities are universal, some belong to one vertical, some are shared by several,
and a plan decides how much of a vertical's set an org gets. The **feature registry**
says which is which, and the **gate** in `src/hooks.server.ts` enforces it, so a page
is protected by existing rather than by remembering a check in its load.

## The tables

All in the `features` migration; all reference data except the last two.

| table                            | one row means                                           | written by                     |
| -------------------------------- | ------------------------------------------------------- | ------------------------------ |
| `features`                       | a navigable capability owning a route prefix            | migration                      |
| `industry_features`              | this industry includes the feature at all               | migration                      |
| `tier_features`                  | this plan unlocks the feature                           | migration                      |
| `organization_feature_overrides` | for this org, force `enabled`/`locked_visible`/`hidden` | operators (SQL / service role) |
| `organization_disabled_features` | this org switched the feature off itself                | owner/admin (RLS)              |

Overrides are the escape hatch for pilots and one-off deals; a trial is just another
`tiers` row with its own `tier_features`. Members can read their org's rows of both
per-org tables, and column grants make sure the browser can only ever insert or delete
an opt-out row.

`role_permissions` grants a level on a **feature** (the old `permissions` catalog is gone):
`read` < `manage` < `delete`, each implying the ones below, owner/admin holding `delete`
on everything. So one catalog drives navigation, the gate, plan/industry availability and
role grants. `staff` (the roster and invitations) is a feature like any other — in every
industry and every tier, so what a member sees of it is decided by their grant alone.

Roles come in industry-scoped ladders (`industry_role_catalog` migration): every industry
has a Viewer (`read` on everything it includes), its own specialists (`manage` on their
domain, `read` around it), a Manager (`manage` on everything) and a Director (`delete` on
everything). System admins (`system_admins` migration) sit outside the catalog entirely:
`private.org_role()` answers `owner` for them on every org, so they pass every gate and
grant without a row here.

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

| mode                     | result                                          |
| ------------------------ | ----------------------------------------------- |
| `enabled`, readable      | allowed                                         |
| `enabled`, no read grant | 403                                             |
| `locked_visible`         | 303 → `/upgrade?feature=<id>`                   |
| `disabled`               | 303 → `/settings/features?feature=<id>`         |
| `hidden`                 | 404 — never a 403 that confirms the page exists |

`/settings`, `/upgrade`, `/api/` and `/logout` are exempt so a user can always respond
to a decision; unregistered paths pass through. Errors thrown from the hook render
`src/error.html` (no route has matched yet); client-side navigations get the in-shell
`+error.svelte`. The same matcher builds the nav, so nothing is ever linked that the
server would bounce.

## Adding a feature

1. Create the route under `src/routes/(app)/<route>/`.
2. A migration inserts its `features` row (id, name, description, route, icon slug,
   category, sort_order), its `industry_features` rows and its `tier_features` rows —
   plus `role_permissions` grants if plain members need it.
3. Add the id to `FEATURE_IDS` in `src/lib/features/types.ts`; make sure the icon slug
   is in `src/lib/features/icons.ts`.
4. `npm run db:types`, commit `src/lib/database.types.ts`.

No nav edit, no per-page check. Writes inside the page still open with
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
- **Two orgs per industry** — Initech and Hooli (general), Bluth Company and Northwind
  Builders (construction), Sacred Heart Clinic and Pinecrest Family Practice (healthcare),
  Harbor & Vale Realty and Summit Brokerage (real-estate), Crane Poole & Schmidt and
  Ashford Legal Group (legal), Marigold Hotels and Lakeside Inns (hospitality). Tiers are
  mixed so the free orgs show `locked_visible` where their industry has deals (Hooli,
  Lakeside Inns), the pro orgs where it has best-practices (Harbor & Vale, Ashford), and
  features outside an industry are `hidden` (deals in a clinic, tickets in an agency).
  `dev` and `e2e` hold each industry's roles as plain members; the seed's comment block
  lists who holds what.
- **`evancoppa@gmail.com` is the system admin**: every org above is in their switcher and
  they are owner-level in each, whatever their membership row says. Sign in as
  `dev@example.com` for the member view.
