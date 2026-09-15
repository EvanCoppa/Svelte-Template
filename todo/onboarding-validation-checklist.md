# Onboarding validation workshop

**Purpose:** validate the workflow before implementation.

**Output:** a signed-off required-field matrix, permissions matrix, stage
transition table, and duplicate/cancellation examples.

## Test cases

- [ ] Approved, single-location merchant with complete handoff data.
- [ ] Approved merchant missing install contact information.
- [ ] Approved merchant with no company or contact attached to the deal.
- [ ] Merchant with multiple locations or MIDs.
- [ ] Handoff cancelled after equipment shipment.
- [ ] Handoff corrected and promoted a second time.
- [ ] Post-live merchant with an overdue 30-day check-in.

## Questions for sales and onboarding staff

- [ ] What exact deal stage means “ready for onboarding”?
- [ ] Which fields block promotion?
- [ ] Which missing values may be marked unknown?
- [ ] Which values must be copied into the audit snapshot?
- [ ] Who may save a draft?
- [ ] Who may promote?
- [ ] Who may waive a required field, and for how long?
- [ ] Who may view the restricted tax-ID last four?
- [ ] When is the merchant considered Live?
- [ ] Does onboarding close at Live or after the 90-day check-in?
- [ ] Are check-ins better represented as tasks, events, or a visible queue?
- [ ] Is one MID enough, or are merchant accounts needed immediately?

## Acceptance criteria

- [ ] Repeated promotion of the same deal returns one onboarding record.
- [ ] A draft can be saved without starting operational tasks or notifications.
- [ ] A deal without a company/contact can be promoted without creating dummy
      parties.
- [ ] Every exception has a reason, approver, timestamp, and optional expiry.
- [ ] Cancellation preserves the source deal, handoff snapshot, and history.
- [ ] Post-live milestones do not alter the sales pipeline.
- [ ] Sensitive fields are masked and excluded from notes, search, exports, and
      AI context.

