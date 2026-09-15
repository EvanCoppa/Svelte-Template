-- Hourly wage and commission percentage for a staff member.
--
-- Pay is not roster data: `listStaff()` reads `organization_members` and
-- every staff `read` holder sees that query's rows, but a plain member
-- should never receive a colleague's wage or commission. Column-level grants
-- cannot draw that line — a grant is a database-role boundary
-- (`authenticated` vs `anon`), the same role every signed-in user shares,
-- while "owner/admin only" is a ROW condition, and a policy that admits a row
-- exposes every column of it (the storefront migration's own reasoning). So
-- pay lives in its own table with its own RLS rather than as columns on
-- `organization_members`, and the app only ever queries it for a caller the
-- policy already lets through.

create table public.staff_compensation (
	org_id uuid not null,
	user_id uuid not null,
	hourly_wage numeric check (hourly_wage >= 0),
	commission_percent numeric check (commission_percent >= 0 and commission_percent <= 100),
	updated_at timestamptz not null default now(),
	primary key (org_id, user_id),
	foreign key (org_id, user_id)
		references public.organization_members (org_id, user_id)
		on delete cascade
);

comment on table public.staff_compensation is
	'Wage and commission for a staff member. One row per membership, present only once someone has entered pay for that person. Owner/admin read and write only.';

create trigger staff_compensation_set_updated_at
	before update on public.staff_compensation
	for each row execute procedure public.set_updated_at();

alter table public.staff_compensation enable row level security;

create policy "Owners and admins can view staff compensation"
	on public.staff_compensation
	for select
	to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can set staff compensation"
	on public.staff_compensation
	for insert
	to authenticated
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can update staff compensation"
	on public.staff_compensation
	for update
	to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'))
	with check (private.org_role(org_id) in ('owner', 'admin'));

create policy "Owners and admins can clear staff compensation"
	on public.staff_compensation
	for delete
	to authenticated
	using (private.org_role(org_id) in ('owner', 'admin'));
