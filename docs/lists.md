# Lists: a list is its fields, and the industry chooses them

Every list page — `/companies`, `/assets`, `/invoices`, and every view — is the page
heading, a toolbar, and a table. The toolbar is a search box and a filter for each
column worth filtering; the table is the columns. Which columns, which of them the
search box scans, and which get a filter is **not a fact about the code**: a beverage
distributor's Assets page is a page of taps and coolers with a serial number and a
route, both custom fields the org declared, and a merchant-services book of companies
leads with each merchant's MID and is filtered by its MCC. Neither column exists in
`assets` or `companies`, so no page file can name them. The fields of a list are
**rows**, resolved per industry exactly as a feature's name and its sidebar position
are.

The `list_fields` migration (`supabase/migrations/20260912090000_list_fields.sql`) is
the implementation; the client side is `src/lib/lists/`, the server side is
`src/lib/server/crm/lists.ts` + `src/lib/server/lists.ts`, and the chrome is
`DataTable.Toolbar` / `Search` / `Filters` in `src/lib/components/data-table/`.

## The tables

Reference data, written by migrations and only read by the browser, like `features`.

| table                  | one row means                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_fields`          | one default field of one list: `feature_id` (the feature that owns the list page), `field`, `label`, `shown`, `searchable`, `filterable`, `sort_order`          |
| `industry_list_fields` | an industry's own say on that field — every column nullable, null inheriting the default's column by column; a row for a field the defaults do not list adds it |

A list is keyed by **the feature that owns its page**: a kind's own feature
(`assets`, `companies`) or a view's id (`suppliers`). A view is a feature, so the two
need nothing different — and `views.columns` is gone: a view's columns are its
`list_fields` rows, so a column is declared in exactly one place.

`field` is a key from the kind's entry in `LIST_FIELD_CATALOG`
(`src/lib/lists/catalog.ts`) — a **built-in column**, which is what the catalog says each
key renders as and, for an enum, the values a filter offers. Three flags, one meaning
each: `shown` is a column on the table (a hidden field still searches and filters, and
the reader can switch it on from `ViewOptions`); `searchable` puts it under the search
box; `filterable` gives it a multi-select in the toolbar. `sort_order` is multiples of
100 restarting at 100 per list, the `nav_sort_order` convention, so an industry slots a
field between two others without renumbering. `name` is every list's first column and
the link into the record whatever the rows say.

## A picture is a field, not a second table

The products list shows each product's `image_url` as a thumbnail, and that is a **row
like any other** (`('products', 'image', …, 150)`) rather than a column hand-written into
`/products` or a second data table beside `DataTable`. It cost one field **type**:
`image`, whose cell is `{ type: 'image'; url: string | null }` and whose column is drawn
by `DataTable.imageCell()`. A catalog is the one list where the picture is the
identifying fact — a reader scanning aligners or fittings recognises the thing before
reading its name — so it sits immediately after the name, at `sort_order` 150.

An `image` is a picture rather than a value, which decides everything the toolbar does
with it: it is not in `FILTERABLE_TYPES` (the resolver throws on a row that asks), it
holds no text for the search box (`cellText()` reads it as blank) and nothing to order
rows by, so its header is the label alone rather than a sort button. It is still a
column: `ViewOptions` toggles it, and an industry that sells hours rather than objects
hides it with one `industry_list_fields` row. A record with no picture draws a
placeholder tile of the same size, not a dash, so the column keeps a straight edge.

**A URL is not automatically loadable.** `img-src` admits `'self'`, Supabase and nothing
else, so imagery hosted anywhere else needs its origin in `PUBLIC_IMAGE_ORIGINS`
(`imageOrigins()` in `src/lib/server/security-headers.ts`, fed to the CSP from
`hooks.server.ts` exactly as the map's origins are). Unset — the default — means Supabase
Storage only.

Another kind joins by adding `image` to its catalog entry, a branch in
`describeListRows()`, and its own `list_fields` row. Nothing else.

## Custom fields: the industry ships them, and each one says how it sits

A custom field is never named in `list_fields`. Instead (`industry_custom_fields`
migration):

| table                      | one row means                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `industry_custom_fields`   | a field an industry ships for a kind of record — key, label, type, choices — and how it sits on the kind's list              |
| `custom_field_definitions` | the org's fields, as before, now each carrying the same three list flags: `list_shown`, `list_searchable`, `list_filterable` |

Every org in an industry gets the industry's fields as its own definitions — copied by
trigger when the org is created (and when its industry changes), and by backfill for the
orgs that already exist — and the org adds its own on top, or renames and re-flags a
shipped one. The copy is a starting point, not a link: a later change to a template
reaches new orgs only. **Every custom field of the kind is a column of its list**, drawn
after the built-ins in label order; the flags say whether it starts shown, whether the
search box scans it, and whether it gets a filter. A filter needs values to pick from,
so only a text, select or boolean field can be one — a check constraint refuses the flag
on a numeric field, and the resolver reads it as off regardless.

## Resolution

`resolveList(kind, featureId, registry, industryId, customFields)` in
`src/lib/lists/resolve.ts` is pure and client-safe, the shape of `resolveFeatures()`:

1. the list's default rows, then the active industry's rows applied over them, null
   inheriting column by column — an added row's nulls read as a default row would
   (shown, not searched, not filtered, last);
2. each row becomes a built-in `ListField`, taking its type, label and options from the
   catalog; `name` is forced first and shown;
3. every custom field of the kind follows, as a `ListField` from its definition (`text`
   → text, `numeric` → number, `boolean` → yes/no, `select` → an enum of its allowed
   values), flagged as the definition says, its column id `custom:<key>` so a custom
   `status` never collides with the built-in one.

What the database cannot check is checked here and **throws with the list's id**: a key
the catalog does not have, a filter on a built-in field that cannot be one. A filter is
a multi-select of values, so only a `text`, `enum`, `boolean`, `record` or `payment`
field can be filtered (`FILTERABLE_TYPES`); an amount or a date cannot. A throw is a
migration that shipped a bad row, and a 500 is the right answer to that, the way
`resolveView()` refuses a bad filter. A custom field's flags are an org's data and never
a 500.

## The page never learns the source

The server describes; the page draws. `describeListRows()`
(`src/lib/server/crm/lists.ts`) turns each row into a `ListRow` of cells **typed by
how they render** — `link`, `status`, `record`, `text`, `image`, `number`, `money`,
`boolean`, `date`, `datetime`, `payment` — the rule `RecordDetail` follows on the record
page. A
built-in field is a switch on the kind's catalog key (so a key the catalog has and the
describer cannot fill is a `check` error); a custom field is read from the values
fetched for the rows, in the column its definition's type names. A name or a party
links only when `passesFeatureGate()` says the reader may open that kind.

`loadRecordList(locals, kind)` (`src/lib/server/lists.ts`) is a list page's whole
load: it reads the kind through its own module (`listRecords()`), resolves the spec,
reads the addresses only when the spec has a `city` and the custom values only when it
has a custom field (`listNeeds()`), and returns `{ list: { spec, rows } }`. A view's
load runs its filter first and hands the rows in: `loadList(locals, view.id, result)`.

The page composes the same six lines everywhere:

```svelte
const table = createListTable(() => data.list, () => page.data.terms);

<DataTable.Root {table}>
	<DataTable.Toolbar>
		<DataTable.Search placeholder="Search {terms.plural}…" ariaLabel="Search {terms.plural}" />
		<DataTable.Filters />
		<DataTable.ViewOptions class="ms-auto" />
	</DataTable.Toolbar>
	<DataTable.Content emptyMessage="No {terms.plural} match." />
	<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
</DataTable.Root>
```

`createListTable()` (`src/lib/lists/table.ts`) turns each field into a TanStack column
that sorts by the cell's value (`cellSortValue()`), draws it by its type, is hidden to
start with when the field is not `shown`, opts into the search box with
`enableGlobalFilter` when `searchable`, and declares `meta.filter` when `filterable`. A
column's heading is fixed text or the word for a kind of record as the industry says
it (`fieldLabel()` reads the terms the layout shipped), never a constant.

## The toolbar

Three `DataTable` parts, all reading the table from context like `ViewOptions` does:

- **`DataTable.Toolbar`** is the row over the table — search first, filters after,
  whatever the page adds pushed to the end with `ms-auto` — wrapping on a narrow
  screen and keeping its own room below it so the controls never sit on the table's
  frame.
- **`DataTable.Search`** drives the table's global filter, which scans exactly the
  columns that opted in with `enableGlobalFilter`. A hand-written table (the staff
  roster) opts its one searchable column in and the rest out.
- **`DataTable.Filters`** draws a `DataTable.Filter` — a multi-select `Combobox` — for
  every column whose `meta.filter` is set, in column order. The values are the
  column's own (`meta.filter.options`: an enum's values toned from the shared maps, a
  select field's allowed values) or, when the column names none, every distinct value
  the rows on screen hold — so a free-text type, an org-defined stage or a category
  filters without anyone listing its values, and a blank reads as "Empty". Every
  filter compares with `oneOf`, the one filter function in the preset for the job.

All of it is client state over rows the load already shipped, like sorting and paging:
the table holds every row of the kind, and nothing is refetched to narrow it. Nothing
goes in the URL.

## A row that opens

Some records are made of other records: an order and the shipments and invoices
against it, a proposal and its options. A list of them has two things to show at once
— the record, and what it is made of — and the answer is **more rows of the same
table**, not a second grid inside a cell. That is what keeps a nested value under the
column it belongs to, and what lets hiding a column from `ViewOptions`, pinning the
first one or scrolling sideways move the nested rows with the rest. Three parts, on
top of the table any list page already builds:

- **`DataTable.expandColumn(columnHelper, label)`** is the chevron, first in the
  columns — before the checkbox, since both are controls on the row rather than
  columns of data (`pinnedColumnCount()` pins them together with the first real
  column). `label` names the row for the button's screen-reader label; it is the rest
  of "Show …" / "Hide …". Which rows can open at all is the table's own
  `getRowCanExpand`, so a record with nothing under it has no dead control.
- **`DataTable.Content`'s `detail` snippet** is what an open row shows, drawn straight
  after it and handed that row's record. It is rendered only while the row is open.
- **`DataTable.SubSection`** is the heading over one run of nested rows — its label and
  count, or, with children instead, the sentence an open record with nothing under it
  says. **`DataTable.SubRow`** is one row of that run: its `cell` snippet is drawn once
  per column on screen and handed that column's id, and a column the nested row has no
  value for is simply left unsaid.

Both take a `divider` — the rule above them. `start` (a dashed rule) marks where the
record's own row ends and the rows it opened begin, `section` (a dotted one) separates
a later group from the one above it, and `row` is one more row of the group it is in.
It is drawn on the top edge because the table body already owns every cell's bottom
border.

Expansion is state on the table, not on the page: `rowExpandingFeature` is in the
shared `DataTable.features` preset, because `DataTable.Root` takes a
`SvelteTable<DataTableFeatures, TData>` and a table that registered the feature on its
own could not be handed to the parts. No `expandedRowModel` is registered — the rows an
open row shows are the page's own, not TanStack sub-rows, so nothing needs flattening
into the row model. `/components` → "Data table — a row that opens" is the reference.

## The industries that are not the default

Two ship today:

| industry            | custom fields (`industry_custom_fields`)                                                                     | built-in say (`industry_list_fields`) |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `merchant-services` | on companies: MID (shown, searchable), MCC and current processor (shown, filterable), average ticket (shown) | `relationship` hidden                 |
| `beverage`          | on assets: location (shown, filterable — a select of routes), serial number (shown, searchable)              | `purchase_price` hidden               |

The seed relies on the trigger: the fixture orgs (Keystone Payments, Cobalt Merchant
Services, Marigold Beverage Co) receive the definitions when they are inserted, and the
seeded values look each field up by key. Acme's own "Preferred channel" contact field is
flagged shown and filterable, the worked example of an org's field with no industry
behind it.

## Adding a field, after this

- **A built-in column on a list**: make sure the kind's catalog entry has the key and
  `describeListRows()` fills it, then insert its `list_fields` row. A key with no
  describer branch is a `check` error, not a blank column.
- **An industry that wants a built-in column hidden, searchable, or renamed**: one
  `industry_list_fields` row setting only that column, the rest null.
- **A custom field an industry ships**: one `industry_custom_fields` row with its three
  flags, plus the migration's backfill loop for the orgs already in the industry. No
  code.
- **An org's own custom field**: a definition with its flags. Nothing else — every
  declared field is already a column of its kind's list.
- **A new kind of list**: add the kind to `LIST_KINDS`, its catalog entry, a branch in
  `listRecords()` and `describeListRows()`, and its default rows.

Nothing about the built-in columns is per org: an org that wants its own built-in
column set asks for a migration, like a feature's name. Per-org saved column sets are a
later phase and would be a tenant table of the same shape, resolved after these.
