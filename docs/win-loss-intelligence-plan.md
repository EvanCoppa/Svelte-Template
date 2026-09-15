# Win/Loss Intelligence for the CRM

**Status:** Planning only  
**Scope:** Closed-deal outcome capture, immutable evidence, permission-scoped analysis, and read-only AI insights.

## 1. Product direction

Build Win/Loss Intelligence as a read-only feature inside the existing CRM. Do not create a separate app or a new industry solely for analytics.

Register a feature such as `win_loss_intelligence` through the existing feature and permission catalog. Recommended access model:

- Sales users see only the deals permitted by their existing CRM visibility rules.
- Managers and analysts receive an explicitly defined team or organization scope.
- Org owners/admins configure taxonomies and field packs.
- System admins get operator access only through explicit, audited tooling.
- AI never receives broader access than the requesting user.

The feature should be vertical-aware, but its core data contract should remain industry-neutral.

## 2. Existing CRM alignment

The design should extend the current architecture rather than create parallel concepts:

- `deals` remains the source record for opportunity identity, owner, amount, pipeline, stage, source, and close state.
- `pipelines` and `pipeline_stages` remain configurable rows, not a second stage vocabulary.
- `activities` remains the user-facing interaction timeline.
- A new append-only deal history stream supplies analytical evidence for stage and field transitions.
- Proposals and document/evidence records should provide proof for proposal-sent and statement-collected facts.
- Generalized custom fields should hold vertical-specific outcome fields.
- The existing AI conversation architecture can host the read-only analysis experience, but analysis inputs must come from permission-checked snapshots rather than unrestricted tools.
- Feature registry, role permissions, organization membership, and RLS remain the access-control foundation.

## 3. Outcome capture

Create a versioned outcome record for every closed deal. The record should contain:

- Deal and organization identifiers.
- Won/lost outcome.
- Closed time and capture time.
- Captured by, capture source, and schema version.
- Win reason or primary value driver.
- Lost reason.
- Competitor.
- Main objection.
- What would have changed the outcome?
- Proposal-sent status and evidence timestamp.
- Completeness status and correction metadata.

Use controlled option lists with optional explanation text. The close flow should show existing evidence and avoid asking users to duplicate facts already present in the CRM:

- Proposal sent should be derived from proposal records or system-generated activities where possible.
- Statement collected should use document/evidence records where available.
- Stage, amount, owner, source, pipeline, and timing should come from the deal and its history.

Allow an incomplete save when necessary, but make the incompleteness visible in reporting. Require the minimum outcome contract before a deal is considered analytically closed.

## 4. Core fields versus vertical fields

### Core fields

These should work across industries:

- Outcome.
- Win reason.
- Lost reason.
- Competitor.
- Main objection.
- What would have changed the outcome?
- Proposal sent.
- Deal source/origin.
- Owner.
- Pipeline and stage.
- Deal amount.
- Sales-cycle timing.
- Activity and stage-transition evidence.
- Data completeness.

### Vertical-specific fields

Use the generalized custom-field system for fields that vary by industry. Example packs:

**Merchant services**

- Statement collected.
- Processing volume.
- Pricing objection.
- Current processor.
- Underwriting blocker.

**Roofing**

- Inspection completed.
- Estimate delivered.
- Insurance issue.
- Financing need.
- Season or timing objection.

**Dentistry**

- Treatment plan presented.
- Insurance coverage.
- Financing discussion.
- Patient readiness.
- Appointment scheduled.

**Medical supplies**

- Clinical approval.
- Procurement process.
- Contract vehicle.
- Budget cycle.

High-integrity workflow facts—such as document collection or underwriting status—may eventually deserve dedicated tables. Do not put sensitive financial or document data into unstructured custom-field text.

## 5. Immutable history and timeline evidence

Existing activities are authored content and may be edited. They are appropriate for the user-facing timeline but are not sufficient as the only analytical evidence.

Add an append-only deal history stream that records:

- Deal creation.
- Pipeline and stage transitions.
- Assignment changes.
- Amount or forecast changes.
- Proposal sent.
- Documents or statements collected.
- Won/lost transitions.
- Reopens.
- Outcome corrections.

Each event should preserve:

- Deal and organization IDs.
- Previous and next values.
- Previous and next pipeline/stage IDs.
- Stage labels at the time of transition.
- Actor and timestamp.
- Source: UI, database trigger, import, or automation.
- Correlation/request ID.
- Optional before/after JSON.

Stage labels must be snapshotted because an organization may later rename a stage. Reopening a deal should append a new event; it should not erase the original close evidence.

## 6. Unknown and not-applicable semantics

Do not use a single null state for every missing value. Each field should distinguish:

- Known value.
- Unknown.
- Not asked.
- Not applicable.
- Not captured because the deal predates the feature.

The close flow should expose explicit “Unknown” and “Not applicable” choices. Reports should show field coverage and missingness alongside outcome metrics.

Corrections should be append-only, require a reason, and preserve the original value, new value, actor, and timestamp.

## 7. Permission-scoped AI snapshots

Introduce a server-side snapshot layer for AI analysis. A snapshot is an immutable, permission-scoped representation of the data used for one analysis request.

Record at least:

- Snapshot ID.
- Requesting user and organization.
- Authorized visibility scope.
- Filters and date range.
- Data cutoff timestamp.
- Included deal count.
- Source manifest or included source IDs.
- Redaction policy.
- Authorization/policy version hash.
- Creation time and expiry time.
- Model, prompt, and analysis version when AI is invoked.

Generate snapshots through the caller’s RLS-visible data path, then apply an explicit feature-permission check. Do not expose the service-role key to the client, and do not allow an AI tool to issue arbitrary database queries.

Every AI claim should link to the snapshot plus the supporting aggregate, cohort, deal, or timeline evidence the user is allowed to open. Store the analysis metadata and citations for auditability. Keep the experience read-only: AI may explain patterns, but it may not write outcomes, taxonomies, or deal fields.

## 8. Deterministic insights before AI

Ship reliable aggregates before predictive or generative recommendations:

- Win/loss rate.
- Amount-weighted win rate.
- Deal count and amount.
- Stage-to-stage conversion.
- Median sales cycle.
- Stage dwell time.
- Proposal-sent rate.
- Activity coverage.
- Outcome-field completeness.
- Top lost reasons.
- Competitor frequency and performance.
- Objection frequency.
- Breakdowns by industry, pipeline, stage, source, owner, and time period.

Use descriptive language such as “associated with.” Do not claim that a competitor, owner, activity, or objection caused an outcome without an appropriate experimental design.

For every cohort, show sample size, coverage, and a confidence indicator. Suppress or group small cohorts, avoid rankings when samples are weak, and label exploratory findings.

## 9. Read-only UX

### Deal close flow

Provide a compact close modal that collects the core fields, shows available evidence, supports explicit unknown/not-applicable states, and identifies incomplete records.

### Deal detail

Add an Evidence or History view showing stage transitions, activities, proposal/document evidence, outcome capture, corrections, and provenance.

### Win/Loss Intelligence page

Provide filters for date, pipeline, stage, owner, source, competitor, objection, and industry. Show summary cards, cohort tables, completeness, and drill-through links to permitted deals.

### AI analysis panel

Show scope before analysis, for example:

> 42 closed deals · January–June 2026 · Current user visibility · 81% outcome completeness

The response should include citations, sample size, data-quality notes, and a clear descriptive/non-causal caveat where appropriate.

## 10. Phased rollout

### Phase 0 — Validation and instrumentation

- Define taxonomies, visibility rules, and the minimum data contract.
- Audit existing deals, activities, proposals, pipelines, and custom fields.
- Select representative historical deals for backfill testing.

### Phase 1 — Outcome capture and history

- Add close-flow capture.
- Add immutable stage/deal history.
- Add unknown/not-applicable semantics.
- Add completeness and correction tracking.

### Phase 2 — Deterministic reporting

- Build filters, cohorts, conversion metrics, completeness reporting, and drill-downs.
- Validate calculations against a manually reviewed sample.

### Phase 3 — Permission-scoped AI

- Add snapshots, source manifests, redaction, citations, retention, and model-version logging.
- Start with summaries over deterministic aggregates.

### Phase 4 — Vertical packs

- Add industry-specific custom-field bundles and evidence workflows.
- Promote only high-value, high-integrity fields into dedicated tables later.

## 11. Open decisions

- Should users see their own deals, team deals, or all organization deals?
- How is manager/team visibility represented?
- Can closed deals be reopened, and does re-closing create a new outcome version?
- Who owns the controlled reason, objection, and competitor taxonomies?
- Is proposal-sent always derived, or can it be manually asserted?
- What qualifies as a collected statement?
- What statement data may be stored, redacted, or excluded?
- What minimum sample size is acceptable for each insight type?
- How long are AI snapshots and source manifests retained?
- Which AI providers and data-retention guarantees are acceptable?
- Which vertical fields remain custom fields versus becoming dedicated workflow tables?

## 12. Validation exercise

Use approximately 20–30 closed won/lost deals per vertical:

1. Map each requested field to existing CRM data.
2. Measure current completeness and ambiguity.
3. Replay stage transitions and verify historical evidence.
4. Test rep, manager, admin, and system-admin visibility combinations.
5. Compare deterministic metrics with a manually reviewed sample.
6. Run AI summaries from a fixed snapshot and verify every claim has source support.
7. Test small-sample suppression and unknown/not-applicable handling.
8. Have sales users complete the close flow and confirm it is practical for a normal deal.

Suggested launch gates:

- No cross-organization or out-of-scope rows visible.
- Every AI claim is traceable to snapshot evidence.
- Stage history remains correct after stage renames and deal reopens.
- Unknown and not-applicable values are not silently counted as known negatives.
- Core metrics match the manually reviewed sample within an agreed tolerance.
- Normal outcome capture takes less than one minute for a complete deal.

## 13. Planning-only boundary

This document is a design and validation plan. No migrations, schema changes, application code, branches, or PRs are included in this plan.
