# Imports: a spreadsheet in, records out

A business already keeps its catalog, its fee schedule and its client list in a
spreadsheet. `/import` brings one in: pick the kind of record the file holds, drop a
CSV or an Excel file, review every row as it would land, then write the rows you
approve. It is **one page, not an "Import" button on every list** — the picker lists
the kinds this session may import, and the page says, per kind, which columns the
file may have.

## The pieces

| where                           | what                                                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/schemas/imports.ts`    | the registry (`IMPORT_KINDS`, `IMPORT_SPECS`), the two form schemas, the preview and result types — client-safe             |
| `src/lib/imports.ts`            | the pure mapping: a header to a field, a cell to the string the form would post, the column guide's words, the template CSV |
| `src/lib/server/spreadsheet.ts` | one reader for CSV, TSV and Excel (SheetJS): the first sheet as a grid of strings, numbered as the sheet numbers its rows   |
| `src/lib/server/imports.ts`     | `previewImport()` (parse, map, validate, match — writes nothing) and `commitImport()` (write each row as decided)           |
| `src/lib/server/records.ts`     | `insertRecord()` / `updateRecord()` — the one place a row's strings become columns, shared with the "Add …" modal           |
| `src/lib/components/import/`    | `Import.DropZone`, `Import.ColumnGuide`, `Import.RowStatus`, `Import.RowDetails` — structural parts the page composes       |
| `src/routes/(app)/import/`      | the page: `?/preview` and `?/commit`, plus `template/[kind]` (a GET that answers with a starter CSV)                        |
| `imports` migration             | the feature row, its page row, every industry and tier, and `read` for every role that may `manage` anything                |

## An import is the create form, many rows at a time

A kind's importable columns **are** its `RECORD_FORMS` fields and its validation
**is** its `RECORD_SCHEMAS` entry. A value the "Add …" modal would refuse is refused
here with the same message; a field added to the form is importable with no second
list; and a row is written through the same `insertRecord()` the modal posts to. The
registry adds only what a spreadsheet needs and a form does not:

- **`aliases`** — the other header names a column is recognised under. Headers are
  compared by `normalizeHeader()` (case, spacing and punctuation dropped), so "Unit
  Price", "unit_price" and "UNIT-PRICE" are one, and a roofer's "Price" or a
  dentist's "CDT code" lands where it should. The first header wins a field; the
  second is ignored and listed. A header nothing answers to maps to null and the
  preview names it, so a typo'd column is noticed rather than silently dropped.
- **`key`** — the field that says two rows are the same record: a product's SKU, a
  billable's code, a contact's email, an asset's identifier, a company's name.

Cells are coerced before validation (`coerceCell()`): `$1,200.50` is an amount,
`Service` or `SERVICE` is the `service` option, `Yes`/`x`/`1` is `true` for a yes/no
select, `3/1/2024` is `2024-03-01`. Anything else passes through as typed for the
schema to refuse with its own message.

## What the preview says of a row

| status      | means                                                                              | imported?                            |
| ----------- | ---------------------------------------------------------------------------------- | ------------------------------------ |
| `new`       | no record like it                                                                  | yes, unless the reader skips it      |
| `match`     | a record like it exists; the preview lists every field the file would change on it | overwrite it, add beside it, or skip |
| `invalid`   | a value the kind's schema refuses (the errors are listed per field)                | never                                |
| `duplicate` | a second row for the same record inside the file (the first one is the import)     | never                                |

Matching (`findMatch()`): the row's **key**, compared trimmed and case-insensitively,
finds the org's record with that key. Only when the row or the record has **no key**
does the **name** stand in — so a row whose SKU is new is a new product even if a
product of that name exists with another SKU, while a list with no codes still updates
rather than doubles the catalog. The matched key is never listed as a change (`d2740`
is the code `D2740`); a blank cell is never a change either, because a blank cell keeps
the existing value.

A required field no header maps to (`missingRequired`) blocks the whole file: every row
is invalid without it, and the page says which column to add.

## The two actions

**`preview`** posts the kind and the file as multipart (`importUploadSchema`,
`z.instanceof(File)`, `allowFiles: true` on the server, `withFiles()` on the way back
so the file never rides to the browser). It answers with the preview beside the form and
writes nothing. A file that is not a spreadsheet, is empty, or has more than
`MAX_IMPORT_ROWS` rows fails with the reader's message on the form.

**`commit`** posts the rows back as JSON (`dataType: 'json'`, so it needs JavaScript —
the drop zone does too) with a decision on each: `create`, `update` (with the id of the
record to overwrite) or `skip`. Every row is validated again against the kind's
schema — the preview's word is not trusted — and written on its own, at
`WRITE_CONCURRENCY` at a time, so one refused row (a SKU another row already took, a
policy refusal) is one line in the result rather than a lost file. An `update` writes
**only the fields the file provided and filled in**, through `updateRecord()` and the
same column builders as the insert. The result says how many were added, overwritten,
skipped and failed, and the page invalidates the list the rows landed in.

Both actions check what adding one record checks: the kind's feature `enabled` for the
org and `manage` held on it (`requireImportable()`). The `imports` feature itself needs
only `read`, granted by migration to every role that may manage anything.

## Adding a kind

1. Its kind is in `RECORD_FORMS` / `RECORD_SCHEMAS` already — every import is a record
   form — and every field is named after its column.
2. Add it to `IMPORT_KINDS` and give it an `IMPORT_SPECS` entry: its `key` and its
   `aliases`.
3. Add its rows to `listRows()` in `$lib/server/imports.ts` and its `case` to
   `updateRecord()` in `$lib/server/records.ts` (the column builder already exists for
   the insert).
4. Pin its matching in `imports.test.ts`.

Nothing on the page changes: the picker, the column guide, the template and the preview
all read the registry.
