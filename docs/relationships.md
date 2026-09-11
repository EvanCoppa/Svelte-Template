# Relationships and assets

The CRM is relational: a contact has a `company_id`, a deal names a company and a
contact, a proposal hangs off a record. Those columns say what a record _is_. The
relationship graph says how records _relate_ — who owns the truck, which supplier it
was bought from, which employee holds the laptop, where the contact worked before —
without a junction table per pair of kinds. This is the account of that graph, the
`assets` table that motivated it, and how the two stay distinct from everything else.

## The four primitives, and which one a thing is

| You want to store…                                            | It is a…      | Where                                                   |
| ------------------------------------------------------------- | ------------- | ------------------------------------------------------- |
| a record's own fundamental property (`assets.name`, `status`) | column        | the table, by migration                                 |
| an attribute one industry cares about (serial number, VIN)    | custom field  | `custom_field_definitions` with `entity_type = 'asset'` |
| the primary parent a list filters by (`contacts.company_id`)  | column        | the table — it drives cascades, views and list pages    |
| any other link between two records (owner, vendor, assignee)  | relationship  | `relationships`, typed by `relationship_types`          |
| something that happened or was written against a record       | activity/note | `activities`, `notes`                                   |

`org_id` is none of these. It is the tenant boundary, stored on every row of every
table here (`assets`, `relationships`, and an org's own `relationship_types`), and
never inferred by walking a relationship.

## Universal identity: the entity link, not a registry table

Every record that can stand in a relationship is identified by the pair the whole CRM
already shares — `crm_entity_type` + `entity_id` (`src/lib/server/crm/entity.ts`,
the party-model migration). That is the universal entity id: `('contact', <id>)`,
`('asset', <id>)`, `('company', <id>)`. There is deliberately no `entities` table
with a foreign key from each first-class table, because the CRM already has one
mechanism for "some record" and the house rule is never a second one. Integrity is
the same as for an address or a tag:

- **existence in the same org** — `private.crm_entity_exists(org, kind, id)`, a
  SECURITY DEFINER lookup with one branch per kind, run by the `relationships_check`
  trigger for _both_ endpoints against the relationship's own `org_id`, so
  `from.org = to.org = relationship.org` holds by construction;
- **cleanup on delete** — `private.on_crm_entity_gone()` deletes a record's
  relationships (from either side) beside its addresses, tags and custom values, via
  the `on_crm_entity_deleted('<kind>')` trigger every parent table carries.

A kind added later is one enum value, one `crm_entity_exists()` branch and one
delete trigger — the party-model checklist — and it takes part in every relationship
type with a null side at once. **A custom object shipped later** is one value
(`custom_record`), one `custom_records` table carrying its object definition, and
that same branch: "HVAC unit → installed at → 123 Main Street" needs no migration
once the object exists.

### Members are a kind, keyed by the membership

`'member'` is the one kind whose id is not a row in its own table: it is the
`user_id` of an `organization_members` row, and it exists in an org exactly as long
as that row does. So a relationship can name the employee a laptop is _assigned to_
while keeping three things apart: a **contact** (a person you work for), a
**profile** (an auth user) and a **membership** (a person who works here). Leaving
the org runs the same cleanup (`on_member_removed`), so nothing is assigned to
someone who has left. A member has no record page; a relationship shows their name
(through `profiles`, which members can read for people they share an org with) with
no link.

## Relationship types

`relationship_types` is what a relationship can _be_: a `key` ('works_at', 'owns'),
a `forward_label` read from the `from` side, an `inverse_label` read from the `to`
side, and optionally a `source_type` / `target_type` saying which kinds may stand on
each side.

- **System types** have `org_id` null, ship by migration with fixed ids
  (`f0000000-…`), and belong to every org. Nothing lets a client write one.
- **An org's own types** have `org_id` set and are kept by its owners/admins through
  RLS, like pipelines and custom field definitions. Each must be unique by key within
  the org.
- **Scope is a hard rule where set.** "works at" only reads correctly between a
  contact and a company, so the insert trigger refuses anything else; "related to"
  leaves both sides null and accepts any pair. Narrowing a type under rows that no
  longer fit is refused (`check_relationship_type_scope`), and a type with rows
  cannot be deleted (`on delete restrict`).
- `is_system` is a generated column (`org_id is null`), never written.

## Relationships

One row per relationship, whichever side you read it from. The inverse is a label,
never a second row. `started_on` / `ended_on` say when it held; an ended row is
history and is kept on purpose (the previous employer, the asset's last holder).

Constraints, and why:

| Rule                                                     | How                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| never across orgs; both endpoints must exist             | trigger, both endpoints checked in `new.org_id`                          |
| type must be system or this org's, and fit the endpoints | same trigger                                                             |
| one **open** relationship per type, pair and direction   | partial unique index `where ended_on is null` — ended periods may repeat |
| `ended_on >= started_on`                                 | check constraint                                                         |
| endpoints and type immutable from the browser            | column grants: update is `started_on`, `ended_on`, `notes` only          |
| self-relationships                                       | allowed — no shipped type makes sense of one, a future type might        |

RLS follows taggings: members read, create (as themselves), update and remove
relationships in orgs they belong to. A link between two records you can already see
is working data, and removing one you just drew is part of drawing it.

## The application API

`src/lib/server/crm/relationships.ts` is the one module that touches the two tables,
and the one place a row is oriented:

```ts
getRelationships(supabase, orgId, entity, canOpen, vocabulary, { typeId?, openOnly? })
//   → RelationshipView[]: { id, type: { id, key }, direction: 'forward' | 'inverse',
//       label, other: { entityType, entityId, name, href | null }, startedOn, endedOn, notes }
listRelationships(supabase, orgId, entity, filter)      // raw rows with the type embedded
listRelationshipTypes(supabase, orgId)                  // system + the org's own
createRelationship(supabase, orgId, { typeId, from, to, started_on?, ended_on?, notes? })
updateRelationship(supabase, orgId, id, { started_on?, ended_on?, notes? })
removeRelationship(supabase, orgId, id)
orientRelationship(row, entity)                         // pure: direction, label, other
```

`getRelationships()` returns rows already read from the record's side — the label
that applies from there and the record at the other end, named and linked. Naming
goes through the app's existing namers: `recordLinks()` (hence `getRecord()`) for
records, `getDisplayNames()` for members. A relationship whose other end is a kind
the reader may not open (`canOpen`, the feature gate) is omitted rather than shown
unlinked, the record page's rule for a related group. The generic record page draws
the result in its Relationships card (`Detail.Relationship`).

## Assets

`assets` holds only what every asset has: `name`, `asset_type` (free text, the org's
own word), `identifier` (unique within the org when set), `status`
(active/inactive/retired), `description`, `acquired_on`, `disposed_on`,
`purchase_price` + `currency`. Deliberately absent: `owner_id`, `vendor_id`,
`assigned_user_id`, `leased_from_id` — each is a relationship (`owns`, `purchased_from`,
`assigned_to`, `leased_from`), because an owner column would have to choose between a
contact and a company before the first row was written. Serial numbers, VINs,
mileage and warranty dates are custom fields with `entity_type = 'asset'`. The
feature is `assets` (every industry, every tier; grants derived from products), the
list page `/assets`, and the record page the generic one.

## Rules the first writer must follow

- **Symmetric types are stored in one direction.** `spouse_of` and `related_to`
  read the same both ways, but the unique index is per direction, so a picker must
  query both directions (`getRelationships()` already returns both) before inserting,
  or the fact shows twice.
- **An org's own type may reuse a system key** — the two unique indexes never
  collide. App code therefore addresses types by `id`, never by key; `key` is a
  handle for migrations and seeds.
- **Drawing or removing a link needs `manage` on the on-screen record's feature**
  (the same level as editing it), checked with `requirePermission()` in the action;
  RLS lets any member write, so the check is the app-level gate exactly as it is for
  addresses.

## Not built yet

- A UI to draw a relationship (a type picker plus a record picker across kinds) and
  to remove one. The API and the read side are complete; the write side is called
  from tests only.
- A settings page for an org's own relationship types (RLS already allows
  owners/admins to insert them).
- Custom objects (`custom_record`), which this design is shaped to accept.
