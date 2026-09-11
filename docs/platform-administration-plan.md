# Platform Administration — implementation plan

> **Status: planning only.** This document records the agreed architecture and
> delivery order for platform administration. It intentionally describes no
> implemented route, table, policy, or UI. The first implementation change must
> be the isolated shell and its authorization gate described in Phase 1.

## The boundary

Platform administration belongs in this application for now, but it is **not**
an industry, an organization, or another tenant context.

The ordinary application stays organization-first:

- The existing top-left picker switches organizations.
- An organization supplies the active industry, tier, role, feature, and
  navigation context.
- Selecting an organization continues to set the active-organization state as
  it does today.

For an eligible system administrator, the same picker also exposes a visually
separate **Platform** section (with a divider or section label where it fits
cleanly) containing **Platform Administration**. That entry is a navigation
destination, not an organization: selecting it goes to `/admin` and must not
change the active organization.

This gives an operator a familiar way into the platform area without pretending
that platform work has a tenant, industry vocabulary, tier, or feature context.

## Route and code isolation

Use a SvelteKit route group so the public URL remains `/admin` while its
implementation is physically and conceptually separate:

```
src/routes/
  (app)/                  # existing organization-scoped application
  (admin)/
    admin/
      +layout.server.ts   # server authorization and admin page data
      +layout.svelte      # admin identity and navigation
      +page.server.ts
      +page.svelte
      organizations/
      tiers/
      industries/
      features/

src/lib/
  admin/                  # admin-only components, queries, actions, helpers
```

`/admin` must own its layout, navigation, naming, and visual identity. It must
not inherit the normal tenant shell/sidebar, industry vocabulary, feature
registry navigation, or ordinary application utilities. Reuse only deliberately
shared low-level primitives (for example, generic UI primitives, formatting, or
authentication plumbing); keep admin-specific services, components, and
navigation under the admin boundary.

An admin page that operates on an organization chooses its target organization
explicitly. That target is separate from the normal active organization and
must not be inferred from or silently modify the regular organization picker.

## Eligibility and security model

The normal application integration should stay small:

1. Make the current user's system-administrator eligibility available as a
   boolean so the organization picker can decide whether to show the Platform
   entry.
2. Add the navigation action to `/admin`.

That client-visible boolean is a convenience, not an authorization boundary.
Every admin page, form action, and API endpoint must independently perform a
server-side system-admin check. A hidden picker entry must never be the only
protection. Deny in the `(admin)` server layout for pages, and repeat the gate
in each admin action or endpoint so direct requests cannot bypass it.

### Why `system_admins` remains separate

`public.system_admins` is deliberately universal and platform-owned:

- It is keyed by user and is **not** a `public.roles` row.
- It is not industry-scoped, does not require organization membership, and is
  not assignable through normal organization role management.
- Its established semantics are platform superuser / owner-level access across
  every organization.

This is appropriate only for a very small, highly trusted operator group. Keep
the list short and protect those accounts accordingly. If the product later
needs support, finance, operations, or other less-privileged internal roles,
design a distinct platform-permission model rather than weakening or
overloading `system_admins`. That model is explicitly outside the first slice.

## Initial admin experience

The landing page should be minimal but useful:

- A clear Platform Administration identity, distinct from organization work.
- A visible return path to ordinary organization work.
- A small set of links or cards for the planned configuration areas.
- No implicit active-organization switch and no industry-specific wording.

Organization-oriented pages use an explicit target-organization chooser. It
should make the current target clear in the page title, filters, and mutation
confirmation rather than borrowing the tenant shell's context.

## Page roadmap

### First data pages: read-only, table-oriented

| Area | Directory columns | Detail / scope |
| --- | --- | --- |
| Organizations | name, industry, tier, created date | Read-only organization detail: tier, industry, members, and overrides. |
| Tiers | ID, name, organization count, enabled feature count | Directory only at first. |
| Industries | ID, name, organization count | Directory only at first. |
| Feature registry | feature, route, category, icon, sort order | Directory only at first. |

The recommended first useful slice is intentionally narrower: admin home,
organizations list, tiers list, and read-only organization detail. After those
are established, add exactly one controlled mutation: **change an
organization's tier**.

Tier changes must use a dedicated server-side admin action with target-
organization validation, system-admin authorization, and clear success/failure
handling. Do not generalize it into a broad browser write capability.

## Deferred work

The following should not be part of the initial rollout:

- Role editor
- Feature editor
- Industry changes
- System-admin management

Each carries multi-table permissions, feature gates, cascading effects, or an
especially elevated protection requirement. Keep the first admin surface
observational, then make only the tier change deliberate and auditable before
considering these areas.

Reference catalogs are currently browser-readable but intentionally not broadly
client-writable. Any future mutation must be an explicit, narrowly scoped
server-side platform-admin action; do not add a general client write policy.

## Delivery phases

### Phase 1 — prove the boundary

When implementation is authorized, build only:

- the `(admin)/admin` shell and landing page;
- the conditional picker entry for system administrators; and
- independent server authorization for the admin route boundary.

Validate that non-system administrators cannot load `/admin` directly, that
the Platform entry does not alter active-organization state, and that the admin
layout has no tenant sidebar or feature-registry dependency.

### Phase 2 — read-only platform visibility

Add the table-oriented organizations and tiers directories plus the read-only
organization detail page. Preserve the explicit target-organization model.
Industries and feature registry directories can follow using the same isolated
query and presentation patterns.

### Phase 3 — one controlled mutation

Add the dedicated organization-tier change action only after the read-only
pages and server authorization pattern are established. Confirm authorization
server-side, validate the requested tier and organization, and reload the
relevant admin views after success.

### Phase 4 — separately designed elevated configuration

Revisit role editing, feature editing, industry changes, system-admin
management, and any future platform-permission model as independent design and
security work. None should be smuggled into the first implementation slice.

## Implementation guardrails

- Keep all platform code under the `(admin)` / `$lib/admin` boundary whenever
  practical.
- Do not add platform administration to industry feature resolution, ordinary
  application navigation, or tenant vocabulary.
- Do not use the normal active organization as a surrogate for an admin target.
- Treat every admin request as privileged on the server, including direct API
  calls and form submissions.
- Retain existing `system_admins` semantics; do not make it writable through
  normal role or membership management.
- Keep initial lists readable and table-first. Avoid bringing configuration
  editors into a phase that has not explicitly designed their data integrity,
  authorization, and cascading effects.
