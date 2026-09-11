# Features: the registry and the gate

One deployment serves organizations whose products only partially overlap. Some
capabilities are universal, some belong to one vertical, some are shared by several,
and a plan decides how much of a vertical's set an org gets. The **feature registry**
says which is which, and the **gate** in `src/hooks.server.ts` enforces it, so a page
is protected by existing rather than by remembering a check in its load.

## The tables

All in the `features` migration except `pages`, which has its own; all reference data
except the two per-org tables.

| table                            | one row means                                             | written by                     |
| -------------------------------- | --------------------------------------------------------- | ------------------------------ |
| `features`                       | a navigable capability owning a route prefix              | migration                      |
| `industry_features`              | this industry includes the feature — and what it calls it | migration                      |
| `tier_features`                  | this plan unlocks the feature                             | migration                      |
| `organization_feature_overrides` | for this org, force `enabled`/`locked_visible`/`hidden`   | operators (SQL / service role) |
| `organization_disabled_features` | this org switched the feature off itself                  | owner/admin (RLS)              |
| `pages`                          | a titled screen a feature is made of                      | migration                      |

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

## Names by industry

A feature's row is where a thing is named, and the industry axis can rename it. A
proposal is a "quote" to a roofer and a "treatment plan" to a dentist; the sidebar
entry, the tab title, the heading, the "Add …" button and the record page all say the
industry's word, and none of those words is a constant in `src/`. Three columns
(`feature_names_by_industry` migration):

| column                            | says                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `features.name` / `features.noun` | the default words: the list ("Deals") and one row of it ("deal", lower-case; null for a feature that is not a list of records) |
| `industry_features.name` / `noun` | the industry's own words for it; null inherits the feature's                                                                   |
| `pages.title` null                | "the owning feature's name, as the org's industry says it"                                                                     |

`resolveFeatures()` applies the active industry's row, so the resolved `feature.name` is
already the industry's word and every surface that reads it — `buildNav()`, the ⌘K
palette, the upgrade prompt, `/settings/features` — follows with no change. Modes are
untouched: `private.feature_mode()` mirrors modes only, and no policy ever needs a name.

The surfaces that name **one record** read `terms`, which the `(app)` layout ships
next to `nav` and `pages` (`visibleTerms()` in `src/lib/features/terms.ts`, filtered by
the same `isVisible()` predicate): `recordTerms(page.data.terms, kind)` in
`src/lib/crm/records.ts` answers `{ name, noun, plural }` for a kind of record —
"Treatment plans" / "treatment plan" / "treatment plans" — and throws for a kind whose
feature is not on screen, which cannot happen on a page the gate served. `CreateRecord`
("Add quote", "Quote created"), `DataTable.Pagination` ("3 quotes"), the generic record
page ("Quote", "All quotes") and its 404 ("Quote not found.") all read it. On the
server, `visibleTerms(features, canRead)` gives the same map.

`<PageHeader.Title />` with no children heads the page with the same `titleFor()` the
shell and the breadcrumb use, so a list page never spells its own name.

Four features are named per industry today: **proposals** ("Quotes" for roofing and
medical-supplies, "Treatment plans" for cosmetic and dentistry), **contacts** ("Patients"
in dentistry, "Clients" in cosmetic, "Homeowners" in roofing — the `industry_vocabulary`
migration), the two the proposal builder draws from, **billables** ("Procedures",
"Services", "Billable items", "Line items") and **quick-plans** ("Bundles", "Packages",
"Treatment packages", "Order templates", "Standing orders") — and the **calendar**, a
"Schedule" of "appointments" in cosmetic and dentistry (the `calendar` migration).

### Words that are not a feature's name

Some words belong to no feature: the two people on a proposal are a "Presenter" and a
"Provider" in a practice, an "Estimator" and a "Project manager" on a roof. Those are
**terms** — rows in `terms` (id, default label) with an industry's own word in
`industry_terms` (a missing row inherits), the same shape as features /
industry_features minus the modes (`industry_vocabulary` migration). `resolveVocabulary()`
(`src/lib/features/vocabulary.ts`) folds them per industry, `loadVocabulary()` in
`src/lib/server/features.ts` reads them, the `(app)` layout ships the result as
`vocabulary` next to `terms`, and `term(page.data.vocabulary, id)` is the accessor —
`TERM_IDS` is the typed key list, in lockstep with the table. The builder labels its two
pickers with them and `describeProposal()` labels the two `person` fields on the record
page with them. Nothing is settable per org: an org that needs its own word asks for a
migration, exactly like a feature's name.

## Sidebar sections

A feature's `category` is the section of the sidebar it is filed under. The values are
`general`, `crm`, `tools`, `insights`, `library` and `other` — declared once as
`NAV_CATEGORIES` in `src/lib/navigation.ts`, in the order the sections render, and
mirrored by the check constraint on `features.category` (the `feature_categories`
migration). `groupNav()` buckets the entries and drops the empty sections, so a
category may ship before the features that will live in it (`insights` does today).

The column is **nullable on purpose**: a feature that says nothing about where it
belongs is filed under Other rather than under a default the migration had to guess.
`navCategoryOf()` is the one place that answers it — null and any value the app does
not know both become `other` — and both the sidebar and `/settings/features` group
with it, so a feature lands in the same section on both screens.

Adding a section = one entry in `NAV_CATEGORIES` and the same value in the check
constraint, by migration. Nothing else changes: the sidebar, the ⌘K palette and the
feature settings page all render the list.

### Order inside a section

`sort_order` decides where a feature sits inside its section, and it is **spaced**:
multiples of 100, restarting at 100 in each category (the `nav_sort_order` migration).
The gaps are the point — a feature that belongs between two others takes a number
between them instead of renumbering its neighbours, so adding a page stays one insert.
Values below 100 belong to the static shell entries (`staticNavItems`; Dashboard is 0),
which is what keeps them above every feature in their section. Only renumber a whole
section when its gaps genuinely run out, and then put all of it back on multiples of
100 in one migration.

The order itself is the order of the work — what you open first, then the records you
keep, then what moves through a state. Never alphabetical, never ship date. A view sits
directly after the records it filters, so Suppliers reads as a cut of Companies rather
than a page of its own.

**And the order is the industry's, like the words are** (the `industry_feature_order`
migration). A practice opens its day on the Schedule and its Patients, a roofer on
Quotes, a distributor on its accounts — so `industry_features.sort_order` is that
industry's own position and null inherits `features.sort_order`, exactly the rule
`name` and `noun` follow on the same row. `resolveFeatures()` applies it, so the
sidebar, the palette and the feature settings page reorder with no change of their own;
nothing outside the resolver knows the column exists. Null inherits **column by
column**, so an industry can rename a feature without reordering it, or reorder it
without renaming it.

Sections are deliberately **not** per-industry: a feature is filed under the same
heading everywhere, and only its position inside that heading moves. When a vertical
does want its own order, set it for every feature in that section, not just the one —
a section with some rows ordered and the rest inheriting reads as two interleaved
lists. `crm` is the default and keeps every row null.

## Pages and titles

A feature is made of **pages**, and a page has a **title**. `pages` is the registry of
those screens: `path` (the exact pathname it is served at), `title` (the browser
`<title>`, in full — app code appends nothing to it), and the `feature_id` it belongs
to. The dashboard and settings belong to no feature, so their rows carry `feature_id`
null — the same split as `staticNavItems` in `src/lib/navigation.ts`. A feature's own
list page leaves `title` null: it is named after the feature, as the org's industry
says it, and `visiblePages()` fills the name in before the row reaches the browser. A
sub-screen keeps a title of its own.

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

## Records: one page for any kind

A row on a list page opens as a **record**, and there is one page for all of them:
`src/routes/(app)/[kind=record]/[id=guid]/`. `src/lib/crm/records.ts` lists the kinds
that have a list page (`RECORD_KINDS`: billable, company, contact, product, deal, proposal,
task, ticket)
and where each lives; `recordHref(kind, id)` is what a list row links to, and the
`[kind=record]` matcher (`src/params/record.ts`) accepts exactly those list-route
segments, so `/contacts/<id>` reaches the page and `/settings/<id>` never does.

Sitting under the kind's list route is what gates it. The hook already decides whether
this session may open anything under `/contacts` — mode and read grant — so the record
page needs no check of its own, and a deal record answers 403 to exactly the users the
deals list does. The page has no `pages` row: its load returns the record's name as
`title` (the record-title exception above), and until the load answers, the shell titles
it after the list it belongs to.

`src/lib/server/crm/records.ts` is the registry. `getRecord()` branches on the kind — one
branch per table, like `private.crm_entity_exists()` — reads the row through that kind's
own data module, and describes it as one `RecordDetail`: a name, lifecycle pills, and
fields typed by how they render (`money`, `date`, `datetime`, `link`, `record`,
`person`, …), so the page never inspects a value to decide how to draw it. Everything
the CRM attaches through the shared entity link — activities, tags, addresses, custom
fields — is read the same way for every kind, and `listRelatedRecords()` lists the deals,
tasks, tickets and people that point at a company or a contact. Where a field or a group
names another kind, it links only when `passesFeatureGate()` says the reader may open
that kind's route; otherwise the field is plain text and the group is never fetched.

**A kind that outgrows the generic page** adds `src/routes/(app)/<kind>/[id]/`. A static
segment outranks `[kind=record]`, so the specific page takes over with no other change,
and the generic page stays the default for every other kind. Build it from the same
`RecordDetail` and the parts in `src/lib/components/detail/` rather than a second
renderer. A new list page joins the generic page by adding its kind to `RECORD_KINDS`, a
branch to `getRecord()`, and `DataTable.linkCell()` on its primary column.

The header's breadcrumb trail (`src/lib/breadcrumbs.svelte.ts`) names its crumbs with
the same `titleFor()`, so a page is called one thing everywhere: in the tab, in the
trail, and in the sidebar entry its feature registers.

The public screens (`/login`, `/reset-password`, `/invite/[token]` and the pre-route
`src/error.html`) keep static titles on purpose: they render before a session or an org
exists, and `pages` is readable by signed-in users only.

## Adding a feature

1. Create the route under `src/routes/(app)/<route>/`.
2. A migration inserts its `features` row (id, name, noun — lower-case singular when
   the feature is a list of records — description, route, icon slug, category (the
   sidebar section — see "Sidebar sections"; null files it under Other), sort_order —
   the last number in that section plus 100, or halfway between two entries), its
   `industry_features` rows (with the industry's own `name` / `noun` where it calls the
   feature something else, and its own `sort_order` where the vertical puts it
   somewhere else) and its `tier_features` rows — plus `role_permissions` grants if
   plain members need it.
3. The same migration inserts a `pages` row per screen the feature is made of
   (`feature_id`, `path`, `title` — null for the feature's own list page, so it follows
   the feature's name).
4. Add the id to `FEATURE_IDS` in `src/lib/features/types.ts`; make sure the icon slug
   is in `src/lib/features/icons.ts`.
5. `npm run db:types`, commit `src/lib/database.types.ts`.

No nav edit, no `<title>`, no per-page check. Writes inside the page still open with
`requirePermission(locals.org.access, '<id>', 'manage')`, destructive ones with `'delete'`.

## Seed fixtures

`supabase/seed.sql` makes every mode visible locally:

- **Acme Inc** (pro, crm): clients, deals, tickets, staff, components enabled; **tasks**
  switched off by the org (`disabled`); **best-practices** enterprise-only
  (`locked_visible`). `e2e@example.com` holds crm Support, which grants nothing on
  deals — so `/deals` answers 403 for that user.
- **Globex** (free, roofing): **deals** is outside both its industry and its tier
  but an operator override enables it (a pilot); **best-practices** is not in
  roofing (`hidden`).
- **Two orgs per industry** — Initech and Hooli (crm), Ridgeline Roofing and Northwind
  Roofing (roofing), Meridian Medical Supply and Harbor Health Supplies (medical-supplies),
  Lumen Cosmetics and Velvet & Vale Beauty (cosmetic), Bright Smile Dental and Ashford
  Family Dentistry (dentistry), Marigold Beverage Co and Lakeside Brewing (beverage). Tiers
  are mixed so the free orgs show `locked_visible` where their industry has deals (Hooli,
  Harbor Health Supplies, Lakeside Brewing), the pro orgs where it has best-practices
  (Lumen Cosmetics, Marigold Beverage Co), and features outside an industry are `hidden`
  (deals in a dental practice, tickets in a beauty brand). `dev` and `e2e` hold each
  industry's roles as plain members; the seed's comment block lists who holds what.
- **Proposals in three industries' words**: Acme's two proposals are "Proposals"; a
  draft in Bright Smile Dental is a "Treatment plan" and one in Ridgeline Roofing a
  "Quote" — the same `/proposals` page, named by the org's industry. Each names its
  presenter and its responsible person (Evan and dev), and Bright Smile's is for Dana
  Reyes, one of its two patients.
- **A fee schedule and bundles in two industries' words**: Bright Smile Dental has five
  procedures with CDT codes (crowns per tooth, scaling per quadrant with UR/UL/BR/BL
  chips, whitening per arch) and two quick plans; Ridgeline Roofing has four services
  per square and one package. Bright Smile's draft option is built from the schedule —
  two crowns on teeth 12 and 13 — so `detail` and a unit count are on screen after a
  reset.
- **A week on the calendar**: Acme's schedule around today — a stand-up, a renewal
  review overlapping a coffee (so the week view has a side-by-side layout to draw), a
  site visit for a company, a demo, an all-day offsite, a deal desk — and one
  appointment in Bright Smile Dental's "Schedule" for Dana Reyes. Offsets from the
  Monday of the current week, in the zone the seed names, so a reset always lands on
  a populated week (docs/calendar.md).
- **`evancoppa@gmail.com` is the system admin**: every org above is in their switcher and
  they are owner-level in each, whatever their membership row says. Sign in as
  `dev@example.com` for the member view.
