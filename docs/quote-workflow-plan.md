# Quote intake and response — the plan

> **Status: a plan, not an implementation.** This document describes a future intake
> workflow. It does not add a `quotes` table, route, form, storage bucket, integration or
> UI. Decisions below are recommendations to discuss before the first slice is built.

The business needs a place to receive and work on requests for pricing. A request may be
for several products, a roofing job, payment-processing rates and percentages, or
something another vertical calls by a different name. The common shape is an inbound
request with a description and possibly files, followed by internal review and pricing.

The important boundary is that a **quote request is its own object**. It is not a
proposal, and it is not a deal. A proposal is a structured decision artifact that offers
options. A deal is the commercial opportunity or pipeline work that may follow. A quote
request is the submission and pricing work that starts before either of those exists.

## Product boundary and terminology

| Object            | What it means                                                                           | What it must not mean                                     |
| ----------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Quote request** | An inbound request, its source files and details, and the work of preparing a response. | An automatic sale, proposal, or CRM company/contact.      |
| **Proposal**      | A structured presentation of one or more options for someone to compare and choose.     | The intake envelope for every request.                    |
| **Deal**          | A tracked commercial opportunity or later customer work item in the deal pipeline.      | A synonym for an inbound request or a guaranteed outcome. |

The quote record should exist as soon as an intake submission is accepted, even when the
requester is anonymous, the vertical is not fully known, or the request is not yet worth
creating a company, contact, proposal or deal. The original submission remains attached
to that record as the source of truth; internal pricing and later response edits are
separate work on the record.

This distinction matters for existing industry vocabulary. Some verticals may currently
present proposals using a screen label such as “Quote” (see [proposals.md](proposals.md)
and [roofing.md](roofing.md)). If both concepts are exposed in one product, the UI should
choose unambiguous labels such as “Quote requests” for intake and “Proposals” or
“Estimates” for structured options. A display label may vary by industry, but the data
model must not alias the two objects.

## The universal quote record

The first design should have one small, queryable core and a vertical extension. The
following is a conceptual contract, not a migration prescription:

| Core value                 | Purpose                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `id`, tenant/org ownership | Stable identity and the normal organization boundary.                                   |
| `received_at`              | When the business accepted the submission, distinct from a source system's event time.  |
| submitted description      | The requester's free-text explanation of what they want. Preserve the original text.    |
| submitted files            | References to the uploaded documents, images or other files in the file model below.    |
| requester metadata         | Optional name, email, phone and other permitted contact details from the submission.    |
| source metadata            | Channel, source system, integration/account, external submission id and source times.   |
| `vertical_key`             | A stable classifier such as `payment-processing`, `roofing` or `product-quote`.         |
| lifecycle state            | The current quote-work state; it is not a deal stage.                                   |
| pricing/response fields    | Internal pricing values, response summary, validity and response timestamps as decided. |
| created/updated timestamps | Operational freshness, separate from the received time and source event time.           |

Pricing and response data should support both a simple answer and a later richer
breakdown. The core should be able to hold, when applicable, a currency, total or range,
pricing notes, assumptions, validity/expiration, response summary, response author and
response time. It should not force every vertical to represent its pricing as the same
line-item grid before that need is understood. Vertical pricing details can remain in the
extension payload until repeated cross-vertical reporting justifies a typed field.

The record should also retain operational fields for ownership and intake quality, such
as an unclaimed/claimed indicator, internal assignee, last reviewed time, spam or
quarantine disposition, and a reference to the intake attempt. These are workflow facts,
not requester-provided business facts, and should be distinguishable from the original
submission.

### Files and documents

Files should be separate child records rather than an array of opaque URLs on the quote.
Each file reference should retain at least:

- the quote id and organization id;
- the private storage object key, original filename, media type and byte size;
- a checksum or content fingerprint for duplicate detection;
- source file id/name when it came from a third-party system;
- upload/received time, scan/quarantine status and any safe-to-display time;
- retention/deletion metadata when policy requires it.

The uploaded bytes belong in private object storage, not in the database. The application
should issue short-lived, permission-checked access URLs or stream the file through an
authorized endpoint. A filename is display metadata, never a trusted path. Original
files should be immutable from the reviewer's perspective: replacing a document creates
a new child record and history entry so the business can distinguish what was submitted
from what was later added.

The design should allow a file to be marked as unsafe, unsupported or unavailable
without losing the quote record. A scan or import failure is a visible operational state,
not a reason to silently drop the submission.

### Proposed initial lifecycle

The following small state model is a discussion aid, not an implementation mandate:

```text
received → reviewing → needs information → reviewing
                         └──────────────→ priced → responded
                                                   ├→ accepted
                                                   ├→ declined
                                                   └→ expired
```

`received` means intake succeeded. `reviewing` means somebody has triaged it. `needs
information` means the current request cannot be priced responsibly. `priced` means an
internal pricing answer exists. `responded` means the business has recorded a response;
it does not imply that the response was delivered by this first intake slice. The terminal
states describe the response outcome, not deal-pipeline outcomes.

Every transition should record who or what caused it, when, and an optional reason. The
final vocabulary, whether `accepted` means “the requester accepted the quote” or only
“the business accepted the request,” needs an explicit product decision before build.

## Vertical-specific data without a giant schema

Use a universal core plus a versioned, validated extension keyed by `vertical_key`.
Vertical data should be inspectable and editable by the right workflow, but it should not
force unrelated industries to carry dozens of null columns. A sensible first boundary is:

1. Keep timestamps, source, description, state, ownership, files and common pricing facts
   in the universal core.
2. Store vertical-specific facts in an extension payload with a schema/version marker and
   a vertical-owned validation/rendering definition.
3. Promote an extension field to a typed universal field only when multiple verticals
   need to filter, sort, report or enforce the same concept.
4. Preserve unknown fields when a later version learns how to interpret them; an intake
   should not lose a submission because the UI does not yet know every field.

The extension is a place for vertical facts, not a dumping ground for core workflow
fields. Source metadata, lifecycle state and audit history remain queryable independently
of the extension.

Examples of information the vertical may collect, without prescribing a complete form:

| Vertical           | Likely extension information                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Payment processing | Current statements, processing volume, payment methods, current rates/fees, POS or gateway context, and business type.         |
| Roofing            | Property/job context, measurements, roof condition/materials, access constraints, insurance or claim context, and site photos. |
| Product/item quote | Requested products or SKUs, quantities, specifications, substitutions, delivery/location needs, and target timing.             |

The first intake form may collect only a vertical key and free text plus files. If a
vertical-specific form is available, it should add optional structured data rather than
make the universal form unusable. A request that does not fit a known vertical remains a
valid quote with an `other`/unclassified extension path for later triage.

## Intake channels and the inbound boundary

Quotes will arrive through more than the app's own screen: a web dropbox, embedded forms,
third-party tools, partner websites and future integrations. Those channels should feed a
stable inbound boundary with adapters behind it, rather than each integration writing
directly into the internal record shape.

```text
web dropbox ─┐
embedded form ├→ intake boundary → validate/quarantine → quote + files → internal review
third-party ─┘           └→ source/idempotency history
```

The boundary should establish the tenant and source before accepting a quote, normalize
the universal fields, retain the raw source envelope where allowed, and return a stable
submission identifier. The exact URL and transport are open decisions; the contract is
the important part. An adapter may translate a vendor's event into that contract, but it
must not bypass the same validation, deduplication, file-security or audit rules.

### Channel considerations

- **Web dropbox:** A public or semi-public form should identify the receiving organization
  through a non-secret routing key or tenant-specific URL. It may accept a requester who
  is not signed in. Do not treat possession of a public form URL as permission to browse
  existing quotes.
- **Embedded forms:** Support an origin/embed identifier and a form configuration version
  in source metadata. Use a narrowly scoped submission credential or signed configuration,
  not a browser-exposed service credential with broad write access.
- **Third-party tools:** Store provider, connection/account, external submission id,
  provider event time and the adapter version. Retryable delivery must be safe, and a
  provider event should be traceable back to the quote it created or updated.
- **Authenticated submission:** If the requester is already known, record the authenticated
  principal separately from the submitted requester details. A signed-in submitter should
  not automatically gain access to internal pricing or other quotes.
- **Anonymous submission:** Accepting an anonymous request should be a deliberate org
  setting with a spam policy, a privacy notice and a way to follow up. Anonymous does not
  mean unowned forever; staff can claim it after review.

### Validation, abuse and deduplication

At the boundary, validate tenant routing, required core fields, allowed file types and
limits, file count and size, text length, vertical key format and source credentials.
Reject or quarantine unsafe content with a useful status and log context that does not
expose secrets or unnecessary personal data.

Public and embedded intake needs layered abuse controls: per-source and per-IP rate
limits, request size/time limits, bot checks where appropriate, content and attachment
scanning, and a review queue for suspicious submissions. Limits should fail closed for
the external boundary while keeping a diagnostic reference for staff.

Retries are expected. Require an idempotency key for clients that can provide one, and
also support a provider plus external-submission-id uniqueness rule. When a provider
cannot provide a stable id, use a conservative fingerprint of source metadata and
normalized payload; identical files alone must not merge two legitimate requests. A
deduplication decision should be recorded as history, and staff should be able to mark a
possible duplicate as distinct or link it to the original.

### Storage access and retention

All quote files are potentially sensitive, including payment statements, property
photos, addresses and pricing. The implementation should define private storage, malware
scanning/quarantine, encryption in transit and at rest, short-lived signed access, role-
checked download/preview, and an audit trail for access to sensitive documents. Storage
keys must be unguessable and independent of original filenames.

Retention is a business/legal decision, but the data model should support it from the
start: per-file retention status, quote-level retention/expiration, a safe deletion
workflow, and an audit record when bytes are removed. Deleting a file should not erase the
quote's history or the fact that a file was received.

## Internal workflow

The first internal screen should answer three questions quickly: what was requested, what
files arrived, and what still needs to happen. A reviewer should be able to:

1. open the quote and view the original description, source context and safe files;
2. classify or correct the vertical, claim ownership and optionally link known CRM
   organizations/companies/contacts;
3. record missing information and keep the quote in `needs information` without making a
   deal or proposal;
4. add or revise internal pricing, assumptions, validity and response notes;
5. review the history of submissions, files, state changes, links and pricing edits;
6. eventually mark the response outcome and, in a later phase, deliver it through an
   approved outward-facing channel.

Internal notes and pricing edits must be distinguishable from requester-submitted text.
Pricing changes should show the editor and time, and, where practical, a before/after
summary. A reviewer may correct a parsed field or add a missing file, but should not
overwrite the original intake envelope.

The initial read-only slice should not promise outbound messaging. `needs information`
can be an internal work state with a note or task until a client portal or other response
channel is designed. Later, a portal can expose only the response view and approved files,
not internal notes, source credentials, audit details or unapproved pricing revisions.

## Organizations, companies, contacts and anonymous requests

A quote can relate to existing CRM records without requiring those records at intake:

- link an organization/company when the requester is known to represent a business;
- link one or more contacts when a specific person is known;
- keep requester-provided identity details on the quote even after a CRM link is made,
  because the submitted value is evidence of what arrived;
- allow the quote to remain unclaimed when no safe match exists;
- allow a staff member to claim or relink it with an audit event and an explicit reason.

Matching should be conservative. An email or phone match may suggest a company/contact,
but it should not silently attach a sensitive quote to the wrong customer. A public form
may have no authenticated CRM identity at all. The quote is still valid and searchable
to authorized internal users by its intake metadata.

If an accepted quote later becomes commercial pipeline work, use an explicit “create deal”
or “link to deal” action. The resulting deal keeps its own identity, amount, owner,
pipeline stage and history, with a durable source link back to the quote. The quote keeps
its own lifecycle, original files, pricing/response history and outcome. Creating a deal
must not mutate the quote into a deal or require a proposal to exist.

A proposal may be created from a quote when the response needs comparable options; that is
also an explicit link or conversion action. The proposal remains the presentation layer,
and the quote remains the intake/work record. Whether one quote may yield multiple
proposals or deals is an open cardinality decision, not a reason to collapse the models.

## History and audit

The current quote snapshot is optimized for work; an append-only event/history stream is
the record of how it got there. At minimum, history should cover:

- accepted intake and source retries/deduplication decisions;
- file received, scanned, quarantined, viewed, replaced or deleted;
- vertical classification, claim/assignment and organization/company/contact links;
- lifecycle transitions and reasons;
- information requests, pricing/response edits and outcome decisions;
- proposal/deal links or explicit conversions;
- integration delivery and failure context.

Each event should identify the quote, organization, actor or source, timestamp, event
type, and enough structured before/after or reference data to explain the change. Keep
submitted content immutable or versioned, avoid storing secrets in events, and apply the
same tenant and role protections to history as to the quote and its files. History should
be useful for support and compliance without becoming a second mutable copy of the quote.

## Phased roadmap

| Phase                | Scope                                                                                                                                                        | Deliberately deferred                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1 — internal intake  | Accept web-dropbox submissions, create quote records, retain source metadata and files, scan/quarantine, and give staff a read-only list/detail/file view.   | Pricing edits, requester messaging, automatic deals/proposals, broad integrations.                 |
| 2 — internal work    | Add claim/assignment, conservative CRM linking, `needs information`, internal pricing and response editing, lifecycle/history views, and duplicate handling. | Client-visible response delivery and any unreviewed automatic conversion.                          |
| 3 — outward response | Add a client portal or selected delivery channel, approved response/file views, response status tracking and notifications.                                  | Unbounded channel support; every integration should still use the same inbound/outbound contracts. |
| 4 — integrations     | Add third-party adapters, embedded-form configuration, retries/webhooks, provider mappings and operational monitoring based on real intake volume.           | Vertical-specific complexity that is not supported by observed demand.                             |

Phase 1 is intentionally useful without pretending the response channel is solved. The
business can see every submission and its documents, while Phase 2 makes the internal
pricing work reliable before Phase 3 exposes anything to a requester.

## Non-goals for the first implementation

- Replacing or renaming the existing proposal or deal concepts.
- Treating every inbound quote as a proposal, deal, company, contact or customer.
- Automatically creating a deal, proposal or CRM identity from an unreviewed submission.
- Designing one exhaustive schema for payment processing, roofing and product quotes.
- Sending pricing or missing-information requests to a requester before an approved
  outbound channel exists.
- Building OCR, AI extraction, payment underwriting, estimating calculations or a full
  document editor as part of intake.
- Making uploaded files public, guessable by URL or available to every authenticated
  user regardless of organization and role.
- Adding migrations, routes, UI, storage, integrations or behavior in this planning slice.

## Open decisions before build

1. What should the canonical product name be when an industry already calls proposals
   “quotes”: “quote request,” “estimate request,” “inquiry,” or another pair?
2. Which organizations may receive anonymous submissions, and what consent/privacy copy
   and abuse controls are required for each public form?
3. Which requester fields are safe and useful to retain, and for how long?
4. What is the initial vertical registry and who owns each extension's schema/version?
5. Which pricing facts are universal in phase 2, and when does a vertical need line items?
6. What exact lifecycle states and transition permissions are needed, especially the
   meaning of `accepted` and the difference between `responded` and delivered?
7. How should staff claim an anonymous request, resolve possible duplicates and undo a
   mistaken organization/contact match?
8. May one quote link to multiple proposals or deals, and what does “convert” mean in
   reporting and permissions?
9. Which storage/scanning provider, file limits, retention periods and legal holds apply?
10. Which public-form credentials, third-party auth methods, retry contracts and monitoring
    standards are acceptable?
11. What can a future client portal reveal, and which response files or pricing revisions
    require explicit approval before publication?

The implementation should begin only after these decisions are narrowed enough that the
universal core, extension boundary, storage policy and explicit quote/proposal/deal links
can be tested independently.
