import type { Enums } from '$lib/database.types';

/**
 * The polymorphic link every CRM record shares.
 *
 * The database has one mechanism for "this row is about some CRM record" — the
 * `crm_entity_type` enum plus an id, validated by `private.crm_entity_exists()`
 * and cleaned up by `public.on_crm_entity_deleted()` (see the party-model
 * migration). Activities, addresses, tags and custom field values all use it,
 * so app code names it once here rather than re-declaring the pair per module.
 */

export type CrmEntityType = Enums<'crm_entity_type'>;

/** A reference to one CRM record: what kind it is, and which one. */
export type CrmEntityRef = { entityType: CrmEntityType; entityId: string };
