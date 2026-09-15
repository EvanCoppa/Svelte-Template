-- Evan joins the platform operators.
--
-- Mirrors the system_admin_nick migration: "owner-level in every
-- organization" has one home, public.system_admins, and the grant is keyed
-- on the account by email lookup rather than a pinned uuid, because auth
-- user ids differ between the local stack, CI's disposable database and
-- production, and only production has this person. Local already has this
-- row from supabase/seed.sql's fixed-id fixture, so this block finds one
-- there and does nothing; it exists to write the row where seed.sql cannot
-- reach — production — and to be the version-controlled record of that
-- grant, restoring it in any database rebuilt from migrations.
--
-- Revoking is one statement, and it is not the whole job — a membership row
-- an operator also holds outlives their row here:
--   delete from public.system_admins where user_id = '<uuid>';
do $$
declare
	operator uuid;
begin
	select id into operator
	from auth.users
	where lower(email) = 'evancoppa@gmail.com'
	order by created_at
	limit 1;

	if operator is null then
		raise notice 'No auth user for evancoppa@gmail.com; no operator row written.';
		return;
	end if;

	insert into public.system_admins (user_id, note)
	values (operator, 'Platform operator: Evan (evancoppa@gmail.com).')
	on conflict (user_id) do nothing;
end;
$$;
