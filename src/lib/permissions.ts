/**
 * The permission keys the app knows at build time, in lockstep with the
 * `permissions` catalog table: the migration adding a gated page's row also
 * adds its key here, so a typo'd key is a `check` error instead of a
 * silently-failing string.
 *
 * This lives outside `src/lib/server/` because client code needs the type
 * too — `src/lib/navigation.ts` tags nav items with the permission that
 * gates their page. Everything that *checks* permissions (grants, levels,
 * `can()`) stays in `src/lib/server/roles.ts`.
 */
export type PermissionId = 'clients' | 'deals' | 'tasks' | 'tickets' | 'staff';
