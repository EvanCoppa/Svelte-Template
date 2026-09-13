-- Nick joins the platform operators.
--
-- "Owner-level in every organization" has one home in this schema: a row in
-- public.system_admins (see that migration). private.org_role() answers
-- 'owner' for an operator on every org that exists, so every tenant policy
-- already written against it — and private.feature_level(), which gives an
-- owner 'delete' on every feature — carries the grant with nothing per
-- table to wire, and loadOrgContext() puts every org in their switcher.
-- Owner memberships inserted org by org would be the same access for
-- today's orgs only, and would need another migration for every org created
-- after this one.
--
-- The grant is keyed on the account, so this looks the operator up by email
-- rather than pinning a uuid the way seed.sql can: auth user ids differ
-- between the local stack, CI's disposable database and production, and
-- only production has this person. Where the address names nobody the block
-- writes nothing and says so in the deploy log — which is what makes it
-- safe to replay everywhere, alongside `on conflict do nothing`. It is also
-- the failure mode to watch: if the account does not exist yet when this
-- lands, the operator row is never written, and the fix is a new migration
-- (or one insert by the service role) once they have signed up.
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
	where lower(email) = 'nick@guaranteeth.com'
	order by created_at
	limit 1;

	if operator is null then
		raise notice 'No auth user for nick@guaranteeth.com; no operator row written.';
		return;
	end if;

	insert into public.system_admins (user_id, note)
	values (operator, 'Platform operator: Nick (nick@guaranteeth.com).')
	on conflict (user_id) do nothing;
end;
$$;
