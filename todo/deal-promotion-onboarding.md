# Deal promotion and industry-specific onboarding

**Status:** planning only

## Idea

A deal can exist before it is attached to a company or contact. Once the sales
work is ready, a person deliberately promotes the deal into onboarding.

Onboarding is a separate lifecycle, not another deal stage and not a proposal.
It has its own pipeline, stages, owners, dates, checklist, activity, tasks,
documents, equipment, and completion rules.

The original deal remains linked and auditable after promotion.

## Lifecycle boundary

1. **Deal** — sales activity, qualification, proposal/application work, amount,
   sales owner, sales pipeline, and expected close date.
2. **Handoff draft** — a checklist collects the information onboarding needs.
   Missing values can be saved without starting operational work.
3. **Promotion** — an explicit, permission-checked, idempotent action creates or
   reuses the onboarding record and records the handoff snapshot.
4. **Onboarding** — the implementation and activation workflow with its own
   stages, owners, tasks, documents, and operational data.
5. **Live customer** — customer status continues independently after onboarding
   is complete.
6. **Post-live cadence** — two-week, 30-, 60-, and 90-day follow-ups are
   cadence-generated tasks/events, not sales stages.

## What is referenced and what is copied

### Keep as references

- Source deal ID.
- Company and contact IDs when known.
- Sales owner and onboarding owner.
- Proposals, application artifacts, documents, tasks, activities, assets, and
  shipments.

### Copy into a handoff snapshot

Copy values that must remain historically true even if the source record later
changes:

- Merchant display name.
- Install contact name, phone, and email.
- Processor and processor identifier/MID.
- Install type and equipment plan.
- Target go-live date and business hours.
- Checklist answers, exceptions, and the person who approved them.

The snapshot should retain the originating field keys/IDs where applicable. The
deal should not be deleted or silently detached after promotion.

## Generic onboarding record

The future onboarding record should contain:

- Organization and optional company/contact association.
- Source deal and promotion event.
- Industry and onboarding pipeline/stage.
- Lifecycle status: `draft`, `active`, `blocked`, `complete`, or `cancelled`.
- Sales owner and onboarding owner.
- Created, promoted, started, target-completion, and completed timestamps.
- Required-field/checklist completion state.
- Block, exception, and cancellation reasons.
- Links to activities, tasks, documents, assets, shipments, proposals, and
  notifications.

Onboarding stages should be configured separately from deal pipeline stages.
Industry packs may provide defaults that an organization can customize, using
the same general pattern as industry custom fields.

## Industry pack contract

Each industry pack defines:

- Pipeline stages and their order.
- Stage entry and exit requirements.
- Required fields and checklist items.
- Validation rules and terminology.
- Default tasks and cadence hooks.
- Completion criteria.
- Links to the industry’s existing records and assets.

The core onboarding workflow must not contain payment-processing or roofing
assumptions.

## Payment-processing pack

### Recommended operational stages

1. Approved / Handoff
2. Install Scheduled
3. Equipment Shipped
4. Install and Training Complete
5. PCI Setup
6. Live

`Approved` is the entry stage after underwriting/processor approval. It is not
completion. `Live` means activation has occurred after installation/training and
PCI is compliant or has an authorized exception.

### Post-live milestones

Two-week, 30-day, 60-day, and 90-day check-ins should initially be cadence
milestones linked to onboarding. Each milestone creates a task/event and an
activity when completed. They should not become four extra board columns.

Onboarding can close at `Live`, with cadence continuing afterward, or expose an
optional `Complete` state once the 90-day milestone is finished. This remains an
open product decision.

### Handoff fields

- Merchant name.
- Company link, when known.
- Install contact link, name, phone, and email.
- Processor.
- Processor MID/identifier.
- Equipment, POS, or gateway.
- Virtual terminal need.
- Install type: in-person or remote.
- Equipment shipment status, carrier, tracking/reference, and exception.
- Target go-live date.
- Business hours and time zone.
- PCI status, due date, owner, completion date, and escalation.
- Last four of tax ID only.
- Notes.
- Sales rep owner.
- Onboarding owner.

Processor and MID should remain separate fields. If one business can have
multiple locations or accounts, introduce a merchant-account child record rather
than adding more one-value company fields.

### Example validation

- Last four of tax ID must be exactly four digits.
- Do not accept full tax IDs, bank details, payment credentials, or card data.
- Install Scheduled requires an install date, install type, and contact or an
  approved exception.
- Equipment Shipped requires shipment status plus tracking/carrier data or a
  documented exception.
- Live requires installation/training completion and an acceptable PCI state.
- Target go-live cannot precede approval.
- Unknown values must be explicit rather than blank.

## Other verticals

A roofing pack could use:

1. Contract / Handoff
2. Permit and Materials
3. Production Scheduled
4. Materials Delivered
5. Install Complete
6. Final Inspection
7. Customer Handover

Its fields would reference homeowner/contact, property asset, job type, permit
status, material order/delivery, crew participants, insurance claim, inspection,
photos, and warranty handoff. The lifecycle mechanics stay shared; only the pack
changes.

## Promotion UX and permissions

- A deal stage can make promotion eligible, but reaching that stage must not
  silently create onboarding.
- **Save handoff draft:** create or update a draft with missing values and no
  operational automation.
- **Promote to onboarding:** require the core and industry checklist, show the
  missing/unknown values, show the selected owners, and require confirmation.
- A deal without a company/contact may still be promoted if the onboarding
  snapshot has enough identity/contact information. Linking or creating a party
  should be an explicit choice; never create dummy parties automatically.
- Sales reps may prepare drafts. Final promotion, cancellation, reopening, and
  required-field waivers should be limited to the chosen onboarding roles,
  managers, or owner/admin users.
- Use a unique active onboarding per source deal and an idempotency key so a
  double submit cannot create duplicate records, tasks, notifications, or
  cadences.
- Cancellation preserves the record, actor, timestamp, and reason. Correction
  should use a new handoff revision or authorized reopen, not deletion.

## Security and access

Last-four tax ID data should be separated from ordinary onboarding fields, masked
in the UI, restricted server-side, audited on access, and excluded from search,
exports, and AI context. Current feature-level permissions are not field-level
security.

Owner fields must point only to active organization members. Reassignment should
retain history, using relationships if multiple participants or historical
owners are needed.

## Integrations

- **Activities:** automatically record promotion, stage changes, exceptions,
  shipment/install/PCI events, and check-in completion.
- **Tasks:** create checklist and stage-entry work through the shared task model;
  assign through the existing relationship pattern.
- **Notifications:** send actionable in-app notifications to owners and
  participants; link to the onboarding or task.
- **Assets/equipment:** link real terminals/assets; keep serial data in the asset
  model or custom fields rather than notes.
- **Shipments:** link existing order/shipment records where available; carrier
  status and onboarding stage remain separate facts.
- **Documents:** generalize the current attachment approach into versioned
  documents plus required-document checklists.
- **Client portal:** later expose a safe projection of status, appointments,
  document requests, and checklists without internal notes or sensitive fields.

## Implementation todo

- [ ] Confirm the promotion-eligible deal stage.
- [ ] Decide whether `Live` or a later `Complete` state closes onboarding.
- [ ] Decide whether multi-location merchants require a merchant-account record
      in the first release.
- [ ] Define the generic onboarding record and audit/history model.
- [ ] Define onboarding pipeline/stage configuration separate from deal boards.
- [ ] Define the required-field and exception model.
- [ ] Define role permissions for draft, promote, cancel, reopen, waive, and
      sensitive-field access.
- [ ] Build a read-only onboarding profile/status view.
- [ ] Build draft handoff and explicit promotion with idempotency.
- [ ] Add the payment-processing field pack and stage rules.
- [ ] Connect assets, shipments, documents, notifications, activities, and tasks.
- [ ] Add cadence enrollment for post-live milestones.
- [ ] Validate a roofing pack without adding vertical branches to core logic.
- [ ] Design the future client-facing projection.

