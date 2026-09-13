# Platform administration

The platform area is where the product itself is administered, as distinct
from the organizations that use it. It lives at `/admin`, behind the
`system_admins` table, and it is deliberately not a tenant surface: no active
organization, no industry vocabulary, no tier, no feature registry, no role
grants.

Phases 1–3 below are built. Phase 4 is explicitly deferred, and the reasoning
for that is at the end of this file.

## The boundary

The ordinary application stays organization-first:

- The top-left picker switches organizations.
- An organization supplies the active industry, tier, role, feature and
  navigation context.
- Selecting an organization sets the active-organization cookie as it always
  has.

For a system admin, the same picker grows a separate **Platform** section
holding **Platform Administration**
(`src/lib/components/team-switcher.svelte`). That entry is a navigation
destination, not an organization: it goes to `/admin` and **must not** change
the active organization. It never carries a check mark, and it sits under its
own label behind a separator so it cannot read as one more workspace.

The invariant holds at the hook, not by convention: `hooks.server.ts` skips
`loadOrgContext()` entirely for `/admin`, so nothing in the platform area can
read or repair the active-org cookie. An operator working in Acme in the app
can be looking at Globex here, and both stay where they were.

## Route and code isolation

```
src/routes/
  (app)/                       # the organization-scoped application
  (admin)/
    admin/
      +layout.server.ts        # the authorization gate + shell data
      +layout.svelte           # the platform shell: one inverted bar
      +page.server.ts          # overview
      organizations/
        +page.server.ts        # the directory
        [id=guid]/             # one organization, and the one mutation
      tiers/
      industries/
      features/

src/lib/
  admin/nav.ts                 # the area's own nav list, titles and hrefs
  server/admin/
    guard.ts                   # requireSystemAdmin()
    organizations.ts           # directory, detail, the tier write
    catalog.ts                 # tiers, industries, feature registry, counts
```

`/admin` owns its layout, navigation, naming and visual identity. It does not
inherit the tenant sidebar, the breadcrumb trail, the ⌘K palette, the note
dock, the upgrade prompt, industry vocabulary or the feature registry's
navigation — none of those mean anything without an organization, and
borrowing them would make the console look like one more page of the app it
administers.

What it does reuse is deliberately low-level and organization-agnostic: the
`ui/` primitives, `DataTable`, `PageHeader`, `iconFor()`, `isPathUnder()`,
`titleFor()`, and the `listStaff()` data module — which already takes an
explicit org id, so reusing it keeps one way to list an organization's
members rather than inventing a second.

An admin page that operates on an organization names its target explicitly in
the URL. That target is separate from the active organization and is never
inferred from the cookie.

## Eligibility and security

The integration into the normal application is two things and no more:

1. `loadOrgContext()` already looks up the operator flag to build the
   organization list, so it returns it as `systemAdmin`; the `(app)` layout
   ships it, and the picker draws its entry on it.
2. That entry navigates to `/admin`.

**That boolean authorizes nothing.** Every admin page, action and endpoint
performs its own server-side check with `requireSystemAdmin()`:

- the `(admin)` layout load covers every page, because a layout load runs
  before each child page's;
- each page load calls it again anyway;
- each action calls it first, because a POST reaches an action with no load
  in front of it.

A non-operator gets **404, not 403** — the reasoning a `hidden` feature's 404
rests on (`$lib/features/gate`): a refusal that confirms the page is real
tells every tenant user where the console lives. The guard also fails closed:
`isSystemAdmin()` throws on a database error rather than answering false.

### Why `system_admins` stays separate

`public.system_admins` is platform-owned and universal:

- keyed by user, and **not** a `public.roles` row;
- not industry-scoped, requiring no organization membership;
- not assignable through ordinary role management — SQL or the service role
  only;
- semantically platform superuser: `private.org_role()` answers `owner` for
  an operator on every organization.

That is appropriate only for a very small, highly trusted group. Keep the list
short and protect those accounts. If the product later needs support, finance
or operations roles, design a distinct platform-permission model rather than
weakening or overloading `system_admins`.

## Pages

Titles and nav labels both come from `adminNav` in `$lib/admin/nav.ts` — a
hand-kept list for the reason `settingsNav` is one: these pages are not
features, and no migration registers them. The `(admin)` layout load names
each page with `adminTitleFor(url.pathname)` and the shell renders the one
`<title>`; `PageHeader.Title` with no children renders the same name through
`titleFor()`, so a page is named once. `/admin` matches exactly, never as a
prefix, so the area root does not claim every page under it.

| Page                | Columns                                                      | Notes                                                                                                       |
| ------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Overview            | —                                                            | Four cards, one per area, each with its row count.                                                          |
| Organizations       | name, industry, tier, members, created                       | Every row links to the detail page.                                                                         |
| Organizations → one | identity, plan, members, feature exceptions                  | Read-only except the plan.                                                                                  |
| Tiers               | id, name, organizations, features                            | Cheapest plan first — fewest features, because plans nest, the ordering `upgradePlans()` pitches in.        |
| Industries          | id, name, organizations, features                            | Directory only.                                                                                             |
| Features            | icon, feature, id, route, category, order, plans, industries | Read through `loadFeatureRegistry()`, so the directory and the resolver can never see different registries. |

Adding an admin page = the route under `src/routes/(admin)/admin/` plus one
entry in `adminNav`. No migration: `/admin` is outside the feature registry
and outside the `pages` table on purpose.

## The one mutation

Moving an organization to another plan, on that organization's own page
(`setTier`). It is the only write in the area, and it is shaped deliberately:

- the operator flag is proved first, in the action itself;
- the target organization is validated through the caller's own client, so
  "does it exist" is answered by the same RLS that decides whether this
  caller may see it — org visibility, never a membership row;
- the requested tier is checked against the `tiers` table for a readable
  message, with the foreign key as the backstop;
- only then is the service-role client created, because
  `organizations.tier_id` is revoked from `authenticated` by column grant
  (the organizations migration) and cannot go through the caller's client;
- the change is logged (`[platform-admin] organization tier changed`) with
  the operator, the organization and the plan it left.

Freshness is `QUERY.adminOrganizations`, its own `admin:` domain: platform
data, read outside any tenant, that nothing under `app:` depends on.

There is no audit **table** yet. Until there is one, that log line is where a
plan change is answerable for.

## Deferred

Not part of this area, and not to be smuggled into it:

- a role editor;
- a feature editor;
- changing an organization's industry — it re-resolves that organization's
  features, roles and vocabulary at once;
- system-admin management;
- any broader platform-permission model (support, finance, operations);
- a real audit trail.

Reference catalogs stay browser-readable and not broadly client-writable. A
future mutation must be another explicit, narrowly scoped server-side action,
never a general client write policy.

## Guardrails

- Keep platform code under `(admin)` / `$lib/admin` / `$lib/server/admin`.
- Do not add platform administration to industry feature resolution, the
  ordinary application navigation, the palette or tenant vocabulary.
- Never use the active organization as a surrogate for an admin target.
- Treat every admin request as privileged on the server, form posts included.
- Retain `system_admins` semantics; never make it writable through role or
  membership management.
- Keep the lists readable and table-first. A configuration editor does not
  arrive until its data integrity, authorization and cascading effects have
  been designed.
