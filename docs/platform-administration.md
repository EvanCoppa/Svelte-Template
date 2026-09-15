# Platform administration

The platform area is where the product itself is administered, as distinct
from the organizations that use it. It lives at `/admin`, behind the
`system_admins` table, and it is deliberately not a tenant surface: no active
organization, no industry vocabulary, no tier, no feature registry, no role
grants.

The area is built and it is editable: an organization's name, plan, vertical
and feature overrides, and the reference catalogs behind all of them. What is
still deliberately out of it — and why — is at the end of this file.

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
        [id=guid]/             # one organization: name, plan, vertical, overrides
      tiers/
        +page.server.ts        # the directory, and adding a plan
        [id=key]/              # one plan: its name, and what it unlocks
      industries/
        +page.server.ts        # the directory, and adding a vertical
        [id=key]/              # one vertical: what it includes, and its words
      features/
        +page.server.ts        # the directory
        [id=key]/              # one registry row's metadata

src/lib/
  admin/nav.ts                 # the area's own nav list, titles and hrefs
  admin/keys.ts                # what a catalog id looks like (the [id=key] matcher's rule)
  components/feature-picker.svelte   # pick a set of features, both catalog axes
  server/admin/
    guard.ts                   # requireSystemAdmin()
    organizations.ts           # directory, detail, and the org's four writes
    catalog.ts                 # tiers, industries, feature registry, counts, their writes
```

An organization is keyed by uuid (`[id=guid]`); a plan, a vertical and a
feature are keyed by the text id their migration — or their create form —
chose (`[id=key]`). That shape lives in `$lib/admin/keys` because two places
must agree about it: the matcher, which decides whether a detail URL reaches a
load at all, and the create forms, which mint the keys those URLs are built
from. A key a form accepted but the matcher rejects is a row with no page.

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
| Organizations → one | identity + name, plan, vertical, overrides, members          | Members and their roles stay read-only: they are the organization's own.                                    |
| Tiers               | id, name, organizations, features                            | Cheapest plan first — fewest features, because plans nest, the ordering `upgradePlans()` pitches in.        |
| Tiers → one         | name, and the features it unlocks                            | The picker is `FeaturePicker`, the same control the vertical and /settings/features use.                    |
| Industries          | id, name, organizations, features                            | Every row links to the detail page.                                                                         |
| Features            | icon, feature, id, route, category, order, plans, industries | Read through `loadFeatureRegistry()`, so the directory and the resolver can never see different registries. |
| Features → one      | name, noun, description, icon, section, order                | Plus, read-only, the plans and verticals pointing at it — each edited from its own page.                    |

Adding an admin page = the route under `src/routes/(admin)/admin/` plus one
entry in `adminNav`. No migration: `/admin` is outside the feature registry
and outside the `pages` table on purpose. A DETAIL page needs no entry at all:
it inherits its section's label until its own load returns a `title`, which is
the record-page exception the `(app)` shell makes for the same reason.

## The writes

Every write in the area is the same five steps, the shape `setTier` set:

1. the operator flag is proved first, in the action itself — the layout's
   check protects pages, and a POST reaches an action with no load in front
   of it;
2. the target is looked up through the CALLER's own client, so "does it
   exist" is answered by the same RLS that decides whether this caller may
   see it — org visibility, never a membership row;
3. the referenced catalog row (a tier, an industry, a feature) is checked
   against its table for a readable message, with the foreign key as the
   backstop;
4. only then is the service-role client created, and only if the write
   actually needs it;
5. the change is logged with the operator, the target and the value it left.

### Which client, and why

The grants decide this, never convenience:

| Write                                   | Client       | Because                                                                             |
| --------------------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| `renameOrganization()`                  | the caller's | `grant update (name)` to `authenticated`, and an operator is `owner` everywhere     |
| `setOrganizationTier()` / `…Industry()` | service role | both columns are revoked from `authenticated` by column grant                       |
| `setFeatureOverride()` / `clear…()`     | service role | `organization_feature_overrides` is "set by operators only" — members may only read |
| every `catalog.ts` write                | service role | `tiers`, `industries`, `features` and their join tables have no write policy at all |

Rename is the one that goes through RLS, and it stays that way on purpose:
reaching for the admin client there would buy nothing and quietly widen the
area's blast radius. The rule the signatures carry is that **a parameter named
`admin` is a service-role client**, and its function is reachable only from an
action that has already proved `requireSystemAdmin()`.

### What each page writes

- **One organization** — its name, its plan, its vertical, and its feature
  overrides. Members and their roles are shown and never written: an operator
  who needs to change one does it as a member of that org, where the act is
  attributable and the org's own policies apply.
- **One plan** — its name, and exactly which features it unlocks. A feature a
  plan does not unlock is still SHOWN to an organization whose vertical
  includes it, locked and pitching an upgrade; hiding it altogether is the
  other axis.
- **One vertical** — its name, which features it includes at all, and what it
  calls each of them (`name`, `noun`, `sort_order`). Blank means inherit, not
  empty: null is how the resolver reads "use the feature's own", column by
  column, so clearing a box removes the override rather than renaming the
  feature to nothing.
- **One feature** — the default name, noun, description, icon, section and
  order every vertical falls back to. Not its `id` and not its `route`: both
  are facts about the CODE, since the gate matches requests against the route
  and a route naming no page is a feature whose every click 404s. There is no
  create and no delete for the same reason.

### Two rules that are easy to get wrong

**Set membership is written as a diff.** An `industry_features` row is not a
bare join row — it also carries that vertical's own name, noun and sidebar
position for the feature. Deleting every row and re-inserting the set would
silently throw all of that away for every feature that was only passing
through, so `setIndustryFeatures()` and `setTierFeatures()` both go through
`membershipDiff()` and touch only what genuinely changed. Removing a feature
and adding it back IS a reset of its naming, which is the honest reading of
taking it out of a vertical.

**Moving an organization's vertical re-resolves everything about it**, which
is why it is the one write that makes the operator type the organization's
name back. Features, their names, their order, the vocabulary and the roles
the org may hand out are all decided by the industry, and all re-resolve on
that organization's next request. Role ASSIGNMENTS are not rewritten and are
not meant to be: `getUserAccess()` and `private.feature_level()` both filter
to the org's current industry, so an assignment pointing at the old vertical's
roles goes inert rather than granting something nobody chose. Owners and
admins keep their implicit access throughout, so an org cannot lock itself
out — and the page says how many assignments are about to go quiet before the
post.

### Freshness

`QUERY.adminOrganizations` for the organization pages and
`QUERY.adminCatalog` for the three catalogs, both in their own `admin:`
domain: platform data, read outside any tenant, that nothing under `app:`
depends on. A catalog edit changes what an organization may reach, but it
changes nothing in this browser — the tenant's resolved answer is rebuilt on
that organization's next request. Never invalidate a tenant key from here,
and never read one.

### The audit trail

There is still no audit **table**. Until there is one, every write logs a
`[platform-admin]` line carrying the operator, the target and the value it
left, and that log is where a change is answerable for.

A migration also remains how a catalog is SHIPPED: the seeded plans,
verticals and features are rows in migration files so a fresh database gets
them too. These editors are how the catalogs are OPERATED afterwards. The two
are not in tension as long as an edit made here is written back into a
migration before a fresh database is expected to have it.

## Deferred

Not part of this area, and not to be smuggled into it:

- a role editor — roles are industry-scoped reference data, and a role can
  hand out `delete` on everything;
- creating or deleting a `features` row, which is a migration alongside the
  route it describes;
- system-admin management;
- any broader platform-permission model (support, finance, operations);
- a real audit trail.

Reference catalogs stay browser-readable and not broadly client-writable. The
editors above did not change that: every one of them is an explicit, narrowly
scoped server-side action behind `requireSystemAdmin()`, reaching the service
role only where a grant leaves no alternative. A future mutation must be
another of those, never a general client write policy.

## Guardrails

- Keep platform code under `(admin)` / `$lib/admin` / `$lib/server/admin`.
- Do not add platform administration to industry feature resolution, the
  ordinary application navigation, the palette or tenant vocabulary.
- Never use the active organization as a surrogate for an admin target.
- Treat every admin request as privileged on the server, form posts included.
- Retain `system_admins` semantics; never make it writable through role or
  membership management.
- A new write follows the five steps above, takes the narrowest client its
  grants allow, and logs what it changed. One that cannot explain its
  cascading effects on screen does not ship.
