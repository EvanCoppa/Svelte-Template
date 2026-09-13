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
npm run dev            # db:start + db:env + db:reset (when owed) + vite dev
npm run build          # production build (Vercel adapter)
npm run check          # svelte-check (strict types, a11y, unused CSS) — keep at ZERO
npm run lint           # prettier --check + eslint (flat config) — keep at ZERO
npm run lint:oxlint    # oxlint + vendored anti-slop rules (tools/oxlint/anti-slop) — keep at ZERO
npm run knip           # unused files / exports / dependencies (knip.jsonc) — keep at ZERO
npm test               # vitest (server-side unit tests)
npm run test:e2e       # playwright (real browser, tests/) — see "E2E tests" below
npm run db:start       # boot the local Supabase stack in Docker (npm run dev does this)
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
  pages go under the `(app)` route group and need zero auth wiring. Signed-in page
  requests then pass the **feature gate** (see "Multi-tenancy"): a registered
  route is served only when its feature is enabled for the active org and the
  user can read it. Errors thrown there render `src/error.html`.
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
- **Features are the registry of what the product is** (`features` migration +
  `src/lib/features/`). A feature is one navigable capability owning a route
  prefix, and four tiers-style tables map it: `features`, `industry_features`
  (which verticals include it at all), `tier_features` (which plans unlock it),
  `organization_feature_overrides` (per-org escape hatch, operator/SQL only) —
  plus `organization_disabled_features`, the org's own opt-outs (owner/admin via
  RLS). The pure resolver (`resolve.ts`, mirrored for modes by
  `private.feature_mode()`) folds them into one mode per feature per session: `enabled`, `locked_visible`
  (industry has it, plan doesn't — the tier axis, shown with an upgrade prompt),
  `disabled` (the org switched it off), `hidden` (not in the industry — does not
  exist). **`hooks.server.ts` enforces the mode** next to the auth check via
  `featureGateFor()` (locked → `/?upgrade=<id>`, where the upgrade prompt opens,
  disabled → `/settings/features?feature=`, hidden → 404), so a page is gated by being
  registered, never by a check in its load. Adding a page = the route + one
  migration inserting its rows (the migration's closing comment is the
  checklist) + its id in `FEATURE_IDS`; the sidebar and ⌘K palette render from
  the registry, and `/settings` (with `/api/` and `/logout`) is exempt from the gate.
- **A feature's row is where a thing is named, and the industry axis can rename
  it** (`feature_names_by_industry` migration + `src/lib/features/terms.ts`). A
  proposal is a "quote" to a roofer and a "treatment plan" to a dentist, so
  `features.name` / `features.noun` (the list, and one lower-case row of it) are
  the default words and `industry_features.name` / `noun` an industry's own
  (null inherits). The resolver applies the active industry's row, so the nav,
  the palette, the upgrade prompt and feature settings follow with no change;
  the `(app)` layout ships `terms` for the surfaces that name one record, and
  `recordTerms(page.data.terms, kind)` (`src/lib/crm/records.ts`) is the one
  accessor — "Add quote", "3 quotes", "Quote not found". **A kind's words are
  never a constant in `src/`**, and `private.feature_mode()` mirrors modes only:
  no policy needs a name.
- **The sidebar's order is the industry's too** (`nav_sort_order` +
  `industry_feature_order` migrations; docs/features.md, "Order inside a
  section"). `features.sort_order` is the default position inside the
  feature's section and `industry_features.sort_order` the industry's own,
  null inheriting column by column exactly as `name` / `noun` do on that row —
  so a practice leads with its Schedule and its Patients, a roofer with Quotes,
  through the same resolver and with no second nav. Positions are **multiples
  of 100, restarting at 100 in each category**, so a new feature slots between
  two others without renumbering them (below 100 is reserved for
  `staticNavItems`; Dashboard is 0), and the order within a section is the
  order of the work — never alphabetical, never ship date, with a view directly
  after the records it filters. Sections themselves are not per-industry, and
  a vertical that sets an order sets it for every feature in that section.
- **A feature is made of pages, and a page has a title** (`pages` migration +
  `src/lib/features/pages.ts`). One row per screen — `path`, `title`, and the
  `feature_id` it belongs to (null for the shell pages, dashboard and settings).
  A feature's own list page leaves `title` null: it is named after the feature,
  as the org's industry says it, and `visiblePages()` fills it in.
  The `(app)` layout ships the pages the session may see (`visiblePages()`,
  filtered by the same predicate as the nav) and renders **the one `<title>` for
  the whole group** from `matchPage(page.url.pathname, …)`, re-resolved on every
  navigation. **Never put `<svelte:head><title>` in a page file** — a title is a
  row, so the migration adding a route adds its page row too. A title that
  depends on a record is the one exception: that page's load returns `title` and
  page data wins. Public screens (`/login`, `/reset-password`, `/invite`) keep
  static titles — they render before a session exists.
- **Every record has a page, and the generic one is the default**
  (`src/routes/(app)/[kind=record]/[id=guid]/` + `src/lib/crm/records.ts` +
  `src/lib/server/crm/records.ts`). A row on any list page links to
  `recordHref(kind, id)` — `/contacts/<id>`, `/products/<id>` — and one route
  renders it for every kind: the `[kind=record]` matcher accepts exactly the list
  routes in `RECORD_KIND_META`, and because a record sits under its kind's list
  route, the hook's feature gate covers it with no extra wiring. The server module
  reads the kind's row through its own data module and describes it as one
  `RecordDetail` — a name, lifecycle pills, and fields typed by how they render
  (`money`, `datetime`, `record`, `person`…), never by a runtime check — while the
  shared entity link supplies what every kind has: activities, tags, addresses,
  custom fields and the records that point at it. A field or a related group
  that names another kind links only when `passesFeatureGate()` says the reader
  may open it; otherwise it is plain text or not fetched at all. The page has no
  `pages` row (its title is the record's name) and no nav entry. **A kind that
  needs its own screen adds `(app)/<kind>/[id]/`** — a static segment outranks the
  matcher, so the specific page wins and the generic one stays the default for
  the rest; compose it from the same `RecordDetail` and the `detail/` parts rather
  than a second renderer. A new list page joins by adding its kind to
  `RECORD_KINDS`, a branch to `getRecord()`, and `DataTable.linkCell()` on its
  primary column. What a kind is called — the eyebrow, "All quotes", the related
  cards, the 404 — comes from `recordTerms()`, never from `RECORD_KIND_META`.
  **The page is a header, then tabs with a record rail beside them**, never a
  wall of cards: the header is the way back (one `←` icon button, since the
  breadcrumb trail is the way back on a wide screen), the initials avatar, the
  name with its pills and the `link` fields as a row of quick facts. Under it,
  `ui/tabs` are the page — Overview (highlights that jump to a tab,
  relationships, the latest activity), Activity, the sections only some kinds
  have (Addresses, Billing, Photos, Conversation) and one tab per
  related-records group — with the rail on the end side holding what the
  record IS whichever tab is open: `Record details` (its fields as
  label-and-value rows, then its custom fields, then created / updated / id),
  with `EditRecord compact` in that card's header, and the Notes card under
  it. A new section is a tab, drawn only while active; a new fact about the
  record is a row in the rail; never a card outside the two.
- **A view is a query with a page** (`views` migration + `src/lib/views/` +
  `src/lib/server/crm/views.ts` + `(app)/views/[view=view]/`; docs/views.md). A
  `views` row names a source (`company` | `contact`), a JSON filter validated by
  `VIEW_FILTER_SCHEMAS`, its columns and its layouts (`table`, `map`), and its id
  is a `features` row at `/views/<id>` — so the nav, the gate, the title, the
  industry's name for it and the role grants need nothing new; adding a view for
  an industry is one migration inserting rows (that file's closing comment is the
  checklist), never a route. Filters compile through `listCompanies()` /
  `listContacts()` (`conditions`, `ids`, `sort`), the hops (a tag, a contact's
  company's relationship) resolving to an id list first — never a second query
  builder. The page draws `ViewRow`s and `MapPin`s the server described
  (`describeViewRows()`, `pinsFor()`), never a source's columns; "Add …" is the
  generic `CreateRecord` pre-filled from the filter. The map is `MapView`
  (`src/lib/components/map-view/`, MapLibre GL) over the style URLs hardcoded in
  `src/lib/map.ts` (the CSP derives their origins like Supabase's), and coordinates
  come from `geocode()` (`src/lib/server/geocode.ts`, `GEOCODER_URL`) when the
  record page's address form saves. Per-org saved views are a later phase and
  reuse the same filter shape.
- **Roles grant read/manage on features** (`roles_permissions` migration +
  `src/lib/server/roles.ts`; the old `permissions` catalog is gone — features
  are the keys). Roles are industry-scoped reference data: `industries`, `roles`
  and `role_permissions` ship by migration, and an org's `industry_id` (default
  `crm`, set by onboarding/service-role code like `tier_id`) decides which
  roles its owners/admins can hand out — so onboarding an org needs zero role
  setup, and two industries can each have a same-named role granting different
  things. The catalog (`industry_role_catalog` migration) ships six industries —
  crm, roofing, medical-supplies, cosmetic, dentistry, beverage — each with a
  full ladder: a Viewer (read on everything in the industry), the vertical's
  specialists, a Manager (manage on everything) and a Director (delete on
  everything); ids follow `b0000000-0000-0000-00II-0000000000RR` (II =
  industry, RR = role), and adding an industry is one migration (that file's
  closing comment is the checklist). Custom per-org roles are a deliberate
  future extension, not built yet. Members can hold several roles and access
  is the union of their grants.
  Levels are a ladder — `read` < `manage` < `delete`, each implying the ones
  below — and owner/admin implicitly hold `delete` on everything. A policy
  gating on a level therefore compares with `in ('manage','delete')`, never
  `= 'manage'`. Access is the **intersection** of the feature's mode and the
  grant: the hook also refuses (403) an enabled feature the user cannot
  `read`, so loads need no check; add/edit opens with
  `requirePermission(locals.org.access, 'key', 'manage')` and destructive
  actions take `delete`. This is app-level gating like tier gating — use
  `private.feature_enabled()` / `private.feature_level()` in a policy only when
  a feature is a real security boundary (the `staff` feature is: invite rows
  carry join tokens). Assigning/unassigning roles is owner/admin via RLS (only
  roles from the org's industry), never a feature.
- **System admins are the one role outside the catalog** (`system_admins`
  migration): a table of user ids, written by SQL/service-role code only (like
  `tier_id`), never a `roles` row — roles are industry-scoped and need a
  membership, and an operator has neither. `private.org_role()` answers
  `owner` for a system admin on every org, so every policy written against it
  and `private.feature_level()` honour the role with no per-table wiring, and
  `private.shares_org_with()` lets them see any roster's names. The app
  mirrors that: `loadOrgContext()` lists every org RLS shows them with
  `role: 'owner'`, and `PUT /api/org` and the staff actions check org
  visibility, never a membership row — copy that when a new surface needs
  "may this user act in this org". A user can only read their own
  `system_admins` row, so nothing can list operators. Locally,
  `evancoppa@gmail.com` is the seeded operator.
- **Staff management is the reference gated page** (`staff_management`
  migration + `src/lib/server/staff.ts` + `src/routes/(app)/staff/`). It uses
  all three levels: `read` shows the roster, `manage` invites people and
  revokes invites, `delete` removes a member — while assigning roles stays an
  owner/admin act (what the `member_roles` policies accept), since a role can
  hand out `delete`. Invitations are rows in
  `organization_invites` — single-use, database-generated tokens, 7-day
  expiry, either addressed to an email or shareable as a link — consumed at
  `/invite/[token]`, which lives outside `(app)` because the person accepting
  is not a member yet and goes through the service-role client for the same
  reason. `profiles.email` is a trigger-maintained copy of the auth email
  (column grants keep it out of reach of the browser), and members can read
  the profiles of people they share an org with, which is what lets a roster
  name anyone.
- **Every user always has ≥1 org**: `handle_new_user` creates a personal free org
  with an owner membership on signup, so no screen needs an empty-org state. Don't
  break that invariant without building onboarding to replace it.
- **The active org is a cookie** (`src/lib/server/active-org.ts`), resolved and
  repaired once per request in `hooks.server.ts` via `loadOrgContext()`
  (`src/lib/server/org-context.ts`), which puts `{ organizations, activeOrg,
features, access }` on `locals.org` — the hook gates the route on it, and
  `src/routes/(app)/+layout.server.ts` hands every `(app)` page `organizations`,
  `activeOrg` (`role` + tier + industry) and the filtered `nav` under `QUERY.org`
  and `QUERY.features` (grants never reach the browser). Child loads filter by
  `locals.activeOrgId`; it is a UI preference, not an auth decision — RLS is the
  boundary, a forged cookie yields zero rows. Switching goes through `PUT
/api/org` (the team switcher) + `invalidate(QUERY.org)`.
- **CRM working data is member-writable** — a documented extension of the canonical
  shape, not a drift. The `crm_core` migration is the reference: members create and
  edit companies/contacts/deals/tasks/tickets, authored content (activities, ticket
  comments) is editable by its author or owner/admin, deletes stay owner/admin, and
  notifications belong to their recipient (created server-side only, via
  `src/lib/server/crm/notifications.ts` + the service-role client). Column-level
  grants keep `org_id`, authorship columns and ticket numbers immutable from the
  browser. Data access for these tables lives in `src/lib/server/crm/` — loads and
  actions go through those modules (passing `locals.supabase` + `locals.activeOrgId`),
  never through ad-hoc `.from()` chains in routes.
- **The party model is two tables, split by what a row IS** (`crm_party_model`
  migration). `companies` are organizations you deal with — `relationship` says
  customer, supplier or partner, so a vendor is not a second table — and `contacts`
  are people, with a **nullable `company_id`**: a dental patient or a homeowner is a
  contact who belongs to no company, and the same list and picker serve them and the
  buyer at a 500-person account. Records that involve a party (deals, tasks,
  tickets) carry both `company_id` and `contact_id`, both nullable. `contact_profiles`
  links an auth user to the contact they are, for a client-facing app; a portal user
  is **not** an `organization_member`, so every existing policy already excludes
  them, and `handle_new_user` skips the personal org when signup metadata says
  `account_type: 'portal'`.
- **One polymorphic link, not one per table.** "This row is about some CRM record"
  is answered everywhere by the same three pieces: the `crm_entity_type` enum plus
  an `entity_id`, `private.crm_entity_exists()` as the foreign key Postgres cannot
  express, and `private.on_crm_entity_gone()` (called by every parent's
  `on_crm_entity_deleted` trigger) as the one place that says what
  happens when a record goes (proposals detach, addresses/activities/taggings/custom
  values are deleted). `addresses`, `activities`, `taggings` and `custom_field_values`
  all use it; app code names the pair once in `src/lib/server/crm/entity.ts`. A new
  table that points at "some record" adds a branch to those functions — never a
  second mechanism, and never a column per kind.
- **Org-definable sets are rows; vocabularies we own are enums.** `pipelines` +
  `pipeline_stages` replaced the `deal_stage` enum, because a dental practice and a
  roofer do not run the same board — a deal's `stage_id` is pinned to its own
  pipeline by a composite foreign key, every org gets a default board by trigger, and
  an unplaced deal lands in it. `stage_outcome` (open/won/lost) stays an enum: every
  board has exactly those three. Custom fields follow the same rule and now apply to
  **any** kind of record — a definition declares its `entity_type` and values
  reference `(field_definition_id, entity_type)`, so a contact's field cannot be
  filled in on a product. That is where industry specifics belong: a column if two
  unrelated industries would ever query on it, a custom field otherwise.
- **`products` is one catalog for goods and services** (`kind`), because a dental
  procedure, a roofing labor line and a stocked part all become priced lines on a
  proposal. Inventory columns are guarded by a check constraint so a service cannot
  track stock, and `proposal_line_items.product_id` is **provenance, not a live
  lookup** — the line keeps its own label and `unit_cost` so repricing the catalog
  never rewrites a quote that was already sent.
- **`billables` is the fee schedule, a table and a feature apart from products**
  (`billables_and_quick_plans` migration + `src/lib/server/crm/billables.ts`): what
  an org charges for on a proposal — a procedure with its CDT code, a labor line —
  priced per unit, counted in the units the row names, either a fixed set the
  builder offers as chips (`unit_choices`: UR/UL/BR/BL, Upper/Lower) or typed in
  ("12, 13"; `unitTokens()` in `src/lib/crm/billables.ts` counts them). `is_featured`
  puts one on every option's checklist; the rest are found by search. A line cites
  it through `proposal_line_items.billable_id` (provenance, like `product_id`, and
  never both) and keeps the units in `detail`. `quick_plans` +
  `quick_plan_billables` are named bundles that fill an option in one click (the
  builder's Quick Select; `src/lib/server/crm/quick-plans.ts`), kept on their own
  page because a bundle's one field is a multi-select the generic form cannot
  render. Both are member-writable working data like products, and both are
  features named by the industry — "Procedures" and "Quick plans" in a practice,
  "Services" and "Packages" on a roof.
- **Every proposal names two people, both members** (`proposal_people` migration):
  `presenter_id` and `responsible_id`, each a composite key onto the membership like
  `deals.assigned_to`, so nobody outside the org can be named and leaving clears it.
  What the two are CALLED is a **term** (`industry_vocabulary` migration +
  `src/lib/features/vocabulary.ts`): `terms` holds the default word and
  `industry_terms` an industry's own ("Presenter" / "Provider" in a practice,
  "Estimator" / "Project manager" on a roof), the `(app)` layout ships the resolved
  `vocabulary` next to `terms`, and `term(page.data.vocabulary, id)` is the one
  accessor. A word that is not a feature's name is never a constant in `src/` — it is
  a `terms` row and an id in `TERM_IDS`; nothing is settable per org.
- **Relationships are one table, not a junction table per pair of kinds**
  (`relationships` migration + `src/lib/server/crm/relationships.ts`; docs/relationships.md).
  A `relationships` row names two records through the shared entity link
  (`from_type`/`from_id`, `to_type`/`to_id` — so a company, a contact, an asset, an
  employee or a kind added later all take part) and a `relationship_types` row that
  carries a forward label ("owns") and an inverse one ("owned by"). **One row is the
  relationship whichever side you read it from**: `getRelationships()` orients every
  row around the record on screen and names the other end, so no caller reconstructs
  an inverse. System types ship by migration with `org_id` null; an org's own are
  owner/admin rows. Both endpoints are checked to exist in the relationship's own org
  by trigger (never across tenants), a type's `source_type`/`target_type` are hard
  where set, at most one open relationship of a type exists per pair (ended ones are
  history), and deleting either end deletes the row. **A record's structural columns
  stay columns** — `contacts.company_id`, a deal's parties — and the graph is for
  every other link — the one the columns did not foresee. A record's own assignee
  column (`deals.assigned_to`, an event's) stays; what never gets a column is a link
  that would have to pick a kind (`owner_id`: a contact or a company?).
  `'member'` is the kind for someone who works here (keyed by `organization_members.user_id`,
  existing only while the membership does), distinct from a contact and an auth user.
  **The graph is also drawn whole**: `/graph` (feature `graph`, `src/lib/server/crm/graph.ts`
  - `src/lib/components/relationship-graph/`; docs/relationships.md, "The graph page") is
    an Obsidian-style force-directed map of every record the reader may open — one in no
    relationship yet is a dot of its own that still opens its page — over the
    relationships between them, named through each kind's own list module (so the gate
    applies kind by kind, and a member is on the map only where a relationship names
    one), its legend in the industry's words (`recordTerms()` per kind, the `graph_member` term for
    people who work here) and its edges labelled by their types. Nothing per industry is
    stored for it; a kind or a type joins the map by existing.
- **Assets hold only universal columns** (`assets` migration + `src/lib/server/crm/assets.ts`):
  name, type, identifier, status, dates, price. Who owns, holds, sold or leases one is
  a relationship; a serial number or a VIN is a custom field (`entity_type = 'asset'`).
  Never add an `owner_id`-shaped column to it.
- **The calendar is a third kind of "something written down against time"**
  (`calendar` migration + `src/lib/server/crm/calendar.ts` + `src/lib/calendar.ts` +
  `src/lib/components/calendar/` + `src/routes/(app)/calendar/`; docs/calendar.md).
  An activity is a moment that happened, a note a document that stays open, an
  **event a block of time that is planned** — and a task is _due_, not booked, so
  `calendar_events` is its own table with a start AND an end. Both are instants and
  **`ends_at` is exclusive** (an all-day event runs midnight to midnight; `all_day`
  says how to draw it, not how to store it), so overlap is one comparison and a resize
  is one column. The optional entity link says who it is for; `assigned_to` is a
  membership like `deals.assigned_to`. Every Date in `$lib/calendar.ts` is local and
  the server never draws the grid: `fetchWindow()` pads in UTC, the page draws its own
  zone's grid after hydration, and forms carry instants behind wall-clock inputs.
  Booking, editing and deleting are superforms actions; **a drag posts the `move`
  action from the page's script** (`fetch('?/move')` + `deserialize`, the two changed
  columns only) with an optimistic `pending` overlay until `QUERY.calendar` reloads —
  the road for a JS-born mutation that belongs to the page it lives on. The feature
  is named by the industry ("Schedule" / "appointment" in a practice).
- **A task has a column AND a finishing time, and a trigger holds them together**
  (`task_board` migration + `src/lib/crm/tasks.ts` + `src/routes/(app)/tasks/`).
  `tasks.status` (`task_status`: todo / in_progress / blocked / done) says WHERE the
  task sits; `completed_at` says WHEN it was finished. They are not two ways to say
  the same thing, and `private.tasks_sync_completion()` keeps the one relationship
  between them — `status = 'done'` exactly when the timestamp is set — so the board
  writes `status`, the checkbox writes `completed_at`, and neither knows the other
  column exists. An enum rather than rows, unlike `pipeline_stages`: "not started,
  underway, stuck, finished" is the same four states in every vertical, and what a
  task is CALLED is already the industry's through the feature's terms. There is no
  `cancelled` state on purpose — it would be a second closed state and the timestamp
  can only be honest about one. **The board groups those statuses rather than adding
  to them**: `TASK_STATUS_GROUPS` (`src/lib/crm/tones.ts`) is the columns — To do,
  In progress (holding `in_progress` AND `blocked`), Done — and a group is a way of
  reading the wall, never a value written to a row, so a drop on a grouped column
  asks which status it meant and a card wears its own status on its eyebrow. Adding
  a column means grouping differently; adding a _status_ is a migration and a change
  to the four states above. **The page is not a table**: a `Kanban` board by status
  group and a `GroupList` by due-date bucket, the choice remembered per device
  (`$lib/list-view.svelte`), with one `move` action behind the drag, the arrow keys
  and the checkbox alike, and `schedule` / `prioritize` / `assign` / `unassign`
  behind the chips and the menus a card carries — every one a form action posted
  through a hidden form, never a `fetch`. Bucketing is pure and local
  (`taskBucket()`, `dueLabel()`) for the reason the calendar's dates are: "overdue"
  and "today" are wall-clock words.
- **An invoice is a document and the ledger is the account it lands on** (`ledger`
  migration + `src/lib/server/crm/invoices.ts`, `payments.ts`, `ledger.ts` + the pure
  fold in `src/lib/crm/ledger.ts` + `src/routes/(app)/invoices/`, `(app)/ledger/`;
  docs/ledger.md). Two features: `invoices` (one bill to one customer — `draft` →
  `issued` → `void`, each step an act on the record page, never an edit; issuing
  closes the lines by trigger and voiding hands its payments back to the account by
  trigger, so neither is ever half-done) and `ledger` (every issued invoice and every payment, newest first, with
  the balance that falls out of them — **a read, never a table**; `describeLedger()`
  folds the two tables and the pages sum the rows by the viewer's own date, because
  "overdue" is a wall-clock word like the task board's "today"). **A customer is a
  party**: both tables name `company_id` and `contact_id`, both nullable, at least one
  set, and the account is the company when one is named, else the person — decided
  once in `accountSideOf()`, carried as the `company:<id>` / `contact:<id>` key that
  the ledger's filter and the payment form share (the filter keeps only that account's
  rows; the form offers every company and the people who stand alone). The document is the `invoices` grant's
  and the money is the `ledger` grant's (record, apply, remove a payment), so an
  invoice's record page checks both; the billing block is `billing.server.ts` beside
  the generic record page plus `Detail.InvoiceLines` / `Detail.InvoicePayments`, drawn
  whenever the load supplies `data.billing` — the thread's data-presence rule. Every
  payment form carries an idempotency key the load minted, so a double submit collides
  on the table instead of recording money twice.

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
- **Quickstart for testing locally or in a cloud/web session:** `npm run dev`.
  `scripts/dev.mjs` boots the stack, writes `.env.local`, applies the migrations and
  seed when they have changed, then starts Vite — `-- --fresh` forces the reset,
  `-- --skip-db` leaves the stack alone. Then sign in as a seeded user — e.g.
  `evancoppa@gmail.com` / `password123` (also
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
input echoed back; `redirect(303, ...)` on success. Notes are the worked example of the
exception and the only one in the app — `/api/notes` is cross-page (the dock floats over
every screen) and multi-verb, and a note has no form to post; see "Notes" below. A
mutation born in a **gesture on the page it lives on** (the calendar's drag-to-move, the
staff page's hold-to-remove) is still a form action: a hidden `<form>` with hidden inputs
bound to a `superForm` store, filled from script and submitted with `requestSubmit()` —
never a `fetch` of your own (docs/calendar.md, "The writes").

## Assignment, priority and conversations (docs/tasks.md)

Tasks are the reference for three things a record may need, and each has exactly one
answer:

- **Assignment is a relationship, not a column** — `tasks.assigned_to` is gone. A task
  is assigned to as many people as the work needs through `assigned_to` rows in the
  graph (docs/relationships.md), and unassigning sets `ended_on` rather than deleting,
  so a handover is history instead of a lost fact. `listTaskAssignees()`,
  `assignTask()` and `endTaskAssignment()` in `src/lib/server/crm/tasks.ts` are the
  only place that shape is known; the Relationships card draws the result, so
  `describeTask()` has **no "Assigned to" field** — never add a second copy of a
  relationship as a record field. `deals.assigned_to` and `calendar_events.assigned_to`
  stay columns on purpose: each is genuinely one person.
- **Priority is one vocabulary** — the `public.priority` enum (renamed from
  `ticket_priority` when tasks became its second table), its options named once in
  `PRIORITY_OPTIONS` (`src/lib/schemas/records.ts`) and toned once in `PRIORITY_TONE`
  (`src/lib/crm/tones.ts`). A third table that needs urgency reuses both; it never
  declares a second enum with the same values.
- **A conversation is `Detail.Thread` plus a comments table** — `task_comments` copies
  `ticket_comments` (authored content, editable by its author or an owner/admin), and
  the generic record page renders the thread whenever the load supplies `data.thread`.
  That is a data-presence check, not a kind check: another kind joins by adding a
  branch to `hasThread()` and the two comment actions, never by forking the record
  page or writing a second thread component. **Posting requires no grant** beyond
  being able to open the record — participation is not editing.

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
/settings/profile are the reference implementations.

### Creating and editing a record is one form, not one per page

Adding a row of any kind goes through the **generic record form**: the registry in
`src/lib/schemas/records.ts` (the feature that owns each kind of object — whose terms
name it: "Add quote", "Quote created" — the query key its list depends on, its fields
and its zod schema), the
`CreateRecord` component behind every list page's "Add …" button, and
`src/lib/server/records.ts`, which validates the post, checks `manage` on the feature
and hands the values to the matching `$lib/server/crm/*` module. A list page's server
file is therefore the same two lines everywhere:

```typescript
return { companies: …, ...(await loadCreateRecord(locals, 'company')) };
export const actions: Actions = { create: (event) => createRecord(event, 'company') };
```

**The record page edits with the same form.** `loadEditRecord()` fills it in from the
row and `updateRecord()` saves it, behind the `EditRecord` button on the generic record
page — so a kind is described once and is creatable, editable and validated the same
way, and `writeRecord()` is one switch for both (a blank field therefore means the
column's empty value on both paths, never "leave it as it was", or clearing one would
silently do nothing). **A deal's stage is a field in that list**, which is how a deal
moves down the funnel. An invoice is the exception and says why: it is a document with
a lifecycle — draft, issue, void — that its own record-page actions own
(`billing.server.ts`), so it is not an `EditableRecordType`.

Every field posts a **string** — that is what lets one component render them all — and
`writeRecord()` is the one place strings become columns (blank → null, an
amount → a number, a wall-clock pick → an ISO instant, re-parsed with the concrete
schema so the enum unions come back without a cast), with `recordFormValues()` its
mirror on the way back into the form. A record that points at another row — an
invoice's customer, a deal's stage — uses the `company` / `contact` / `stage` **picker
field types**: still a
string (the row's id), rendered as a `Combobox` whose options `loadCreateRecord()`
reads per request and ships as `createPickers` — never a second modal for "the same
form plus a customer". Adding a kind of record = a schema, a `RECORD_FORMS` entry and
one `case` in each of those two functions; never a second create or edit modal, action
or field-rendering loop (the inputs are `RecordFields`, once, for both frames). A screen whose creation is genuinely special
(the staff page's invite, which sends an email and mints a token; the proposal
builder at `/proposals/new`, which writes the two people, the options and their
billable and product lines with the row — docs/proposals.md, "The page"; the quick
plans page, whose one field is a multi-select; the calendar, whose booking form is
two instants behind wall-clock inputs, an all-day switch that changes what they mean,
a colour and a record — docs/calendar.md) keeps its own form and says why.

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

## AI assistant

The assistant (`/assistant`, feature id `assistant`) is built on the Vercel AI SDK, and
**the SDK's own mechanism is the answer to every AI concern** — never a parallel one. The
SDK's docs ship inside the package (`node_modules/ai/docs/`) and match the installed
version; read them before the website. The full account is `docs/assistant.md`.

- **Models** come from `src/lib/server/ai/provider.ts` (`chatModel()`), the only file that
  imports a provider package. Config is env-only (`ANTHROPIC_API_KEY`, `AI_MODEL`); when
  unconfigured the page says so and the endpoint answers 503, never a crash.
- **The agent** is the SDK's `ToolLoopAgent` in `src/lib/server/ai/agent.ts` — model,
  instructions, tools, `stopWhen`, `prepareStep`, `toolApproval`, `toolsContext`,
  `activeTools` live there, not in the endpoint.
- **A tool is one file** in `src/lib/server/ai/tools/`: `tool()` with a zod `inputSchema`
  and `outputSchema`, the shared `contextSchema`, and an `execute` that calls a data
  module (`src/lib/server/crm/*`) — never `.from()` directly. Next to it, its
  `ToolAccess`: the feature it touches and the level it needs. **Tools are linked to
  features**: `activeToolNames()` keeps a tool only when the feature is `enabled` for the
  org and the caller holds the level, and every tool re-checks with
  `requireToolContext()`. Destructive tools go in `TOOL_APPROVAL`. Adding a tool = the
  file + one line in each map in `tools/index.ts` + a label in `src/lib/ai/labels.ts`.
- **The message type** is `AssistantUIMessage` (`src/lib/ai/types.ts`), inferred from the
  tool set. Render by `part.type`; never sniff a field on a payload. UI that is not a tool
  result is a data part; a message-level fact is metadata (`messageMetadataSchema`).
- **The browser sends only the last message** (`prepareSendMessagesRequest` in
  `Assistant.Root`); `src/lib/server/ai/conversations.ts` owns the thread and the endpoint
  saves it from `onEnd`. The browser's copy of an assistant message is never trusted —
  only its approval decisions are merged.
- **Model text is untrusted**: `Assistant.Markdown` renders it to components with raw
  HTML disabled, never `{@html}`.
- Freshness is `QUERY.assistant`; rename and delete are superforms actions on the page.
  Every module under `src/lib/server/ai/` has a test beside it; the endpoint test drives
  the real agent with `MockLanguageModelV4` from `ai/test`.

## User settings — three axes, three homes

Switches accumulate, and which of three places one belongs in is not a style
question: it decides whether it follows you to another laptop and whether the screen
flickers on load. The full account is `docs/user-preferences.md`; the rules:

- **The organization decides what exists.** Features on and off, tier, industry,
  roles — the registry, edited at `/settings/features` by an owner or admin. Not a
  preference; never duplicate one as a preference.
- **The account decides how you work.** `user_preferences`, one row per key, private
  to its owner (no policy grants anyone else's, not even an org owner's), loaded once
  in the `(app)` layout and shipped as `page.data.preferences`. Written by the form
  action on `/settings/preferences`.
- **The device decides how it looks here.** `localStorage` (`$lib/theme.svelte` is
  the pattern) or a **cookie** when the server must know before it renders (the
  sidebar's collapsed state). Never anything you would mind losing: a private window
  and cleared site data both read as "no value", and the answer is always the
  documented default.
- **Choosing between them**: would it apply to a colleague who never touched it? →
  organization. Would you want it different on your laptop and your desktop? →
  device. Does the browser have to answer before the server can render? → device, in
  a cookie. Otherwise → account. "It must not flash" is _not_ a reason to reach for a
  cookie: account preferences are loaded server-side too.
- **Adding an account preference is one entry in `PREFERENCES`**
  (`src/lib/preferences.ts`): a zod schema, a fallback, a label and a description —
  plus the `feature` it belongs to, which is what keeps a switch for a feature the
  org turned off from being offered at all. No migration (the table is key/value) and
  no backfill (a key with no row _is_ the fallback), and the settings page renders
  the registry rather than a hand-kept list.
- A preference is **drawn by the `kind` its entry declares**, never by inspecting the
  stored value — the rule a record's fields follow. Its value is parsed against its
  own schema on the way in and on the way out, so a key whose type changed reads as
  the fallback instead of poisoning every page.
- The notes rail (`notes.dock`) is the worked example, and it hides **chrome, not the
  feature**: the dock component stays mounted with the preference off so `⌥⌘L` still
  opens every note. A preference that quietly takes a shortcut away is how people
  stop trusting preferences.

## Navigation

`src/lib/navigation.ts` drives both the sidebar and the ⌘K palette, and the entries
come from the feature registry: `buildNav()` (called in the `(app)` layout load) merges
`staticNavItems` (Dashboard — the pages every org has) with every feature
that is `enabled` or `locked_visible` for the active org and readable by the user.
Adding a page = create the route under `(app)` + register the feature and its `pages`
row by migration; nothing in `navigation.ts` changes, and the page's `<title>` comes
from that row (see "A feature is made of pages" under Multi-tenancy). A locked entry
renders with a lock and a click opens the upgrade prompt (`showUpgrade()`) instead of
navigating. Icons are named by lucide slug (`features.icon`) and resolved
only through the one-per-file map in `src/lib/features/icons.ts` — add a slug there
when a feature needs it; never the barrel import.

**Settings is its own shell, not a nav entry.** It is reached from the user menu in the
sidebar footer (`nav-user.svelte`), and while the pathname is under `/settings` the
`(app)` layout swaps `AppSidebar` for `SettingsSidebar`, whose sections are the
hand-kept `settingsNav` list at the bottom of `navigation.ts` — a list, not a registry
read, because these pages exist for every org and are exempt from the feature gate.
`/settings` itself only redirects to the first section. Adding a settings page = the
route under `(app)/settings/` + one `settingsNav` entry + its `pages` row by migration;
the settings sidebar and the palette's Settings group both render from that one list.
Never put Settings back in `staticNavItems`, and never build a second settings nav.

The header carries a **breadcrumb trail**: how deep this tab has gone since it last
jumped from a shell surface, newest last, capped at `MAX_CRUMBS` (3). It is a **depth
trail, not a hierarchy** — these pages are siblings under one shell and the same screen
is reached from a dozen places, so a tree read off the URL would be fiction (a contact
opened from `/treatments` shows _Treatments › Contact_, not _Contacts › Contact_). The
depth is the walk actually taken: **a click in a shell surface starts the trail over at
depth 1** — the app sidebar, the settings sidebar, the ⌘K palette and the user menu each
call `breadcrumbs.startAt(href)` immediately before navigating, so a new surface that
navigates must pair the two or its jumps read as steps deeper — while a link inside a
page pushes onto the trail, and landing on a page the trail already holds truncates back
to it, so the trail only grows by going deeper. A jump is matched to the page that
arrives with `isPathUnder()`, the same rule that marks the sidebar active, so a door like
`/settings` redirecting into its first section is still that jump. Browser back rewinds
the trail — to the crumb it lands on, or to that page alone when it lands outside. All of
that behaviour is in `src/lib/breadcrumbs.svelte.ts`;
`src/lib/components/breadcrumbs.svelte` records one visit in `afterNavigate` and renders
the trail with `ui/breadcrumb`. Crumbs are named by the same `titleFor()` that titles the
document, so a page never has two names, and the trail lives in `sessionStorage` keyed by
user + org (this tab's own; no cookie on every request, and switching org or user starts a
fresh one). Never add a second breadcrumb surface, a per-page crumb prop, or a
hierarchy-from-the-URL variant.

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
- **A dialog is `Modal`** (`src/lib/components/modal/`), the app-level compound over `ui/dialog`
  and `ui/card`: `Modal.Content` is the muted tray, `Modal.Card` the white card inside it holding
  `Modal.Header` (an icon-led `Modal.Title`; the close button is pinned to the card) and
  `Modal.Body`, and `Modal.Footer` sits on the tray pairing `Modal.Cancel` (`esc`) with
  `Modal.Action` (`↵` on a submit button) — both `UntitledButton`s. Wrap `Modal.Card` +
  `Modal.Footer` in the page's `<form>` so `Modal.Action type="submit"` posts it. Reach for bare
  `ui/dialog` only when a screen needs a different frame; `/components` → Overlays → Modal is the
  reference.
- **Selling a plan is `showUpgrade(featureId?)`** from `$lib/upgrade.svelte`. It opens the one
  `UpgradePrompt` the `(app)` layout mounts — `UpgradeModal` (`src/lib/components/upgrade-modal/`,
  the pitch as a dialog frame) fed the plans from the layout load — with the smallest plan that
  unlocks the feature and what else it adds. Call it where a locked click or a tier limit lands
  (the sidebar, the palette and the feature gate already do); never navigate somewhere to pitch
  a plan, and never build a second upsell surface. `/components` → Overlays → Upgrade modal is
  the reference.
- **A board is `Kanban`** (`src/lib/components/kanban/`), the app-level compound for "cards in
  columns you can move one between", and it has **two axes**: a `Kanban.Column` is a **status
  group** — the coarse state a reader scans for — and the `statuses` it declares are the states a
  record is actually in. A column holding one status takes a release straight away; a column
  holding several shows `Kanban.Zones` (a `Kanban.DropZone` each) in place of its `Kanban.Cards`
  while a card is over it, and asks which. **A group is never a state**: `onmove` is always called
  with a status, because a group is a way of reading the board and not something a record can be
  stored as. `Kanban.Root` owns the drag state and draws the card under the pointer (from the
  lifted card's own snippet, so a column that splits cannot unmount what you are carrying) and
  freezes the board's height for the length of the drag; `Kanban.Card` is the draggable shell with
  a real handle button on it, and `Kanban.CardHeader` / `CardTitle` / `CardFooter` / `Ring` are
  the regions every card has. The page owns the groups, the statuses, the cards and what a move
  means — the board hands back a card id and the status it was released over, and nothing else.
  Moving works from the keyboard as well as under a pointer (Space to grab, ← → to move one
  status at a time **across column boundaries**, Escape to drop), so never build a drag-only board
  and never leave a status the arrows cannot reach. `/tasks` is the worked example and
  `/components` → Boards & grouped lists the reference.
- **A list that comes in headings is `GroupList`** (`src/lib/components/group-list/`) — collapsible
  sections of rows, as `/tasks` draws its due-date buckets. Nothing in it groups, sorts, counts or
  names anything: the page arrives with its rows already in piles, because what a pile means and
  what it is called are the page's to know (a count reads "3 quotes" through `recordTerms()`,
  never a hardcoded noun). Not to be confused with `enhanced/accordion`, which is a config-object
  component for panels of text.
- Success feedback is a **toast**, per "Mutation feedback" below — never a hand-rolled banner.
- An inline form message is `FormAlert` from `ui/alert` — `<FormAlert message={form?.message} />`,
  with `variant="success"` for the rare non-toast confirmation. Never a `<p>` with tinted
  border/background classes: that loses `role="alert"`, and the class string then gets copied.

Need something not vendored yet? Add it with `npx shadcn-svelte@latest add <name>` rather than
writing it yourself. These files are project source, so extend one in place — a new variant or
prop — before creating a parallel component. `/components` renders the full inventory; check it
before you build.

### A page is its name and its actions

Every `(app)` screen opens with `PageHeader` (`src/lib/components/page-header/`): the
title on the start side, whatever the page lets you do on the end side, one line.
**There is no subtitle.** A page is named once — by its `pages` row, which also titles
the document and names the breadcrumb — so `<PageHeader.Title />` with no children
renders that name (the same `titleFor()`), and a list page never spells its own; give
it children only for a heading that is deliberately not the page's name ("Welcome
back"). A paragraph under the heading explaining what "Companies" means is the third
copy of that name, so it was removed everywhere and no new one goes in. Explanation
belongs where the thing is: a `Card.Description`, an empty state, an `Alert`.

`PageHeader.Actions` is where a page's own buttons live, and on a list page the first
of them is the "Add …" button — `<CreateRecord type="company" form={data.createForm} />`,
rendered only when the load says `canCreate`. See "Creating a record is one form".

### A data table is not a card

`DataTable.Content` already draws its own bordered, rounded frame around the rows, so wrapping
one in `ui/card` stacks two borders around the same table and buys nothing. **A list page is the
page heading, then the toolbar, then the table** — `/clients`, `/deals`, `/tickets`, `/tasks` and
`/staff` are all built that way, and a new one copies them. (The `/components` showcase is not an
exception to fix: there the card is the demo frame around a primitive, not a page layout.)

Cards still earn their place around everything that is _not_ the table: a form, and the summary
or grouped panels that sit beside a roster — the staff page's organization panel and its pending
invites are the reference.

**A table sizes its own page, and never asks.** A rows-per-page picker makes the reader solve a
layout problem the browser already has the answer to, so there isn't one: `DataTable.Root`
measures the room between the table and the bottom of the viewport and shows as many rows as fit,
re-measuring when that changes (`page-size.ts`; `DataTable.Content` marks its empty-state row
`data-empty` so it never gets mistaken for a row to measure). A page therefore says nothing about
page size — no `initialState.pagination` — and the one screen that wants a fixed number, because a
card or a long page gives it no viewport to fill, passes `<DataTable.Root {table} pageSize={5}>`.
That prop is the only way to set a page size; never reintroduce a picker or a second knob.
`DataTable.Pagination` reads the result: the row count on the left, and on the right one pill
holding **page of pages** and the four controls (first, previous, next, last).

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

**Alternate skins are the one exception**, and they earn it by reusing the `ui/` element rather
than replacing it. `UntitledButton` (`enhanced/untitled-button`) wears the
[Untitled UI](https://www.untitledui.com/react/components/buttons) button look — skeuomorphic
edge, faded inner border, offset focus outline, nine `color`s × five `size`s, `loading`, icon
snippets — but renders `ui/button` with `variant="unstyled"`, so the `<button>`/`<a>` switch,
`ref` binding and disabled handling stay in one place. `ui/button` is still the default answer for
a button; reach for a skin when a screen deliberately wants that look, and pick one skin per
screen rather than mixing them. A further skin follows the same rule: `variant="unstyled"` plus a
`tv` recipe painted from `app.css` tokens — never a second `<button>` element.

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
