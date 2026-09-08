-- Every proposal names two people: the one who presents it and the one
-- responsible for what it proposes — the provider who does the work in a
-- practice, the project manager on a roofing job, the account manager on a
-- supply order. Ported from Yes Smile's presenter_id + providerid; both are
-- org members here, picked from the roster, and the slides read both when
-- they arrive.
--
-- Same shape as deals.assigned_to: a composite foreign key onto the
-- membership, so a proposal can never name someone outside the org, and
-- losing membership clears the name rather than dangling it. Nullable, so
-- a draft created elsewhere (the assistant, an import) is still a legal
-- row; the builder requires both.
--
-- What the two are CALLED is the industry's business — "Presenter" and
-- "Provider" in a practice, "Estimator" and "Project manager" on a roof —
-- see the industry_vocabulary migration.

alter table public.proposals
	add column presenter_id uuid,
	add column responsible_id uuid,
	add foreign key (org_id, presenter_id) references public.organization_members (org_id, user_id)
		on delete set null (presenter_id),
	add foreign key (org_id, responsible_id) references public.organization_members (org_id, user_id)
		on delete set null (responsible_id);

comment on column public.proposals.presenter_id is
	'The member who presents the proposal. A membership, so it clears when they leave the org.';
comment on column public.proposals.responsible_id is
	'The member responsible for what is proposed — the provider, project manager or account manager, as the industry calls them.';

create index proposals_presenter_id_idx on public.proposals (presenter_id);
create index proposals_responsible_id_idx on public.proposals (responsible_id);

-- Both settable from the builder and editable afterwards, like assigned_to.
revoke insert, update on table public.proposals from authenticated;
grant insert (org_id, entity_type, entity_id, title, base_config, status, default_fee, tax_rate,
		valid_until, deck_id, presenter_id, responsible_id, created_by),
	update (entity_type, entity_id, title, base_config, status, default_fee, tax_rate, valid_until,
		selected_option_id, deck_id, presenter_id, responsible_id)
	on table public.proposals to authenticated;
