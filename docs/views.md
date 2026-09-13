# Views: a query with a page

A vendors page is the companies page with a filter. A patient map is the contacts page
drawn as pins. Every vertical wants a dozen of these — the suppliers a roofer buys from,
the people at a partner, the patients within reach of a practice — and none of them is
worth a route, a load, a column list and a nav entry of its own. So a **view** is a row:
which kind of record, which of them, which columns, table or map or both. One page
renders every row, and an industry gets a new page by inserting rows in a migration.

The `views` migration (`supabase/migrations/20260910100000_views.sql`) is the
implementation; the client side is `src/lib/views/`, the runner is
`src/lib/server/crm/views.ts`, the page is `src/routes/(app)/views/[view=view]/`.

## The tables

Reference data, all of it, written by migrations and only read by the browser.

| table               | one row means                                                                   | new here |
| ------------------- | ------------------------------------------------------------------------------- | -------- |
| `views`             | the definition: `source`, `filter`, `columns`, `layouts`, `default_layout`      | yes      |
| `features`          | the view as a navigable capability, at `route = '/views/<id>'`                  | no       |
| `industry_features` | which industries have the view, and what each calls it ("Vendors", "Suppliers") | no       |
| `tier_features`     | which plans unlock it (every plan, today)                                       | no       |
| `role_permissions`  | who may read it — derived from the source feature's grants                      | no       |
| `pages`             | its title, `null` so it follows the industry's word                             | no       |

## Rule 1 — a view is a feature

The id of a `views` row is a foreign key onto `features.id`, and that feature's route is
`/views/<id>`. Everything a page needs then comes from machinery that already exists:
`buildNav()` lists it in the sidebar and the ⌘K palette, `featureGateFor()` in
`hooks.server.ts` serves or refuses it by mode and grant, `visiblePages()` titles it,
`industry_features` says which verticals have it and renames it, `tier_features` can lock
it behind a plan. A view has no overlay table of its own: "which industries, called what"
is `industry_features`' question, and a different filter for another industry is simply
another view row.

`resolveView()` (`src/lib/views/resolve.ts`) checks the pairing on every load — the
feature's route must be the view's href and its `noun` must be set (the row count says
"3 vendors") — and throws with the view's id when a migration shipped a bad row. That is
a 500 on purpose, the way `resolveVocabulary()` refuses a missing term.

## Rule 2 — the filter is a row, and it compiles through the list modules

`views.filter` is JSON in the shape `src/lib/views/filter.ts` declares: a `where` list of
conditions, all of which must hold, and an optional `sort`. A condition names one `field`,
and the field decides the operator and the value shape — a discriminated union per
source, so every filterable column appears exactly once and adding one is one line.

| op       | on                       | means                                         |
| -------- | ------------------------ | --------------------------------------------- |
| `in`     | an enum column           | the value is one of these (`eq` is one value) |
| `not_in` | an enum column           | the value is none of these                    |
| `ilike`  | a text column            | contains the value (stored without `%`)       |
| `eq`     | `has_company` (contacts) | belongs to a company, or does not             |
| `has`    | `tag`                    | carries a tag of that name                    |

Two conditions reach past the record's own table: `company.relationship` on a contact
(the people at companies of that relationship) and `tag` on either kind. `runView()`
resolves those to an id list **first** — through `listCompanies()` and
`listTaggedEntityIds()` — and an empty list ends the run with no rows and no second
query. Everything else goes straight into the source's list module as `conditions`,
`ids` and `sort` on `listCompanies()` / `listContacts()`. There is no second query
builder: the modules stay the one way to read a table, and the assistant's search tool
keeps using the same `relationship` filter it always had.

The three shipped views:

| id                 | source  | filter                                        | layouts    |
| ------------------ | ------- | --------------------------------------------- | ---------- |
| `suppliers`        | company | `relationship in [supplier]`                  | table, map |
| `partner-contacts` | contact | `company.relationship in [partner]` (the hop) | table      |
| `patient-map`      | contact | `has_company eq false`                        | map, table |

## Rule 3 — the page never learns the source

The page draws what the server described. `describeViewRows()` turns each row into a
`ViewRow`: cells in the view's column order, each typed by how it renders — `link`,
`status`, `text`, `datetime` — the rule `RecordDetail` follows on the record page. The
column catalog (`src/lib/views/columns.ts`) says what each key is called; a column that
names another kind is labelled through the terms the layout shipped, never a constant.
`name` is always the first column and always the link into the record, and it links only
when `passesFeatureGate()` says the reader may open that kind — so a view of vendors
still renders when the org switched Companies off, with plain names.

`viewColumns()` (`src/lib/views/table.ts`) turns those cells into TanStack columns that
sort by the cell's text, and the page composes them into `DataTable` exactly as a list
page composes its hand-written ones. The "Add …" button is the generic `CreateRecord` for
the source kind, pre-filled with every enum column the filter pins to one value
(`defaultsFor()`), so a company added from Vendors is a supplier and appears in the list
it was added from. Creating stays the source feature's `manage`; a view's own grant is
`read` only.

## The map

`pinsFor()` makes one `MapPin` per address with coordinates, named after its record.
`MapView` (`src/lib/components/map-view/`) draws them as one clustered MapLibre GL layer:
a click on a cluster zooms into it, a click on a pin opens `MapView.Popup` naming the
record, coloured from the `app.css` tokens and framed to the pins. The library is loaded
inside the attachment — it touches `window` on import, so a top-level import would break
the server render — and lands in its own chunk.

The map is a style URL, and a second one for the dark theme: both are constants in
`mapConfig()` (`src/lib/map.ts`) — OpenFreeMap's Liberty and Dark styles, which need no
key and no account, so a clone draws a map with nothing to configure. `mapOrigins()`
derives the origins from the same URLs and `hooks.server.ts` hands them to the CSP —
`connect-src` and `img-src`, since MapLibre fetches the style, tiles, glyphs and sprite —
the way the Supabase origin is derived there, so changing the style is those two lines and
the CSP follows. The style's tiles, glyphs and sprite must come from the style URL's own
origin (true of OpenFreeMap and of the MapLibre demo style).

## Geocoding

Coordinates come from `geocode()` in `src/lib/server/geocode.ts`, called by the record
page's address action when an address is saved. `GEOCODER_URL` is a template with
`{query}` (and `{key}` for `GEOCODER_API_KEY`) answering Nominatim-style JSON, so one
variable picks the provider; `GEOCODER_USER_AGENT` names the app to public Nominatim.
Unconfigured, down or stumped, the geocoder reports failure and the address still saves
with null coordinates — a pin is a courtesy the map needs, never a condition of saving.
The seed carries coordinates for its fixtures so the maps have pins with no provider set.

## Later: per-org saved views

Attio-style views a member creates are a deliberate next step, not built. They will be a
tenant table in the canonical shape (`org_id`, RLS through `private.org_role()`) carrying
the same `source`, `filter`, `columns` and `layouts` columns, parsed by the same
`VIEW_FILTER_SCHEMAS` and drawn by the same page — resolved after the reference registry.
Nothing here needs to change for that.
