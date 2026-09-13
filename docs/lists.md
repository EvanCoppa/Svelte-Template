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

`field` is one of two things:

- **a catalog key** — `status`, `city`, `company` — from the kind's entry in
  `LIST_FIELD_CATALOG` (`src/lib/lists/catalog.ts`), which says what each key renders
  as and, for an enum, the values a filter offers.
- **`custom:<key>`** — a custom field definition of the kind, named by its `key`.
  Definitions are an org's rows (`custom_field_definitions`), so an industry names
  them by key: every org in the industry that has declared the field gets the column,
  and one that has not simply does not (the resolver drops the row, never errors).

**Extra custom fields.** A custom field the org declared that no row names is still
part of the kind's list — appended after the listed fields, in label order, neither
searched nor filtered — and the definition's own `is_default_shown` flag
(`custom_field_default_shown` migration) says whether it starts as a visible column
or waits behind the table's View menu. An org therefore puts a field on its own table
with no migration at all; a row naming the field wins over the flag.

Four flags, one meaning each: `shown` is a column on the table (a hidden field still
searches and filters, and the reader can switch it on from `ViewOptions`);
`searchable` puts it under the search box; `filterable` gives it a multi-select in the
toolbar; `sort_order` is multiples of 100 restarting at 100 per list, the
`nav_sort_order` convention, so an industry slots a field between two others without
renumbering. `name` is every list's first column and the link into the record whatever
the rows say.

## Resolution

`resolveList(kind, featureId, registry, industryId, customFields)` in
`src/lib/lists/resolve.ts` is pure and client-safe, the shape of `resolveFeatures()`:

1. the list's default rows, then the active industry's rows applied over them, null
   inheriting column by column — an added row's nulls read as a default row would
   (shown, not searched, not filtered, last);
2. each row becomes a `ListField`: a catalog key takes its type, label and options from
   the catalog; a `custom:<key>` takes them from the org's definition (`text` → text,
   `numeric` → number, `boolean` → yes/no, `select` → an enum of its allowed values),
   and is dropped when the org has no such definition;
3. `name` is forced first and shown.

What the database cannot check is checked here and **throws with the list's id**: a key
the catalog does not have, a filter on a field that cannot be one. A filter is a
multi-select of values, so only a `text`, `enum`, `boolean`, `record` or `payment`
field can be filtered (`FILTERABLE_TYPES`); an amount or a date cannot. A throw is a
migration that shipped a bad row, and a 500 is the right answer to that, the way
`resolveView()` refuses a bad filter.

## The page never learns the source

The server describes; the page draws. `describeListRows()`
(`src/lib/server/crm/lists.ts`) turns each row into a `ListRow` of cells **typed by
how they render** — `link`, `status`, `record`, `text`, `number`, `money`, `boolean`,
`date`, `datetime`, `payment` — the rule `RecordDetail` follows on the record page. A
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

## The industries that are not the default

Two ship today, both in the `list_fields` migration:

| industry            | list      | what the rows say                                                                                                                               |
| ------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `merchant-services` | companies | `custom:mid` shown and searchable; `custom:mcc` and `custom:current_processor` filterable; `custom:average_ticket` shown; `relationship` hidden |
| `beverage`          | assets    | `custom:location` filterable and `custom:serial_number` searchable, between the name and the status; `purchase_price` hidden                    |

The seed declares the matching custom fields for the fixture orgs (Keystone Payments,
Cobalt Merchant Services, Marigold Beverage Co), so both lists show their columns after
a reset. An org in either industry that never declared the field sees the default
columns and nothing else.

## Adding a field, after this

- **A built-in column on a list**: make sure the kind's catalog entry has the key and
  `describeListRows()` fills it, then insert its `list_fields` row. A key with no
  describer branch is a `check` error, not a blank column.
- **A custom field on an industry's list**: no code — insert an `industry_list_fields`
  row naming `custom:<key>`. Every org in that industry that has declared the field
  sees it.
- **An org's own custom field on its own list**: nothing at all — every declared field
  is already a column; set `is_default_shown` on the definition to have it start
  visible.
- **An industry that wants a default column hidden, searchable, or renamed**: one
  `industry_list_fields` row setting only that column, the rest null.
- **A new kind of list**: add the kind to `LIST_KINDS`, its catalog entry, a branch in
  `listRecords()` and `describeListRows()`, and its default rows.

Nothing is per org: an org that wants its own column set asks for a migration, like a
feature's name. Per-org saved column sets are a later phase and would be a tenant table
of the same shape, resolved after these.
