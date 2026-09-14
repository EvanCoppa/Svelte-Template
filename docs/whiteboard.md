# The whiteboard

One canvas to think on, at `/whiteboard`. Boxes, ellipses, arrows, lines, handwriting
and labels — enough to sketch a layout, a funnel or a wiring diagram next to the app
that will implement it, and deliberately no more.

It is the only page in the app that **keeps nothing the organization can read**. Every
other screen is a view onto tenant-scoped rows behind RLS; this one is a drawing in
the reader's own browser. That single decision is what the rest of this document is
about, because it is what makes the feature small.

## Where a board lives, and why that is not the database

A board is **device-axis data** (docs/user-preferences.md): `localStorage`, alongside
the theme, the sidebar's collapsed state and the per-page list/board choice. The three
axes and the question that picks one:

| The question                                                 | The axis     | Where                     |
| ------------------------------------------------------------ | ------------ | ------------------------- |
| Would it apply to a colleague who never touched it?          | organization | the feature registry      |
| Would you want it different on your laptop and your desktop? | device       | `localStorage` / a cookie |
| Otherwise                                                    | account      | `user_preferences`        |

A sketch answers the middle question. Nothing else in the app reads it, no colleague
sees it, the organization has no opinion about it, and losing it costs a drawing rather
than a record — which is exactly the bargain the device axis strikes everywhere else.
So there is **no table, no RLS policy, no `org_id`, no query key and nothing to
invalidate**, and the page has no load function and no form action. `db:types` is
unaffected because no schema changed.

`src/lib/whiteboard/board.svelte.ts` is the whole of the storage, modelled on
`$lib/theme.svelte.ts` for the writing and `$lib/breadcrumbs.svelte.ts` for reading it
back safely. It is keyed **by user** (`whiteboard:<user id>`), not by organization:
every other device-axis value belongs to the machine rather than the tenant, and
switching org should not hand you a different pad — but two people signing in to the
same browser must not draw on each other's board. Storage that is disabled, full or
cleared reads as "no value", and the documented default is an empty canvas.

**If a board should ever be shared** — one canvas an org draws on together — that is a
different feature with a different promise: a tenant-scoped table on the canonical
shape, RLS on, realtime, and a name that says whose board it is. It is not this one
growing a table.

## The page is still registered like every other

Device storage changes nothing about how the page joins the app. A page here is gated
**by being in the registry**, never by a check in its load, so the whiteboard arrives
the same way as the graph or the ledger — the `whiteboard` migration inserts its
`features` row (filed under Tools, last at 400), its `pages` row, an
`industry_features` row for every industry, `tier_features` for all three plans, and a
`read` grant for every role; `FEATURE_IDS` gains its id and `icons.ts` its slug.

That is what gives it a sidebar entry, a ⌘K entry, its `<title>`, its breadcrumb, and
an org's ability to switch it off at `/settings/features`. Nothing in `navigation.ts`
changed.

`read` is the **only** grant, and the migration says why: `manage` and `delete` exist
to say who may write and who may destroy rows other people can see, and a board has no
rows and no other people. Whoever can open the page can draw on their own board and
cannot reach anyone else's.

No industry renames or reorders it. Sketching is not a vertical's speciality, and every
industry that orders its own Tools section does so within 100–300, so a null
`sort_order` inherits the feature's 400 and the pad closes that section everywhere
without a row per industry.

## The four files, and what each one knows

| File                                       | Knows                                                        |
| ------------------------------------------ | ------------------------------------------------------------ |
| `src/lib/whiteboard/scene.ts`              | what an element is, and the pure geometry (no DOM, no state) |
| `src/lib/whiteboard/board.svelte.ts`       | the scene in `localStorage`, plus undo history               |
| `src/lib/components/whiteboard/`           | the canvas and the toolbar parts (no storage, no board)      |
| `src/routes/(app)/whiteboard/+page.svelte` | owns all of it and wires them together                       |

### Every element is a box

A scene is a flat, ordered list — first drawn is furthest back — and **every element is
a box**: `(x, y)` with a `(w, h)` that may be negative, because a box dragged up and to
the left is still the box you dragged. That is the one deliberate simplification in the
model, and it is what lets selecting, moving and hit-testing be **one code path rather
than one per kind**: a rectangle's box is its outline, an ellipse's is what it is
inscribed in, a line's is the diagonal between its ends, a stroke's is the extent of its
points, a label's is what the canvas measured its text at. Nothing normalises those
signs — `boundsOf()` reads them when a caller needs a corner and a size.

A stroke's `points` are stored **relative to its box**, so dragging a thousand-point
scribble is two numbers. `points` and `text` carry schema defaults rather than being
optional, so every consumer gets the same element type instead of narrowing a union on
a field that may be absent.

A kind is named `kind`, the word the rest of the app already uses for "which sort of
thing this is" (`RecordKind`, `products.kind`).

### Colours are tokens, never hex

An ink stores a **name** (`ink`, `red`, `amber`, `green`, `blue`, `violet`) and
`INK_TOKENS` maps each to an `app.css` custom property — `ink` is `--foreground`, the
rest are the chart tokens. The canvas resolves them with `getComputedStyle` and re-reads
them when the theme flips, so a board sketched in the light theme is legible in the dark
one with nothing stored per theme, and the palette dot and the stroke can never disagree
about what a colour is.

### A stored scene is validated on the way in

`parseScene()` reads `localStorage` through a zod schema whose `version` is a
`literal`. Bad JSON, a scene from a future build, and a key some other program left
behind all arrive as the empty board rather than a half-understood one — the same rule
account preferences follow. NaN and Infinity need no guard: `JSON.stringify` writes both
as `null`, which is not a number, so neither can come back.

## The canvas draws; the page decides

`Whiteboard.Root` is a compound component (the `compound-components` skill) and the
page owns the data. The split that matters:

- **A gesture under the pointer is the component's alone.** A rectangle being dragged
  out has no id, no history and nothing in storage, because it is not yet a thing on the
  board. The component draws it as a live preview built by the same function that will
  build the real element, so what you see is what you get.
- **A finished gesture leaves as one element** through `oncommit`, and the page hands it
  to the board store. So one gesture is one history entry and one write — which is why
  undo undoes a stroke rather than a pointer event, and why a scribble does not write to
  `localStorage` a thousand times.

The callbacks are `oncommit` / `onpick` / `ondelete` rather than the names they
resemble: the component's container is a `div`, and a `div`'s own `onchange` and
`onselect` already mean other things.

`view` (pan and zoom) is `$bindable`, so the page can show the zoom percentage and put
the view back; it is the one piece of state that is genuinely "where the reader is
looking" rather than part of the drawing. Everything in `scene.ts` is in **board
units**; the canvas is the only place they meet screen pixels, in `toBoard()` and
`toScreen()`.

The toolbar is three plain parts the page fills — `Whiteboard.Toolbar`,
`Whiteboard.Tool`, `Whiteboard.Swatch` — so which tools exist, what they are called and
what each does is readable in the page's own markup. `Whiteboard.Tool` is used for the
tools, the two line weights and the fill switch: everything whose whole state is "this
one, or not". The weight control renders a line of the weight it picks, because the
control may as well be the thing it sets.

## Using it

| Gesture                     | Does                                                |
| --------------------------- | --------------------------------------------------- |
| drag with a drawing tool    | draws that element                                  |
| drag with select on a thing | moves it                                            |
| drag with select on nothing | pans the board                                      |
| middle-button drag          | pans, whatever the tool                             |
| wheel / trackpad            | scrolls the board                                   |
| ⌘/ctrl + wheel, pinch       | zooms about the pointer                             |
| double-click a label        | re-words it, in its own ink                         |
| `V R O A L P T`             | select, rectangle, ellipse, arrow, line, draw, text |
| `⌫` / `Delete`              | deletes what is selected                            |
| `Esc`                       | deselects                                           |
| `⌘Z` / `ctrl+Z`             | undoes one gesture                                  |

The tool stays selected after you draw, so a row of boxes is a row of drags. Emptying a
label deletes it. Undo history is in memory: a reload opens the board as it was left,
with nothing to undo.

Two things a canvas cannot do, and what is done instead: it is a picture to assistive
technology, so the element count and every label are mirrored as text beneath it; and a
drawing cannot be made with a keyboard, so no shortcut pretends otherwise — the keys
above pick tools and act on what is already there.

## Adding to it

A tool, an ink or a kind of element is app code and no migration: add the kind to
`ELEMENT_KINDS`, a `case` to the canvas's draw switch and its hit test, an entry to the
page's `TOOL_META`. An ink is a name in `INKS` and a token in `INK_TOKENS`. If a change
means an old board can no longer be read, bump `SCENE_VERSION` and every stored board
opens empty instead of wrong. Nothing about a drawing is ever a row, so nothing about a
drawing is ever a migration.
