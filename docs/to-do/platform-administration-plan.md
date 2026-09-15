# Platform administration plan

> Planning only. This document contains architecture and delivery guidance; it
> intentionally contains no implementation, migration, or UI code.

## Boundary

Platform administration belongs in the application for now, but it is not an
industry, organization, or tenant context. The normal top-left picker continues
to switch organizations and supplies the active industry, tier, role, feature,
and navigation context.

For an eligible system administrator, the picker may expose a visually separate
**Platform Administration** entry. It is a destination, not an organization: it
opens `/admin` without changing the active organization.

## Isolation and security

Use a SvelteKit route group and an admin-only code area so the public URL can
remain `/admin` while the shell, navigation, queries, and actions stay apart
from the tenant application. Reuse only deliberately shared low-level
primitives.

`system_admins` remains universal and platform-owned. It is not an industry role,
does not require organization membership, and is not assignable through normal
role management. The picker boolean is only a display convenience. Every admin
page, form action, and API endpoint must perform its own server-side system-admin
check.

## First pages

Start read-only and table-first:

1. Small admin home with a clear return path.
2. Organizations directory and read-only organization detail.
3. Tiers directory.
4. Industries and feature-registry directories.

Only after those pages are stable should the first controlled mutation be added:
changing an organization’s tier through a narrowly scoped, audited server action.

Defer role editing, feature editing, industry changes, system-admin management,
and any broader platform-permission model.

## Delivery phases

### Phase 1 — prove the boundary

- Admin shell and landing page.
- Conditional picker entry for system administrators.
- Independent server authorization for the route boundary.
- Validation that the admin area neither changes active-organization state nor
  inherits tenant navigation and vocabulary.

### Phase 2 — read-only visibility

Add organizations, tiers, industries, and feature-registry directories using an
explicit target organization rather than the normal active organization.

### Phase 3 — one controlled mutation

Add only the organization-tier change action after the read-only and authorization
patterns are proven. Validate the target organization and tier server-side and
record who made the change.

### Phase 4 — separately designed elevated configuration

Revisit role editing, feature editing, industry changes, system-admin management,
and future platform permissions as independent security work.

## Guardrails

- Keep platform-specific code under the admin route and library boundary.
- Never use the active organization as a surrogate admin target.
- Treat every admin request as privileged, including direct API calls.
- Keep initial pages observational and table-first.
- Do not weaken or overload `system_admins` to support less-privileged internal roles.
