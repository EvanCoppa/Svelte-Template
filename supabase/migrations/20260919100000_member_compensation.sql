-- Hourly wage and commission percentage on staff (docs/to-do/backlog.md, 1.2).
--
-- Pay is not roster data: a plain member reading the staff roster must never
-- receive another member's wage or commission. Column-level GRANTs can't draw
-- that line, because every signed-in user shares the same `authenticated`
-- Postgres role regardless of which org they hold which role in — a grant
-- that hid a column from "member" would hide it from "owner" too. So
-- compensation lives in its own table, gated by row-level security instead of
-- column grants, the same way `private.org_role()` already gates every other
-- owner/admin-only write.
create table public.member_compensation (
	org_id uuid not null references public.organizations (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	hourly_wage numeric check (hourly_wage >= 0),
	commission_percent numeric check (commission_percent >= 0 and commission_percent <= 100),
	updated_at timestamptz not null default now(),
	primary key (org_id, user_id),
	-- A compensation row can't outlive or predate the membership it belongs
	-- to: it disappears the moment the membership does, and it can only be
	-- inserted for a (org_id, user_id) pair that already is one.
	foreign key (org_id, user_id) references public.organization_members (org_id, user_id) on delete cascade
);

comment on table public.member_compensation is
	'Hourly wage and commission percent per member, per org. Owner/admin only — not roster data, and not even self-service for the member it names.';

-- No separate org_id index: the primary key's leading column already covers
-- "every compensation row in this org" lookups, and every read of this table
-- is already scoped to one (org_id, user_id) pair or one org via that key.

create trigger member_compensation_set_updated_at
	before update on public.member_compensation
	for each row execute procedure public.set_updated_at();

alter table public.member_compensation enable row level security;

-- Owner/admin only, both ways — a plain member never reads their own pay
-- through this table; the roster shows them their role, not their wage.
create policy "Owners and admins can view member compensation"
	on public.member_compensation
	for select
	to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can set member compensation"
	on public.member_compensation
	for insert
	to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update member compensation"
	on public.member_compensation
	for update
	to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can delete member compensation"
	on public.member_compensation
	for delete
	to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));
