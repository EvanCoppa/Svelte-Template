# Antinote in notes

Antinote's scratch-paper behaviour, added to the notes feature we already have. Nothing
else: no `@` record links, no `::` business actions, no documents, no autocomplete, no
dictation. Those are [notes-and-documents-plan.md](notes-and-documents-plan.md). This is
the part that makes a note feel like paper you can do arithmetic on, and it is
**one pure module, one gutter, and no migration**.

## What Antinote provides, and what of it travels

| Antinote                                                | here                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| reactive variables (`price = 37.50`, then `price * 25`) | **build** — the whole point                                             |
| contextual math (arithmetic with words around it)       | **build**                                                               |
| sum / average / count (items, lines, words)             | **build**                                                               |
| distance and weight conversion                          | **build** — fixed ratios, no network                                    |
| lists and checklists, checked off by keyword            | **build**                                                               |
| plain-text paste (strips formatting)                    | **build** — three lines, and the body is `text` anyway                  |
| currency and crypto conversion                          | **no** — needs live rates, so a network call per keystroke              |
| global hotkey                                           | **have** — `⌥⌘L`                                                        |
| search                                                  | **have** — `noteMatches()`                                              |
| themes, grid paper                                      | **have** — `badge_tone` and the app's own light/dark tokens             |
| export to TXT / Markdown                                | **have** — `notesToMarkdown()`                                          |
| auto-delete                                             | **have, differently** — we archive, and archiving is the better default |
| dock / menu bar / over-fullscreen modes                 | **no** — macOS window management; our dock is the answer to this        |
| screenshot-to-text, AutoPaste, timer                    | **no** — OS-level, not a text feature                                   |
| iCloud sync                                             | **no** — notes are server-backed and org-scoped already                 |

## The one rule

**The body is the source of truth and computed output never enters it.**

`notes.body` stays exactly what the user typed. Results render in a gutter beside the
textarea, derived on every keystroke and thrown away. That is not a style preference —
writing `= $937.50` into the text would break `noteLabel()` (a note is named by its first
line), change what `noteMatches()` searches and what `notesToMarkdown()` exports, and it
would mean editing text under a live caret inside the 250 ms autosave loop.

The **one** write the compute layer may make is toggling a checklist's single `[ ]` →
`[x]` character at a known offset.

## What to build

**1. `src/lib/editor/compute.ts` — pure, with a test beside it.**

Takes the body, returns one optional result per line. No `$app/*` imports, so it runs in
a node test like `$lib/notes.ts` and `$lib/calendar.ts` do.

```
parse   →  per line: a variable assignment, an expression, an aggregate, a conversion, or prose
resolve →  variables in order of definition; a later line sees an earlier one
evaluate → arithmetic, %, fixed-ratio conversions, sum/average/count over the lines above
format  →  money to 2dp, everything else to significant digits
```

Reactive falls out of this for free: the whole body is recomputed on every change, so
editing `price` updates every line below it without a dependency graph. A note is capped
at 20 000 characters, so there is nothing to optimise.

Prose is the common case and must stay silent — a line that is not clearly math gets no
result, and a wrong guess is worse than no answer. Division by zero, an undefined
variable and unit mismatches all produce a quiet dash, never a thrown error and never a
toast.

**2. The gutter, in `note-editor.svelte`.**

A read-only column beside the `<Textarea>`, one row per line, sharing its line-height and
font metrics. Empty for prose lines. It scrolls with the textarea and is
`aria-hidden` — the results are derived, and a screen reader reading every line twice is
worse than not reading the gutter at all. Give it a single `aria-live` summary instead
when a total exists.

Wrapped lines are the fiddly part and the reason to build this first: a long line
occupies two rows in the textarea and one entry in the gutter. Measure the rendered
rows rather than assuming a fixed line height — there is no helper for this, and
`DataTable`'s page-size measuring is the nearest thing in the repo to copy the shape of.

**3. Checklists.**

`- [ ]` is the convention, typed or inserted. Clicking the gutter's box rewrites that one
character and lets the existing autosave carry it. No new endpoint, no new column.

## Files

| file                                         | change                                    |
| -------------------------------------------- | ----------------------------------------- |
| `src/lib/editor/compute.ts`                  | new — the whole feature                   |
| `src/lib/editor/compute.test.ts`             | new — vitest, the reference for the rules |
| `src/lib/components/note/note-editor.svelte` | the gutter, and the checkbox click        |
| `src/lib/notes.ts`                           | nothing                                   |
| `supabase/migrations/`                       | **nothing**                               |
| `src/lib/database.types.ts`                  | **nothing**                               |

No new dependency. Write the evaluator; a math library is a bigger surface than the six
operations this needs, and it would have to be audited for how it handles a half-typed
expression on every keystroke.

## Done when

- A note computes `price = 37.50` / `price * 25` and shows `937.50`, and editing `price`
  updates the line below it.
- `sum` under a column of numbers totals them.
- Prose notes look and behave exactly as they do today — no gutter, no change.
- `noteLabel()`, `noteExcerpt()`, `noteMatches()` and `notesToMarkdown()` have no new
  tests, because nothing about them changed.
- `check`, `lint`, `lint:oxlint`, `knip` and `test` are at zero.
