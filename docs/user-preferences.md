# Settings: three axes, and where each one lives

A running app accumulates switches. "Show me the notes rail." "Dark theme." "This
organization doesn't use tickets." They feel like one category — _settings_ — and
they are three, with three different homes. Putting one in the wrong home is not a
style mistake: it is the difference between a switch that follows you to a new laptop
and one that doesn't, and between a screen that renders right on the first paint and
one that flickers.

## The three axes

| Axis                   | Whose is it?                  | Where it lives                                                             | Who changes it                             |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| **Organization**       | The org's — everyone sees it  | The feature registry (`organization_disabled_features`, tiers, industries) | An owner or admin, at `/settings/features` |
| **Account preference** | Yours, everywhere you sign in | `user_preferences`, one row per key                                        | You, at `/settings/preferences`            |
| **Device preference**  | Yours, on this machine only   | The browser: `localStorage`, or a cookie                                   | You, wherever the control is               |

The axes compose, and they compose in one direction: **the org decides what exists,
your account decides how you work with it, the device decides how it looks right
here.** An account preference about a feature the org switched off is not wrong, it is
simply moot — and the setting is not offered while that is true, rather than being
offered and doing nothing.

## Which axis is this switch?

Four questions, in order. The first one that answers yes decides it.

1. **Would it apply to a colleague who never touched it?** Then it is the
   organization's, and it is not a preference at all — it belongs in the feature
   registry, where the route gate and the nav already read it. "We don't use
   tickets" is this.
2. **Would you want it different on your laptop and your desktop?** Then it is a
   device preference. Theme is the honest example: the same person wants dark at
   night on the sofa and light in a bright office, and syncing that across machines
   would be a bug, not a feature.
3. **Does the browser have to answer before the server can render?** Then it is a
   device preference stored in a **cookie**, because a cookie is the only browser
   storage the server can read on the first request. The sidebar's collapsed state is
   this: read from `sidebar:state` in the `(app)` layout load so a collapsed sidebar
   renders collapsed instead of expanding and snapping shut.
4. **Otherwise it is an account preference.** It is about how _you_ work, it should
   follow you, and it costs one row.

Note what question 3 does _not_ say. An account preference also arrives before the
first paint — it is loaded server-side with the session and shipped in layout data —
so "no flash" is not a reason to reach for a cookie. Cookies are for the device
preferences the server needs, and nothing else: they ride on every single request,
including every image and data fetch, which is a real cost that `localStorage` does
not have.

## Device preferences

Two stores, one rule: **a cookie when the server needs it, `localStorage` when it
doesn't.**

- `localStorage` — `src/lib/theme.svelte.ts` is the pattern: a module-level runes
  object, seeded from storage inside a `browser` guard, writing back on every change.
  Import it and read `.current`; never read `localStorage` from a component.
- A cookie — `SIDEBAR_COOKIE_NAME` in `src/lib/components/ui/sidebar/constants.js`,
  written by the sidebar and read in the `(app)` layout load.

Both must survive their storage being empty or throwing. A private window, cleared
site data, or a browser configured to block storage all produce "no value", and the
answer is always the documented default — never a crash and never a blank screen.
Theme's fallback is the OS's `prefers-color-scheme`, which is the best kind of
default: the machine already knows.

A device preference is **never** the place for anything you would be annoyed to lose.
It is chrome, not data.

## Account preferences

One table, `user_preferences`: `(user_id, key)` as the primary key, a `jsonb` value,
and RLS that lets you read and write **only your own rows** — no policy anywhere
grants a user another user's preferences, not even an org owner's.

The keys are a registry in `src/lib/preferences.ts`, exactly the way `FEATURE_IDS` is
a registry: the app knows every key at build time, so a typo is a `check` error rather
than a preference that silently never loads. Each entry declares three things and
optionally a fourth:

```ts
'notes.dock': {
  schema: z.boolean(),        // what a valid value is — parsed on the way in AND out
  fallback: true,             // what the app does when nobody has said otherwise
  label: 'Notes rail',        // what the settings page calls it
  feature: 'notes'            // only offered when that feature is on for the org
}
```

Three properties follow from that shape and are worth stating:

- **A missing row is not an error, it is the default.** Preferences are read as "the
  rows that exist, folded over the fallbacks", so a brand-new user needs no
  provisioning, and adding a key ships working defaults to everyone with no backfill.
- **The value is parsed at both boundaries.** The database cannot type-check a
  `jsonb` per key, so the registry's zod schema does — on write, and again on read.
  A row that predates a key's schema change reads as the fallback instead of poisoning
  the page.
- **One key changes with one write.** A row per key rather than a blob per user, so
  two tabs setting two different preferences cannot clobber each other, which a
  read-modify-write of one JSON document would do.

They are loaded once per request in the `(app)` layout and shipped as `preferences`,
so any page or component reads `page.data.preferences.<key>` with no round trip of
its own. Writing goes through a form action on `/settings/preferences` — a page-owned
mutation, so it is a form action like every other one, not an endpoint.

## Why the notes rail is an account preference

Walking the questions:

1. Would it apply to a colleague who never touched it? **No** — one person wanting the
   rail says nothing about anyone else. (The org axis for notes already exists and is
   a different switch: an owner turning the notes _feature_ off at
   `/settings/features` takes the page, the nav entry and the rail from everyone.)
2. Different on a laptop and a desktop? **Not really.** It is a working habit, not a
   property of the screen — and the rail is already hidden below `md`, which is the
   part that genuinely is about the machine.
3. Needed before the first paint? Yes, but that does not make it a cookie: it is
   loaded with the session and shipped in layout data, so it never flashes.
4. So: **account preference**, `notes.dock`.

Two consequences worth spelling out, because they are what makes the setting honest:

- **The rail is chrome; the feature is the notes.** Turning the rail off does not turn
  notes off. `/notes` still exists, the sidebar entry still works, and `⌥⌘L` still
  opens every note — the dock component stays mounted for exactly that reason, and
  renders no rail rather than not existing. Hiding a shortcut along with a decoration
  would be a surprise, and surprises in a preference are how people stop trusting
  preferences.
- **A preference for a feature you don't have is not shown.** The `feature` field on
  the registry entry is checked against the same resolved feature map the nav and the
  route gate read, so when an org has notes disabled — or the user has no read grant —
  the row is absent from the settings page instead of sitting there doing nothing.

## Adding one

1. A key in `PREFERENCES` (`src/lib/preferences.ts`) with its schema, fallback, label
   and — if it belongs to a feature — that feature's id.
2. Nothing else. No migration: the table is key/value, and a key with no rows is
   every user on the fallback. No settings-page edit either: the page renders the
   registry.

That is the whole reason this is a registry rather than a column per preference. A
column would be a migration, a generated-types regeneration and a form field for every
switch — and switches are exactly the thing a product accumulates dozens of.

## Deliberately not here (yet)

- **Per-organization account preferences.** Today a preference is one value per user,
  full stop. "Which pipeline do I default to in _this_ org" wants `(user_id, org_id,
key)`; the table can grow an `org_id` with null meaning global, and the registry an
  `orgScoped: true`. Nothing yet needs it, and adding the column later is a migration
  with no data to move.
- **An admin seeing or setting somebody's preferences.** No policy grants it, on
  purpose. If support ever needs it, it is a service-role read, not a widened policy.
- **Syncing device preferences to the account.** Theme could become "follow the
  account, unless this device says otherwise" — a two-layer read. That is a real
  feature, and it is not this one; today theme is device-only and says so on the
  settings page.
