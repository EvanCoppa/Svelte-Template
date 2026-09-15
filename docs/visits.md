# Visits

> Somebody went somewhere, about one CRM record, and something came of it.

A door knocked, a roof walked, a cooler serviced, a flat shown. One table serves
all of them, and what the vertical **calls** it is a row in `industry_features`:
"Site visits" to a roofer, "Service calls" in beverage, "Field calls" to a
medical-supplies rep, "Showings" to a letting agent. Dentistry and cosmetic have
no row at all — a practice is where the patient comes _to_ — so the feature
resolves `hidden` there and does not exist as far as those orgs are concerned.

The moving parts:

- `supabase/migrations/20260919090100_visits.sql` — the tables, the invariant,
  the registry rows
- `supabase/migrations/20260919090200_industry_visit_fields.sql` — what each
  vertical asks about one
- `src/lib/crm/visits.ts` (+ test) — the client-safe half: which kinds you can
  go and see, what a visit is called, and how a device's fix travels
- `src/lib/server/crm/visits.ts` (+ test) — data access
- `src/routes/(app)/visits/` — the list page, which is the same two lines every
  list page is

## Why it is not an activity

The activities migration's own header lists "the site visit on Friday" among the
things `activities` covers, and for a visit that is only logged afterwards it
would be right. Three things make it a table instead, and each is a column that
could not live there:

- **It exists before it happens.** An activity is defined as a moment that
  already happened. A planned visit would sit on a record's timeline dated in
  the future.
- **Things point at it.** An activity is not a `crm_entity_type`, so nothing can
  name one. A visit is attended by members (a relationship), carries the
  industry's questions as custom fields, and holds the photographs that prove it
  happened.
- **It is a page.** A list, a toolbar, a record page and a grant ladder, all
  keyed by a feature that owns a route. Activities have no feature and no list.

Drop scheduling from the design and the first reason evaporates — that is the
one that forces the split.

## The subject is the entity link

A visit names `(entity_type, entity_id)`, **both not null**: a visit to nobody
cannot be found again, counted, or shown on the record it was to. The database
narrows the kinds to the ones you can go and see —

```sql
constraint visits_subject_is_visitable
  check (entity_type in ('company', 'contact', 'deal', 'property', 'asset'))
```

— mirrored by `VISIT_SUBJECT_KINDS` in `$lib/crm/visits.ts`. Widening is
replacing that one constraint and adding the kind to that array, exactly as
`addresses_entity_is_party` was widened for properties. Never a `company_id`
column: a service call is about an **asset**, a showing about a **property**, a
door knock about a **company**, and a home visit about a **contact** who belongs
to no company at all.

Because the link is what a visit points through, `deleting a company deletes its
visits` — there is nothing to detach to — and each of those deletes runs the
same cleanup for the visit's own activities, tags, custom values, images and
relationships.

**A visit has no name column.** It is named for its subject
(`visitName()`), the way a lease is named for what is rented and by whom. The
date is deliberately not folded in: formatting one is the browser's job, and the
list draws `occurred_at` as its own column beside the name.

## Where it sits, and when it happened

`status` (`planned` / `completed` / `missed`) says where the visit sits;
`occurred_at` says when it happened. They are not two ways to say the same
thing, and `private.visits_sync_occurrence()` holds the one relationship between
them — **`status = 'completed'` exactly when the timestamp is set** — so
`logVisit()` writes the timestamp, `setVisitStatus()` writes the status, and
neither knows the other column exists. This is the task board's invariant, for
the task board's reason: a constraint can only refuse a write, and what every
caller wants is the other column filled in for them.

There is no `cancelled`. A visit that was called off was not made, which is what
`missed` says, and **why** is a sentence in `notes` — a second unmade state is
how a status column stops being honest.

Two rules fall out and are enforced in the schema:

- You can only miss something that was on the plan, so `planned` and `missed`
  both require `scheduled_for` (`visits_planned_is_scheduled`).
- An outcome is what _came of_ it, so `outcome_id` needs an occurrence
  (`visits_outcome_needs_an_occurrence`), and un-logging a visit clears the
  outcome and the end time with it.

`ended_at` is **exclusive**, the calendar's rule, so time on site is one
subtraction and is never stored: a duration column plus two instants is two ways
to say the same thing and only one of them can be edited.

## The outcome is rows, the result is an enum

`visit_outcomes` is the org's own words for how a visit went — rows, for the
reason `pipeline_stages` are rows: a roofer's "Needs a second survey" and a
distributor's "Buyer not in" are not the same list. Every org gets five by
trigger (`create_default_visit_outcomes`), so nothing has to be configured
before the first visit is logged, and each carries a `tone` so the pill on the
list wears the colour the **org** gave it rather than one the code picked.

Each row folds onto `visit_result` — `engaged | no_contact | declined` — which
is the `stage_outcome` arrangement exactly: the words are the org's, the axis a
funnel counts on is ours.

## Who went

**Attendance is a relationship, not a column** (docs/tasks.md's rule, applied):
a crew is two technicians and a ride-along is a rep and their manager, and a
column could hold one of them. `attended_by` rows in the graph, one open row per
person, with `ended_on` set rather than deleted so a handover is history.

There are no typed helpers for it yet, on purpose: the record page's **generic
Relationships card** already draws, adds and removes every relationship, and
that is the one established way one is written. `describeVisit()` therefore has
no "Attended by" field — a second copy of a relationship as a record field is
exactly what the tasks rule forbids. Helpers like the task board's
`assignTask()` land in `$lib/server/crm/visits.ts` when a visit-specific screen
needs them, and not before.

`created_by` still records who typed the row up. That is a different fact, and
it stays a column.

## Where the visitor was

A visit stores the device's fix — `latitude`, `longitude`,
`location_accuracy_m` — not a postal address. The address belongs to the party
(`addresses`, geocoded, already on the map); this is evidence of attendance,
which is a different thing. The pair arrives together or not at all, and the
radius is meaningless without a point to put it around.

There is deliberately **no `location_source`**: the device is the only thing
that sets a location today, so the column would have exactly one value and
nothing to compare it against. It lands with the second way of setting one — a
pin dropped on the map, or an address geocoded.

A fix reaches the form as **one field**, because every record-form field posts a
string and neither half of a coordinate pair is separately typeable:
`"<lat>,<lng>"` with the accuracy appended when the device reported one.
`formatFix()` / `parseFix()` in `$lib/crm/visits.ts` are the one place that
shape is known, and `parseFix()` is strict — an action can be POSTed directly,
so a malformed value reads as "no location" rather than a wrong one. A visit is
worth keeping without a fix; a fix nobody can trust is worse than none.

## What the vertical asks is a custom field

`practice_size`, `roof_age_years`, `kegs_delivered`, `attendee_count` — none of
these is a column. Each is an `industry_custom_fields` row for
`entity_type = 'visit'`, copied into every org in the industry as its own
definition and editable from there. Because every definition carries
`list_shown` / `list_searchable` / `list_filterable`, each one is also a column
of the visits list with no code at all (docs/lists.md).

That is the half a bespoke field-visit table holds as columns, and the reason it
never generalises: five columns that are null for every business that is not the
one they were written for, and five more the next vertical would want.

## The form

Creating and editing both go through the **generic record form** — a
`RECORD_FORMS` entry, `visitRecordSchema`, and one `case` in each of
`writeRecord()` and `recordFormValues()`. Two field types are new:

- **`subject`** — a picker across every visitable kind, each option labelled
  with what it is. One question, not "pick a kind, then pick a record". Its
  value is `<kind>:<id>` (the ledger's `company:<id>` account key, generalised);
  `visitSubjectKey()` and `splitVisitSubject()` are the one place that pair is
  made and unmade, and a value it cannot split throws rather than guessing a
  kind — guessing would write the link at the wrong table and the database would
  accept it.
- **`geo`** — the fix, captured rather than typed: a "Use my location" button, a
  read-out of what it got, and a hidden input carrying the string. A refusal is
  reported beside the button and nothing is written, so the form is never
  blocked by a device that will not answer.

`outcome` is a picker of the org's own `visit_outcomes`, like a deal's stage.

## What is not here, on purpose

- **The follow-up.** A booked lunch, a second survey, the callback — that is a
  `calendar_events` row against the same record, or a task. Never a date column
  pair here, which holds exactly one of each and drifts out of step the moment
  either is moved.
- **Targets.** "25 doors a day" belongs to the organization rather than to a
  person, and nothing reads one yet: a limit nothing counts against reads as
  enforced. It lands with the screen that shows it.
- **A route** — a plan that _generates_ visits on a cadence. A real table, and
  it lands when something schedules from it.
- **Where the fix came from** — see above.
